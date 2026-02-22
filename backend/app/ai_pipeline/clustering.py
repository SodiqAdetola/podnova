"""
PodNova Clustering Module
FULLY ASYNC VERSION with Motor
NOW WITH INTEGRATED TOPIC HISTORY TRACKING, AUTOMATIC DISCUSSIONS, AND NEAR-DUPLICATE DETECTION
"""
from app.config import MONGODB_URI, MONGODB_DB_NAME
import os
import json
import time
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
import numpy as np
import motor.motor_asyncio
import certifi
from google import genai
import asyncio
import logging

# Import services
from app.ai_pipeline.article_maintenance import MaintenanceService
from app.ai_pipeline.topic_history import TopicHistoryService
from app.controllers.discussion_controller import create_or_get_topic_discussion

# Configuration
SIMILARITY_THRESHOLD = 0.68  # Lowered from 0.70 to catch more matches
NEAR_DUPLICATE_THRESHOLD = 0.80  # Threshold for auto-merging very similar topics
MIN_ARTICLES_FOR_TITLE = 2
CONFIDENCE_THRESHOLD = 0.6
TOPIC_INACTIVE_DAYS = 90
EMBEDDING_MODEL = "gemini-embedding-001"
TEXT_MODEL = "gemini-2.5-flash"

# Initialize Gemini client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ClusteringService:
    def __init__(self, mongo_uri: str, db_name: str):
        """Initialize the clustering service with Motor async client"""
        self.client = motor.motor_asyncio.AsyncIOMotorClient(
            mongo_uri, 
            tlsCAFile=certifi.where(),
            maxPoolSize=50,
            minPoolSize=10
        )
        self.db = self.client[db_name]
        self.articles_collection = self.db["articles"]
        self.topics_collection = self.db["topics"]
        
        # Initialize maintenance and history services
        self.maintenance_service = MaintenanceService(mongo_uri, db_name)
        self.history_service = TopicHistoryService(mongo_uri, db_name)
        
        # Create indexes on initialization
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
            
            logger.warning("Unexpected embedding response format")
            return None
            
        except Exception as e:
            logger.error(f"Error computing embedding: {str(e)}")
            return None
    
    def cosine_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Calculate cosine similarity between two vectors"""
        dot_product = np.dot(vec1, vec2)
        norm_product = np.linalg.norm(vec1) * np.linalg.norm(vec2)
        return dot_product / norm_product if norm_product != 0 else 0.0
    
    async def check_and_resurrect_topic(self, topic: Dict[str, Any]) -> bool:
        """Check if a stale topic should be resurrected"""
        if topic.get("status") != "stale":
            return False
        
        stale_since = topic.get("stale_since")
        if stale_since:
            days_stale = (datetime.now() - stale_since).days
            if days_stale > self.maintenance_service.config.MAX_RESURRECTION_AGE_DAYS:
                return False
        
        await self.topics_collection.update_one(
            {"_id": topic["_id"]},
            {
                "$set": {
                    "status": "active",
                    "resurrected_at": datetime.now()
                },
                "$unset": {"stale_since": ""}
            }
        )
        
        logger.info(f"  Resurrected stale topic: {topic.get('title', 'Untitled')}")
        return True
    
    async def find_matching_topic(self, article_embedding: np.ndarray, category: str) -> Optional[Dict[str, Any]]:
        """Find existing topic that matches the article embedding"""
        # Get active topics
        active_topics = []
        cursor = self.topics_collection.find({
            "category": category,
            "status": "active"
        })
        async for topic in cursor:
            active_topics.append(topic)
        
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
            # Check stale topics
            stale_topics = []
            cursor = self.topics_collection.find({
                "category": category,
                "status": "stale"
            })
            async for topic in cursor:
                stale_topics.append(topic)
            
            resurrection_threshold = SIMILARITY_THRESHOLD + self.maintenance_service.config.RESURRECTION_SIMILARITY_BONUS
            
            for topic in stale_topics:
                if "centroid_embedding" not in topic:
                    continue
                
                topic_embedding = np.array(topic["centroid_embedding"])
                similarity = self.cosine_similarity(article_embedding, topic_embedding)
                
                if similarity > best_similarity and similarity >= resurrection_threshold:
                    best_similarity = similarity
                    best_match = topic
                    await self.check_and_resurrect_topic(topic)
        
        if best_match:
            logger.info(f"  Found matching topic: {best_match.get('title', 'Untitled')} (similarity: {best_similarity:.3f})")
        
        return best_match
    
    async def compute_centroid(self, article_ids: List) -> Optional[np.ndarray]:
        """Compute centroid embedding from list of article IDs"""
        embeddings = []
        
        for article_id in article_ids:
            article = await self.articles_collection.find_one({"_id": article_id})
            if article and "embedding" in article:
                embeddings.append(np.array(article["embedding"]))
        
        return np.mean(embeddings, axis=0) if embeddings else None
    
    async def create_new_topic(self, article_doc: Dict[str, Any], article_embedding: np.ndarray) -> str:
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
            "last_history_point": None,
            "discussion_id": None  # Will be added when title is generated
        }
        
        result = await self.topics_collection.insert_one(topic_doc)
        topic_id = result.inserted_id
        
        logger.info(f"  Created new topic (ID: {topic_id})")
        
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
        """
        Add article to existing topic and update metadata
        NOW WITH AUTOMATIC HISTORY CHECKING
        """
        topic_id = topic["_id"]
        article_ids = topic.get("article_ids", [])
        sources = set(topic.get("sources", []))
        
        article_ids.append(article_doc["_id"])
        is_new_source = article_doc["source"] not in sources
        sources.add(article_doc["source"])
        
        new_centroid = await self.compute_centroid(article_ids)
        confidence = topic.get("confidence", 0.5)
        if is_new_source:
            confidence = min(1.0, confidence + 0.1)
        
        # Prepare update fields
        update_fields = {
            "article_ids": article_ids,
            "sources": list(sources),
            "centroid_embedding": new_centroid.tolist() if new_centroid is not None else topic.get("centroid_embedding"),
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
        
        logger.info(f"  Updated topic (ID: {topic_id}, articles: {len(article_ids)}, confidence: {confidence:.2f})")
        
        # Check if update is significant enough for history point
        # Only check history for topics that already have titles (are mature enough to display)
        if topic.get("has_title"):  # Only check history for topics with titles
            history_result = await self.history_service.check_and_create_history(str(topic_id))
            if history_result and history_result.get("action") == "created_history":
                logger.info(f"  ✨ Created {history_result['history_type']} history point (score: {history_result['significance_score']:.3f})")
        
        # Check if topic needs trimming
        age_category = self.maintenance_service.get_topic_age_category(topic)
        max_articles = self.maintenance_service.config.TOPIC_LIMITS[age_category]["max_articles"]
        
        if len(article_ids) > max_articles:
            logger.info(f"  Topic exceeds limit ({len(article_ids)} > {max_articles}), trimming...")
            trim_result = await self.maintenance_service.trim_topic_articles(str(topic_id))
            logger.info(f"  Trimmed {trim_result.get('trimmed', 0)} articles, kept {trim_result.get('retained', 0)}")
        
        should_generate_title = (
            not topic.get("has_title", False) and
            len(article_ids) >= MIN_ARTICLES_FOR_TITLE and
            confidence >= CONFIDENCE_THRESHOLD
        )
        
        if should_generate_title:
            logger.info(f"  Topic ready for title generation")
    
    async def create_topic_discussion(self, topic_id: str, topic_title: str, topic_summary: str) -> Optional[str]:
        """
        Automatically create a discussion for a topic when it becomes active.
        Returns the discussion_id if created, None otherwise.
        """
        try:
            discussion_id = await create_or_get_topic_discussion(
                topic_id=str(topic_id),
                topic_title=topic_title,
                topic_summary=topic_summary
            )
            
            if discussion_id:
                logger.info(f"  💬 Created discussion for topic {topic_id}: {discussion_id}")
                
                # Store the discussion_id in the topic for easy reference
                await self.topics_collection.update_one(
                    {"_id": topic_id},
                    {"$set": {"discussion_id": discussion_id}}
                )
                
                return discussion_id
            else:
                logger.warning(f"  Failed to create discussion for topic {topic_id}")
                return None
                
        except Exception as e:
            logger.error(f"  Error creating discussion for topic {topic_id}: {e}")
            return None
    
    async def check_for_near_duplicates(self, new_topic_id: str, category: str):
        """
        After creating a new topic, check if it's very similar to any existing topic
        If similarity is very high, automatically merge them
        """
        try:
            # Small delay to ensure the new topic is fully saved
            await asyncio.sleep(0.2)
            
            new_topic = await self.topics_collection.find_one({"_id": new_topic_id})
            if not new_topic or "centroid_embedding" not in new_topic:
                return
            
            new_embedding = np.array(new_topic["centroid_embedding"])
            
            # Check against other active topics in same category
            cursor = self.topics_collection.find({
                "_id": {"$ne": new_topic_id},
                "category": category,
                "status": "active",
                "centroid_embedding": {"$exists": True}
            })
            
            async for existing_topic in cursor:
                existing_embedding = np.array(existing_topic["centroid_embedding"])
                similarity = self.cosine_similarity(new_embedding, existing_embedding)
                
                # If similarity is above near-duplicate threshold, auto-merge
                if similarity >= NEAR_DUPLICATE_THRESHOLD:
                    logger.warning(f"⚠️  Near-duplicate topic detected with similarity {similarity:.3f}")
                    logger.warning(f"  New topic: {new_topic.get('title', 'Untitled')} ({new_topic_id})")
                    logger.warning(f"  Existing topic: {existing_topic.get('title', 'Untitled')} ({existing_topic['_id']})")
                    
                    # Auto-merge into the older topic
                    if new_topic["created_at"] > existing_topic["created_at"]:
                        # New topic is newer, merge into existing
                        logger.info(f"  Automatically merging new topic into existing topic")
                        await self.merge_topics(existing_topic["_id"], new_topic_id)
                    else:
                        # New topic is actually older (unlikely), merge existing into new
                        logger.info(f"  Automatically merging existing topic into new topic")
                        await self.merge_topics(new_topic_id, existing_topic["_id"])
                    
                    return True
                
                # Log near-misses for monitoring
                elif similarity >= (SIMILARITY_THRESHOLD - 0.05) and similarity < SIMILARITY_THRESHOLD:
                    logger.info(f"  Near-miss: similarity {similarity:.3f} with existing topic")
                    
        except Exception as e:
            logger.error(f"Error checking for near-duplicates: {e}")
            return False
        
        return False
    
    async def merge_topics(self, keep_topic_id, remove_topic_id):
        """Merge two topics (use when near-duplicates are found)"""
        try:
            keep_topic = await self.topics_collection.find_one({"_id": keep_topic_id})
            remove_topic = await self.topics_collection.find_one({"_id": remove_topic_id})
            
            if not keep_topic or not remove_topic:
                logger.error(f"  Cannot merge - one or both topics not found")
                return False
            
            # Combine article IDs
            all_article_ids = list(set(
                keep_topic.get("article_ids", []) + 
                remove_topic.get("article_ids", [])
            ))
            
            # Combine sources
            all_sources = list(set(
                keep_topic.get("sources", []) + 
                remove_topic.get("sources", [])
            ))
            
            # Recalculate confidence
            new_confidence = min(1.0, keep_topic.get("confidence", 0.5) + 0.1)
            
            # Update all articles to point to kept topic
            await self.articles_collection.update_many(
                {"topic_id": str(remove_topic["_id"])},
                {"$set": {"topic_id": str(keep_topic["_id"])}}
            )
            
            # Update the kept topic
            await self.topics_collection.update_one(
                {"_id": keep_topic_id},
                {
                    "$set": {
                        "article_ids": all_article_ids,
                        "sources": all_sources,
                        "article_count": len(all_article_ids),
                        "confidence": new_confidence,
                        "merged_at": datetime.now(),
                        "merged_from": str(remove_topic["_id"])
                    }
                }
            )
            
            # Recalculate centroid
            new_centroid = await self.compute_centroid(all_article_ids)
            if new_centroid is not None:
                await self.topics_collection.update_one(
                    {"_id": keep_topic_id},
                    {"$set": {"centroid_embedding": new_centroid.tolist()}}
                )
            
            # Handle discussions
            if remove_topic.get("discussion_id"):
                # Move any replies to kept topic's discussion? 
                # For simplicity, we'll just delete the old discussion
                await self.db["replies"].delete_many({"discussion_id": remove_topic["discussion_id"]})
                await self.db["discussions"].delete_one({"_id": remove_topic["discussion_id"]})
            
            # Delete the removed topic
            await self.topics_collection.delete_one({"_id": remove_topic_id})
            
            logger.info(f"✅ Merged topic {remove_topic_id} into {keep_topic_id}")
            logger.info(f"   New article count: {len(all_article_ids)}")
            
            return True
            
        except Exception as e:
            logger.error(f"Error merging topics: {e}")
            return False
    
    async def generate_topic_title(self, topic_id: str) -> bool:
        """Generate title and summary for a topic using Gemini LLM with improved prompt"""
        try:
            topic = await self.topics_collection.find_one({"_id": topic_id})
            if not topic:
                logger.error(f"  Topic {topic_id} not found")
                return False
            
            # Get articles for this topic
            articles = []
            cursor = self.articles_collection.find({
                "_id": {"$in": topic.get("article_ids", [])}
            })
            async for article in cursor:
                articles.append(article)
            
            if not articles:
                logger.error(f"  No articles found for topic {topic_id}")
                return False
            
            # Prepare article summaries
            article_texts = []
            for article in articles[:10]:  # Limit to 10 most recent
                description = (
                    article.get('description') or 
                    article.get('content', '')[:300] or 
                    "No description available"
                )
                article_texts.append(
                    f"Title: {article.get('title', 'Untitled')}\n"
                    f"Source: {article.get('source', 'Unknown')}\n"
                    f"Summary: {description}\n"
                )
            
            combined_articles = "\n---\n".join(article_texts)
            
            # IMPROVED PROMPT - Clear, straightforward headlines
            prompt = f"""Write a clear, straightforward headline for a news podcast. Use simple words that everyone can understand.

