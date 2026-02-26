"""
PodNova Article Ingestion Module
FULLY ASYNC VERSION with Motor and aiohttp
Fetches articles from RSS feeds, filters for quality, and stores in MongoDB
"""
from app.config import MONGODB_URI, MONGODB_DB_NAME

import feedparser
import hashlib
import ssl
import certifi
import urllib.request
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
import motor.motor_asyncio
from langdetect import detect
import aiohttp
import asyncio
from bs4 import BeautifulSoup
import re
import logging

# Ingestion Configuration
from app.ai_pipeline.feed_config import RSS_FEEDS, IMPORTANT_KEYWORDS, NOISE_KEYWORDS, FETCH_INTERVAL_HOURS, MIN_WORD_COUNT, MAX_WORD_COUNT, MAX_ARTICLE_AGE_HOURS

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


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

        # Semaphore to limit concurrent HTTP requests
        self.http_semaphore = asyncio.Semaphore(5)

        # Create indexes on initialization
        asyncio.create_task(self._ensure_indexes())

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

    def _fetch_feed_sync(self, feed_url: str) -> List[Dict]:
        """Fetch and parse an RSS feed (sync - feedparser isn't async)"""
        try:
            ssl_context = ssl.create_default_context(cafile=certifi.where())
            feed = feedparser.parse(feed_url, handlers=[
                urllib.request.HTTPSHandler(context=ssl_context)
            ])
            return feed.entries
        except Exception as e:
            logger.error(f"Error fetching feed {feed_url}: {str(e)}")
            return []

    async def fetch_feed(self, feed_url: str) -> List[Dict]:
        """Async wrapper for feed fetching"""
        return await asyncio.to_thread(self._fetch_feed_sync, feed_url)

    async def extract_full_content(self, url: str) -> Optional[str]:
        """Extract full article content from URL using aiohttp"""
        try:
            async with self.http_semaphore:
                await asyncio.sleep(1)  # Polite delay
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, timeout=15, headers={
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }) as response:
                        if response.status != 200:
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
            text = re.sub(r'\s+', ' ', text).strip()
            return text

        except asyncio.TimeoutError:
            logger.warning(f"Timeout extracting content from {url}")
            return None
        except Exception as e:
            logger.error(f"Error extracting content from {url}: {str(e)}")
            return None

    def extract_image_from_entry(self, entry: Dict, url: str) -> Optional[str]:
        """
        Extract the highest quality image URL from RSS entry.
        
        Prioritizes:
        1. Larger images (width/height if available)
        2. Images from reliable attributes (media_content > enclosures > thumbnails)
        3. Images from main content over summaries
        4. Modern formats (webp, jpg) over older ones
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
                        'priority': 100,  # Highest priority
                        'source': 'media_content'
                    })
        
        # Method 2: RSS enclosures
        if hasattr(entry, 'enclosures') and entry.enclosures:
            for enclosure in entry.enclosures:
                if enclosure.get('type', '').startswith('image/'):
                    img_url = enclosure.get('href') or enclosure.get('url')
                    if img_url:
                        # Try to get dimensions from enclosure
                        width = self._parse_dimension(enclosure.get('width'))
                        height = self._parse_dimension(enclosure.get('height'))
                        candidates.append({
                            'url': img_url,
                            'width': width,
                            'height': height,
                            'priority': 90,
                            'source': 'enclosure'
                        })
        
        # Method 3: media:thumbnail (usually lower quality)
        if hasattr(entry, 'media_thumbnail') and entry.media_thumbnail:
            for thumb in entry.media_thumbnail:
                if thumb.get('url'):
                    width = self._parse_dimension(thumb.get('width'))
                    height = self._parse_dimension(thumb.get('height'))
                    candidates.append({
                        'url': thumb['url'],
                        'width': width,
                        'height': height,
                        'priority': 70,  # Lower priority for thumbnails
                        'source': 'thumbnail'
                    })
        
        # Method 4: Extract from HTML content (parse multiple images)
        if hasattr(entry, 'content') and entry.content:
            content_html = entry.content[0].get('value', '')
            html_images = self._extract_images_from_html(content_html)
            for img in html_images:
                candidates.append({
                    'url': img['url'],
                    'width': img.get('width'),
                    'height': img.get('height'),
                    'priority': 80,  # Good priority for content images
                    'source': 'content'
                })
        
        # Method 5: Extract from summary (lower priority)
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
        
        # Score and select best image
        if not candidates:
            return None
        
        best_image = self._select_best_image(candidates)
        
        if not best_image:
            return None
        
        # Clean and validate URL
        image_url = best_image['url']
        
        if image_url.startswith('//'):
            image_url = 'https:' + image_url
        elif image_url.startswith('/') and url:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            image_url = f"{parsed.scheme}://{parsed.netloc}{image_url}"
        
        return image_url


    def _parse_dimension(self, dimension) -> Optional[int]:
        """Parse dimension string to integer"""
        if not dimension:
            return None
        
        try:
            # Handle strings like "500px" or just "500"
            if isinstance(dimension, str):
                dimension = dimension.replace('px', '').strip()
            return int(dimension)
        except (ValueError, TypeError):
            return None


    def _extract_images_from_html(self, html: str) -> List[Dict]:
        """
        Extract multiple images from HTML with their attributes.
        Returns list of dicts with url, width, height.
        """
        from bs4 import BeautifulSoup
        
        images = []
        
        if not html:
            return images
        
        try:
            soup = BeautifulSoup(html, 'html.parser')
            img_tags = soup.find_all('img')
            
            for img in img_tags:
                src = img.get('src') or img.get('data-src')
                if src:
                    # Skip tiny images, tracking pixels, placeholders
                    if self._is_valid_image_url(src):
                        width = self._parse_dimension(img.get('width'))
                        height = self._parse_dimension(img.get('height'))
                        
                        images.append({
                            'url': src,
                            'width': width,
                            'height': height,
                            'alt': img.get('alt', ''),
                        })
            
        except Exception as e:
            print(f"Error extracting images from HTML: {e}")
        
        return images


    def _is_valid_image_url(self, url: str) -> bool:
        """
        Filter out invalid/unwanted images.
        
        Rejects:
        - Tracking pixels (1x1)
        - Placeholder images
        - Social media icons
        - Data URIs (too small)
        """
        if not url:
            return False
        
        url_lower = url.lower()
        
        # Reject data URIs
        if url_lower.startswith('data:'):
            return False
        
        # Reject common tracking/social/icon patterns
        reject_patterns = [
            'pixel',
            'spacer',
            'blank',
            'placeholder',
            '1x1',
            'tracker',
            'icon',
            'logo-small',
            'avatar',
            'favicon',
            'sprite',
        ]
        
        for pattern in reject_patterns:
            if pattern in url_lower:
                return False
        
        # Reject very small dimension hints in URL
        if any(x in url_lower for x in ['w=1', 'h=1', 'size=1', '16x16', '32x32']):
            return False
        
        return True


    def _select_best_image(self, candidates: List[Dict]) -> Optional[Dict]:
        """
        Score candidates and return the best image.
        
        Scoring criteria:
        1. Base priority (source type)
        2. Size (prefer larger images)
        3. Aspect ratio (prefer landscape ~16:9 for news)
        4. Format preference (webp, jpg > png > gif)
        """
        if not candidates:
            return None
        
        for candidate in candidates:
            score = candidate['priority']
            
            # Size scoring
            width = candidate.get('width')
            height = candidate.get('height')
            
            if width and height:
                # Prefer larger images (but not absurdly large)
                area = width * height
                
                if area > 1000000:  # > 1MP, very good
                    score += 50
                elif area > 500000:  # > 0.5MP, good
                    score += 40
                elif area > 200000:  # > 0.2MP, decent
                    score += 30
                elif area > 100000:  # > 0.1MP, okay
                    score += 20
                elif area < 10000:   # < 0.01MP, probably icon/thumbnail
                    score -= 30
                
                # Aspect ratio scoring (prefer ~16:9 for news images)
                aspect_ratio = width / height if height > 0 else 0
                
                # Ideal range: 1.5 - 2.0 (landscape)
                if 1.5 <= aspect_ratio <= 2.0:
                    score += 15
                elif 1.2 <= aspect_ratio <= 2.5:
                    score += 10
                elif aspect_ratio < 0.5 or aspect_ratio > 3.0:
                    score -= 15  # Too narrow or too wide
            
            elif width:  # Only width available
                if width >= 1200:
                    score += 30
                elif width >= 800:
                    score += 20
                elif width >= 600:
                    score += 10
                elif width < 200:
                    score -= 20
            
            # Format preference
            url = candidate['url'].lower()
            
            if url.endswith('.webp'):
                score += 10  # Modern format
            elif url.endswith(('.jpg', '.jpeg')):
                score += 8   # Good compression
            elif url.endswith('.png'):
                score += 5   # Good quality but larger
            elif url.endswith('.gif'):
                score -= 10  # Usually low quality or animated
            
            # Penalize if URL suggests it's a thumbnail
            if any(x in url for x in ['thumb', 'small', 'icon', 'avatar', 'logo']):
                score -= 25
            
            # Bonus for containing quality indicators in URL
            if any(x in url for x in ['large', 'full', 'original', 'hires', 'hero']):
                score += 20
            
            candidate['score'] = score
        
        # Sort by score (descending) and return best
        candidates.sort(key=lambda x: x['score'], reverse=True)
        
        # Filter out very low scores (likely bad images)
        best = candidates[0]
        if best['score'] < 50:  # Threshold for acceptable quality
            return None
        
        return best


    def _extract_image_from_html(self, html: str) -> Optional[str]:
        """
        Legacy method - now uses the improved extraction.
        Kept for backward compatibility.
        """
        images = self._extract_images_from_html(html)
        if images:
            # Return the first image URL (legacy behavior)
            # Consider deprecating this in favor of the scoring method
            return images[0]['url']
        return None

    def generate_content_hash(self, text: str) -> str:
        """Generate a hash for deduplication"""
        return hashlib.md5(text.encode('utf-8')).hexdigest()

    def count_words(self, text: str) -> int:
        """Count words in text"""
        return len(text.split())

    def is_recent(self, published_date: datetime) -> bool:
        """Check if article is within acceptable time window"""
        cutoff = datetime.now() - timedelta(hours=MAX_ARTICLE_AGE_HOURS)
        return published_date > cutoff

    def detect_language(self, text: str) -> str:
        """Detect text language"""
        try:
            return detect(text[:500])
        except Exception as e:
            logger.error(f"Language detection error: {e}")
            return "unknown"

    def is_newsworthy(self, title: str, content: str, category: str) -> bool:
        """Check if article contains newsworthy keywords"""
        text_to_check = (title + " " + content[:500]).lower()
        category_keywords = IMPORTANT_KEYWORDS.get(category, [])
        has_important = any(keyword.lower() in text_to_check for keyword in category_keywords)
        has_noise = any(keyword.lower() in text_to_check for keyword in NOISE_KEYWORDS)
        return has_important and not has_noise

    def filter_article(self, article_data: Dict[str, Any]) -> bool:
        """
        Apply quality filters to determine if article should be ingested
        Returns True if article passes all filters
        """
        content = article_data.get("content", "")
        title = article_data.get("title", "")
        category = article_data.get("category", "")

        word_count = self.count_words(content)
        if word_count < MIN_WORD_COUNT or word_count > MAX_WORD_COUNT:
            logger.info(f"  [REJECTED] {title[:60]} - Word count: {word_count}")
            return False

        language = self.detect_language(content[:500])
        if language != "en":
            logger.info(f"  [REJECTED] {title[:60]} - Language: {language}")
            return False

        if not self.is_recent(article_data["published_date"]):
            logger.info(f"  [REJECTED] {title[:60]} - Too old")
            return False

        if "read more" in content.lower()[:200] and word_count < 500:
            logger.info(f"  [REJECTED] {title[:60]} - Placeholder content")
            return False

        if not self.is_newsworthy(title, content, category):
            logger.info(f"  [REJECTED] {title[:60]} - Not newsworthy enough")
            return False

        return True

    async def article_exists(self, url: str, content_hash: str) -> bool:
        """Check if article already exists in database"""
        existing = await self.articles_collection.find_one({
            "$or": [
                {"url": url},
                {"content_hash": content_hash}
            ]
        })
        return existing is not None

    def parse_article(self, entry: Dict, feed_info: Dict, category: str) -> Optional[Dict[str, Any]]:
        """Parse RSS entry into article document"""
        try:
            title = entry.get('title', '').strip()
            url = entry.get('link', '').strip()

            if not title or not url:
                return None

            # Get publication date
            if hasattr(entry, 'published_parsed') and entry.published_parsed:
                pub_date = datetime(*entry.published_parsed[:6])
            else:
                pub_date = datetime.now()

            # Get description/summary from RSS
            description = entry.get('summary', '') or entry.get('description', '')
            description = BeautifulSoup(description, 'html.parser').get_text(separator=' ', strip=True)
            description = re.sub(r'\s+', ' ', description).strip()

            # Extract image URL
            image_url = self.extract_image_from_entry(entry, url)

            article_data = {
                "title": title,
                "url": url,
                "content": description,  # Will be overwritten if full content extraction succeeds
                "description": description,
                "published_date": pub_date,
                "category": category,
                "source": feed_info.get("name", "Unknown Source"),  # Use .get() with default
                "source_priority": feed_info.get("priority", "medium"),
                "ingested_at": datetime.now(),
                "status": "pending_clustering",
                "word_count": self.count_words(description),
                "image_url": image_url
            }

            return article_data

        except Exception as e:
            logger.error(f"Error parsing article: {str(e)}")
            return None

    async def process_article(self, article_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Process article with optional full content extraction.
        Maintains original article structure for backward compatibility.
        """
        # Try to get full content
        full_content = await self.extract_full_content(article_data["url"])

        if full_content and self.count_words(full_content) >= MIN_WORD_COUNT:
            article_data["content"] = full_content
            article_data["description"] = full_content[:500] + "..." if len(full_content) > 500 else full_content
            article_data["word_count"] = self.count_words(full_content)
            article_data["has_full_content"] = True
            logger.debug(f"  Full content extracted for {article_data['title'][:60]}")
        else:
            # Keep the original description
            article_data["has_full_content"] = False
            logger.debug(f"  Using RSS description for {article_data['title'][:60]} ({article_data['word_count']} words)")

        # Generate content hash from actual content
        article_data["content_hash"] = self.generate_content_hash(article_data["content"])

        # Check if already exists
        if await self.article_exists(article_data['url'], article_data['content_hash']):
            logger.info(f"  [SKIPPED] {article_data['title'][:60]} - Already exists")
            return None

        # Apply quality filters
        if not self.filter_article(article_data):
            return None

        return article_data

    async def ingest_from_feed(self, feed_info: Dict, category: str) -> int:
        """Ingest articles from a single RSS feed"""
        # Get feed name safely with fallback
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
                    img_status = "📷" if result.get('image_url') else "  "
                    full_status = "✓" if result.get('has_full_content') else " "
                    logger.info(f"  [INGESTED] {img_status} [{full_status}] {result['title'][:60]} ({result['word_count']} words)")
                except Exception as e:
                    logger.error(f"  [ERROR] Failed to insert: {str(e)}")

        return ingested_count

    async def run_ingestion(self) -> Dict[str, Any]:
        """Run full ingestion cycle across all feeds"""
        logger.info("=" * 80)
        logger.info("Starting PodNova Article Ingestion")
        logger.info(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        logger.info("=" * 80)

        stats = {
            "total_ingested": 0,
            "by_category": {},
            "start_time": datetime.now()
        }

        for category, feeds in RSS_FEEDS.items():
            category_count = 0
            for feed in feeds:
                # Validate feed has required fields
                if not isinstance(feed, dict):
                    logger.error(f"  Invalid feed format in {category}: {feed}")
                    continue
                    
                if 'url' not in feed:
                    logger.error(f"  Feed missing URL in {category}: {feed}")
                    continue
                    
                try:
                    count = await self.ingest_from_feed(feed, category)
                    category_count += count
                except Exception as e:
                    logger.error(f"  Error processing feed {feed.get('name', 'unknown')}: {e}")
                    continue

            stats["by_category"][category] = category_count
            stats["total_ingested"] += category_count

        stats["end_time"] = datetime.now()
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
        """Close database connection"""
        self.client.close()
        logger.info("MongoDB connection closed")


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