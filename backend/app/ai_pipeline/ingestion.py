"""
PodNova Article Ingestion Module
Fetches articles from RSS feeds, filters for quality, and stores in MongoDB
NOW WITH IMAGE EXTRACTION
"""
from app.config import MONGODB_URI, MONGODB_DB_NAME

import feedparser
import hashlib
import ssl
import certifi
import urllib.request
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from pymongo import MongoClient
from langdetect import detect
import requests
from bs4 import BeautifulSoup
import re

# Ingestion Configuration
from app.ai_pipeline.feed_config import RSS_FEEDS, IMPORTANT_KEYWORDS, NOISE_KEYWORDS, FETCH_INTERVAL_HOURS, MIN_WORD_COUNT, MAX_WORD_COUNT, MAX_ARTICLE_AGE_HOURS

class ArticleIngestionService:
    def __init__(self, mongo_uri: str, db_name: str):
        """Initialize the ingestion service with MongoDB connection"""
        import certifi
        
        self.client = MongoClient(mongo_uri, tlsCAFile=certifi.where())
        self.db = self.client[db_name]
        self.articles_collection = self.db["articles"]
        self.categories_collection = self.db["categories"]
        
        # Create indexes for efficient lookups
        self.articles_collection.create_index("content_hash", unique=True)
        self.articles_collection.create_index("url", unique=True)
        self.articles_collection.create_index("published_date")
        
    def fetch_feed(self, feed_url: str) -> List[Dict]:
        """Fetch and parse an RSS feed"""
        try:
            # Create SSL context with certifi certificates
            ssl_context = ssl.create_default_context(cafile=certifi.where())
            
            # Parse feed with SSL context
            feed = feedparser.parse(feed_url, handlers=[
                urllib.request.HTTPSHandler(context=ssl_context)
            ])
            
            return feed.entries
        except Exception as e:
            print(f"Error fetching feed {feed_url}: {str(e)}")
            return []
    
    def extract_full_content(self, url: str) -> Optional[str]:
        """Attempt to extract full article content from URL"""
        try:
            response = requests.get(url, timeout=10, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            })
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Remove script and style elements
            for script in soup(["script", "style", "nav", "footer", "header"]):
                script.decompose()
            
            # Try to find main content area
            content = None
            for selector in ['article', '.article-body', '.content', 'main']:
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
            
        except Exception as e:
            print(f"Error extracting content from {url}: {str(e)}")
            return None
    
    def extract_image_from_entry(self, entry: Dict, url: str) -> Optional[str]:
        """Extract image URL from RSS entry"""
        image_url = None
        
        # Method 1: Check RSS feed media content
        if hasattr(entry, 'media_content') and entry.media_content:
            image_url = entry.media_content[0].get('url')
        
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
        
        elif hasattr(entry, 'summary'):
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
        except:
            pass
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
            return detect(text)
        except:
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
    
    def filter_article(self, article_data: Dict) -> bool:
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
            print(f"  [REJECTED] {title[:60]} - Word count: {word_count}")
            return False
        
        # Filter 2: Language check
        language = self.detect_language(content[:500])
        if language != "en":
            print(f"  [REJECTED] {title[:60]} - Language: {language}")
            return False
        
        # Filter 3: Recency - only very recent news
        if not self.is_recent(article_data["published_date"]):
            print(f"  [REJECTED] {title[:60]} - Too old")
            return False
        
        # Filter 4: Minimum content quality
        if "read more" in content.lower()[:200] and word_count < 500:
            print(f"  [REJECTED] {title[:60]} - Placeholder content")
            return False
        
        # Filter 5: Newsworthiness - must be important/relevant
        if not self.is_newsworthy(title, content, category):
            print(f"  [REJECTED] {title[:60]} - Not newsworthy enough")
            return False
        
        return True
    
    def article_exists(self, url: str, content_hash: str) -> bool:
        """Check if article already exists in database"""
        existing = self.articles_collection.find_one({
            "$or": [
                {"url": url},
                {"content_hash": content_hash}
            ]
        })
        return existing is not None
    
    def parse_article(self, entry: Dict, feed_info: Dict, category: str) -> Optional[Dict]:
        """Parse RSS entry into article document"""
        try:
            # Extract basic info from RSS
            title = entry.get('title', '').strip()
            url = entry.get('link', '').strip()
            
            # Get publication date
            if hasattr(entry, 'published_parsed') and entry.published_parsed:
                pub_date = datetime(*entry.published_parsed[:6])
            else:
                pub_date = datetime.now()
            
            # Get description/summary from RSS
            description = entry.get('summary', '') or entry.get('description', '')
            
            # Try to extract full content
            full_content = self.extract_full_content(url)
            
            # Use full content if available, otherwise use RSS description
            content = full_content if full_content else description
            
            # Clean HTML tags from content
            content = BeautifulSoup(content, 'html.parser').get_text(separator=' ', strip=True)
            content = re.sub(r'\s+', ' ', content).strip()
            
            if not content or not title or not url:
                return None
            
            # Extract image URL
            image_url = self.extract_image_from_entry(entry, url)
            
            # Generate content hash for deduplication
            content_hash = self.generate_content_hash(content)
            
            article_data = {
                "title": title,
                "url": url,
                "content": content,
                "description": BeautifulSoup(description, 'html.parser').get_text(separator=' ', strip=True),
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
            print(f"Error parsing article: {str(e)}")
            return None
    
    def ingest_from_feed(self, feed_info: Dict, category: str) -> int:
        """Ingest articles from a single RSS feed"""
        print(f"\nFetching from {feed_info['name']} ({category})...")
        
        entries = self.fetch_feed(feed_info['url'])
        print(f"  Found {len(entries)} entries in feed")
        
        ingested_count = 0
        
        for entry in entries:
            article_data = self.parse_article(entry, feed_info, category)
            
            if not article_data:
                continue
            
            # Check if already exists
            if self.article_exists(article_data['url'], article_data['content_hash']):
                print(f"  [SKIPPED] {article_data['title'][:60]} - Already exists")
                continue
            
            # Apply quality filters
            if not self.filter_article(article_data):
                continue
            
            # Insert into MongoDB
            try:
                self.articles_collection.insert_one(article_data)
                ingested_count += 1
                img_status = "📷" if article_data.get('image_url') else "  "
                print(f"  [INGESTED] {img_status} {article_data['title'][:60]} ({article_data['word_count']} words)")
            except Exception as e:
                print(f"  [ERROR] Failed to insert: {str(e)}")
        
        return ingested_count
    
    def run_ingestion(self) -> Dict:
        """Run full ingestion cycle across all feeds"""
        print("=" * 80)
        print("Starting PodNova Article Ingestion")
        print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 80)
        
        stats = {
            "total_ingested": 0,
            "by_category": {},
            "start_time": datetime.now()
        }
        
        for category, feeds in RSS_FEEDS.items():
            category_count = 0
            for feed in feeds:
                count = self.ingest_from_feed(feed, category)
                category_count += count
            
            stats["by_category"][category] = category_count
            stats["total_ingested"] += category_count
        
        stats["end_time"] = datetime.now()
        stats["duration_seconds"] = (stats["end_time"] - stats["start_time"]).total_seconds()
        
        print("\n" + "=" * 80)
        print("Ingestion Summary")
        print("=" * 80)
        print(f"Total articles ingested: {stats['total_ingested']}")
        for cat, count in stats["by_category"].items():
            print(f"  {cat.capitalize()}: {count}")
        print(f"Duration: {stats['duration_seconds']:.2f} seconds")
        print("=" * 80)
        
        return stats


def main():
    """Main entry point for manual execution or scheduling"""
    service = ArticleIngestionService(MONGODB_URI, MONGODB_DB_NAME)
    service.run_ingestion()


if __name__ == "__main__":
    main()