"""
Migration Script: Re-embed Articles with gemini-embedding-001
==============================================================

This script re-embeds all articles in the database using the new
gemini-embedding-001 model (replacing text-embedding-004).

It also recalculates topic centroids based on the new embeddings.

Usage:
    python migrate_embeddings.py [--dry-run] [--batch-size N] [--delay N]

Options:
    --dry-run       : Show what would be done without making changes
    --batch-size N  : Process N articles at a time (default: 50)
    --delay N       : Delay in seconds between batches (default: 2)
"""

import os
import sys
import time
import argparse
from datetime import datetime
from typing import List, Dict, Optional
import numpy as np
from pymongo import MongoClient
import certifi
from google import genai

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    from pathlib import Path
    
    # Get the path to app/.env (parent directory of ai_pipeline)
    current_file = Path(__file__).resolve()
    app_dir = current_file.parent.parent  # Go up from ai_pipeline to app
    env_path = app_dir / '.env'
    
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
        print(f"✓ Loaded environment variables from: {env_path}")
    else:
        print(f"⚠️  Warning: .env file not found at {env_path}")
        print("    Make sure environment variables are set manually.")
except ImportError:
    print("⚠️  Warning: python-dotenv not installed. Make sure environment variables are set manually.")
    pass

# Configuration
MONGODB_URI = os.getenv("MONGODB_URI")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "podnova")
EMBEDDING_MODEL = "gemini-embedding-001"
DEFAULT_BATCH_SIZE = 50
DEFAULT_DELAY = 2  # seconds between batches

# Validate required environment variables before initializing client
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("=" * 80)
    print("❌ ERROR: GEMINI_API_KEY not found!")
    print("=" * 80)
    print("\nPlease ensure your .env file contains:")
    print("  GEMINI_API_KEY=your_api_key_here")
    print("  MONGODB_URI=your_mongodb_uri_here")
    print("  MONGODB_DB_NAME=podnova")
    print("\nOr export them manually:")
    print("  export GEMINI_API_KEY='your_api_key_here'")
    print("=" * 80)
    sys.exit(1)

if not MONGODB_URI:
    print("❌ ERROR: MONGODB_URI not found in environment variables")
    sys.exit(1)

# Initialize Gemini client
client = genai.Client(api_key=GEMINI_API_KEY)


