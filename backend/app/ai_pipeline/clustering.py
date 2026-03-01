# app/ai_pipeline/clustering.py
"""
PodNova Clustering Module
FULLY ASYNC VERSION with Motor
NOW WITH INTEGRATED TOPIC HISTORY TRACKING, AUTOMATIC DISCUSSIONS, AND O(1) CENTROID MATH
"""
from app.config import MONGODB_URI, MONGODB_DB_NAME
import os
import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import List, Dict, Optional, Any
import numpy as np
import motor.motor_asyncio
import certifi
from google import genai
from google.genai import types
import asyncio
import logging

# Import services
from app.ai_pipeline.article_maintenance import MaintenanceService
from app.ai_pipeline.topic_history import TopicHistoryService
from app.controllers.discussion_controller import create_or_get_topic_discussion

# Configuration
SIMILARITY_THRESHOLD = 0.75
MIN_ARTICLES_FOR_TITLE = 2
CONFIDENCE_THRESHOLD = 0.6
TOPIC_INACTIVE_DAYS = 90
EMBEDDING_MODEL = "gemini-embedding-001"
TEXT_MODEL = "gemini-2.5-flash"

# Timezone
UK_TZ = ZoneInfo("Europe/London")

# Initialize Gemini client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ClusteringService:
    def __init__(self, mongo_uri: str, db_name: str):
        """Initialize the clustering service with Motor async client"""
        self.client_db = motor.motor_asyncio.AsyncIOMotorClient(
            mongo_uri, 
            tlsCAFile=certifi.where(),
            maxPoolSize=50,
            minPoolSize=10
        )
        self.db = self.client_db[db_name]
        self.articles_collection = self.db["articles"]
        self.topics_collection = self.db["topics"]
        
        self.maintenance_service = MaintenanceService(mongo_uri, db_name)
        self.history_service = TopicHistoryService(mongo_uri, db_name)
        
        asyncio.create_task(self._ensure_indexes())
    
    async def _ensure_indexes(self):
        """Create indexes for efficient queries"""
        try:
            await self.topics_collection.create_index("category")
            await self.topics_collection.create_index("last_updated")
            await self.topics_collection.create_index("status")
            await self.topics_collection.create_index([("category", 1), ("status", 1)])
            logger.info("Clustering indexes verified")
        except Exception as e:
            logger.error(f"Error creating indexes: {e}")
    
    async def compute_embedding(self, text: str) -> Optional[np.ndarray]:
        """Compute embedding for given text using Async Gemini"""
        try:
            # FIXED: Now strictly asynchronous to prevent event loop blocking
            response = await client.aio.models.embed_content(
                model=EMBEDDING_MODEL,
                contents=text
            )
            
            if hasattr(response, 'embeddings') and len(response.embeddings) > 0:
                return np.array(response.embeddings[0].values)
            elif hasattr(response, 'embedding'):
                return np.array(response.embedding)
            
            return None
            
        except Exception as e:
            logger.error(f"Error computing embedding: {str(e)}")
            return None
    
    def cosine_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Calculate cosine similarity between two vectors"""
        dot_product = np.dot(vec1, vec2)
        norm_product = np.linalg.norm(vec1) * np.linalg.norm(vec2)
        return float(dot_product / norm_product) if norm_product != 0 else 0.0
    
    async def check_and_resurrect_topic(self, topic: Dict[str, Any]) -> bool:
        """Check if a stale topic should be resurrected"""
        if topic.get("status") != "stale":
            return False
        
        stale_since = topic.get("stale_since")
        if stale_since:
            # Ensure timezones match
            if stale_since.tzinfo is None:
                stale_since = stale_since.replace(tzinfo=UK_TZ)
                
            days_stale = (datetime.now(UK_TZ) - stale_since).days
            if days_stale > self.maintenance_service.config.MAX_RESURRECTION_AGE_DAYS:
                return False
        
        await self.topics_collection.update_one(
            {"_id": topic["_id"]},
            {
                "$set": {
                    "status": "active",
                    "resurrected_at": datetime.now(UK_TZ)
                },
                "$unset": {"stale_since": ""}
            }
        )
        return True
    
    async def find_matching_topic(self, article_embedding: np.ndarray, category: str) -> Optional[Dict[str, Any]]:
        """Find existing topic that matches the article embedding"""
        best_match = None
        best_similarity = 0.0
        
        # FIXED: Stream cursor directly to avoid RAM explosion on large datasets
        cursor = self.topics_collection.find({"category": category, "status": "active"})
        
        async for topic in cursor:
            if "centroid_embedding" not in topic:
                continue
            
            topic_embedding = np.array(topic["centroid_embedding"])
            similarity = self.cosine_similarity(article_embedding, topic_embedding)
            
            if similarity > best_similarity and similarity >= SIMILARITY_THRESHOLD:
                best_similarity = similarity
                best_match = topic
        
        # Check stale topics if no active match
        if not best_match:
            stale_cursor = self.topics_collection.find({"category": category, "status": "stale"})
            resurrection_threshold = SIMILARITY_THRESHOLD + self.maintenance_service.config.RESURRECTION_SIMILARITY_BONUS
            
            async for topic in stale_cursor:
                if "centroid_embedding" not in topic:
                    continue
                
                topic_embedding = np.array(topic["centroid_embedding"])
                similarity = self.cosine_similarity(article_embedding, topic_embedding)
                
                if similarity > best_similarity and similarity >= resurrection_threshold:
                    best_similarity = similarity
                    best_match = topic
                    await self.check_and_resurrect_topic(topic)
        
        if best_match:
            logger.info(f"  Found matching topic (similarity: {best_similarity:.3f})")
        
        return best_match
    
    def calculate_new_centroid(self, old_centroid: List[float], new_embedding: np.ndarray, current_count: int) -> np.ndarray:
        """
        FIXED: O(1) Mathematical Centroid Update.
        No longer requires querying the DB for all past articles!
        """
        old_vec = np.array(old_centroid)
        # Weighted average math: ((Old Centroid * N) + New Embedding) / (N + 1)
        new_vec = ((old_vec * current_count) + new_embedding) / (current_count + 1)
        return new_vec

    async def create_new_topic(self, article_doc: Dict[str, Any], article_embedding: np.ndarray) -> str:
        """Create a new topic seeded with this article"""
        topic_doc = {
            "category": article_doc["category"],
            "article_ids": [article_doc["_id"]],
            "sources": [article_doc["source"]],
            "centroid_embedding": article_embedding.tolist(),
            "confidence": 0.5,
            "created_at": datetime.now(UK_TZ),
            "last_updated": datetime.now(UK_TZ),
            "status": "active",
            "article_count": 1,
            "has_title": False,
            "title": None,
            "summary": None,
            "key_insights": None,
            "image_url": article_doc.get("image_url"),
            "history_point_count": 0,
            "last_history_point": None,
            "discussion_id": None
        }
        
        result = await self.topics_collection.insert_one(topic_doc)
        topic_id = result.inserted_id
        
        await self.articles_collection.update_one(
            {"_id": article_doc["_id"]},
            {"$set": {"topic_id": topic_id, "status": "clustered"}}
        )
        
        return topic_id
    
    async def update_existing_topic(
        self,
        topic: Dict[str, Any],
        article_doc: Dict[str, Any],
        article_embedding: np.ndarray
    ) -> None:
        """Add article to existing topic and update metadata"""
        topic_id = topic["_id"]
        article_ids = topic.get("article_ids", [])
        sources = set(topic.get("sources", []))
        current_count = len(article_ids)
        
        article_ids.append(article_doc["_id"])
        is_new_source = article_doc["source"] not in sources
        sources.add(article_doc["source"])
        
        # Use O(1) math instead of DB queries
        new_centroid = self.calculate_new_centroid(
            topic.get("centroid_embedding", article_embedding.tolist()), 
            article_embedding, 
            current_count
        )
        
        confidence = topic.get("confidence", 0.5)
        if is_new_source:
            confidence = min(1.0, confidence + 0.1)
        
        update_fields = {
            "article_ids": article_ids,
            "sources": list(sources),
            "centroid_embedding": new_centroid.tolist(),
            "confidence": confidence,
            "last_updated": datetime.now(UK_TZ),
            "article_count": len(article_ids)
        }
        
        if not topic.get("image_url") and article_doc.get("image_url"):
            update_fields["image_url"] = article_doc["image_url"]
        
        await self.topics_collection.update_one({"_id": topic_id}, {"$set": update_fields})
        await self.articles_collection.update_one(
            {"_id": article_doc["_id"]},
            {"$set": {"topic_id": topic_id, "status": "clustered"}}
        )
        
        if topic.get("has_title"):
            history_result = await self.history_service.check_and_create_history(str(topic_id))
            if history_result and history_result.get("action") == "created_history":
                logger.info(f"  ✨ Created {history_result['history_type']} history point")
        
        age_category = self.maintenance_service.get_topic_age_category(topic)
        max_articles = self.maintenance_service.config.TOPIC_LIMITS[age_category]["max_articles"]
        
        if len(article_ids) > max_articles:
            await self.maintenance_service.trim_topic_articles(str(topic_id))
    
    async def create_topic_discussion(self, topic_id: str, topic_title: str, topic_summary: str, category: str) -> Optional[str]:
        """Automatically create a discussion for a topic when it becomes active."""
        try:
            discussion_id = await create_or_get_topic_discussion(
                topic_id=str(topic_id),
                topic_title=topic_title,
                topic_summary=topic_summary,
                category=category
            )
            if discussion_id:
                await self.topics_collection.update_one(
                    {"_id": topic_id},
                    {"$set": {"discussion_id": discussion_id}}
                )
                return discussion_id
        except Exception as e:
            logger.error(f"  Error creating discussion: {e}")
        return None
    
    async def generate_topic_title(self, topic_id: str) -> bool:
        """Generate title and summary for a topic using Async Gemini LLM"""
        try:
            topic = await self.topics_collection.find_one({"_id": topic_id})
            if not topic:
                return False
            
            articles = []
            cursor = self.articles_collection.find({"_id": {"$in": topic.get("article_ids", [])}})
            async for article in cursor:
                articles.append(article)
            
            if not articles:
                return False
            
            article_texts = []
            for article in articles[:10]:
                description = article.get('description') or article.get('content', '')[:300]
                article_texts.append(f"Title: {article.get('title')}\nSummary: {description}\n")
            
            prompt = f"""Write a clear headline for a news podcast. Category: {topic.get('category')}
