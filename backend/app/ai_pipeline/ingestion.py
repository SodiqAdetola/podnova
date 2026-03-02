"""
PodNova Article Ingestion Module
FULLY ASYNC VERSION with Motor and aiohttp
Fetches articles from RSS feeds, filters for quality, deduplicates, and stores in MongoDB.
"""
import ssl
import hashlib
import re
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import List, Dict, Optional, Any

import feedparser
import certifi
import motor.motor_asyncio
import aiohttp
import asyncio
from bs4 import BeautifulSoup
from langdetect import detect

from app.config import MONGODB_URI, MONGODB_DB_NAME
from app.ai_pipeline.feed_config import (
    RSS_FEEDS, NOISE_KEYWORDS, FETCH_INTERVAL_HOURS, 
    MIN_WORD_COUNT, MAX_WORD_COUNT, MAX_ARTICLE_AGE_HOURS
)

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Set Local Timezone for the UK (handles GMT/BST automatically)
UK_TZ = ZoneInfo("Europe/London")

class ArticleIngestionService:
    def __init__(self, mongo_uri: str, db_name: str):
        """Initialize with Motor async client"""
        self.client = motor.motor_asyncio.AsyncIOMotorClient(
            mongo_uri,
            tlsCAFile=certifi.where()
        )
        self.db = self.client[db_name]
        self.articles_collection = self.db["articles"]
        self.categories_collection = self.db["categories"]

        self.http_semaphore = asyncio.Semaphore(5)
        self.session: Optional[aiohttp.ClientSession] = None

        # Create indexes on initialization
        asyncio.create_task(self._ensure_indexes())

    async def init_session(self):
        """Initialize the shared aiohttp session for connection pooling with anti-bot headers."""
        if not self.session:
            self.session = aiohttp.ClientSession(headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8'
            })

    async def _ensure_indexes(self):
        """Create indexes for efficient lookups"""
        try:
            await self.articles_collection.create_index("content_hash", unique=True)
            await self.articles_collection.create_index("url", unique=True)
            await self.articles_collection.create_index("published_date")
            await self.articles_collection.create_index("status")
            logger.info("Database indexes verified")
        except Exception as e:
            logger.error(f"Error creating indexes: {e}")

    async def fetch_feed(self, feed_url: str) -> List[Dict]:
        """Fetch RSS feed XML using secure session, then parse."""
        try:
            async with self.http_semaphore:
                async with self.session.get(feed_url, timeout=15) as response:
                    if response.status != 200:
                        logger.warning(f"Failed to fetch RSS {feed_url}: HTTP {response.status}")
                        return []
                    # Read the raw XML content
                    content = await response.read()
            
            # Parse the raw content (using to_thread as parsing can be CPU bound)
            feed = await asyncio.to_thread(feedparser.parse, content)
            return feed.entries
            
        except asyncio.TimeoutError:
            logger.warning(f"Timeout fetching feed {feed_url}")
            return []
        except Exception as e:
            logger.error(f"Error fetching feed {feed_url}: {str(e)}")
            return []

    async def extract_full_content(self, url: str) -> Optional[str]:
        """Extract full article content from URL using shared aiohttp session"""
        try:
            async with self.http_semaphore:
                await asyncio.sleep(0.5)  # Polite delay to avoid rate limits
                async with self.session.get(url, timeout=15) as response:
                    if response.status != 200:
                        logger.debug(f"HTTP {response.status} for {url} - Likely paywall.")
                        return None
                    html = await response.text()

            soup = BeautifulSoup(html, 'html.parser')

            # Remove script and style elements
            for elem in soup(["script", "style", "nav", "footer", "header", "aside", "form", "iframe"]):
                elem.decompose()

            # Try to find main content area
            content = None
            for selector in ['article', '.article-body', '.content', 'main', '.post-content', '.story-body', '.entry-content']:
                content = soup.select_one(selector)
                if content:
                    break

            if content:
                text = content.get_text(separator=' ', strip=True)
            else:
                text = soup.get_text(separator=' ', strip=True)

            # Clean up whitespace
            return re.sub(r'\s+', ' ', text).strip()

        except asyncio.TimeoutError:
            logger.warning(f"Timeout extracting content from {url}")
            return None
        except Exception as e:
            logger.error(f"Error extracting content from {url}: {str(e)}")
            return None

    # =========================================================================
    # IMAGE EXTRACTION LOGIC
    # =========================================================================
    def extract_image_from_entry(self, entry: Dict, url: str) -> Optional[str]:
        """
        Extract the highest quality image URL from RSS entry.
        Prioritizes: Larger images, reliable attributes, modern formats.
        """
        candidates = []
        
        # Method 1: RSS feed media content (usually high quality)
        if hasattr(entry, 'media_content') and entry.media_content:
            for media in entry.media_content:
                if media.get('url'):
                    width = self._parse_dimension(media.get('width'))
                    height = self._parse_dimension(media.get('height'))
                    candidates.append({
                        'url': media['url'],
                        'width': width,
                        'height': height,
                        'priority': 100,
                        'source': 'media_content'
                    })
        
        # Method 2: RSS enclosures
        if hasattr(entry, 'enclosures') and entry.enclosures:
            for enclosure in entry.enclosures:
                if enclosure.get('type', '').startswith('image/'):
                    img_url = enclosure.get('href') or enclosure.get('url')
                    if img_url:
                        width = self._parse_dimension(enclosure.get('width'))
                        height = self._parse_dimension(enclosure.get('height'))
                        candidates.append({
                            'url': img_url,
                            'width': width,
                            'height': height,
                            'priority': 90,
                            'source': 'enclosure'
                        })
        
        # Method 3: media:thumbnail
        if hasattr(entry, 'media_thumbnail') and entry.media_thumbnail:
            for thumb in entry.media_thumbnail:
                if thumb.get('url'):
                    width = self._parse_dimension(thumb.get('width'))
                    height = self._parse_dimension(thumb.get('height'))
                    candidates.append({
                        'url': thumb['url'],
                        'width': width,
                        'height': height,
                        'priority': 70,
                        'source': 'thumbnail'
                    })
        
        # Method 4: Extract from HTML content
        if hasattr(entry, 'content') and entry.content:
            content_html = entry.content[0].get('value', '')
            html_images = self._extract_images_from_html(content_html)
            for img in html_images:
                candidates.append({
                    'url': img['url'],
                    'width': img.get('width'),
                    'height': img.get('height'),
                    'priority': 80,
                    'source': 'content'
                })
        
        # Method 5: Extract from summary
        elif hasattr(entry, 'summary') and entry.summary:
            html_images = self._extract_images_from_html(entry.summary)
            for img in html_images:
                candidates.append({
                    'url': img['url'],
                    'width': img.get('width'),
                    'height': img.get('height'),
                    'priority': 60,
                    'source': 'summary'
                })
        
        if not candidates:
            return None
        
        best_image = self._select_best_image(candidates)
        if not best_image:
            return None
        
        image_url = best_image['url']
        if image_url.startswith('//'):
            image_url = 'https:' + image_url
        elif image_url.startswith('/') and url:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            image_url = f"{parsed.scheme}://{parsed.netloc}{image_url}"
        
        return image_url

    def _parse_dimension(self, dimension) -> Optional[int]:
        if not dimension:
            return None
        try:
            if isinstance(dimension, str):
                dimension = dimension.replace('px', '').strip()
            return int(dimension)
        except (ValueError, TypeError):
            return None

    def _extract_images_from_html(self, html: str) -> List[Dict]:
        images = []
        if not html:
            return images
        try:
            soup = BeautifulSoup(html, 'html.parser')
            img_tags = soup.find_all('img')
            for img in img_tags:
                src = img.get('src') or img.get('data-src')
                if src and self._is_valid_image_url(src):
                    images.append({
                        'url': src,
                        'width': self._parse_dimension(img.get('width')),
                        'height': self._parse_dimension(img.get('height')),
                        'alt': img.get('alt', ''),
                    })
        except Exception as e:
            logger.debug(f"Error extracting images from HTML: {e}")
        return images

    def _is_valid_image_url(self, url: str) -> bool:
        if not url:
            return False
        url_lower = url.lower()
        if url_lower.startswith('data:'):
            return False
        reject_patterns = [
            'pixel', 'spacer', 'blank', 'placeholder', '1x1', 'tracker',
            'icon', 'logo-small', 'avatar', 'favicon', 'sprite'
        ]
        if any(pattern in url_lower for pattern in reject_patterns):
            return False
        if any(x in url_lower for x in ['w=1', 'h=1', 'size=1', '16x16', '32x32']):
            return False
        return True

    def _select_best_image(self, candidates: List[Dict]) -> Optional[Dict]:
        if not candidates:
            return None
        for candidate in candidates:
            score = candidate['priority']
            width = candidate.get('width')
            height = candidate.get('height')
            
            if width and height:
                area = width * height
                if area > 1000000: score += 50
                elif area > 500000: score += 40
                elif area > 200000: score += 30
                elif area > 100000: score += 20
                elif area < 10000: score -= 30
                
                aspect_ratio = width / height if height > 0 else 0
                if 1.5 <= aspect_ratio <= 2.0: score += 15
                elif 1.2 <= aspect_ratio <= 2.5: score += 10
                elif aspect_ratio < 0.5 or aspect_ratio > 3.0: score -= 15
            elif width:
                if width >= 1200: score += 30
                elif width >= 800: score += 20
                elif width >= 600: score += 10
                elif width < 200: score -= 20
            
            url = candidate['url'].lower()
            if url.endswith('.webp'): score += 10
            elif url.endswith(('.jpg', '.jpeg')): score += 8
            elif url.endswith('.png'): score += 5
            elif url.endswith('.gif'): score -= 10
            
            if any(x in url for x in ['thumb', 'small', 'icon', 'avatar', 'logo']):
                score -= 25
            if any(x in url for x in ['large', 'full', 'original', 'hires', 'hero']):
                score += 20
            candidate['score'] = score
        
        candidates.sort(key=lambda x: x['score'], reverse=True)
        best = candidates[0]
        return best if best['score'] >= 50 else None

    # =========================================================================
    # CORE PIPELINE LOGIC
    # =========================================================================
    def generate_content_hash(self, text: str) -> str:
        return hashlib.md5(text.encode('utf-8')).hexdigest()

    def count_words(self, text: str) -> int:
        return len(text.split())

    def is_recent(self, published_date: datetime) -> bool:
        """Check if article is within acceptable time window using UK Time"""
        cutoff = datetime.now(UK_TZ) - timedelta(hours=MAX_ARTICLE_AGE_HOURS)
        return published_date > cutoff

    def detect_language(self, text: str) -> str:
        try:
            return detect(text[:500])
        except Exception:
            return "unknown"

    def filter_article(self, article_data: Dict[str, Any]) -> bool:
        """
        Apply quality filters. Only rejects for noise, extreme length, age, or language.
        Does NOT reject for being short (to allow graceful RSS fallbacks).
        """
        content = article_data.get("content", "")
        title = article_data.get("title", "")
        word_count = article_data.get("word_count", 0)

        # Reject if ridiculously long (likely grabbed a massive privacy policy)
        if word_count > MAX_WORD_COUNT:
            logger.debug(f"  [REJECTED] Too long ({word_count} words): {title[:40]}")
            return False

        if self.detect_language(content[:500]) != "en":
            return False

        if not self.is_recent(article_data["published_date"]):
            logger.debug(f"  [REJECTED] Too old: {title[:40]}")
            return False

        # Strictly filter out defined noise
        text_to_check = (title + " " + content[:500]).lower()
        if any(noise.lower() in text_to_check for noise in NOISE_KEYWORDS):
            logger.debug(f"  [REJECTED] Noise detected: {title[:40]}")
            return False

        return True

    def parse_article(self, entry: Dict, feed_info: Dict, category: str) -> Optional[Dict[str, Any]]:
        """Parse RSS entry into preliminary article document"""
        try:
            title = entry.get('title', '').strip()
            url = entry.get('link', '').strip()

            if not title or not url:
                return None

            # Parse the date as UTC, then immediately convert to UK Time
            if hasattr(entry, 'published_parsed') and entry.published_parsed:
                pub_date = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc).astimezone(UK_TZ)
            else:
                pub_date = datetime.now(UK_TZ)

            description = entry.get('summary', '') or entry.get('description', '')
            description = BeautifulSoup(description, 'html.parser').get_text(separator=' ', strip=True)
            description = re.sub(r'\s+', ' ', description).strip()

            article_data = {
                "title": title,
                "url": url,
                "description": description,
                "published_date": pub_date,
                "category": category,
                "source": feed_info.get("name", "Unknown Source"),
                "source_priority": feed_info.get("priority", "medium"),
                "ingested_at": datetime.now(UK_TZ),
                "status": "pending_clustering",
                "image_url": self.extract_image_from_entry(entry, url)
            }
            return article_data

        except Exception as e:
            logger.error(f"Error parsing article: {str(e)}")
            return None

    async def process_article(self, article_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Process pipeline: Deduplicate -> Scrape -> Fallback -> Filter -> Hash Check
        """
        # 1. Deduplication by URL FIRST (Saves massive bandwidth)
        if await self.articles_collection.find_one({"url": article_data['url']}):
            return None

        # 2. Attempt Web Scrape
        full_content = await self.extract_full_content(article_data["url"])

        # 3. Graceful Fallback Logic (if blocked or too short)
        if full_content and self.count_words(full_content) >= MIN_WORD_COUNT:
            article_data["content"] = full_content
            article_data["has_full_content"] = True
            logger.debug(f"  [SCRAPED] Full text extracted: {article_data['title'][:40]}")
        else:
            article_data["content"] = article_data["description"]
            article_data["has_full_content"] = False
            logger.debug(f"  [FALLBACK] Using RSS summary: {article_data['title'][:40]}")

        article_data["word_count"] = self.count_words(article_data["content"])

        # 4. Filter for Noise & Age
        if not self.filter_article(article_data):
            return None

        # 5. Final content hash generation & collision check
        article_data["content_hash"] = self.generate_content_hash(article_data["content"])
        if await self.articles_collection.find_one({"content_hash": article_data["content_hash"]}):
            return None

        return article_data

    async def ingest_from_feed(self, feed_info: Dict, category: str) -> int:
        """Ingest articles from a single RSS feed"""
        feed_name = feed_info.get('name', feed_info.get('url', 'Unknown Feed'))
        logger.info(f"\nFetching from {feed_name} ({category})...")

        entries = await self.fetch_feed(feed_info['url'])
        logger.info(f"  Found {len(entries)} entries in feed")

        tasks = []
        for entry in entries:
            article_data = self.parse_article(entry, feed_info, category)
            if article_data:
                tasks.append(self.process_article(article_data))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        ingested_count = 0
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"  Error processing article: {result}")
                continue
            if result is not None:
                try:
                    await self.articles_collection.insert_one(result)
                    ingested_count += 1
                    full_status = "✓" if result.get('has_full_content') else " "
                    img_status = "📷" if result.get('image_url') else "  "
                    logger.info(f"  [INGESTED] {img_status} [{full_status}] {result['title'][:60]}")
                except Exception as e:
                    logger.error(f"  [ERROR] Failed to insert into DB: {str(e)}")

        return ingested_count

    async def run_ingestion(self) -> Dict[str, Any]:
        """Run full ingestion cycle across all feeds"""
        await self.init_session()

        logger.info("=" * 80)
        logger.info(f"Starting PodNova Article Ingestion at {datetime.now(UK_TZ).strftime('%Y-%m-%d %H:%M:%S %Z')}")
        logger.info("=" * 80)

        stats = {
            "total_ingested": 0,
            "by_category": {},
            "start_time": datetime.now(UK_TZ)
        }

        for category, feeds in RSS_FEEDS.items():
            category_count = 0
            for feed in feeds:
                if not isinstance(feed, dict) or 'url' not in feed:
                    continue
                try:
                    count = await self.ingest_from_feed(feed, category)
                    category_count += count
                except Exception as e:
                    logger.error(f"  Error processing feed {feed.get('name', 'unknown')}: {e}")
                    continue

            stats["by_category"][category] = category_count
            stats["total_ingested"] += category_count

        stats["end_time"] = datetime.now(UK_TZ)
        stats["duration_seconds"] = (stats["end_time"] - stats["start_time"]).total_seconds()

        logger.info("\n" + "=" * 80)
        logger.info("Ingestion Summary")
        logger.info("=" * 80)
        logger.info(f"Total articles ingested: {stats['total_ingested']}")
        for cat, count in stats["by_category"].items():
            logger.info(f"  {cat.capitalize()}: {count}")
        logger.info(f"Duration: {stats['duration_seconds']:.2f} seconds")
        logger.info("=" * 80)

        return stats

    async def close(self):
        """Close database connection and HTTP session"""
        if self.session:
            await self.session.close()
        self.client.close()
        logger.info("Connections closed")


async def main():
    """Main entry point"""
    service = None
    try:
        service = ArticleIngestionService(MONGODB_URI, MONGODB_DB_NAME)
        await service.run_ingestion()
    except Exception as e:
        logger.error(f"Ingestion failed: {e}")
        raise
    finally:
        if service:
            await service.close()

if __name__ == "__main__":
    asyncio.run(main())