# backend/app/ai_pipeline/topic_history.py
"""
PodNova Topic History Module
FULLY ASYNC VERSION with Motor
Manages longitudinal topic development with intelligent snapshot creation
Tracks significant updates and regenerates titles/summaries when needed
"""
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
from bson import ObjectId
import motor.motor_asyncio
import numpy as np
import certifi
import os
import json
import asyncio
from google import genai
import logging

from app.config import MONGODB_URI, MONGODB_DB_NAME

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Model configuration
EMBEDDING_MODEL = "gemini-embedding-001"
TEXT_MODEL = "gemini-2.5-flash"


class HistoryConfig:
    """Configuration for topic history snapshots"""
    
    # Thresholds for triggering history points
    MIN_NEW_ARTICLES = 5          # Minimum new articles for significance
    MIN_NEW_SOURCES = 2           # Minimum new sources for significance
    CONFIDENCE_CHANGE = 0.15      # Minimum confidence change (0-1)
    EMBEDDING_DRIFT = 0.20        # Minimum centroid drift for significance
    TIME_ELAPSED_HOURS = 48       # Minimum time between snapshots
    
    # Scoring weights for composite significance score
    SIGNIFICANCE_WEIGHTS = {
        "article_growth": 0.30,
        "source_diversity": 0.25,
        "confidence_change": 0.20,
        "embedding_drift": 0.15,
        "time_factor": 0.10
    }
    
    # Significance threshold (0-1)
    SIGNIFICANCE_THRESHOLD = 0.60  # Must score above this to create history
    
    # History point types
    HISTORY_TYPES = {
        "initial": "Initial topic creation",
        "major_update": "Significant development with narrative change",
        "source_expansion": "New perspectives from additional sources",
        "confidence_shift": "Reliability assessment changed",
        "periodic": "Scheduled periodic snapshot",
        "manual": "Manually triggered snapshot"
    }
    
    # Maximum history points per topic
    MAX_HISTORY_POINTS = 50
    
    # Periodic snapshot interval (for very active topics)
    PERIODIC_SNAPSHOT_DAYS = 7


