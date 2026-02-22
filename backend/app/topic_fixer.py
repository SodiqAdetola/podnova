"""
Fix script to merge the two similar topics and clean up data inconsistencies
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

TOPIC1_ID = "6999d788e233cc24f053e171"
TOPIC2_ID = "6999d78ae233cc24f053e174"


class TopicFixer:
    def __init__(self, mongo_uri: str, db_name: str):
        self.client = motor.motor_asyncio.AsyncIOMotorClient(
            mongo_uri,
            tlsCAFile=certifi.where(),
        )
        self.db = self.client[db_name]
        self.topics = self.db["topics"]
        self.articles = self.db["articles"]
        self.discussions = self.db["discussions"]

    async def fix_topics(self):
        """Merge the two topics and fix inconsistencies"""
        logger.info("=" * 80)
        logger.info("FIXING DUPLICATE TOPICS")
        logger.info("=" * 80)

        # Get both topics
        topic1 = await self.topics.find_one({"_id": ObjectId(TOPIC1_ID)})
        topic2 = await self.topics.find_one({"_id": ObjectId(TOPIC2_ID)})

        if not topic1 or not topic2:
            logger.error("One or both topics not found")
            return

        # First, verify which articles actually belong to which topic
        logger.info("\n📊 Checking article assignments...")
        
        topic1_articles = []
        cursor = self.articles.find({"topic_id": TOPIC1_ID})
        async for article in cursor:
            topic1_articles.append(article)
            
        topic2_articles = []
        cursor = self.articles.find({"topic_id": TOPIC2_ID})
        async for article in cursor:
            topic2_articles.append(article)

        logger.info(f"Topic 1 has {len(topic1_articles)} articles in articles collection")
        logger.info(f"Topic 2 has {len(topic2_articles)} articles in articles collection")

        # Show what's in each topic's article_ids field
        logger.info(f"\nTopic 1 article_ids field: {len(topic1.get('article_ids', []))} articles")
        logger.info(f"Topic 2 article_ids field: {len(topic2.get('article_ids', []))} articles")

        # Decide which topic to keep (keep the one with more articles/discussion)
        if len(topic2_articles) >= len(topic1_articles):
            keep_topic = topic2
            remove_topic = topic1
        else:
            keep_topic = topic1
            remove_topic = topic2

        logger.info(f"\n✅ Keeping topic: {keep_topic.get('title')} ({keep_topic['_id']})")
        logger.info(f"❌ Removing topic: {remove_topic.get('title')} ({remove_topic['_id']})")

        # Get all unique article IDs from both sources
        all_article_ids = set()
        
        # Add from articles collection
        for article in topic1_articles + topic2_articles:
            all_article_ids.add(article["_id"])
        
        # Add from topic's article_ids field
        for aid in topic1.get("article_ids", []) + topic2.get("article_ids", []):
            all_article_ids.add(aid)

        all_article_ids = list(all_article_ids)
        logger.info(f"\n📰 Total unique articles: {len(all_article_ids)}")

        # Show the articles
        articles = []
        cursor = self.articles.find({"_id": {"$in": all_article_ids}})
        async for article in cursor:
            articles.append(article)
            logger.info(f"\n  Article: {article.get('title', 'Untitled')[:80]}")
            logger.info(f"    Source: {article.get('source')}")
            logger.info(f"    Current topic_id: {article.get('topic_id')}")

        # Handle discussions
        logger.info(f"\n💬 Checking discussions...")
        if keep_topic.get("discussion_id"):
            logger.info(f"  Keeping discussion: {keep_topic['discussion_id']}")
        
        if remove_topic.get("discussion_id"):
            logger.info(f"  Will delete discussion: {remove_topic['discussion_id']}")
            
            # Delete the old discussion and its replies
            await self.db["replies"].delete_many({"discussion_id": remove_topic["discussion_id"]})
            await self.discussions.delete_one({"_id": ObjectId(remove_topic["discussion_id"])})
            logger.info(f"  ✅ Deleted old discussion")

        # Update all articles to point to kept topic
        logger.info(f"\n🔄 Updating articles...")
        result = await self.articles.update_many(
            {"_id": {"$in": all_article_ids}},
            {"$set": {"topic_id": str(keep_topic["_id"])}}
        )
        logger.info(f"  Updated {result.modified_count} articles")

        # Combine sources
        all_sources = list(set(
            keep_topic.get("sources", []) + 
            remove_topic.get("sources", [])
        ))
        logger.info(f"\n📋 Combined sources: {all_sources}")

        # Update the kept topic
        await self.topics.update_one(
            {"_id": keep_topic["_id"]},
            {
                "$set": {
                    "article_ids": all_article_ids,
                    "sources": all_sources,
                    "article_count": len(all_article_ids),
                    "merged_at": datetime.now(),
                    "merged_from": str(remove_topic["_id"])
                }
            }
        )

        # Delete the removed topic
        await self.topics.delete_one({"_id": remove_topic["_id"]})
        logger.info(f"\n✅ Deleted old topic")

        # Recalculate centroid
        await self.recalculate_centroid(keep_topic["_id"], all_article_ids)

        logger.info("\n" + "=" * 80)
        logger.info("✅ FIX COMPLETE")
        logger.info("=" * 80)

    async def recalculate_centroid(self, topic_id, article_ids):
        """Recalculate the centroid embedding for the merged topic"""
        embeddings = []
        
        for article_id in article_ids:
            article = await self.articles.find_one({"_id": article_id})
            if article and "embedding" in article:
                embeddings.append(np.array(article["embedding"]))
        
        if embeddings:
            new_centroid = np.mean(embeddings, axis=0)
            await self.topics.update_one(
                {"_id": topic_id},
                {"$set": {"centroid_embedding": new_centroid.tolist()}}
            )
            logger.info(f"  ✅ Recalculated centroid from {len(embeddings)} embeddings")

    async def close(self):
        self.client.close()


async def main():
    fixer = None
    try:
        fixer = TopicFixer(MONGODB_URI, MONGODB_DB_NAME)
        await fixer.fix_topics()
    except Exception as e:
        logger.error(f"❌ Failed: {e}")
    finally:
        if fixer:
            await fixer.close()


if __name__ == "__main__":
    asyncio.run(main())