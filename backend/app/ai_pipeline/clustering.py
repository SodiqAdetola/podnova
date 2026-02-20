# backend/app/ai_pipeline/clustering.py 
"""
PodNova Clustering Module
NOW WITH INTEGRATED TOPIC HISTORY TRACKING
"""
from app.config import MONGODB_URI, MONGODB_DB_NAME
import os
import json
import time
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import numpy as np
from pymongo import MongoClient
import certifi
from google import genai

# Import services
from app.ai_pipeline.article_maintenance import MaintenanceService
from app.ai_pipeline.topic_history import TopicHistoryService

# Configuration
SIMILARITY_THRESHOLD = 0.7
MIN_ARTICLES_FOR_TITLE = 2
CONFIDENCE_THRESHOLD = 0.6
TOPIC_INACTIVE_DAYS = 90
EMBEDDING_MODEL = "gemini-embedding-001"
TEXT_MODEL = "gemini-2.5-flash"

# Initialize Gemini client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))


class ClusteringService:
    def __init__(self, mongo_uri: str, db_name: str):
        """Initialize the clustering service with MongoDB connection"""
        self.client = MongoClient(mongo_uri, tlsCAFile=certifi.where())
        self.db = self.client[db_name]
        self.articles_collection = self.db["articles"]
        self.topics_collection = self.db["topics"]
        
        # Initialize maintenance and history services
        self.maintenance_service = MaintenanceService(mongo_uri, db_name)
        self.history_service = TopicHistoryService(mongo_uri, db_name)
        
        # Create indexes
        self.topics_collection.create_index("category")
        self.topics_collection.create_index("last_updated")
        self.topics_collection.create_index("status")
        self.topics_collection.create_index([("category", 1), ("status", 1)])
        
    def compute_embedding(self, text: str) -> Optional[np.ndarray]:
        """Compute embedding for given text using Gemini"""
        try:
            response = client.models.embed_content(
                model=EMBEDDING_MODEL,
                contents=text
            )
            
            if hasattr(response, 'embeddings') and len(response.embeddings) > 0:
                return np.array(response.embeddings[0].values)
            elif hasattr(response, 'embedding'):
                return np.array(response.embedding)
            
            print(f"  Unexpected embedding response format")
            return None
            
        except Exception as e:
            print(f"  Error computing embedding: {str(e)}")
            return None
    
    def cosine_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Calculate cosine similarity between two vectors"""
        dot_product = np.dot(vec1, vec2)
        norm_product = np.linalg.norm(vec1) * np.linalg.norm(vec2)
        return dot_product / norm_product if norm_product != 0 else 0.0
    
    def check_and_resurrect_topic(self, topic: Dict) -> bool:
        """Check if a stale topic should be resurrected"""
        if topic.get("status") != "stale":
            return False
        
        stale_since = topic.get("stale_since")
        if stale_since:
            days_stale = (datetime.now() - stale_since).days
            if days_stale > self.maintenance_service.config.MAX_RESURRECTION_AGE_DAYS:
                return False
        
        self.topics_collection.update_one(
            {"_id": topic["_id"]},
            {
                "$set": {
                    "status": "active",
                    "resurrected_at": datetime.now()
                },
                "$unset": {"stale_since": ""}
            }
        )
        
        print(f"  Resurrected stale topic: {topic.get('title', 'Untitled')}")
        return True
    
    def find_matching_topic(self, article_embedding: np.ndarray, category: str) -> Optional[Dict]:
        """Find existing topic that matches the article embedding"""
        active_topics = self.topics_collection.find({
            "category": category,
            "status": "active"
        })
        
        best_match = None
        best_similarity = 0.0
        
        for topic in active_topics:
            if "centroid_embedding" not in topic:
                continue
            
            topic_embedding = np.array(topic["centroid_embedding"])
            similarity = self.cosine_similarity(article_embedding, topic_embedding)
            
            if similarity > best_similarity and similarity >= SIMILARITY_THRESHOLD:
                best_similarity = similarity
                best_match = topic
        
        if not best_match:
            stale_topics = self.topics_collection.find({
                "category": category,
                "status": "stale"
            })
            
            resurrection_threshold = SIMILARITY_THRESHOLD + self.maintenance_service.config.RESURRECTION_SIMILARITY_BONUS
            
            for topic in stale_topics:
                if "centroid_embedding" not in topic:
                    continue
                
                topic_embedding = np.array(topic["centroid_embedding"])
                similarity = self.cosine_similarity(article_embedding, topic_embedding)
                
                if similarity > best_similarity and similarity >= resurrection_threshold:
                    best_similarity = similarity
                    best_match = topic
                    self.check_and_resurrect_topic(topic)
        
        if best_match:
            print(f"  Found matching topic: {best_match.get('title', 'Untitled')} (similarity: {best_similarity:.3f})")
        
        return best_match
    
    def compute_centroid(self, article_ids: List[str]) -> Optional[np.ndarray]:
        """Compute centroid embedding from list of article IDs"""
        embeddings = []
        
        for article_id in article_ids:
            article = self.articles_collection.find_one({"_id": article_id})
            if article and "embedding" in article:
                embeddings.append(np.array(article["embedding"]))
        
        return np.mean(embeddings, axis=0) if embeddings else None
    
    async def create_new_topic(self, article_doc: Dict, article_embedding: np.ndarray) -> str:
        """Create a new topic seeded with this article"""
        topic_doc = {
            "category": article_doc["category"],
            "article_ids": [article_doc["_id"]],
            "sources": [article_doc["source"]],
            "centroid_embedding": article_embedding.tolist(),
            "confidence": 0.5,
            "created_at": datetime.now(),
            "last_updated": datetime.now(),
            "status": "active",
            "article_count": 1,
            "has_title": False,
            "title": None,
            "summary": None,
            "key_insights": None,
            "image_url": article_doc.get("image_url"),
            "history_point_count": 0,
            "last_history_point": None
        }
        
        result = await self.topics_collection.insert_one(topic_doc)
        topic_id = result.inserted_id
        
        print(f"  Created new topic (ID: {topic_id})")
        
        await self.articles_collection.update_one(
            {"_id": article_doc["_id"]},
            {"$set": {"topic_id": topic_id, "status": "clustered"}}
        )
        
        # Create initial history point
        await self.history_service.create_history_point(
            str(topic_id),
            "initial",
            {"total_score": 1.0, "type": "initial"},
            None
        )
        
        return topic_id
    
    async def update_existing_topic(
        self,
        topic: Dict,
        article_doc: Dict,
        article_embedding: np.ndarray
    ) -> None:
        """
        Add article to existing topic and update metadata
        NOW WITH AUTOMATIC HISTORY CHECKING
        """
        topic_id = topic["_id"]
        article_ids = topic["article_ids"]
        sources = set(topic.get("sources", []))
        
        article_ids.append(article_doc["_id"])
        is_new_source = article_doc["source"] not in sources
        sources.add(article_doc["source"])
        
        new_centroid = self.compute_centroid(article_ids)
        confidence = topic.get("confidence", 0.5)
        if is_new_source:
            confidence = min(1.0, confidence + 0.1)
        
        # Prepare update fields
        update_fields = {
            "article_ids": article_ids,
            "sources": list(sources),
            "centroid_embedding": new_centroid.tolist() if new_centroid is not None else topic["centroid_embedding"],
            "confidence": confidence,
            "last_updated": datetime.now(),
            "article_count": len(article_ids)
        }
        
        # Update image if topic doesn't have one
        if not topic.get("image_url") and article_doc.get("image_url"):
            update_fields["image_url"] = article_doc["image_url"]
        
        await self.topics_collection.update_one(
            {"_id": topic_id},
            {"$set": update_fields}
        )
        
        await self.articles_collection.update_one(
            {"_id": article_doc["_id"]},
            {"$set": {"topic_id": topic_id, "status": "clustered"}}
        )
        
        print(f"  Updated topic (ID: {topic_id}, articles: {len(article_ids)}, confidence: {confidence:.2f})")
        
        # ✅ NEW: Check if update is significant enough for history point
        if topic.get("has_title"):  # Only check history for topics with titles
            history_result = await self.history_service.check_and_create_history(topic_id)
            if history_result and history_result.get("action") == "created_history":
                print(f"  ✨ Created {history_result['history_type']} history point (score: {history_result['significance_score']:.3f})")
        
        # Check if topic needs trimming
        age_category = self.maintenance_service.get_topic_age_category(topic)
        max_articles = self.maintenance_service.config.TOPIC_LIMITS[age_category]["max_articles"]
        
        if len(article_ids) > max_articles:
            print(f"  Topic exceeds limit ({len(article_ids)} > {max_articles}), trimming...")
            trim_result = self.maintenance_service.trim_topic_articles(topic_id)
            print(f"  Trimmed {trim_result.get('trimmed', 0)} articles, kept {trim_result.get('retained', 0)}")
        
        should_generate_title = (
            not topic.get("has_title", False) and
            len(article_ids) >= MIN_ARTICLES_FOR_TITLE and
            confidence >= CONFIDENCE_THRESHOLD
        )
        
        if should_generate_title:
            print(f"  Topic ready for title generation")
    
    async def generate_topic_title(self, topic_id: str) -> bool:
        """Generate title and summary for a topic using Gemini LLM"""
        try:
            topic = await self.topics_collection.find_one({"_id": topic_id})
            if not topic:
                print(f"  Topic {topic_id} not found")
                return False
            
            articles = []
            async for article in self.articles_collection.find({
                "_id": {"$in": topic["article_ids"]}
            }):
                articles.append(article)
            
            if not articles:
                print(f"  No articles found for topic {topic_id}")
                return False
            
            article_texts = []
            for article in articles:
                article_texts.append(
                    f"Title: {article['title']}\n"
                    f"Source: {article['source']}\n"
                    f"Summary: {article['description']}\n"
                )
            
            combined_articles = "\n---\n".join(article_texts)
            
            prompt = f"""You are an AI news analyst creating a podcast topic from multiple news articles.