Category: {topic.get('category', 'general').upper()}
Number of articles: {len(articles)}

Articles:
{combined_articles}

RULES FOR THE HEADLINE:
- MAX 10 WORDS
- Say WHAT happened in plain English
- Use everyday words, no jargon or slang
- Be specific - include names, numbers, key details
- Make it easy to understand in 2 seconds

✅ GOOD EXAMPLES (clear, specific):
• "Google fined €2.4 billion by EU regulators"
• "Tesla delays Cybertruck production to 2025"
• "AI software creates fake videos of UK streets"
• "US Supreme Court blocks Trump trade tariffs"
• "Microsoft bug exposes confidential emails"

❌ BAD EXAMPLES (confusing, vague, jargon):
• "AI slop costs threaten global economic reckoning" (uses slang, vague)
• "Tech giant faces regulatory scrutiny" (too vague)
• "The future of AI in question" (vague, says nothing)
• "Paradigm shift in tech landscape" (jargon, meaningless)

Generate a JSON object with:

- **title** (string, MAX 10 WORDS): Clear, straightforward headline following the rules above.

- **summary** (string, 2-3 sentences): Clear overview of what happened and why it matters.

- **key_insights** (array, 3-5 strings): Specific, concrete takeaways.

- **confidence_score** (integer, 0-100): How reliable is this information? Be strict - only give high scores for well-known, reputable sources with clear facts.

