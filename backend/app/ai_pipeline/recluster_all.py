#!/usr/bin/env python3
"""
Simple script to reset embeddings and run normal clustering
Run with: python -m app.ai_pipeline.reset_and_cluster
"""
import asyncio
import logging
from datetime import datetime
from app.config import MONGODB_URI, MONGODB_DB_NAME
from app.ai_pipeline.clustering import ClusteringService

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def reset_and_cluster():
    """Delete all embeddings and topic assignments, then run normal clustering"""
    service = None
    try:
        service = ClusteringService(MONGODB_URI, MONGODB_DB_NAME)
        
        logger.info("=" * 80)
        logger.info("RESETTING EMBEDDINGS AND TOPIC ASSIGNMENTS")
        logger.info("=" * 80)
        
        # Step 1: Delete all embeddings and topic assignments from articles
        logger.info("\n📝 Removing embeddings and topic assignments from articles...")
        result = await service.articles_collection.update_many(
            {},  # All articles
            {
                "$unset": {
                    "embedding": "",
                    "topic_id": ""
                },
                "$set": {
                    "status": "pending_clustering"
                }
            }
        )
        logger.info(f"   Reset {result.modified_count} articles to pending_clustering")
        
        # Step 2: Delete all topics
        logger.info("\n🗑️  Deleting all existing topics...")
        topics_count = await service.topics_collection.count_documents({})
        if topics_count > 0:
            delete_result = await service.topics_collection.delete_many({})
            logger.info(f"   Deleted {delete_result.deleted_count} topics")
        else:
            logger.info("   No topics to delete")
        
        logger.info("\n" + "=" * 80)
        logger.info("RESET COMPLETE - STARTING NORMAL CLUSTERING")
        logger.info("=" * 80)
        
        # Step 3: Run the normal clustering process
        await service.process_pending_articles()
        
        logger.info("\n" + "=" * 80)
        logger.info("✅ RESET AND CLUSTERING COMPLETE")
        logger.info("=" * 80)
        
    except Exception as e:
        logger.error(f"\n❌ Process failed: {e}")
        raise
    finally:
        if service:
            await service.close()


if __name__ == "__main__":
    asyncio.run(reset_and_cluster())