class EmbeddingMigration:
    def __init__(self, mongo_uri: str, db_name: str, dry_run: bool = False):
        """Initialize migration service"""
        self.dry_run = dry_run
        self.client = MongoClient(mongo_uri, tlsCAFile=certifi.where())
        self.db = self.client[db_name]
        self.articles_collection = self.db["articles"]
        self.topics_collection = self.db["topics"]
        
        # Stats tracking
        self.stats = {
            "total_articles": 0,
            "articles_processed": 0,
            "articles_failed": 0,
            "topics_updated": 0,
            "topics_failed": 0,
            "start_time": None,
            "end_time": None
        }
    
    def compute_embedding(self, text: str) -> Optional[np.ndarray]:
        """Compute embedding for given text using new Gemini model"""
        try:
            response = client.models.embed_content(
                model=EMBEDDING_MODEL,
                contents=text
            )
            
            if hasattr(response, 'embeddings') and len(response.embeddings) > 0:
                return np.array(response.embeddings[0].values)
            elif hasattr(response, 'embedding'):
                return np.array(response.embedding)
            
            print(f"    ⚠️  Unexpected embedding response format")
            return None
            
        except Exception as e:
            print(f"    ❌ Error computing embedding: {str(e)}")
            return None
    
    def re_embed_article(self, article: Dict) -> bool:
        """Re-embed a single article with the new model"""
        try:
            text_for_embedding = f"{article['title']} {article['description']}"
            new_embedding = self.compute_embedding(text_for_embedding)
            
            if new_embedding is None:
                self.stats["articles_failed"] += 1
                return False
            
            if not self.dry_run:
                self.articles_collection.update_one(
                    {"_id": article["_id"]},
                    {
                        "$set": {
                            "embedding": new_embedding.tolist(),
                            "embedding_model": EMBEDDING_MODEL,
                            "embedding_updated_at": datetime.now()
                        }
                    }
                )
            
            self.stats["articles_processed"] += 1
            return True
            
        except Exception as e:
            print(f"    ❌ Error processing article {article.get('_id')}: {str(e)}")
            self.stats["articles_failed"] += 1
            return False
    
    def compute_topic_centroid(self, article_ids: List[str]) -> Optional[np.ndarray]:
        """Compute centroid embedding from list of article IDs"""
        embeddings = []
        
        for article_id in article_ids:
            article = self.articles_collection.find_one({"_id": article_id})
            if article and "embedding" in article:
                embeddings.append(np.array(article["embedding"]))
        
        return np.mean(embeddings, axis=0) if embeddings else None
    
    def update_topic_centroid(self, topic: Dict) -> bool:
        """Update topic centroid based on re-embedded articles"""
        try:
            topic_id = topic.get("_id")
            article_ids = topic.get("article_ids", [])
            
            if not article_ids:
                print(f"    ⚠️  Topic {topic_id} has no articles, skipping")
                self.stats["topics_failed"] += 1
                return False
            
            new_centroid = self.compute_topic_centroid(article_ids)
            
            if new_centroid is None:
                print(f"    ⚠️  Could not compute centroid for topic {topic_id}")
                self.stats["topics_failed"] += 1
                return False
            
            if not self.dry_run:
                self.topics_collection.update_one(
                    {"_id": topic_id},
                    {
                        "$set": {
                            "centroid_embedding": new_centroid.tolist(),
                            "centroid_model": EMBEDDING_MODEL,
                            "centroid_updated_at": datetime.now()
                        }
                    }
                )
            
            self.stats["topics_updated"] += 1
            return True
            
        except Exception as e:
            print(f"    ❌ Error updating topic {topic.get('_id')}: {str(e)}")
            import traceback
            traceback.print_exc()
            self.stats["topics_failed"] += 1
            return False
    
    def run_migration(self, batch_size: int = DEFAULT_BATCH_SIZE, delay: float = DEFAULT_DELAY):
        """Execute the full migration process"""
        print("=" * 80)
        print("EMBEDDING MIGRATION: text-embedding-004 → gemini-embedding-001")
        print("=" * 80)
        print(f"Mode: {'DRY RUN (no changes will be made)' if self.dry_run else 'LIVE MIGRATION'}")
        print(f"Batch size: {batch_size}")
        print(f"Delay between batches: {delay}s")
        print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 80)
        
        self.stats["start_time"] = datetime.now()
        
        # Step 1: Count total articles
        total_articles = self.articles_collection.count_documents({})
        self.stats["total_articles"] = total_articles
        print(f"\n📊 Found {total_articles} articles to re-embed")
        
        if total_articles == 0:
            print("No articles to process. Exiting.")
            return
        
        # Step 2: Re-embed articles in batches
        print("\n" + "=" * 80)
        print("PHASE 1: Re-embedding Articles")
        print("=" * 80)
        
        batch_num = 0
        articles_cursor = self.articles_collection.find({})
        
        batch = []
        for article in articles_cursor:
            batch.append(article)
            
            if len(batch) >= batch_size:
                batch_num += 1
                self._process_article_batch(batch, batch_num, total_articles)
                batch = []
                
                # Rate limiting
                if batch_num > 1:
                    time.sleep(delay)
        
        # Process remaining articles
        if batch:
            batch_num += 1
            self._process_article_batch(batch, batch_num, total_articles)
        
        # Step 3: Update topic centroids
        print("\n" + "=" * 80)
        print("PHASE 2: Updating Topic Centroids")
        print("=" * 80)
        
        topics = list(self.topics_collection.find({}))
        total_topics = len(topics)
        print(f"\n📊 Found {total_topics} topics to update")
        
        for i, topic in enumerate(topics, 1):
            try:
                # Safely get title with proper null handling
                title = topic.get('title') if topic else 'Untitled'
                title_display = (title[:50] if title else 'Untitled')
                print(f"  [{i}/{total_topics}] Updating topic: {title_display}...")
                
                if not topic:
                    print(f"    ⚠️  Topic is None, skipping")
                    self.stats["topics_failed"] += 1
                    continue
                
                self.update_topic_centroid(topic)
            except Exception as e:
                print(f"    ❌ Exception processing topic {i}: {str(e)}")
                import traceback
                traceback.print_exc()
                self.stats["topics_failed"] += 1
                continue
            
            if i % 10 == 0 and i < total_topics:
                time.sleep(1)  # Small delay every 10 topics
        
        # Final summary
        self.stats["end_time"] = datetime.now()
        self._print_summary()
    
    def _process_article_batch(self, batch: List[Dict], batch_num: int, total: int):
        """Process a batch of articles"""
        start_idx = (batch_num - 1) * len(batch) + 1
        end_idx = start_idx + len(batch) - 1
        
        print(f"\n📦 Batch {batch_num} (articles {start_idx}-{end_idx} of {total})")
        
        for i, article in enumerate(batch, 1):
            title_preview = article.get('title', 'Untitled')[:50]
            print(f"  [{start_idx + i - 1}/{total}] {title_preview}...", end=" ")
            
            if self.re_embed_article(article):
                print("✅")
            else:
                print("❌")
    
    def _print_summary(self):
        """Print migration summary"""
        duration = (self.stats["end_time"] - self.stats["start_time"]).total_seconds()
        
        print("\n" + "=" * 80)
        print("MIGRATION SUMMARY")
        print("=" * 80)
        print(f"Mode: {'DRY RUN' if self.dry_run else 'LIVE'}")
        print(f"\nArticles:")
        print(f"  Total: {self.stats['total_articles']}")
        print(f"  Processed: {self.stats['articles_processed']} ✅")
        print(f"  Failed: {self.stats['articles_failed']} ❌")
        
        print(f"\nTopics:")
        print(f"  Updated: {self.stats['topics_updated']} ✅")
        print(f"  Failed: {self.stats['topics_failed']} ❌")
        
        print(f"\nTime:")
        print(f"  Duration: {duration:.2f} seconds ({duration/60:.2f} minutes)")
        print(f"  Articles/second: {self.stats['articles_processed']/duration:.2f}")
        
        success_rate = (self.stats['articles_processed'] / self.stats['total_articles'] * 100) if self.stats['total_articles'] > 0 else 0
        print(f"\nSuccess rate: {success_rate:.1f}%")
        print("=" * 80)
        
        if self.dry_run:
            print("\n⚠️  This was a DRY RUN - no changes were made to the database")
            print("Run without --dry-run to perform the actual migration")