Category: {topic['category'].upper()}
Number of articles: {len(articles)}

Articles:
{combined_articles}

Generate a JSON object with:
- **title** (string, max 10 words): Concise newsworthy headline
- **summary** (string, 2-3 sentences): Synthesized overview
- **key_insights** (array, 3-5 strings): Most important facts/developments
- **confidence_score** (integer, 0-100): Reliability assessment

JSON only, no markdown:"""

            response = client.models.generate_content(
                model=TEXT_MODEL,
                contents=prompt
            )
            
            response_text = response.text.strip()
            response_text = response_text.replace("```json", "").replace("```", "").strip()
            result = json.loads(response_text)
            
            await self.topics_collection.update_one(
                {"_id": topic_id},
                {
                    "$set": {
                        "title": result["title"],
                        "summary": result["summary"],
                        "key_insights": result["key_insights"],
                        "has_title": True,
                        "title_generated_at": datetime.now(),
                        "confidence": result["confidence_score"] / 100.0
                    }
                }
            )
            
            print(f"  Generated title: {result['title']}")
            
            # ✅ NEW: Create initial history point when title is first generated
            await self.history_service.create_history_point(
                str(topic_id),
                "initial",
                {"total_score": 1.0, "type": "initial_title"},
                result
            )
            
            return True
            
        except Exception as e:
            print(f"  Error generating topic title: {str(e)}")
            return False
    
    async def assign_to_topic(self, article_doc: Dict) -> Optional[str]:
        """Main function: compute embedding and assign article to topic"""
        print(f"\nProcessing article: {article_doc['title'][:60]}...")
        
        text_for_embedding = f"{article_doc['title']} {article_doc['description']}"
        embedding = self.compute_embedding(text_for_embedding)
        
        if embedding is None:
            print(f"  Failed to compute embedding")
            return None
        
        await self.articles_collection.update_one(
            {"_id": article_doc["_id"]},
            {"$set": {"embedding": embedding.tolist()}}
        )
        
        matching_topic = self.find_matching_topic(embedding, article_doc["category"])
        
        if matching_topic:
            await self.update_existing_topic(matching_topic, article_doc, embedding)
            return matching_topic["_id"]
        else:
            return await self.create_new_topic(article_doc, embedding)
    
    async def process_pending_articles(self) -> Dict:
        """Process all articles with status 'pending_clustering'"""
        print("=" * 80)
        print("Starting Article Clustering")
        print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 80)
        
        pending_articles = []
        async for article in self.articles_collection.find({
            "status": "pending_clustering"
        }):
            pending_articles.append(article)
        
        stats = {
            "total_processed": 0,
            "new_topics": 0,
            "updated_topics": 0,
            "titles_generated": 0,
            "history_points_created": 0,
            "failed": 0,
            "start_time": datetime.now()
        }
        
        print(f"\nFound {len(pending_articles)} articles to process")
        
        for article in pending_articles:
            try:
                topics_before = await self.topics_collection.count_documents({})
                topic_id = await self.assign_to_topic(article)
                
                if topic_id:
                    stats["total_processed"] += 1
                    topics_after = await self.topics_collection.count_documents({})
                    
                    if topics_after > topics_before:
                        stats["new_topics"] += 1
                    else:
                        stats["updated_topics"] += 1
                else:
                    stats["failed"] += 1
                    
            except Exception as e:
                print(f"  Error processing article: {str(e)}")
                stats["failed"] += 1
        
        # Generate titles for ready topics
        print("\n" + "=" * 80)
        print("Generating Titles for Ready Topics")
        print("=" * 80)
        
        ready_topics = []
        async for topic in self.topics_collection.find({
            "has_title": False,
            "status": "active",
            "article_count": {"$gte": MIN_ARTICLES_FOR_TITLE},
            "confidence": {"$gte": CONFIDENCE_THRESHOLD}
        }):
            ready_topics.append(topic)
        
        print(f"Found {len(ready_topics)} topics ready for title generation")
        
        for i, topic in enumerate(ready_topics):
            if i > 0:
                time.sleep(4)
            
            if await self.generate_topic_title(topic["_id"]):
                stats["titles_generated"] += 1
        
        stats["end_time"] = datetime.now()
        stats["duration_seconds"] = (stats["end_time"] - stats["start_time"]).total_seconds()
        
        print("\n" + "=" * 80)
        print("Clustering Summary")
        print("=" * 80)
        print(f"Articles processed: {stats['total_processed']}")
        print(f"New topics created: {stats['new_topics']}")
        print(f"Existing topics updated: {stats['updated_topics']}")
        print(f"Titles generated: {stats['titles_generated']}")
        print(f"Failed: {stats['failed']}")
        print(f"Duration: {stats['duration_seconds']:.2f} seconds")
        print("=" * 80)
        
        return stats
    
    async def mark_inactive_topics(self) -> int:
        """Mark topics as inactive if not updated recently"""
        cutoff_date = datetime.now() - timedelta(days=TOPIC_INACTIVE_DAYS)
        
        result = await self.topics_collection.update_many(
            {"last_updated": {"$lt": cutoff_date}, "status": "active"},
            {"$set": {"status": "inactive"}}
        )
        
        if result.modified_count > 0:
            print(f"Marked {result.modified_count} topics as inactive")
        
        return result.modified_count


async def main():
    """Main entry point"""
    service = ClusteringService(MONGODB_URI, MONGODB_DB_NAME)
    await service.process_pending_articles()
    await service.mark_inactive_topics()


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())