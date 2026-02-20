# backend/app/ai_pipeline/ingestion.py
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
            tlsCAFile=certifi.where(),
            maxPoolSize=50,
            minPoolSize=10
        )
        self.db = self.client[db_name]
        self.articles_collection = self.db["articles"]
        self.categories_collection = self.db["categories"]
        
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
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=10, headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }) as response:
                    if response.status != 200:
                        return None
                    html = await response.text()
            
            soup = BeautifulSoup(html, 'html.parser')
            
            # Remove script and style elements
            for script in soup(["script", "style", "nav", "footer", "header", "aside"]):
                script.decompose()
            
            # Try to find main content area
            content = None
            for selector in ['article', '.article-body', '.content', 'main', '.post-content', '.story-body']:
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
        """Extract image URL from RSS entry"""
        image_url = None
        
        # Method 1: Check RSS feed media content
        if hasattr(entry, 'media_content') and entry.media_content:
            for media in entry.media_content:
                if media.get('url'):
                    image_url = media['url']
                    break
        
        # Method 2: Check RSS enclosures
        elif hasattr(entry, 'enclosures') and entry.enclosures:
            for enclosure in entry.enclosures:
                if enclosure.get('type', '').startswith('image/'):
                    image_url = enclosure.get('href') or enclosure.get('url')
                    break
        
        # Method 3: Check media:thumbnail
        elif hasattr(entry, 'media_thumbnail') and entry.media_thumbnail:
            image_url = entry.media_thumbnail[0].get('url')
        
        # Method 4: Extract from HTML content
        elif hasattr(entry, 'content') and entry.content:
            content_html = entry.content[0].get('value', '')
            image_url = self._extract_image_from_html(content_html)
        
        elif hasattr(entry, 'summary') and entry.summary:
            image_url = self._extract_image_from_html(entry.summary)
        
        # Clean and validate URL
        if image_url:
            # Handle relative URLs
            if image_url.startswith('//'):
                image_url = 'https:' + image_url
            elif image_url.startswith('/') and url:
                from urllib.parse import urlparse
                parsed = urlparse(url)
                image_url = f"{parsed.scheme}://{parsed.netloc}{image_url}"
        
        return image_url
    
    def _extract_image_from_html(self, html_content: str) -> Optional[str]:
        """Extract image URL from HTML content"""
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            img = soup.find('img')
            if img:
                return img.get('src') or img.get('data-src')
        except Exception as e:
            logger.error(f"Error extracting image from HTML: {e}")
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
        
        # Check for important keywords in the category
        category_keywords = IMPORTANT_KEYWORDS.get(category, [])
        has_important_keyword = any(keyword.lower() in text_to_check for keyword in category_keywords)
        
        # Check for noise keywords
        has_noise_keyword = any(keyword.lower() in text_to_check for keyword in NOISE_KEYWORDS)
        
        return has_important_keyword and not has_noise_keyword
    
    def filter_article(self, article_data: Dict[str, Any]) -> bool:
        """
        Apply quality filters to determine if article should be ingested
        Returns True if article passes all filters
        """
        content = article_data.get("content", "")
        title = article_data.get("title", "")
        category = article_data.get("category", "")
        
        # Filter 1: Content length - must be substantial
        word_count = self.count_words(content)
        if word_count < MIN_WORD_COUNT or word_count > MAX_WORD_COUNT:
            logger.info(f"  [REJECTED] {title[:60]} - Word count: {word_count}")
            return False
        
        # Filter 2: Language check
        language = self.detect_language(content[:500])
        if language != "en":
            logger.info(f"  [REJECTED] {title[:60]} - Language: {language}")
            return False
        
        # Filter 3: Recency - only very recent news
        if not self.is_recent(article_data["published_date"]):
            logger.info(f"  [REJECTED] {title[:60]} - Too old")
            return False
        
        # Filter 4: Minimum content quality
        if "read more" in content.lower()[:200] and word_count < 500:
            logger.info(f"  [REJECTED] {title[:60]} - Placeholder content")
            return False
        
        # Filter 5: Newsworthiness - must be important/relevant
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
            # Extract basic info from RSS
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
            
            # Clean description
            description = BeautifulSoup(description, 'html.parser').get_text(separator=' ', strip=True)
            description = re.sub(r'\s+', ' ', description).strip()
            
            # For now, use description as content (full content extraction is optional)
            content = description
            
            # Extract image URL
            image_url = self.extract_image_from_entry(entry, url)
            
            # Generate content hash for deduplication
            content_hash = self.generate_content_hash(content)
            
            article_data = {
                "title": title,
                "url": url,
                "content": content,
                "description": description,
                "content_hash": content_hash,
                "published_date": pub_date,
                "category": category,
                "source": feed_info["name"],
                "source_priority": feed_info.get("priority", "medium"),
                "ingested_at": datetime.now(),
                "status": "pending_clustering",
                "word_count": self.count_words(content),
                "image_url": image_url
            }
            
            return article_data
            
        except Exception as e:
            logger.error(f"Error parsing article: {str(e)}")
            return None
    
    async def ingest_from_feed(self, feed_info: Dict, category: str) -> int:
        """Ingest articles from a single RSS feed"""
        logger.info(f"\nFetching from {feed_info['name']} ({category})...")
        
        entries = await self.fetch_feed(feed_info['url'])
        logger.info(f"  Found {len(entries)} entries in feed")
        
        ingested_count = 0
        
        for entry in entries:
            article_data = self.parse_article(entry, feed_info, category)
            
            if not article_data:
                continue
            
            # Check if already exists
            if await self.article_exists(article_data['url'], article_data['content_hash']):
                logger.info(f"  [SKIPPED] {article_data['title'][:60]} - Already exists")
                continue
            
            # Apply quality filters
            if not self.filter_article(article_data):
                continue
            
            # Insert into MongoDB
            try:
                await self.articles_collection.insert_one(article_data)
                ingested_count += 1
                img_status = "📷" if article_data.get('image_url') else "  "
                logger.info(f"  [INGESTED] {img_status} {article_data['title'][:60]} ({article_data['word_count']} words)")
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
                count = await self.ingest_from_feed(feed, category)
                category_count += count
            
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