JSON only, no markdown:"""

            response = client.models.generate_content(
                model=TEXT_MODEL,
                contents=prompt
            )
            
            response_text = response.text.strip()
            response_text = response_text.replace("```json", "").replace("```", "").strip()
            result = json.loads(response_text)
            
            # Validate required fields
            title = result.get("title")
            if not title:
                logger.error(f"  No title in response")
                return False
            
            # Check word count
            word_count = len(title.split())
            if word_count > 12:  # Allow slightly over but warn
                logger.warning(f"    Title has {word_count} words, exceeds 10")
            
            # Update topic with new content
            await self.topics_collection.update_one(
                {"_id": topic_id},
                {
                    "$set": {
                        "title": title,
                        "summary": result.get("summary", ""),
                        "key_insights": result.get("key_insights", []),
                        "has_title": True,
                        "title_generated_at": datetime.now(),
                        "confidence": result.get("confidence_score", 70) / 100.0
                    }
                }
            )
            
            logger.info(f"  Generated title ({word_count} words): {title}")
            
            # ✅ Create initial history point
            await self.history_service.create_history_point(
                str(topic_id),
                "initial",
                {"total_score": 1.0, "type": "initial_title"},
                result
            )
            logger.info(f"  📜 Created initial history point for topic with title")
            
            # ✅ Create discussion for this topic now that it's active
            discussion_id = await self.create_topic_discussion(
                topic_id=topic_id,
                topic_title=title,
                topic_summary=result.get("summary", "")
            )
            
            return True
            
        except json.JSONDecodeError as e:
            logger.error(f"  JSON parsing error: {e}")
            return False
        except Exception as e:
            logger.error(f"  Error generating topic title: {str(e)}")
            return False
    
    async def assign_to_topic(self, article_doc: Dict[str, Any]) -> Optional[str]:
        """Main function: compute embedding and assign article to topic"""
        logger.info(f"\nProcessing article: {article_doc['title'][:60]}...")
        
        text_for_embedding = f"{article_doc['title']} {article_doc.get('description', '')}"
        embedding = self.compute_embedding(text_for_embedding)
        
        if embedding is None:
            logger.error(f"  Failed to compute embedding")
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
            # Create new topic
            new_topic_id = await self.create_new_topic(article_doc, embedding)
            
            # Check for near-duplicates after creation (prevents duplicate topics)
            await self.check_for_near_duplicates(new_topic_id, article_doc["category"])
            
            return new_topic_id
    
    async def process_pending_articles(self) -> Dict[str, Any]:
        """Process all articles with status 'pending_clustering'"""
        logger.info("=" * 80)
        logger.info("Starting Article Clustering")
        logger.info(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        logger.info("=" * 80)
        
        # Get pending articles
        pending_articles = []
        cursor = self.articles_collection.find({
            "status": "pending_clustering"
        })
        async for article in cursor:
            pending_articles.append(article)
        
        stats = {
            "total_processed": 0,
            "new_topics": 0,
            "updated_topics": 0,
            "titles_generated": 0,
            "history_points_created": 0,
            "discussions_created": 0,
            "near_duplicates_merged": 0,
            "failed": 0,
            "start_time": datetime.now()
        }
        
        logger.info(f"\nFound {len(pending_articles)} articles to process")
        
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
                logger.error(f"  Error processing article: {str(e)}")
                stats["failed"] += 1
        
        # Generate titles for ready topics
        logger.info("\n" + "=" * 80)
        logger.info("Generating Titles for Ready Topics")
        logger.info("=" * 80)
        
        ready_topics = []
        cursor = self.topics_collection.find({
            "has_title": False,
            "status": "active",
            "article_count": {"$gte": MIN_ARTICLES_FOR_TITLE},
            "confidence": {"$gte": CONFIDENCE_THRESHOLD}
        })
        async for topic in cursor:
            ready_topics.append(topic)
        
        logger.info(f"Found {len(ready_topics)} topics ready for title generation")
        
        for i, topic in enumerate(ready_topics):
            if i > 0:
                await asyncio.sleep(4)  # Rate limiting
            
            if await self.generate_topic_title(topic["_id"]):
                stats["titles_generated"] += 1
                stats["history_points_created"] += 1
                stats["discussions_created"] += 1  # Each title generates a discussion
        
        stats["end_time"] = datetime.now()
        stats["duration_seconds"] = (stats["end_time"] - stats["start_time"]).total_seconds()
        
        logger.info("\n" + "=" * 80)
        logger.info("Clustering Summary")
        logger.info("=" * 80)
        logger.info(f"Articles processed: {stats['total_processed']}")
        logger.info(f"New topics created: {stats['new_topics']}")
        logger.info(f"Existing topics updated: {stats['updated_topics']}")
        logger.info(f"Titles generated: {stats['titles_generated']}")
        logger.info(f"History points created: {stats['history_points_created']}")
        logger.info(f"Discussions created: {stats['discussions_created']}")
        logger.info(f"Near-duplicates merged: {stats['near_duplicates_merged']}")
        logger.info(f"Failed: {stats['failed']}")
        logger.info(f"Duration: {stats['duration_seconds']:.2f} seconds")
        logger.info("=" * 80)
        
        return stats
    
    async def mark_inactive_topics(self) -> int:
        """Mark topics as inactive if not updated recently"""
        cutoff_date = datetime.now() - timedelta(days=TOPIC_INACTIVE_DAYS)
        
        result = await self.topics_collection.update_many(
            {"last_updated": {"$lt": cutoff_date}, "status": "active"},
            {"$set": {"status": "inactive"}}
        )
        
        if result.modified_count > 0:
            logger.info(f"Marked {result.modified_count} topics as inactive")
        
        return result.modified_count
    
    async def close(self):
        """Close database connection"""
        self.client.close()
        await self.maintenance_service.close()
        await self.history_service.close()
        logger.info("All connections closed")


async def main():
    """Main entry point"""
    service = None
    try:
        service = ClusteringService(MONGODB_URI, MONGODB_DB_NAME)
        await service.process_pending_articles()
        await service.mark_inactive_topics()
    except Exception as e:
        logger.error(f"Clustering failed: {e}")
        raise
    finally:
        if service:
            await service.close()


if __name__ == "__main__":
    asyncio.run(main())