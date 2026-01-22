"""
PodNova Article and Topic Maintenance Module
Manages article limits, cleanup, and topic lifecycle
"""
from app.config import MONGODB_URI, MONGODB_DB_NAME
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from pymongo import MongoClient
import certifi
import numpy as np


class MaintenanceConfig:
    """All maintenance-related settings"""
    
    # Article retention by category (days)
    ARTICLE_RETENTION = {
        "technology": 30,
        "finance": 30,
        "politics": 30,
        "default": 30
    }
    
    # Topic article limits by age
    TOPIC_LIMITS = {
        "new": {"max_age_days": 7, "max_articles": 30},
        "active": {"max_age_days": 30, "max_articles": 15},
        "mature": {"max_age_days": None, "max_articles": 10}
    }
    
    # Topic lifecycle thresholds (days)
    TOPIC_STALE_DAYS = 7
    TOPIC_ARCHIVE_DAYS = 30
    TOPIC_DELETE_DAYS = 90
    
    # Cleanup settings
    ORPHAN_ARTICLE_GRACE_DAYS = 3
    MIN_TOPIC_ARTICLES = 2
    ARCHIVED_ARTICLE_PURGE_DAYS = 30
    
    # Article ranking weights (must sum to 1.0)
    RANKING_WEIGHTS = {
        "recency": 0.4,
        "source_priority": 0.3,
        "similarity_to_centroid": 0.2,
        "content_quality": 0.1
    }
    
    # Resurrection settings
    RESURRECTION_SIMILARITY_BONUS = 0.15
    MAX_RESURRECTION_AGE_DAYS = 14