def main():
    """Main entry point with CLI argument parsing"""
    parser = argparse.ArgumentParser(
        description="Migrate article embeddings from text-embedding-004 to gemini-embedding-001",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Perform a dry run without making any changes"
    )
    
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Number of articles to process in each batch (default: {DEFAULT_BATCH_SIZE})"
    )
    
    parser.add_argument(
        "--delay",
        type=float,
        default=DEFAULT_DELAY,
        help=f"Delay in seconds between batches (default: {DEFAULT_DELAY})"
    )
    
    args = parser.parse_args()
    
    # Validate environment variables
    if not MONGODB_URI:
        print("❌ Error: MONGODB_URI environment variable not set")
        sys.exit(1)
    
    if not os.getenv("GEMINI_API_KEY"):
        print("❌ Error: GEMINI_API_KEY environment variable not set")
        sys.exit(1)
    
    # Run migration
    migration = EmbeddingMigration(
        mongo_uri=MONGODB_URI,
        db_name=MONGODB_DB_NAME,
        dry_run=args.dry_run
    )
    
    try:
        migration.run_migration(
            batch_size=args.batch_size,
            delay=args.delay
        )
    except KeyboardInterrupt:
        print("\n\n⚠️  Migration interrupted by user")
        migration.stats["end_time"] = datetime.now()
        migration._print_summary()
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Migration failed with error: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()