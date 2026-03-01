# backend/app/ai_pipeline/topic_history.py
"""
PodNova Topic History Module
FULLY ASYNC VERSION with Motor
Manages longitudinal topic development with intelligent snapshot creation
Tracks significant updates and regenerates titles/summaries when needed
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Dict, List, Optional, Tuple, Any
from bson import ObjectId
import motor.motor_asyncio
import numpy as np
import certifi
import os
import json
import asyncio
from google import genai
from google.genai import types
import logging

from app.config import MONGODB_URI, MONGODB_DB_NAME

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Timezone Configuration
UK_TZ = ZoneInfo("Europe/London")

# Model configuration
EMBEDDING_MODEL = "gemini-embedding-001"
TEXT_MODEL = "gemini-2.5-flash"


class HistoryConfig:
    """Configuration for topic history snapshots"""
    MIN_NEW_ARTICLES = 5          
    MIN_NEW_SOURCES = 2           
    CONFIDENCE_CHANGE = 0.15      
    EMBEDDING_DRIFT = 0.20        
    TIME_ELAPSED_HOURS = 48       
    
    SIGNIFICANCE_WEIGHTS = {
        "article_growth": 0.30,
        "source_diversity": 0.25,
        "confidence_change": 0.20,
        "embedding_drift": 0.15,
        "time_factor": 0.10
    }
    
    SIGNIFICANCE_THRESHOLD = 0.60  
    
    HISTORY_TYPES = {
        "initial": "Initial topic creation",
        "major_update": "Significant development with narrative change",
        "source_expansion": "New perspectives from additional sources",
        "confidence_shift": "Reliability assessment changed",
        "periodic": "Scheduled periodic snapshot",
        "manual": "Manually triggered snapshot"
    }
    
    MAX_HISTORY_POINTS = 50
    PERIODIC_SNAPSHOT_DAYS = 7


class TopicHistoryService:
    def __init__(self, mongo_uri: str, db_name: str):
        """Initialize topic history service with async Motor client"""
        self.client_db = motor.motor_asyncio.AsyncIOMotorClient(
            mongo_uri, 
            tlsCAFile=certifi.where(),
            maxPoolSize=50,
            minPoolSize=10
        )
        self.db = self.client_db[db_name]
        self.topics_collection = self.db["topics"]
        self.articles_collection = self.db["articles"]
        self.history_collection = self.db["topic_history"]
        self.config = HistoryConfig()
        
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            logger.warning("GEMINI_API_KEY not set. Metadata regeneration will fail.")
        self.gemini_client = genai.Client(api_key=api_key) if api_key else None
        
        asyncio.create_task(self._ensure_indexes())
    
    async def _ensure_indexes(self):
        try:
            await self.history_collection.create_index([("topic_id", 1), ("created_at", -1)])
            await self.history_collection.create_index("created_at")
            await self.topics_collection.create_index("last_history_check")
            await self.topics_collection.create_index([("status", 1), ("has_title", 1)])
            logger.info("Database indexes verified")
        except Exception as e:
            logger.error(f"Error creating indexes: {e}")
    
    def cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        try:
            vec1_np = np.array(vec1)
            vec2_np = np.array(vec2)
            dot_product = np.dot(vec1_np, vec2_np)
            norm_product = np.linalg.norm(vec1_np) * np.linalg.norm(vec2_np)
            return float(dot_product / norm_product) if norm_product != 0 else 0.0
        except Exception as e:
            logger.error(f"Error calculating cosine similarity: {e}")
            return 0.0
    
    def calculate_significance_score(
        self, topic: Dict[str, Any], last_history: Optional[Dict[str, Any]], current_stats: Dict[str, Any]
    ) -> Tuple[float, Dict[str, Any]]:
        weights = self.config.SIGNIFICANCE_WEIGHTS
        breakdown = {}
        total_score = 0.0
        
        if not last_history:
            return 1.0, {"type": "initial", "reason": "First snapshot"}
        
        # 1. ARTICLE GROWTH
        prev_count = last_history.get("article_count", 0)
        current_count = current_stats["article_count"]
        new_articles = current_count - prev_count
        
        if new_articles >= self.config.MIN_NEW_ARTICLES:
            growth_ratio = new_articles / max(prev_count, 1)
            absolute_score = min(1.0, new_articles / 20)
            article_score = min(1.0, (growth_ratio * 0.5 + absolute_score * 0.5))
        else:
            article_score = min(1.0, new_articles / self.config.MIN_NEW_ARTICLES)
            
        breakdown["article_growth"] = {
            "score": article_score,
            "new_articles": new_articles
        }
        total_score += article_score * weights["article_growth"]
        
        # 2. SOURCE DIVERSITY
        prev_sources = set(last_history.get("sources", []))
        current_sources = set(current_stats["sources"])
        new_sources = current_sources - prev_sources
        
        source_score = min(1.0, len(new_sources) / self.config.MIN_NEW_SOURCES)
        breakdown["source_diversity"] = {"score": source_score, "new_sources": list(new_sources)[:5]}
        total_score += source_score * weights["source_diversity"]
        
        # 3. CONFIDENCE CHANGE
        prev_confidence = last_history.get("confidence", 0.5)
        current_confidence = current_stats["confidence"]
        confidence_delta = abs(current_confidence - prev_confidence)
        
        confidence_score = min(1.0, confidence_delta / self.config.CONFIDENCE_CHANGE)
        breakdown["confidence_change"] = {"score": confidence_score, "delta": confidence_delta}
        total_score += confidence_score * weights["confidence_change"]
        
        # 4. EMBEDDING DRIFT
        drift_score = 0.0
        if last_history.get("centroid_embedding") and topic.get("centroid_embedding"):
            similarity = self.cosine_similarity(last_history["centroid_embedding"], topic["centroid_embedding"])
            drift = 1 - similarity
            drift_score = min(1.0, drift / self.config.EMBEDDING_DRIFT)
            breakdown["embedding_drift"] = {"score": drift_score, "similarity": similarity}
        
        total_score += drift_score * weights["embedding_drift"]
        
        # 5. TIME FACTOR (Timezone Safe)
        last_history_time = last_history.get("created_at", datetime.now(UK_TZ))
        if last_history_time.tzinfo is None:
            last_history_time = last_history_time.replace(tzinfo=UK_TZ)
            
        time_elapsed = (datetime.now(UK_TZ) - last_history_time).total_seconds() / 3600
        time_score = min(1.0, time_elapsed / self.config.TIME_ELAPSED_HOURS)
        breakdown["time_factor"] = {"score": time_score, "hours_elapsed": time_elapsed}
        total_score += time_score * weights["time_factor"]
        
        # 6. PERIODIC TRIGGER
        if (time_elapsed / 24) >= self.config.PERIODIC_SNAPSHOT_DAYS and current_count >= 10:
            breakdown["periodic_trigger"] = True
            total_score = max(total_score, self.config.SIGNIFICANCE_THRESHOLD + 0.05)
        
        breakdown["total_score"] = total_score
        breakdown["is_significant"] = total_score >= self.config.SIGNIFICANCE_THRESHOLD
        
        return total_score, breakdown
    
    def determine_history_type(self, breakdown: Dict[str, Any]) -> str:
        if breakdown.get("periodic_trigger"):
            return "periodic"
        
        scores = {k: v.get("score", 0) for k, v in breakdown.items() if isinstance(v, dict) and "score" in v}
        dominant = max(scores.items(), key=lambda x: x[1]) if scores else ("major_update", 1.0)
        
        if dominant[0] == "embedding_drift" and dominant[1] > 0.7: return "major_update"
        elif dominant[0] == "source_diversity" and dominant[1] > 0.7: return "source_expansion"
        elif dominant[0] == "confidence_change" and dominant[1] > 0.7: return "confidence_shift"
        return "major_update"
    
    async def regenerate_topic_metadata(self, topic_id: str, history_type: str) -> Dict[str, Any]:
        """Regenerate title, summary, and insights using Async Gemini with Structured Outputs"""
        if not self.gemini_client:
            return {"error": "Gemini API not configured"}
        
        try:
            topic = await self.topics_collection.find_one({"_id": ObjectId(topic_id)})
            if not topic:
                return {"error": "Topic not found"}
            
            article_ids = topic.get("article_ids", [])
            articles = []
            cursor = self.articles_collection.find({"_id": {"$in": article_ids}}).sort("published_date", -1).limit(20)
            async for article in cursor:
                articles.append(article)
            
            if not articles:
                return {"error": "No articles found"}
            
            article_texts = []
            for article in articles[:10]:
                date_str = str(article.get("published_date", datetime.now(UK_TZ)))
                desc = article.get('description', article.get('content', 'No content'))
                article_texts.append(f"Title: {article.get('title')}\nSource: {article.get('source')}\nDate: {date_str}\nContent: {desc}\n")
            
            context_note = ""
            if history_type == "major_update": context_note = "This is a MAJOR UPDATE to an ongoing story."
            elif history_type == "source_expansion": context_note = "This update includes NEW PERSPECTIVES from additional sources."
            elif history_type == "confidence_shift": context_note = "There has been a RELIABILITY CHANGE in this story."
            
            prompt = f"""You are an AI news analyst updating a podcast topic that has evolved over time.
{context_note}
Category: {topic.get('category', 'GENERAL').upper()}
Update Type: {history_type}
Articles:
{"".join(article_texts)}

