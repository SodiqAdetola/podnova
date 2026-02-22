"""
Diagnostic script to analyze why two similar topics weren't merged
"""
from app.config import MONGODB_URI, MONGODB_DB_NAME
import motor.motor_asyncio
import certifi
import asyncio
import logging
import numpy as np
from datetime import datetime
from bson import ObjectId

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# The two topic IDs
TOPIC1_ID = "6999d788e233cc24f053e171"
TOPIC2_ID = "6999d78ae233cc24f053e174"


class TopicAnalyzer:
    def __init__(self, mongo_uri: str, db_name: str):
        self.client = motor.motor_asyncio.AsyncIOMotorClient(
            mongo_uri,
            tlsCAFile=certifi.where(),
        )
        self.db = self.client[db_name]
        self.topics = self.db["topics"]
        self.articles = self.db["articles"]

    def cosine_similarity(self, vec1: list, vec2: list) -> float:
        """Calculate cosine similarity between two vectors"""
        v1 = np.array(vec1)
        v2 = np.array(vec2)
        dot_product = np.dot(v1, v2)
        norm_product = np.linalg.norm(v1) * np.linalg.norm(v2)
        return dot_product / norm_product if norm_product != 0 else 0.0

    async def analyze_topics(self):
        """Analyze the two topics in detail"""
        logger.info("=" * 80)
        logger.info("ANALYZING TWO SIMILAR TOPICS")
        logger.info("=" * 80)

        # Get both topics
        topic1 = await self.topics.find_one({"_id": ObjectId(TOPIC1_ID)})
        topic2 = await self.topics.find_one({"_id": ObjectId(TOPIC2_ID)})

        if not topic1 or not topic2:
            logger.error("One or both topics not found")
            return

        logger.info(f"\n📌 TOPIC 1:")
        logger.info(f"  ID: {TOPIC1_ID}")
        logger.info(f"  Title: {topic1.get('title')}")
        logger.info(f"  Created: {topic1.get('created_at')}")
        logger.info(f"  Articles: {topic1.get('article_count')}")
        logger.info(f"  Sources: {topic1.get('sources')}")

        logger.info(f"\n📌 TOPIC 2:")
        logger.info(f"  ID: {TOPIC2_ID}")
        logger.info(f"  Title: {topic2.get('title')}")
        logger.info(f"  Created: {topic2.get('created_at')}")
        logger.info(f"  Articles: {topic2.get('article_count')}")
        logger.info(f"  Sources: {topic2.get('sources')}")

        # Calculate centroid similarity
        if "centroid_embedding" in topic1 and "centroid_embedding" in topic2:
            similarity = self.cosine_similarity(
                topic1["centroid_embedding"],
                topic2["centroid_embedding"]
            )
            logger.info(f"\n📊 CENTROID SIMILARITY: {similarity:.4f}")
            
            # Check against threshold
            threshold = 0.70
            if similarity >= threshold:
                logger.info(f"  ✅ This is ABOVE the threshold ({threshold}) - they SHOULD have been merged!")
            else:
                logger.info(f"  ❌ This is BELOW the threshold ({threshold}) - explains why they weren't merged")
                logger.info(f"  Difference from threshold: {threshold - similarity:.4f}")

        # Get all articles from both topics
        article_ids = topic1.get("article_ids", []) + topic2.get("article_ids", [])
        articles = []
        cursor = self.articles.find({"_id": {"$in": article_ids}})
        async for article in cursor:
            articles.append(article)

        logger.info(f"\n📰 ARTICLES ({len(articles)} total):")
        
        for i, article in enumerate(articles, 1):
            logger.info(f"\n  Article {i}:")
            logger.info(f"    ID: {article['_id']}")
            logger.info(f"    Title: {article.get('title', 'Untitled')}")
            logger.info(f"    Source: {article.get('source')}")
            logger.info(f"    Topic: {'Topic 1' if str(article['_id']) in topic1.get('article_ids', []) else 'Topic 2'}")
            
            # Check if article has embedding
            if "embedding" in article:
                logger.info(f"    Has embedding: ✅")
            else:
                logger.info(f"    Has embedding: ❌")

        # Calculate article-by-article similarity if embeddings exist
        logger.info(f"\n🔍 ANALYZING ARTICLE SIMILARITIES:")
        
        topic1_articles = await self.articles.find({
            "_id": {"$in": topic1.get("article_ids", [])}
        }).to_list(length=10)
        
        topic2_articles = await self.articles.find({
            "_id": {"$in": topic2.get("article_ids", [])}
        }).to_list(length=10)

        for a1 in topic1_articles:
            if "embedding" not in a1:
                continue
            for a2 in topic2_articles:
                if "embedding" not in a2:
                    continue
                    
                sim = self.cosine_similarity(a1["embedding"], a2["embedding"])
                logger.info(f"\n  Article 1: {a1.get('title', 'Untitled')[:50]}...")
                logger.info(f"  Article 2: {a2.get('title', 'Untitled')[:50]}...")
                logger.info(f"  Similarity: {sim:.4f}")

        # Recommendations
        logger.info("\n" + "=" * 80)
        logger.info("RECOMMENDATIONS")
        logger.info("=" * 80)
        
        if similarity >= 0.65 and similarity < 0.70:
            logger.info("⚠️  These topics are very similar but just below threshold.")
            logger.info("   Consider LOWERING the similarity threshold to 0.68")
            logger.info("   or implement near-duplicate detection as suggested.")
        elif similarity >= 0.70:
            logger.info("✅ These topics SHOULD have been merged - check your clustering logic!")
            logger.info("   Possible issues:")
            logger.info("   - Articles were processed at different times")
            logger.info("   - One topic's centroid wasn't updated properly")
            logger.info("   - Category mismatch (but both are technology)")
        else:
            logger.info("❌ These topics are genuinely different enough to stay separate.")
            logger.info("   No action needed.")

    async def merge_if_needed(self):
        """Optionally merge the two topics"""
        topic1 = await self.topics.find_one({"_id": ObjectId(TOPIC1_ID)})
        topic2 = await self.topics.find_one({"_id": ObjectId(TOPIC2_ID)})
        
        if not topic1 or not topic2:
            return
        
        similarity = self.cosine_similarity(
            topic1["centroid_embedding"],
            topic2["centroid_embedding"]
        )
        
        if similarity >= 0.65:  # Suggest merging if close enough
            logger.info(f"\nMerging topics with similarity {similarity:.4f}")
            
            # Keep the older topic
            keep_topic = topic1 if topic1["created_at"] < topic2["created_at"] else topic2
            remove_topic = topic2 if keep_topic["_id"] == topic1["_id"] else topic1
            
            logger.info(f"Keeping: {keep_topic.get('title')}")
            logger.info(f"Removing: {remove_topic.get('title')}")
            
            # Combine article IDs
            all_article_ids = list(set(
                keep_topic.get("article_ids", []) + 
                remove_topic.get("article_ids", [])
            ))
            
            # Update kept topic
            await self.topics.update_one(
                {"_id": keep_topic["_id"]},
                {
                    "$set": {
                        "article_ids": all_article_ids,
                        "article_count": len(all_article_ids),
                        "merged_at": datetime.now(),
                        "merged_from": str(remove_topic["_id"])
                    }
                }
            )
            
            # Update articles
            await self.articles.update_many(
                {"topic_id": str(remove_topic["_id"])},
                {"$set": {"topic_id": str(keep_topic["_id"])}}
            )
            
            # Delete removed topic
            await self.topics.delete_one({"_id": remove_topic["_id"]})
            
            logger.info(f"✅ Merged. Now has {len(all_article_ids)} articles")

    async def close(self):
        self.client.close()


async def main():
    analyzer = None
    try:
        analyzer = TopicAnalyzer(MONGODB_URI, MONGODB_DB_NAME)
        await analyzer.analyze_topics()
        
        response = input("\nMerge these topics? (yes/no): ")
        if response.lower() == "yes":
            await analyzer.merge_if_needed()
            
    except Exception as e:
        logger.error(f"❌ Failed: {e}")
    finally:
        if analyzer:
            await analyzer.close()


if __name__ == "__main__":
    asyncio.run(main())