Articles:
{"".join(article_texts)}

RULES: MAX 10 WORDS. Clear English. No jargon. Be specific."""

            # FIXED: Async call & explicit JSON Schema enforcement
            response = await client.aio.models.generate_content(
                model=TEXT_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                )
            )
            
            result = json.loads(response.text)
            title = result.get("title")
            
            if not title:
                return False
            
            await self.topics_collection.update_one(
                {"_id": topic_id},
                {
                    "$set": {
                        "title": title,
                        "summary": result.get("summary", ""),
                        "key_insights": result.get("key_insights", []),
                        "has_title": True,
                        "title_generated_at": datetime.now(UK_TZ),
                        "confidence": result.get("confidence_score", 70) / 100.0
                    }
                }
            )
            
            await self.history_service.create_history_point(
                str(topic_id), "initial", {"total_score": 1.0, "type": "initial_title"}, result
            )
            
            await self.create_topic_discussion(
                topic_id=topic_id,
                topic_title=title,
                topic_summary=result.get("summary", ""),
                category=topic.get("category")
            )
            return True
            
        except Exception as e:
            logger.error(f"  Error generating topic title: {str(e)}")
            return False
    
    async def assign_to_topic(self, article_doc: Dict[str, Any]) -> Optional[str]:
        """Main function: compute embedding and assign article to topic"""
        text_for_embedding = f"{article_doc['title']} {article_doc.get('description', '')}"
        
        # Await the new async compute_embedding
        embedding = await self.compute_embedding(text_for_embedding)
        
        if embedding is None:
            return None
        
        await self.articles_collection.update_one(
            {"_id": article_doc["_id"]},
            {"$set": {"embedding": embedding.tolist()}}
        )
        
        matching_topic = await self.find_matching_topic(embedding, article_doc["category"])
        
        if matching_topic:
            await self.update_existing_topic(matching_topic, article_doc, embedding)
            return str(matching_topic["_id"])
        else:
            return await self.create_new_topic(article_doc, embedding)
    
    async def process_pending_articles(self) -> Dict[str, Any]:
        """Process all articles with status 'pending_clustering'"""
        logger.info(f"Starting Clustering at {datetime.now(UK_TZ).strftime('%H:%M:%S')}")
        
        cursor = self.articles_collection.find({"status": "pending_clustering"})
        stats = {"processed": 0, "start_time": datetime.now(UK_TZ)}
        
        async for article in cursor:
            try:
                topic_id = await self.assign_to_topic(article)
                if topic_id:
                    stats["processed"] += 1
            except Exception as e:
                logger.error(f"Error assigning article: {e}")
        
        # Generate titles for ready topics
        ready_cursor = self.topics_collection.find({
            "has_title": False,
            "status": "active",
            "article_count": {"$gte": MIN_ARTICLES_FOR_TITLE},
            "confidence": {"$gte": CONFIDENCE_THRESHOLD}
        })
        
        async for topic in ready_cursor:
            await self.generate_topic_title(topic["_id"])
        
        return stats
    
    async def mark_inactive_topics(self):
        """Mark topics as inactive if not updated recently"""
        cutoff_date = datetime.now(UK_TZ) - timedelta(days=TOPIC_INACTIVE_DAYS)
        await self.topics_collection.update_many(
            {"last_updated": {"$lt": cutoff_date}, "status": "active"},
            {"$set": {"status": "inactive"}}
        )
    
    async def close(self):
        self.client_db.close()
        await self.maintenance_service.close()
        await self.history_service.close()

async def main():
    service = ClusteringService(MONGODB_URI, MONGODB_DB_NAME)
    try:
        await service.process_pending_articles()
        await service.mark_inactive_topics()
    finally:
        await service.close()

if __name__ == "__main__":
    asyncio.run(main())