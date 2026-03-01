# app/ai_pipeline/article_maintenance.py
"""
PodNova Article and Topic Maintenance Module
Manages article limits, cleanup, and topic lifecycle.
FULLY ASYNC, TIMEZONE SAFE, AND MEMORY OPTIMIZED.
"""
from app.config import MONGODB_URI, MONGODB_DB_NAME
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import List, Dict, Optional, Any
import motor.motor_asyncio
import certifi
import numpy as np
import asyncio
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Timezone
UK_TZ = ZoneInfo("Europe/London")

class MaintenanceConfig:
    """All maintenance-related settings"""
    
    # Topic article limits by age
    TOPIC_LIMITS = {
        "new": {"max_age_days": 7, "max_articles": 30},
        "active": {"max_age_days": 30, "max_articles": 15},
        "mature": {"max_age_days": None, "max_articles": 10}
    }
    
    # Topic lifecycle thresholds (days)
    TOPIC_STALE_DAYS = 14          # Topics become stale after 14 days of no activity
    TOPIC_ARCHIVE_DAYS = 60        # Stale topics are archived after 60 days
    TOPIC_DELETE_DAYS = 180        # Archived topics are deleted after 180 days
    
    # Cleanup settings
    ORPHAN_ARTICLE_GRACE_DAYS = 3   # Days before orphan articles are cleaned up
    MIN_TOPIC_ARTICLES = 2          # Minimum articles needed to keep a topic
    ARCHIVED_ARTICLE_PURGE_DAYS = 30 # Days before permanently deleting archived articles
    
    # Article ranking weights (must sum to 1.0)
    RANKING_WEIGHTS = {
        "recency": 0.4,
        "source_priority": 0.3,
        "similarity_to_centroid": 0.2,
        "content_quality": 0.1
    }
    
    # Source priority mapping
    PRIORITY_MAP = {
        "high": 1.0,
        "medium": 0.6,
        "low": 0.3
    }
    
    # Resurrection settings
    RESURRECTION_SIMILARITY_BONUS = 0.15
    MAX_RESURRECTION_AGE_DAYS = 14


