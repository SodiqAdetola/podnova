# backend/app/ai_pipeline/topic_history.py
"""
PodNova Topic History Module
Manages longitudinal topic development with intelligent snapshot creation
Tracks significant updates and regenerates titles/summaries when needed
"""
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from bson import ObjectId
from pymongo import MongoClient
import numpy as np
import certifi
import os
import json
from google import genai

from app.config import MONGODB_URI, MONGODB_DB_NAME


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
        """Initialize topic history service"""
        self.client = MongoClient(mongo_uri, tlsCAFile=certifi.where())
        self.db = self.client[db_name]
        self.topics_collection = self.db["topics"]
        self.articles_collection = self.db["articles"]
        self.history_collection = self.db["topic_history"]
        self.config = HistoryConfig()
        
        # Initialize Gemini for title/summary generation
        self.gemini_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        
        # Create indexes
        self.history_collection.create_index([("topic_id", 1), ("created_at", -1)])
        self.history_collection.create_index("created_at")
        self.topics_collection.create_index("last_history_check")
    
    def cosine_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Calculate cosine similarity between two vectors"""
        dot_product = np.dot(vec1, vec2)
        norm_product = np.linalg.norm(vec1) * np.linalg.norm(vec2)
        return dot_product / norm_product if norm_product != 0 else 0.0
    
    def calculate_significance_score(
        self,
        topic: Dict,
        last_history: Optional[Dict],
        current_stats: Dict
    ) -> Tuple[float, Dict]:
        """
        Calculate composite significance score (0-1)
        Returns: (score, breakdown_dict)
        
        This is the core algorithm that determines if a topic update is significant
        """
        weights = self.config.SIGNIFICANCE_WEIGHTS
        breakdown = {}
        total_score = 0.0
        
        # If no previous history, this is the initial snapshot
        if not last_history:
            return 1.0, {"type": "initial", "reason": "First snapshot"}
        
        # 1. ARTICLE GROWTH SCORE (0-1)
        # More new articles = higher significance
        prev_count = last_history.get("article_count", 0)
        current_count = current_stats["article_count"]
        new_articles = current_count - prev_count
        
        if new_articles >= self.config.MIN_NEW_ARTICLES:
            # Score based on percentage growth and absolute number
            growth_ratio = new_articles / max(prev_count, 1)
            absolute_score = min(1.0, new_articles / 20)  # Cap at 20 new articles
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
        # New sources indicate broader coverage
        prev_sources = set(last_history.get("sources", []))
        current_sources = set(current_stats["sources"])
        new_sources = current_sources - prev_sources
        
        if len(new_sources) >= self.config.MIN_NEW_SOURCES:
            source_score = min(1.0, len(new_sources) / 5)  # Cap at 5 new sources
        else:
            source_score = len(new_sources) / self.config.MIN_NEW_SOURCES
        
        breakdown["source_diversity"] = {
            "score": source_score,
            "new_sources": list(new_sources),
            "total_sources": len(current_sources)
        }
        total_score += source_score * weights["source_diversity"]
        
        # 3. CONFIDENCE CHANGE SCORE (0-1)
        # Significant confidence shift indicates reliability change
        prev_confidence = last_history.get("confidence", 0.5)
        current_confidence = current_stats["confidence"]
        confidence_delta = abs(current_confidence - prev_confidence)
        
        if confidence_delta >= self.config.CONFIDENCE_CHANGE:
            confidence_score = min(1.0, confidence_delta / 0.3)  # Cap at 0.3 change
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
        # Topic narrative shift detected by centroid movement
        drift_score = 0.0
        if "centroid_embedding" in last_history and "centroid_embedding" in topic:
            prev_centroid = np.array(last_history["centroid_embedding"])
            current_centroid = np.array(topic["centroid_embedding"])
            
            similarity = self.cosine_similarity(prev_centroid, current_centroid)
            drift = 1 - similarity  # Higher drift = lower similarity
            
            if drift >= self.config.EMBEDDING_DRIFT:
                drift_score = min(1.0, drift / 0.4)  # Cap at 0.4 drift
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
        # Longer time since last update increases significance
        last_history_time = last_history.get("created_at", datetime.now())
        time_elapsed = (datetime.now() - last_history_time).total_seconds() / 3600  # hours
        
        if time_elapsed >= self.config.TIME_ELAPSED_HOURS:
            # Scale up to 7 days for maximum time factor
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
        # Very active topics get periodic snapshots
        days_since_last = time_elapsed / 24
        if days_since_last >= self.config.PERIODIC_SNAPSHOT_DAYS and current_count >= 10:
            breakdown["periodic_trigger"] = True
            total_score = max(total_score, self.config.SIGNIFICANCE_THRESHOLD + 0.05)
        
        breakdown["total_score"] = total_score
        breakdown["threshold"] = self.config.SIGNIFICANCE_THRESHOLD
        breakdown["is_significant"] = total_score >= self.config.SIGNIFICANCE_THRESHOLD
        
        return total_score, breakdown
    
    def determine_history_type(self, breakdown: Dict) -> str:
        """Determine the type of history point based on breakdown"""
        if breakdown.get("periodic_trigger"):
            return "periodic"
        
        # Check which factor dominated
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
    
    async def regenerate_topic_metadata(self, topic_id: str, history_type: str) -> Dict:
        """
        Regenerate title, summary, and insights for a topic
        This is called when a significant update occurs
        """
        try:
            topic = await self.topics_collection.find_one({"_id": ObjectId(topic_id)})
            if not topic:
                return {"error": "Topic not found"}
            
            # Get current articles
            articles = []
            async for article in self.articles_collection.find({
                "_id": {"$in": topic["article_ids"]}
            }):
                articles.append(article)
            
            if not articles:
                return {"error": "No articles found"}
            
            # Prepare article texts
            article_texts = []
            for article in articles:
                article_texts.append(
                    f"Title: {article['title']}\n"
                    f"Source: {article['source']}\n"
                    f"Date: {article['published_date'].strftime('%Y-%m-%d')}\n"
                    f"Content: {article['description']}\n"
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

Category: {topic['category'].upper()}
Number of articles: {len(articles)}
Sources: {', '.join(topic.get('sources', []))}
Update Type: {history_type}

Articles:
{combined_articles}

Generate an UPDATED synthesis that reflects the current state of this story. Output JSON with:

- **title** (string, max 10 words): Current headline capturing the story's present state
- **summary** (string, 2-3 sentences): Updated overview reflecting latest developments
- **key_insights** (array, 3-5 strings): Current most important facts/developments
- **confidence_score** (integer, 0-100): Current reliability assessment
- **development_note** (string, 1 sentence): What has changed since earlier in this story

JSON format only, no markdown:"""

            response = self.gemini_client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt
            )
            
            response_text = response.text.strip()
            response_text = response_text.replace("```json", "").replace("```", "").strip()
            result = json.loads(response_text)
            
            # Update topic with new metadata
            await self.topics_collection.update_one(
                {"_id": ObjectId(topic_id)},
                {
                    "$set": {
                        "title": result["title"],
                        "summary": result["summary"],
                        "key_insights": result["key_insights"],
                        "confidence": result["confidence_score"] / 100.0,
                        "last_regenerated": datetime.now(),
                        "development_note": result.get("development_note")
                    }
                }
            )
            
            return result
            
        except Exception as e:
            print(f"Error regenerating metadata: {str(e)}")
            return {"error": str(e)}
    
    async def create_history_point(
        self,
        topic_id: str,
        history_type: str,
        significance_breakdown: Dict,
        regenerated_metadata: Optional[Dict] = None
    ) -> str:
        """Create a new history snapshot for a topic"""
        topic = await self.topics_collection.find_one({"_id": ObjectId(topic_id)})
        if not topic:
            return None
        
        # Get current article count and sources
        current_stats = {
            "article_count": len(topic.get("article_ids", [])),
            "sources": topic.get("sources", []),
            "confidence": topic.get("confidence", 0.5)
        }
        
        # Create snapshot
        history_doc = {
            "topic_id": ObjectId(topic_id),
            "history_type": history_type,
            "created_at": datetime.now(),
            
            # Snapshot of topic state
            "title": topic.get("title"),
            "summary": topic.get("summary"),
            "key_insights": topic.get("key_insights", []),
            "article_count": current_stats["article_count"],
            "sources": current_stats["sources"],
            "confidence": current_stats["confidence"],
            "centroid_embedding": topic.get("centroid_embedding"),
            "category": topic.get("category"),
            "image_url": topic.get("image_url"),
            
            # Metadata about this snapshot
            "significance_score": significance_breakdown.get("total_score"),
            "significance_breakdown": significance_breakdown,
            "was_regenerated": regenerated_metadata is not None,
            "development_note": regenerated_metadata.get("development_note") if regenerated_metadata else None
        }
        
        result = await self.history_collection.insert_one(history_doc)
        history_id = result.inserted_id
        
        # Update topic with last history timestamp
        await self.topics_collection.update_one(
            {"_id": ObjectId(topic_id)},
            {
                "$set": {
                    "last_history_point": datetime.now(),
                    "history_point_count": await self.history_collection.count_documents({"topic_id": ObjectId(topic_id)})
                }
            }
        )
        
        print(f"  Created {history_type} history point for topic: {topic.get('title', 'Untitled')[:60]}")
        print(f"  Significance score: {significance_breakdown.get('total_score', 0):.3f}")
        
        return str(history_id)
    
    async def check_and_create_history(self, topic_id: str) -> Optional[Dict]:
        """
        Main function: Check if topic needs a history point and create if significant
        Returns: Dict with action taken or None
        """
        topic = await self.topics_collection.find_one({"_id": ObjectId(topic_id)})
        if not topic or topic.get("status") != "active":
            return None
        
        # Get latest history point
        last_history = await self.history_collection.find_one(
            {"topic_id": ObjectId(topic_id)},
            sort=[("created_at", -1)]
        )
        
        # Gather current stats
        current_stats = {
            "article_count": len(topic.get("article_ids", [])),
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
                print(f"  Regenerating metadata for {history_type}...")
                regenerated = await self.regenerate_topic_metadata(str(topic_id), history_type)
            
            # Create history point
            history_id = await self.create_history_point(
                str(topic_id),
                history_type,
                breakdown,
                regenerated
            )
            
            return {
                "action": "created_history",
                "history_id": history_id,
                "history_type": history_type,
                "significance_score": significance_score,
                "was_regenerated": regenerated is not None,
                "breakdown": breakdown
            }
        else:
            # Not significant enough
            return {
                "action": "no_history_needed",
                "significance_score": significance_score,
                "threshold": self.config.SIGNIFICANCE_THRESHOLD,
                "breakdown": breakdown
            }
    
    async def get_topic_timeline(self, topic_id: str) -> List[Dict]:
        """Get full history timeline for a topic"""
        history_points = []
        
        async for point in self.history_collection.find(
            {"topic_id": ObjectId(topic_id)},
            sort=[("created_at", -1)]
        ):
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
    
    async def run_history_check_cycle(self) -> Dict:
        """Check all active topics for history point creation"""
        print("=" * 80)
        print("Topic History Check Cycle")
        print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 80)
        
        stats = {
            "topics_checked": 0,
            "histories_created": 0,
            "by_type": {},
            "regenerations": 0,
            "start_time": datetime.now()
        }
        
        # Get all active topics
        cursor = self.topics_collection.find({
            "status": "active",
            "has_title": True
        })
        
        async for topic in cursor:
            stats["topics_checked"] += 1
            
            result = await self.check_and_create_history(topic["_id"])
            
            if result and result.get("action") == "created_history":
                stats["histories_created"] += 1
                
                history_type = result["history_type"]
                stats["by_type"][history_type] = stats["by_type"].get(history_type, 0) + 1
                
                if result.get("was_regenerated"):
                    stats["regenerations"] += 1
        
        stats["end_time"] = datetime.now()
        stats["duration_seconds"] = (stats["end_time"] - stats["start_time"]).total_seconds()
        
        print("\n" + "=" * 80)
        print("History Check Summary")
        print("=" * 80)
        print(f"Topics checked: {stats['topics_checked']}")
        print(f"History points created: {stats['histories_created']}")
        print(f"Metadata regenerations: {stats['regenerations']}")
        if stats["by_type"]:
            print("By type:")
            for htype, count in stats["by_type"].items():
                print(f"  {htype}: {count}")
        print(f"Duration: {stats['duration_seconds']:.2f} seconds")
        print("=" * 80)
        
        return stats


def main():
    """Entry point for manual testing"""
    import asyncio
    
    async def test():
        service = TopicHistoryService(MONGODB_URI, MONGODB_DB_NAME)
        await service.run_history_check_cycle()
    
    asyncio.run(test())


if __name__ == "__main__":
    main()