class TopicHistoryService:
    def __init__(self, mongo_uri: str, db_name: str):
        """Initialize topic history service with async Motor client"""
        self.client = motor.motor_asyncio.AsyncIOMotorClient(
            mongo_uri, 
            tlsCAFile=certifi.where(),
            maxPoolSize=50,
            minPoolSize=10
        )
        self.db = self.client[db_name]
        self.topics_collection = self.db["topics"]
        self.articles_collection = self.db["articles"]
        self.history_collection = self.db["topic_history"]
        self.config = HistoryConfig()
        
        # Initialize Gemini for title/summary generation
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            logger.warning("GEMINI_API_KEY not set. Metadata regeneration will fail.")
        self.gemini_client = genai.Client(api_key=api_key) if api_key else None
        
        # Create indexes on initialization
        asyncio.create_task(self._ensure_indexes())
    
    async def _ensure_indexes(self):
        """Ensure all required indexes exist"""
        try:
            # History collection indexes
            await self.history_collection.create_index([("topic_id", 1), ("created_at", -1)])
            await self.history_collection.create_index("created_at")
            
            # Topics collection indexes
            await self.topics_collection.create_index("last_history_check")
            await self.topics_collection.create_index([("status", 1), ("has_title", 1)])
            
            logger.info("Database indexes verified")
        except Exception as e:
            logger.error(f"Error creating indexes: {e}")
    
    def cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        try:
            vec1_np = np.array(vec1)
            vec2_np = np.array(vec2)
            
            dot_product = np.dot(vec1_np, vec2_np)
            norm_product = np.linalg.norm(vec1_np) * np.linalg.norm(vec2_np)
            
            if norm_product == 0:
                return 0.0
                
            similarity = dot_product / norm_product
            return float(similarity)
        except Exception as e:
            logger.error(f"Error calculating cosine similarity: {e}")
            return 0.0
    
    def calculate_significance_score(
        self,
        topic: Dict[str, Any],
        last_history: Optional[Dict[str, Any]],
        current_stats: Dict[str, Any]
    ) -> Tuple[float, Dict[str, Any]]:
        """
        Calculate composite significance score (0-1)
        Returns: (score, breakdown_dict)
        """
        weights = self.config.SIGNIFICANCE_WEIGHTS
        breakdown = {}
        total_score = 0.0
        
        # If no previous history, this is the initial snapshot
        if not last_history:
            return 1.0, {"type": "initial", "reason": "First snapshot"}
        
        # 1. ARTICLE GROWTH SCORE (0-1)
        prev_count = last_history.get("article_count", 0)
        current_count = current_stats["article_count"]
        new_articles = current_count - prev_count
        
        if new_articles >= self.config.MIN_NEW_ARTICLES:
            growth_ratio = new_articles / max(prev_count, 1)
            absolute_score = min(1.0, new_articles / 20)
            article_score = (growth_ratio * 0.5 + absolute_score * 0.5)
        else:
            article_score = new_articles / self.config.MIN_NEW_ARTICLES
        
        article_score = min(1.0, article_score)
        breakdown["article_growth"] = {
            "score": article_score,
            "new_articles": new_articles,
            "growth_rate": f"{(new_articles / max(prev_count, 1) * 100):.1f}%"
        }
        total_score += article_score * weights["article_growth"]
        
        # 2. SOURCE DIVERSITY SCORE (0-1)
        prev_sources = set(last_history.get("sources", []))
        current_sources = set(current_stats["sources"])
        new_sources = current_sources - prev_sources
        
        if len(new_sources) >= self.config.MIN_NEW_SOURCES:
            source_score = min(1.0, len(new_sources) / 5)
        else:
            source_score = len(new_sources) / self.config.MIN_NEW_SOURCES
        
        breakdown["source_diversity"] = {
            "score": source_score,
            "new_sources": list(new_sources)[:5],
            "total_sources": len(current_sources)
        }
        total_score += source_score * weights["source_diversity"]
        
        # 3. CONFIDENCE CHANGE SCORE (0-1)
        prev_confidence = last_history.get("confidence", 0.5)
        current_confidence = current_stats["confidence"]
        confidence_delta = abs(current_confidence - prev_confidence)
        
        if confidence_delta >= self.config.CONFIDENCE_CHANGE:
            confidence_score = min(1.0, confidence_delta / 0.3)
        else:
            confidence_score = confidence_delta / self.config.CONFIDENCE_CHANGE
        
        breakdown["confidence_change"] = {
            "score": confidence_score,
            "previous": prev_confidence,
            "current": current_confidence,
            "delta": confidence_delta,
            "direction": "increased" if current_confidence > prev_confidence else "decreased"
        }
        total_score += confidence_score * weights["confidence_change"]
        
        # 4. EMBEDDING DRIFT SCORE (0-1)
        drift_score = 0.0
        if (last_history.get("centroid_embedding") and 
            topic.get("centroid_embedding")):
            
            similarity = self.cosine_similarity(
                last_history["centroid_embedding"],
                topic["centroid_embedding"]
            )
            drift = 1 - similarity
            
            if drift >= self.config.EMBEDDING_DRIFT:
                drift_score = min(1.0, drift / 0.4)
            else:
                drift_score = drift / self.config.EMBEDDING_DRIFT
            
            breakdown["embedding_drift"] = {
                "score": drift_score,
                "drift_magnitude": drift,
                "similarity": similarity
            }
        else:
            breakdown["embedding_drift"] = {"score": 0.0, "reason": "No embedding data"}
        
        total_score += drift_score * weights["embedding_drift"]
        
        # 5. TIME FACTOR SCORE (0-1)
        last_history_time = last_history.get("created_at", datetime.now())
        time_elapsed = (datetime.now() - last_history_time).total_seconds() / 3600
        
        if time_elapsed >= self.config.TIME_ELAPSED_HOURS:
            time_score = min(1.0, time_elapsed / (7 * 24))
        else:
            time_score = time_elapsed / self.config.TIME_ELAPSED_HOURS
        
        breakdown["time_factor"] = {
            "score": time_score,
            "hours_elapsed": time_elapsed,
            "days_elapsed": time_elapsed / 24
        }
        total_score += time_score * weights["time_factor"]
        
        # 6. CHECK FOR PERIODIC SNAPSHOT
        days_since_last = time_elapsed / 24
        if (days_since_last >= self.config.PERIODIC_SNAPSHOT_DAYS and 
            current_count >= 10):
            breakdown["periodic_trigger"] = True
            total_score = max(total_score, self.config.SIGNIFICANCE_THRESHOLD + 0.05)
        
        breakdown["total_score"] = total_score
        breakdown["threshold"] = self.config.SIGNIFICANCE_THRESHOLD
        breakdown["is_significant"] = total_score >= self.config.SIGNIFICANCE_THRESHOLD
        
        return total_score, breakdown
    
    def determine_history_type(self, breakdown: Dict[str, Any]) -> str:
        """Determine the type of history point based on breakdown"""
        if breakdown.get("periodic_trigger"):
            return "periodic"
        
        scores = {
            "article_growth": breakdown.get("article_growth", {}).get("score", 0),
            "source_diversity": breakdown.get("source_diversity", {}).get("score", 0),
            "confidence_change": breakdown.get("confidence_change", {}).get("score", 0),
            "embedding_drift": breakdown.get("embedding_drift", {}).get("score", 0)
        }
        
        dominant = max(scores.items(), key=lambda x: x[1])
        
        if dominant[0] == "embedding_drift" and dominant[1] > 0.7:
            return "major_update"
        elif dominant[0] == "source_diversity" and dominant[1] > 0.7:
            return "source_expansion"
        elif dominant[0] == "confidence_change" and dominant[1] > 0.7:
            return "confidence_shift"
        else:
            return "major_update"
    
    async def regenerate_topic_metadata(self, topic_id: str, history_type: str) -> Dict[str, Any]:
        """
        Regenerate title, summary, and insights for a topic
        This is called when a significant update occurs
        """
        if not self.gemini_client:
            logger.error("Gemini client not initialized")
            return {"error": "Gemini API not configured"}
        
        try:
            topic = await self.topics_collection.find_one({"_id": ObjectId(topic_id)})
            if not topic:
                return {"error": "Topic not found"}
            
            # Get current articles
            article_ids = topic.get("article_ids", [])
            if not article_ids:
                return {"error": "No articles found"}
            
            articles = []
            cursor = self.articles_collection.find({
                "_id": {"$in": article_ids}
            }).sort("published_date", -1).limit(20)
            async for article in cursor:
                articles.append(article)
            
            if not articles:
                return {"error": "No articles found"}
            
            # Prepare article texts
            article_texts = []
            for article in articles[:10]:
                published_date = article.get("published_date", datetime.now())
                if isinstance(published_date, datetime):
                    date_str = published_date.strftime('%Y-%m-%d')
                else:
                    date_str = str(published_date)
                
                article_texts.append(
                    f"Title: {article.get('title', 'Untitled')}\n"
                    f"Source: {article.get('source', 'Unknown')}\n"
                    f"Date: {date_str}\n"
                    f"Content: {article.get('description', article.get('content', 'No content'))}\n"
                )
            
            combined_articles = "\n---\n".join(article_texts)
            
            # Enhanced prompt based on history type
            context_note = ""
            if history_type == "major_update":
                context_note = "This is a MAJOR UPDATE to an ongoing story. Focus on what has changed or developed recently."
            elif history_type == "source_expansion":
                context_note = "This update includes NEW PERSPECTIVES from additional sources. Highlight diverse viewpoints."
            elif history_type == "confidence_shift":
                context_note = "There has been a RELIABILITY CHANGE in this story. Assess the current confidence level."
            
            prompt = f"""You are an AI news analyst updating a podcast topic that has evolved over time.

{context_note}

Your task is to generate a CLEAR headline explaining the LATEST development in this ongoing story.

Category: {topic.get('category', 'GENERAL').upper()}
Number of articles: {len(articles)}
Sources: {', '.join(topic.get('sources', [])[:5])}
Update Type: {history_type}

Articles:
{combined_articles}

Generate an UPDATED synthesis that reflects the current state of this story. Output JSON with:

- **title** (string, max 10 words): A headline explaining what's NEW in this story. Include specific names and concrete developments.

  Examples of CLEAR update titles:
  "Senate passes $95 billion aid package for Ukraine and Israel"
  "Judge sets June 2024 trial date in Google antitrust case"
  "Microsoft completes $69 billion Activision Blizzard acquisition"
  
  Examples of CONFUSING titles (AVOID):
  "Historic vote reshapes foreign policy landscape"
  "Trial date set in major tech case"
  "Deal finally closes after regulatory hurdles"

- **summary** (string, 2-3 sentences): Updated overview reflecting latest developments (MAKE THIS INCLUSIVE FOR ALL COMPREHENSION LEVELS).

- **key_insights** (array, 3-5 strings): Current most important facts/developments

- **confidence_score** (integer, 0-100): Current reliability assessment

- **development_note** (string, 1 sentence): What has changed since earlier in this story (MAKE THIS INCLUSIVE FOR ALL COMPREHENSION LEVELS).

JSON format only, no markdown:"""

            response = self.gemini_client.models.generate_content(
                model=TEXT_MODEL,
                contents=prompt
            )
            
            response_text = response.text.strip()
            response_text = response_text.replace("```json", "").replace("```", "").strip()
            result = json.loads(response_text)
            
            # Update topic with new metadata
            update_data = {
                "title": result["title"],
                "summary": result["summary"],
                "key_insights": result["key_insights"],
                "confidence": result["confidence_score"] / 100.0,
                "last_regenerated": datetime.now(),
                "development_note": result.get("development_note")
            }
            
            await self.topics_collection.update_one(
                {"_id": ObjectId(topic_id)},
                {"$set": update_data}
            )
            
            logger.info(f"Regenerated metadata for topic {topic_id}: {result['title']}")
            return result
            
        except json.JSONDecodeError as e:
            logger.error(f"JSON parsing error in metadata regeneration: {e}")
            return {"error": "Failed to parse AI response"}
        except Exception as e:
            logger.error(f"Error regenerating metadata: {str(e)}")
            return {"error": str(e)}
    
    async def create_history_point(
        self,
        topic_id: str,
        history_type: str,
        significance_breakdown: Dict[str, Any],
        regenerated_metadata: Optional[Dict[str, Any]] = None
    ) -> Optional[str]:
        """Create a new history snapshot for a topic"""
        try:
            topic = await self.topics_collection.find_one({"_id": ObjectId(topic_id)})
            if not topic:
                logger.error(f"Topic {topic_id} not found")
                return None
            
            # Get current stats
            article_ids = topic.get("article_ids", [])
            sources = topic.get("sources", [])
            
            # Safely get development note
            development_note = None
            if regenerated_metadata and isinstance(regenerated_metadata, dict):
                development_note = regenerated_metadata.get("development_note")
            
            # Create snapshot
            history_doc = {
                "topic_id": ObjectId(topic_id),
                "history_type": history_type,
                "created_at": datetime.now(),
                
                # Snapshot of topic state
                "title": topic.get("title"),
                "summary": topic.get("summary"),
                "key_insights": topic.get("key_insights", []),
                "article_count": len(article_ids),
                "sources": sources,
                "confidence": topic.get("confidence", 0.5),
                "centroid_embedding": topic.get("centroid_embedding"),
                "category": topic.get("category"),
                "image_url": topic.get("image_url"),
                
                # Metadata about this snapshot
                "significance_score": significance_breakdown.get("total_score"),
                "significance_breakdown": significance_breakdown,
                "was_regenerated": regenerated_metadata is not None,
                "development_note": development_note
            }
            
            result = await self.history_collection.insert_one(history_doc)
            history_id = result.inserted_id
            
            # Count total history points for this topic
            history_count = await self.history_collection.count_documents(
                {"topic_id": ObjectId(topic_id)}
            )
            
            # Update topic with last history timestamp
            await self.topics_collection.update_one(
                {"_id": ObjectId(topic_id)},
                {
                    "$set": {
                        "last_history_point": datetime.now(),
                        "history_point_count": history_count
                    }
                }
            )
            
            logger.info(f"Created {history_type} history point for topic: {topic.get('title', 'Untitled')[:60]}")
            logger.info(f"  Significance score: {significance_breakdown.get('total_score', 0):.3f}")
            
            return str(history_id)
            
        except Exception as e:
            logger.error(f"Error creating history point: {e}")
            return None
    
    async def check_and_create_history(self, topic_id: str) -> Optional[Dict[str, Any]]:
        """
        Main function: Check if topic needs a history point and create if significant
        Returns: Dict with action taken or None
        """
        try:
            topic = await self.topics_collection.find_one({"_id": ObjectId(topic_id)})
            if not topic or topic.get("status") != "active":
                return None
            
            # Get latest history point
            last_history = await self.history_collection.find_one(
                {"topic_id": ObjectId(topic_id)},
                sort=[("created_at", -1)]
            )
            
            # Gather current stats
            article_ids = topic.get("article_ids", [])
            current_stats = {
                "article_count": len(article_ids),
                "sources": topic.get("sources", []),
                "confidence": topic.get("confidence", 0.5)
            }
            
            # Calculate significance
            significance_score, breakdown = self.calculate_significance_score(
                topic, last_history, current_stats
            )
            
            # Check if significant enough
            if significance_score >= self.config.SIGNIFICANCE_THRESHOLD:
                history_type = self.determine_history_type(breakdown)
                
                # Regenerate metadata if major update
                regenerated = None
                if history_type in ["major_update", "source_expansion"]:
                    logger.info(f"  Regenerating metadata for {history_type}...")
                    regenerated = await self.regenerate_topic_metadata(topic_id, history_type)
                
                # Create history point
                history_id = await self.create_history_point(
                    topic_id,
                    history_type,
                    breakdown,
                    regenerated
                )
                
                if history_id:
                    return {
                        "action": "created_history",
                        "history_id": history_id,
                        "history_type": history_type,
                        "significance_score": significance_score,
                        "was_regenerated": regenerated is not None,
                        "breakdown": breakdown
                    }
            
            # Not significant enough
            return {
                "action": "no_history_needed",
                "significance_score": significance_score,
                "threshold": self.config.SIGNIFICANCE_THRESHOLD,
                "breakdown": breakdown
            }
            
        except Exception as e:
            logger.error(f"Error checking history for topic {topic_id}: {e}")
            return None
    
    async def get_topic_timeline(self, topic_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get full history timeline for a topic"""
        try:
            history_points = []
            
            cursor = self.history_collection.find(
                {"topic_id": ObjectId(topic_id)},
                sort=[("created_at", -1)]
            ).limit(limit)
            
            async for point in cursor:
                history_points.append({
                    "id": str(point["_id"]),
                    "history_type": point["history_type"],
                    "created_at": point["created_at"].isoformat(),
                    "title": point.get("title"),
                    "summary": point.get("summary"),
                    "key_insights": point.get("key_insights", []),
                    "article_count": point.get("article_count"),
                    "sources": point.get("sources", []),
                    "confidence": point.get("confidence"),
                    "significance_score": point.get("significance_score"),
                    "was_regenerated": point.get("was_regenerated", False),
                    "development_note": point.get("development_note"),
                    "image_url": point.get("image_url")
                })
            
            return history_points
            
        except Exception as e:
            logger.error(f"Error getting timeline for topic {topic_id}: {e}")
            return []
    
    async def run_history_check_cycle(self, batch_size: int = 50) -> Dict[str, Any]:
        """Check all active topics for history point creation in batches"""
        logger.info("=" * 80)
        logger.info("Topic History Check Cycle Started")
        logger.info(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        logger.info("=" * 80)
        
        stats = {
            "topics_checked": 0,
            "histories_created": 0,
            "by_type": {},
            "regenerations": 0,
            "start_time": datetime.now(),
            "errors": 0
        }
        
        try:
            # Get count of active topics
            total_topics = await self.topics_collection.count_documents({
                "status": "active",
                "has_title": True
            })
            
            logger.info(f"Total active topics to check: {total_topics}")
            
            # Process in batches
            skip = 0
            while skip < total_topics:
                cursor = self.topics_collection.find({
                    "status": "active",
                    "has_title": True
                }).skip(skip).limit(batch_size)
                
                batch_topics = await cursor.to_list(length=batch_size)
                
                for topic in batch_topics:
                    try:
                        stats["topics_checked"] += 1
                        
                        if stats["topics_checked"] % 10 == 0:
                            logger.info(f"Progress: {stats['topics_checked']}/{total_topics} topics checked")
                        
                        result = await self.check_and_create_history(str(topic["_id"]))
                        
                        if result and result.get("action") == "created_history":
                            stats["histories_created"] += 1
                            
                            history_type = result["history_type"]
                            stats["by_type"][history_type] = stats["by_type"].get(history_type, 0) + 1
                            
                            if result.get("was_regenerated"):
                                stats["regenerations"] += 1
                    
                    except Exception as e:
                        logger.error(f"Error processing topic {topic.get('_id')}: {e}")
                        stats["errors"] += 1
                
                skip += batch_size
                await asyncio.sleep(0.1)  # Small delay
            
        except Exception as e:
            logger.error(f"Error in history check cycle: {e}")
            stats["errors"] += 1
        
        stats["end_time"] = datetime.now()
        stats["duration_seconds"] = (stats["end_time"] - stats["start_time"]).total_seconds()
        
        logger.info("\n" + "=" * 80)
        logger.info("History Check Summary")
        logger.info("=" * 80)
        logger.info(f"Topics checked: {stats['topics_checked']}")
        logger.info(f"History points created: {stats['histories_created']}")
        logger.info(f"Metadata regenerations: {stats['regenerations']}")
        logger.info(f"Errors encountered: {stats['errors']}")
        
        if stats["by_type"]:
            logger.info("By type:")
            for htype, count in stats["by_type"].items():
                logger.info(f"  {htype}: {count}")
        
        logger.info(f"Duration: {stats['duration_seconds']:.2f} seconds")
        logger.info("=" * 80)
        
        return stats
    
    async def close(self):
        """Close database connection"""
        self.client.close()
        logger.info("MongoDB connection closed")


async def run_history_check():
    """Main entry point for running history check"""
    service = None
    try:
        service = TopicHistoryService(MONGODB_URI, MONGODB_DB_NAME)
        stats = await service.run_history_check_cycle()
        return stats
    except Exception as e:
        logger.error(f"Failed to run history check: {e}")
        raise
    finally:
        if service:
            await service.close()


async def main():
    """Entry point for manual execution"""
    logger.info("Starting topic history check...")
    stats = await run_history_check()
    
    if stats and stats.get("errors", 0) == 0:
        logger.info("History check completed successfully")
        return 0
    else:
        logger.error("History check completed with errors")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)