RULES: MAX 10 WORDS FOR TITLE. Be specific."""

            # FIXED: Async call & guaranteed JSON output
            response = await self.gemini_client.aio.models.generate_content(
                model=TEXT_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                )
            )
            
            result = json.loads(response.text)
            
            update_data = {
                "title": result["title"],
                "summary": result["summary"],
                "key_insights": result["key_insights"],
                "confidence": result.get("confidence_score", 70) / 100.0,
                "last_regenerated": datetime.now(UK_TZ),
                "development_note": result.get("development_note")
            }
            
            await self.topics_collection.update_one({"_id": ObjectId(topic_id)}, {"$set": update_data})
            return result
            
        except Exception as e:
            logger.error(f"Error regenerating metadata: {str(e)}")
            return {"error": str(e)}
    
    async def create_history_point(self, topic_id: str, history_type: str, significance_breakdown: Dict[str, Any], regenerated_metadata: Optional[Dict[str, Any]] = None) -> Optional[str]:
        try:
            topic = await self.topics_collection.find_one({"_id": ObjectId(topic_id)})
            if not topic:
                return None
            
            history_doc = {
                "topic_id": ObjectId(topic_id),
                "history_type": history_type,
                "created_at": datetime.now(UK_TZ),
                "title": topic.get("title"),
                "summary": topic.get("summary"),
                "key_insights": topic.get("key_insights", []),
                "article_count": len(topic.get("article_ids", [])),
                "sources": topic.get("sources", []),
                "confidence": topic.get("confidence", 0.5),
                "centroid_embedding": topic.get("centroid_embedding"),
                "category": topic.get("category"),
                "image_url": topic.get("image_url"),
                "significance_score": significance_breakdown.get("total_score"),
                "significance_breakdown": significance_breakdown,
                "was_regenerated": regenerated_metadata is not None,
                "development_note": regenerated_metadata.get("development_note") if isinstance(regenerated_metadata, dict) else None
            }
            
            result = await self.history_collection.insert_one(history_doc)
            history_count = await self.history_collection.count_documents({"topic_id": ObjectId(topic_id)})
            
            await self.topics_collection.update_one(
                {"_id": ObjectId(topic_id)},
                {"$set": {"last_history_point": datetime.now(UK_TZ), "history_point_count": history_count}}
            )
            return str(result.inserted_id)
            
        except Exception as e:
            logger.error(f"Error creating history point: {e}")
            return None
    
    async def check_and_create_history(self, topic_id: str) -> Optional[Dict[str, Any]]:
        try:
            topic = await self.topics_collection.find_one({"_id": ObjectId(topic_id)})
            if not topic or topic.get("status") != "active":
                return None
            
            last_history = await self.history_collection.find_one(
                {"topic_id": ObjectId(topic_id)}, sort=[("created_at", -1)]
            )
            
            current_stats = {
                "article_count": len(topic.get("article_ids", [])),
                "sources": topic.get("sources", []),
                "confidence": topic.get("confidence", 0.5)
            }
            
            significance_score, breakdown = self.calculate_significance_score(topic, last_history, current_stats)
            
            if significance_score >= self.config.SIGNIFICANCE_THRESHOLD:
                history_type = self.determine_history_type(breakdown)
                
                regenerated = None
                if history_type in ["major_update", "source_expansion"]:
                    regenerated = await self.regenerate_topic_metadata(topic_id, history_type)
                
                history_id = await self.create_history_point(topic_id, history_type, breakdown, regenerated)
                
                if history_id:
                    return {
                        "action": "created_history",
                        "history_id": history_id,
                        "history_type": history_type,
                        "significance_score": significance_score,
                        "was_regenerated": regenerated is not None,
                        "breakdown": breakdown
                    }
            
            return {"action": "no_history_needed", "significance_score": significance_score}
            
        except Exception as e:
            logger.error(f"Error checking history for topic {topic_id}: {e}")
            return None
    
    async def run_history_check_cycle(self) -> Dict[str, Any]:
        """
        FIXED: Uses cursor streaming instead of inefficient .skip().limit() pagination.
        This saves memory and runs significantly faster.
        """
        logger.info(f"Topic History Check Cycle Started at {datetime.now(UK_TZ).strftime('%H:%M:%S %Z')}")
        
        stats = {
            "topics_checked": 0, "histories_created": 0, "by_type": {}, 
            "regenerations": 0, "start_time": datetime.now(UK_TZ), "errors": 0
        }
        
        try:
            # Stream cursor directly
            cursor = self.topics_collection.find({"status": "active", "has_title": True})
            
            async for topic in cursor:
                try:
                    stats["topics_checked"] += 1
                    result = await self.check_and_create_history(str(topic["_id"]))
                    
                    if result and result.get("action") == "created_history":
                        stats["histories_created"] += 1
                        history_type = result["history_type"]
                        stats["by_type"][history_type] = stats["by_type"].get(history_type, 0) + 1
                        
                        if result.get("was_regenerated"):
                            stats["regenerations"] += 1
                            
                    # Small yield to prevent event loop starvation on massive databases
                    await asyncio.sleep(0.01)
                    
                except Exception as e:
                    logger.error(f"Error processing topic {topic.get('_id')}: {e}")
                    stats["errors"] += 1
            
        except Exception as e:
            logger.error(f"Error in history check cycle: {e}")
            stats["errors"] += 1
        
        stats["end_time"] = datetime.now(UK_TZ)
        stats["duration_seconds"] = (stats["end_time"] - stats["start_time"]).total_seconds()
        
        logger.info(f"Summary: {stats['topics_checked']} checked, {stats['histories_created']} histories created.")
        return stats
    
    async def close(self):
        self.client_db.close()
        logger.info("MongoDB connection closed")


async def main():
    service = None
    try:
        service = TopicHistoryService(MONGODB_URI, MONGODB_DB_NAME)
        await service.run_history_check_cycle()
    finally:
        if service:
            await service.close()

if __name__ == "__main__":
    asyncio.run(main())