class MaintenanceService:
    def __init__(self, mongo_uri: str, db_name: str):
        """Initialize maintenance service with MongoDB connection"""
        self.client = MongoClient(mongo_uri, tlsCAFile=certifi.where())
        self.db = self.client[db_name]
        self.articles_collection = self.db["articles"]
        self.topics_collection = self.db["topics"]
        self.config = MaintenanceConfig()
        
        # Create maintenance-specific indexes
        self.articles_collection.create_index([("status", 1), ("ingested_at", 1)])
        self.articles_collection.create_index("topic_id")
        self.topics_collection.create_index([("status", 1), ("last_updated", 1)])
    
    def cosine_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Calculate cosine similarity between two vectors"""
        dot_product = np.dot(vec1, vec2)
        norm_product = np.linalg.norm(vec1) * np.linalg.norm(vec2)
        return dot_product / norm_product if norm_product != 0 else 0.0
    
    def rank_article(self, article: Dict, topic: Dict, now: datetime) -> float:
        """
        Calculate ranking score for an article within its topic
        Higher score = more important to keep
        """
        score = 0.0
        weights = self.config.RANKING_WEIGHTS
        
        # 1. Recency score (0-1, newer is better)
        article_age_hours = (now - article["ingested_at"]).total_seconds() / 3600
        max_age_hours = 720  # 30 days
        recency_score = max(0, 1 - (article_age_hours / max_age_hours))
        score += recency_score * weights["recency"]
        
        # 2. Source priority score (0-1)
        priority_map = {"high": 1.0, "medium": 0.6, "low": 0.3}
        source_score = priority_map.get(article.get("source_priority", "medium"), 0.6)
        score += source_score * weights["source_priority"]
        
        # 3. Similarity to centroid score (0-1)
        if "embedding" in article and "centroid_embedding" in topic:
            article_emb = np.array(article["embedding"])
            centroid_emb = np.array(topic["centroid_embedding"])
            similarity = self.cosine_similarity(article_emb, centroid_emb)
            score += similarity * weights["similarity_to_centroid"]
        else:
            score += 0.5 * weights["similarity_to_centroid"]
        
        # 4. Content quality score (based on word count)
        word_count = article.get("word_count", 0)
        quality_score = min(1.0, word_count / 1000)
        score += quality_score * weights["content_quality"]
        
        return score
    
    def get_topic_age_category(self, topic: Dict) -> str:
        """Determine topic age category"""
        age_days = (datetime.now() - topic["created_at"]).days
        
        if age_days <= self.config.TOPIC_LIMITS["new"]["max_age_days"]:
            return "new"
        elif age_days <= self.config.TOPIC_LIMITS["active"]["max_age_days"]:
            return "active"
        else:
            return "mature"
    
    def trim_topic_articles(self, topic_id: str) -> Dict:
        """
        Trim articles from a topic if it exceeds limits
        Returns: dict with trim statistics
        """
        topic = self.topics_collection.find_one({"_id": topic_id})
        if not topic:
            return {"error": "Topic not found"}
        
        age_category = self.get_topic_age_category(topic)
        max_articles = self.config.TOPIC_LIMITS[age_category]["max_articles"]
        current_count = len(topic.get("article_ids", []))
        
        if current_count <= max_articles:
            return {"trimmed": 0, "retained": current_count}
        
        # Get all articles in this topic
        articles = list(self.articles_collection.find({
            "_id": {"$in": topic["article_ids"]}
        }))
        
        now = datetime.now()
        
        # Rank articles
        ranked_articles = []
        for article in articles:
            score = self.rank_article(article, topic, now)
            ranked_articles.append({
                "article": article,
                "score": score,
                "is_seed": article["_id"] == topic["article_ids"][0]
            })
        
        # Sort by score (descending) but always keep seed article
        ranked_articles.sort(key=lambda x: (x["is_seed"], x["score"]), reverse=True)
        
        # Keep top N articles
        to_keep = ranked_articles[:max_articles]
        to_remove = ranked_articles[max_articles:]
        
        kept_ids = [item["article"]["_id"] for item in to_keep]
        removed_ids = [item["article"]["_id"] for item in to_remove]
        
        # Archive removed articles
        self.articles_collection.update_many(
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
        
        # Update topic with new article list
        self.topics_collection.update_one(
            {"_id": topic_id},
            {
                "$set": {
                    "article_ids": kept_ids,
                    "article_count": len(kept_ids),
                    "last_trimmed": now
                }
            }
        )
        
        # Recalculate centroid with remaining articles
        self._recalculate_topic_centroid(topic_id, kept_ids)
        
        return {
            "trimmed": len(removed_ids),
            "retained": len(kept_ids),
            "age_category": age_category,
            "max_allowed": max_articles
        }
    
    def _recalculate_topic_centroid(self, topic_id: str, article_ids: List[str]) -> bool:
        """Recalculate topic centroid from current articles"""
        embeddings = []
        
        for article_id in article_ids:
            article = self.articles_collection.find_one({"_id": article_id})
            if article and "embedding" in article:
                embeddings.append(np.array(article["embedding"]))
        
        if not embeddings:
            return False
        
        new_centroid = np.mean(embeddings, axis=0)
        
        self.topics_collection.update_one(
            {"_id": topic_id},
            {"$set": {"centroid_embedding": new_centroid.tolist()}}
        )
        
        return True
    
    def cleanup_old_articles(self) -> Dict:
        """Remove articles past their retention period"""
        stats = {
            "archived": 0,
            "deleted": 0,
            "by_category": {}
        }
        
        now = datetime.now()
        
        # Archive old articles by category
        for category, retention_days in self.config.ARTICLE_RETENTION.items():
            if category == "default":
                continue
            
            cutoff_date = now - timedelta(days=retention_days)
            
            result = self.articles_collection.update_many(
                {
                    "category": category,
                    "ingested_at": {"$lt": cutoff_date},
                    "status": {"$in": ["clustered", "pending_clustering"]}
                },
                {
                    "$set": {
                        "status": "archived_expired",
                        "archived_at": now
                    }
                }
            )
            
            stats["by_category"][category] = result.modified_count
            stats["archived"] += result.modified_count
        
        # Handle categories not explicitly defined
        default_retention = self.config.ARTICLE_RETENTION["default"]
        cutoff_date = now - timedelta(days=default_retention)
        
        result = self.articles_collection.update_many(
            {
                "category": {"$nin": list(self.config.ARTICLE_RETENTION.keys())},
                "ingested_at": {"$lt": cutoff_date},
                "status": {"$in": ["clustered", "pending_clustering"]}
            },
            {
                "$set": {
                    "status": "archived_expired",
                    "archived_at": now
                }
            }
        )
        
        stats["by_category"]["other"] = result.modified_count
        stats["archived"] += result.modified_count
        
        # Delete articles archived for > 30 days
        delete_cutoff = now - timedelta(days=self.config.ARCHIVED_ARTICLE_PURGE_DAYS)
        result = self.articles_collection.delete_many({
            "status": {"$in": ["archived_expired", "archived_from_topic"]},
            "archived_at": {"$lt": delete_cutoff}
        })
        
        stats["deleted"] = result.deleted_count
        
        return stats
    
    def cleanup_orphan_articles(self) -> int:
        """Remove articles without topics that are past grace period"""
        cutoff_date = datetime.now() - timedelta(days=self.config.ORPHAN_ARTICLE_GRACE_DAYS)
        
        result = self.articles_collection.update_many(
            {
                "status": "pending_clustering",
                "ingested_at": {"$lt": cutoff_date},
                "$or": [
                    {"topic_id": {"$exists": False}},
                    {"topic_id": None}
                ]
            },
            {
                "$set": {
                    "status": "archived_orphan",
                    "archived_at": datetime.now()
                }
            }
        )
        
        return result.modified_count
    
    def update_topic_lifecycle(self) -> Dict:
        """Update topic statuses based on activity"""
        now = datetime.now()
        stats = {
            "marked_stale": 0,
            "marked_archived": 0,
            "deleted": 0
        }
        
        # Active → Stale
        stale_cutoff = now - timedelta(days=self.config.TOPIC_STALE_DAYS)
        result = self.topics_collection.update_many(
            {
                "status": "active",
                "last_updated": {"$lt": stale_cutoff}
            },
            {"$set": {"status": "stale", "stale_since": now}}
        )
        stats["marked_stale"] = result.modified_count
        
        # Stale → Archived
        archive_cutoff = now - timedelta(days=self.config.TOPIC_ARCHIVE_DAYS)
        result = self.topics_collection.update_many(
            {
                "status": "stale",
                "stale_since": {"$lt": archive_cutoff}
            },
            {"$set": {"status": "archived", "archived_at": now}}
        )
        stats["marked_archived"] = result.modified_count
        
        # Archived → Deleted
        delete_cutoff = now - timedelta(days=self.config.TOPIC_DELETE_DAYS)
        topics_to_delete = list(self.topics_collection.find({
            "status": "archived",
            "archived_at": {"$lt": delete_cutoff}
        }))
        
        for topic in topics_to_delete:
            # Archive associated articles first
            self.articles_collection.update_many(
                {"topic_id": topic["_id"]},
                {
                    "$set": {
                        "status": "archived_topic_deleted",
                        "archived_at": now
                    },
                    "$unset": {"topic_id": ""}
                }
            )
            
            # Delete the topic
            self.topics_collection.delete_one({"_id": topic["_id"]})
            stats["deleted"] += 1
        
        return stats
    
    def cleanup_small_topics(self) -> int:
        """Remove topics with too few articles"""
        small_topics = list(self.topics_collection.find({
            "article_count": {"$lt": self.config.MIN_TOPIC_ARTICLES},
            "status": {"$in": ["stale", "archived"]}
        }))
        
        deleted = 0
        for topic in small_topics:
            # Move articles back to pending
            self.articles_collection.update_many(
                {"topic_id": topic["_id"]},
                {
                    "$set": {"status": "pending_clustering"},
                    "$unset": {"topic_id": ""}
                }
            )
            
            self.topics_collection.delete_one({"_id": topic["_id"]})
            deleted += 1
        
        return deleted
    
    def run_full_maintenance(self) -> Dict:
        """Execute complete maintenance cycle"""
        print("=" * 80)
        print("Starting PodNova Maintenance Cycle")
        print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 80)
        
        stats = {
            "start_time": datetime.now(),
            "topics_trimmed": 0,
            "articles_trimmed": 0,
            "articles_cleaned": {},
            "orphans_cleaned": 0,
            "topics_lifecycle": {},
            "small_topics_deleted": 0
        }
        
        # 1. Trim oversized topics
        print("\n[1/5] Trimming oversized topics...")
        active_topics = list(self.topics_collection.find({"status": "active"}))
        
        for topic in active_topics:
            result = self.trim_topic_articles(topic["_id"])
            if result.get("trimmed", 0) > 0:
                stats["topics_trimmed"] += 1
                stats["articles_trimmed"] += result["trimmed"]
                print(f"  Trimmed '{topic.get('title', 'Untitled')[:50]}': "
                      f"{result['trimmed']} removed, {result['retained']} kept")
        
        # 2. Clean up old articles
        print("\n[2/5] Cleaning up old articles...")
        article_stats = self.cleanup_old_articles()
        stats["articles_cleaned"] = article_stats
        print(f"  Archived: {article_stats['archived']}, Deleted: {article_stats['deleted']}")
        
        # 3. Clean up orphan articles
        print("\n[3/5] Cleaning up orphan articles...")
        orphan_count = self.cleanup_orphan_articles()
        stats["orphans_cleaned"] = orphan_count
        print(f"  Orphaned articles archived: {orphan_count}")
        
        # 4. Update topic lifecycle
        print("\n[4/5] Updating topic lifecycle...")
        lifecycle_stats = self.update_topic_lifecycle()
        stats["topics_lifecycle"] = lifecycle_stats
        print(f"  Stale: {lifecycle_stats['marked_stale']}, "
              f"Archived: {lifecycle_stats['marked_archived']}, "
              f"Deleted: {lifecycle_stats['deleted']}")
        
        # 5. Clean up small topics
        print("\n[5/5] Cleaning up small topics...")
        small_topics = self.cleanup_small_topics()
        stats["small_topics_deleted"] = small_topics
        print(f"  Small topics deleted: {small_topics}")
        
        stats["end_time"] = datetime.now()
        stats["duration_seconds"] = (stats["end_time"] - stats["start_time"]).total_seconds()
        
        print("\n" + "=" * 80)
        print("Maintenance Summary")
        print("=" * 80)
        print(f"Topics trimmed: {stats['topics_trimmed']}")
        print(f"Articles removed from topics: {stats['articles_trimmed']}")
        print(f"Old articles archived: {stats['articles_cleaned']['archived']}")
        print(f"Old articles deleted: {stats['articles_cleaned']['deleted']}")
        print(f"Orphan articles cleaned: {stats['orphans_cleaned']}")
        print(f"Topics marked stale: {stats['topics_lifecycle']['marked_stale']}")
        print(f"Topics archived: {stats['topics_lifecycle']['marked_archived']}")
        print(f"Topics deleted: {stats['topics_lifecycle']['deleted']}")
        print(f"Small topics removed: {stats['small_topics_deleted']}")
        print(f"Duration: {stats['duration_seconds']:.2f} seconds")
        print("=" * 80)
        
        return stats


def main():
    """Main entry point for manual execution"""
    service = MaintenanceService(MONGODB_URI, MONGODB_DB_NAME)
    service.run_full_maintenance()


if __name__ == "__main__":
    main()