class MaintenanceService:
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
        self.topics_collection = self.db["topics"]
        self.config = MaintenanceConfig()
        
        asyncio.create_task(self._ensure_indexes())
    
    async def _ensure_indexes(self):
        """Create maintenance-specific indexes"""
        try:
            await self.articles_collection.create_index([("status", 1), ("ingested_at", 1)])
            await self.articles_collection.create_index("topic_id")
            await self.topics_collection.create_index([("status", 1), ("last_updated", 1)])
            logger.info("Maintenance indexes verified")
        except Exception as e:
            logger.error(f"Error creating indexes: {e}")
    
    def cosine_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Calculate cosine similarity between two vectors"""
        dot_product = np.dot(vec1, vec2)
        norm_product = np.linalg.norm(vec1) * np.linalg.norm(vec2)
        return float(dot_product / norm_product) if norm_product != 0 else 0.0
    
    def rank_article(self, article: Dict[str, Any], topic: Dict[str, Any], now: datetime) -> float:
        """Calculate ranking score for an article within its topic"""
        score = 0.0
        weights = self.config.RANKING_WEIGHTS
        
        # 1. Recency score (0-1, newer is better)
        ingested_at = article.get("ingested_at", now)
        if ingested_at.tzinfo is None:
            ingested_at = ingested_at.replace(tzinfo=UK_TZ)
            
        article_age_hours = (now - ingested_at).total_seconds() / 3600
        max_age_hours = 720  # 30 days
        recency_score = max(0, 1 - (article_age_hours / max_age_hours))
        score += recency_score * weights["recency"]
        
        # 2. Source priority score (0-1)
        priority = article.get("source_priority", "medium")
        source_score = self.config.PRIORITY_MAP.get(priority, 0.6)
        score += source_score * weights["source_priority"]
        
        # 3. Similarity to centroid score (0-1)
        if "embedding" in article and "centroid_embedding" in topic:
            article_emb = np.array(article["embedding"])
            centroid_emb = np.array(topic["centroid_embedding"])
            score += self.cosine_similarity(article_emb, centroid_emb) * weights["similarity_to_centroid"]
        else:
            score += 0.5 * weights["similarity_to_centroid"]
        
        # 4. Content quality score
        word_count = article.get("word_count", 0)
        quality_score = min(1.0, word_count / 1000)
        score += quality_score * weights["content_quality"]
        
        return score
    
    def get_topic_age_category(self, topic: Dict[str, Any]) -> str:
        """Determine topic age category"""
        created_at = topic.get("created_at", datetime.now(UK_TZ))
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=UK_TZ)
            
        age_days = (datetime.now(UK_TZ) - created_at).days
        
        if age_days <= self.config.TOPIC_LIMITS["new"]["max_age_days"]:
            return "new"
        elif age_days <= self.config.TOPIC_LIMITS["active"]["max_age_days"]:
            return "active"
        else:
            return "mature"
    
    async def trim_topic_articles(self, topic_id: str) -> Dict[str, Any]:
        """
        Trim articles from a topic if it exceeds limits.
        FIXED: Centroid is now calculated in-memory without double-querying the DB.
        """
        topic = await self.topics_collection.find_one({"_id": topic_id})
        if not topic:
            return {"error": "Topic not found"}
        
        age_category = self.get_topic_age_category(topic)
        max_articles = self.config.TOPIC_LIMITS[age_category]["max_articles"]
        current_count = len(topic.get("article_ids", []))
        
        if current_count <= max_articles:
            return {"trimmed": 0, "retained": current_count}
        
        articles = []
        cursor = self.articles_collection.find({"_id": {"$in": topic["article_ids"]}})
        async for article in cursor:
            articles.append(article)
        
        now = datetime.now(UK_TZ)
        ranked_articles = []
        for article in articles:
            score = self.rank_article(article, topic, now)
            ranked_articles.append({
                "article": article,
                "score": score,
                "is_seed": article["_id"] == topic["article_ids"][0]
            })
        
        # Sort by score (keep seed article safe at the top)
        ranked_articles.sort(key=lambda x: (x["is_seed"], x["score"]), reverse=True)
        
        to_keep = ranked_articles[:max_articles]
        to_remove = ranked_articles[max_articles:]
        
        kept_ids = [item["article"]["_id"] for item in to_keep]
        removed_ids = [item["article"]["_id"] for item in to_remove]
        
        # 1. Safely detach and archive removed articles
        if removed_ids:
            await self.articles_collection.update_many(
                {"_id": {"$in": removed_ids}},
                {
                    "$set": {
                        "status": "archived_from_topic",
                        "archived_at": now,
                        "former_topic_id": topic_id
                    },
                    "$unset": {"topic_id": ""}
                }
            )
        
        # 2. Recalculate centroid instantly in memory (saves a DB query!)
        kept_embeddings = [
            np.array(item["article"]["embedding"]) 
            for item in to_keep if "embedding" in item["article"]
        ]
        new_centroid = np.mean(kept_embeddings, axis=0) if kept_embeddings else None

        # 3. Update the topic
        update_doc = {
            "article_ids": kept_ids,
            "article_count": len(kept_ids),
            "last_trimmed": now
        }
        if new_centroid is not None:
            update_doc["centroid_embedding"] = new_centroid.tolist()

        await self.topics_collection.update_one({"_id": topic_id}, {"$set": update_doc})
        
        return {
            "trimmed": len(removed_ids),
            "retained": len(kept_ids),
            "age_category": age_category,
            "max_allowed": max_articles
        }
    
    async def purge_deleted_articles(self) -> int:
        """
        FIXED: Acts as a pure garbage collector.
        Permanently deletes articles that have ALREADY been safely detached 
        from topics and have aged out of the archive grace period.
        """
        delete_cutoff = datetime.now(UK_TZ) - timedelta(days=self.config.ARCHIVED_ARTICLE_PURGE_DAYS)
        
        result = await self.articles_collection.delete_many({
            "status": {"$in": [
                "archived_from_topic", 
                "archived_topic_deleted", 
                "archived_orphan"
            ]},
            "archived_at": {"$lt": delete_cutoff}
        })
        
        return result.deleted_count
    
    async def cleanup_orphan_articles(self) -> int:
        """Archive articles that failed clustering and are past grace period"""
        cutoff_date = datetime.now(UK_TZ) - timedelta(days=self.config.ORPHAN_ARTICLE_GRACE_DAYS)
        
        result = await self.articles_collection.update_many(
            {
                "status": "pending_clustering",
                "ingested_at": {"$lt": cutoff_date}
            },
            {
                "$set": {
                    "status": "archived_orphan",
                    "archived_at": datetime.now(UK_TZ)
                }
            }
        )
        return result.modified_count
    
    async def update_topic_lifecycle(self) -> Dict[str, Any]:
        """Update topic statuses based on activity"""
        now = datetime.now(UK_TZ)
        stats = {"marked_stale": 0, "marked_archived": 0, "deleted": 0}
        
        # 1. Active → Stale
        stale_cutoff = now - timedelta(days=self.config.TOPIC_STALE_DAYS)
        result = await self.topics_collection.update_many(
            {"status": "active", "last_updated": {"$lt": stale_cutoff}},
            {"$set": {"status": "stale", "stale_since": now}}
        )
        stats["marked_stale"] = result.modified_count
        
        # 2. Stale → Archived
        archive_cutoff = now - timedelta(days=self.config.TOPIC_ARCHIVE_DAYS)
        result = await self.topics_collection.update_many(
            {"status": "stale", "stale_since": {"$lt": archive_cutoff}},
            {"$set": {"status": "archived", "archived_at": now}}
        )
        stats["marked_archived"] = result.modified_count
        
        # 3. Archived → Deleted
        delete_cutoff = now - timedelta(days=self.config.TOPIC_DELETE_DAYS)
        cursor = self.topics_collection.find({
            "status": "archived",
            "archived_at": {"$lt": delete_cutoff}
        })
        
        async for topic in cursor:
            # Safely detach articles first!
            await self.articles_collection.update_many(
                {"topic_id": topic["_id"]},
                {
                    "$set": {"status": "archived_topic_deleted", "archived_at": now},
                    "$unset": {"topic_id": ""}
                }
            )
            await self.topics_collection.delete_one({"_id": topic["_id"]})
            stats["deleted"] += 1
        
        return stats
    
    async def cleanup_small_topics(self) -> int:
        """Remove old topics with too few articles"""
        cursor = self.topics_collection.find({
            "article_count": {"$lt": self.config.MIN_TOPIC_ARTICLES},
            "status": {"$in": ["stale", "archived"]}
        })
        
        deleted = 0
        async for topic in cursor:
            # Revert articles back to pending so they might cluster elsewhere
            await self.articles_collection.update_many(
                {"topic_id": topic["_id"]},
                {
                    "$set": {"status": "pending_clustering"},
                    "$unset": {"topic_id": ""}
                }
            )
            await self.topics_collection.delete_one({"_id": topic["_id"]})
            deleted += 1
            
        return deleted
    
    async def run_full_maintenance(self) -> Dict[str, Any]:
        """Execute complete maintenance cycle safely"""
        logger.info("=" * 80)
        logger.info(f"Starting PodNova Maintenance at {datetime.now(UK_TZ).strftime('%H:%M:%S %Z')}")
        logger.info("=" * 80)
        
        stats = {
            "start_time": datetime.now(UK_TZ),
            "topics_trimmed": 0,
            "articles_trimmed": 0
        }
        
        # 1. Trim oversized topics (Streaming Cursor to save RAM)
        logger.info("\n[1/5] Trimming oversized topics...")
        cursor = self.topics_collection.find({"status": "active"})
        async for topic in cursor:
            result = await self.trim_topic_articles(topic["_id"])
            if result.get("trimmed", 0) > 0:
                stats["topics_trimmed"] += 1
                stats["articles_trimmed"] += result["trimmed"]
        
        # 2. Garbage Collection (Purge deleted articles)
        logger.info("\n[2/5] Purging permanently deleted articles...")
        stats["articles_purged"] = await self.purge_deleted_articles()
        
        # 3. Clean up orphans
        logger.info("\n[3/5] Cleaning up orphan articles...")
        stats["orphans_cleaned"] = await self.cleanup_orphan_articles()
        
        # 4. Update topic lifecycle
        logger.info("\n[4/5] Updating topic lifecycle...")
        stats["topics_lifecycle"] = await self.update_topic_lifecycle()
        
        # 5. Clean up small topics
        logger.info("\n[5/5] Cleaning up small topics...")
        stats["small_topics_deleted"] = await self.cleanup_small_topics()
        
        stats["end_time"] = datetime.now(UK_TZ)
        stats["duration_seconds"] = (stats["end_time"] - stats["start_time"]).total_seconds()
        
        logger.info("\n" + "=" * 80)
        logger.info("Maintenance Summary")
        logger.info(f"Topics trimmed: {stats['topics_trimmed']}")
        logger.info(f"Articles detached: {stats['articles_trimmed']}")
        logger.info(f"Articles permanently purged: {stats['articles_purged']}")
        logger.info(f"Orphans archived: {stats['orphans_cleaned']}")
        logger.info(f"Topics marked stale/archived: {stats['topics_lifecycle']['marked_stale']} / {stats['topics_lifecycle']['marked_archived']}")
        logger.info(f"Topics permanently deleted: {stats['topics_lifecycle']['deleted']}")
        logger.info("=" * 80)
        
        return stats
    
    async def close(self):
        self.client.close()
        logger.info("MongoDB connection closed")


async def main():
    service = None
    try:
        service = MaintenanceService(MONGODB_URI, MONGODB_DB_NAME)
        await service.run_full_maintenance()
    except Exception as e:
        logger.error(f"Maintenance failed: {e}")
    finally:
        if service:
            await service.close()

if __name__ == "__main__":
    asyncio.run(main())