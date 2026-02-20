# backend/app/scripts/reset_history.py
"""
One-time script to DELETE ALL EXISTING HISTORY and create fresh initial history points
Run with: python -m app.scripts.reset_history
"""
import asyncio
import sys
import os
from datetime import datetime
from bson import ObjectId
import motor.motor_asyncio
import certifi
import logging

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ai_pipeline.topic_history import TopicHistoryService
from app.config import MONGODB_URI, MONGODB_DB_NAME

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def reset_history():
    """DELETE ALL EXISTING HISTORY and create fresh initial history points"""
    
    # Connect directly to MongoDB
    client = motor.motor_asyncio.AsyncIOMotorClient(
        MONGODB_URI, 
        tlsCAFile=certifi.where()
    )
    db = client[MONGODB_DB_NAME]
    topics_collection = db["topics"]
    history_collection = db["topic_history"]
    
    # Initialize history service for creating points
    history_service = TopicHistoryService(MONGODB_URI, MONGODB_DB_NAME)
    
    try:
        logger.info("=" * 80)
        logger.info("⚠️  WARNING: RESETTING ALL TOPIC HISTORY ⚠️")
        logger.info("=" * 80)
        
        # STEP 1: Count existing history
        old_history_count = await history_collection.count_documents({})
        logger.info(f"📊 Existing history points: {old_history_count}")
        
        # STEP 2: Delete ALL history points
        if old_history_count > 0:
            logger.info("🗑️  Deleting all history points...")
            delete_result = await history_collection.delete_many({})
            logger.info(f"   Deleted {delete_result.deleted_count} history points")
        
        # STEP 3: Reset history_point_count on all topics to 0
        logger.info("🔄 Resetting history_point_count on all topics...")
        reset_result = await topics_collection.update_many(
            {},
            {"$set": {"history_point_count": 0, "last_history_point": None}}
        )
        logger.info(f"   Reset {reset_result.modified_count} topics")
        
        # STEP 4: Get all topics that have titles (the ones we want history for)
        topics = []
        cursor = topics_collection.find({
            "has_title": True,
            "title": {"$ne": None}
        })
        async for topic in cursor:
            topics.append(topic)
        
        logger.info(f"\n📝 Found {len(topics)} topics with titles to create fresh history for")
        
        stats = {
            "created": 0,
            "errors": 0
        }
        
        # STEP 5: Create fresh initial history points
        for topic in topics:
            try:
                topic_id = topic["_id"]
                logger.info(f"📝 Creating fresh history for: {topic.get('title', 'Untitled')[:60]}")
                
                # Create initial history point using current topic state
                result = {
                    "title": topic.get("title"),
                    "summary": topic.get("summary"),
                    "key_insights": topic.get("key_insights", []),
                    "confidence_score": topic.get("confidence", 0.5) * 100,
                    "development_note": "Initial topic creation (history reset)"
                }
                
                await history_service.create_history_point(
                    str(topic_id),
                    "initial",
                    {"total_score": 1.0, "type": "initial_reset"},
                    result
                )
                
                stats["created"] += 1
                logger.info(f"  ✅ Created fresh history point")
                
                # Small delay
                await asyncio.sleep(0.1)
                
            except Exception as e:
                logger.error(f"Error processing topic {topic.get('_id')}: {e}")
                stats["errors"] += 1
        
        # STEP 6: Verify final state
        final_history_count = await history_collection.count_documents({})
        
        logger.info("\n" + "=" * 80)
        logger.info("Reset Complete - Summary")
        logger.info("=" * 80)
        logger.info(f"Old history points deleted: {old_history_count}")
        logger.info(f"Topics reset: {reset_result.modified_count}")
        logger.info(f"Fresh history points created: {stats['created']}")
        logger.info(f"Final history count: {final_history_count}")
        logger.info(f"Errors: {stats['errors']}")
        
        if stats['created'] > 0:
            logger.info("\n✅ History has been reset and recreated successfully!")
            logger.info("   Your timeline will now show the current state of each topic.")
        else:
            logger.warning("\n⚠️  No history points were created. Check if topics have titles.")
        
        logger.info("=" * 80)
        
        return stats
        
    finally:
        await history_service.close()
        client.close()


async def main():
    """Main entry point"""
    logger.info("Starting history reset...")
    
    # Ask for confirmation (since this is destructive)
    response = input("This will DELETE ALL EXISTING HISTORY. Are you sure? (yes/no): ")
    if response.lower() != 'yes':
        logger.info("Operation cancelled.")
        return 0
    
    stats = await reset_history()
    
    if stats and stats.get("errors", 0) == 0 and stats.get("created", 0) > 0:
        logger.info("✅ Reset completed successfully")
        return 0
    else:
        logger.error("❌ Reset completed with errors")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)