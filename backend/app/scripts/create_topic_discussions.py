# scripts/create_topic_discussions.py
"""
Migration script to create discussions for existing topics

Run this ONCE after deploying the discussions feature to:
- Create a discussion for each existing topic
- Link discussion_id back to topic

Run from backend root: python -m app.scripts.create_topic_discussions
Or from app/scripts: python create_topic_discussions.py
"""

import asyncio
import sys
import os
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables from .env file
# Look for .env in current dir, parent dir, or grandparent dir
env_path = None
for path in ['.env', '../.env', '../../.env']:
    if os.path.exists(path):
        env_path = path
        break

if env_path:
    load_dotenv(env_path)
    print(f"✅ Loaded .env from: {env_path}")
else:
    load_dotenv()  # Try default locations

# Ensure we can import from app
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)  # app directory
grandparent_dir = os.path.dirname(parent_dir)  # backend root

# Add backend root to path so we can import app.db
if grandparent_dir not in sys.path:
    sys.path.insert(0, grandparent_dir)

from app.db import db
from bson import ObjectId


async def create_discussions_for_existing_topics():
    """Create discussions for all existing topics that don't have one"""
    
    print("🚀 Starting migration: Create discussions for existing topics")
    print("=" * 60)
    
    # Get all active topics
    cursor = db["topics"].find({
        "status": "active",
        "has_title": True
    })
    
    topics = []
    async for topic in cursor:
        topics.append(topic)
    
    print(f"📊 Found {len(topics)} active topics")
    
    if len(topics) == 0:
        print("✅ No topics found. Nothing to migrate.")
        return
    
    # Check how many already have discussions
    existing_discussions = await db["discussions"].count_documents({
        "discussion_type": "topic",
        "topic_id": {"$exists": True}
    })
    
    print(f"💬 {existing_discussions} discussions already exist")
    print(f"🆕 Need to create {len(topics)} discussions (checking for duplicates)")
    print()
    
    created_count = 0
    skipped_count = 0
    error_count = 0
    
    for i, topic in enumerate(topics, 1):
        topic_id = str(topic["_id"])
        
        try:
            # Check if discussion already exists for this topic
            existing = await db["discussions"].find_one({
                "topic_id": topic_id,
                "discussion_type": "topic"
            })
            
            if existing:
                print(f"⏭️  [{i}/{len(topics)}] Skipped: {topic['title'][:50]}... (already has discussion)")
                skipped_count += 1
                
                # Update topic with discussion_id if missing
                if not topic.get("discussion_id"):
                    await db["topics"].update_one(
                        {"_id": topic["_id"]},
                        {"$set": {"discussion_id": str(existing["_id"])}}
                    )
                
                continue
            
            # Create discussion for this topic
            discussion_data = {
                "title": topic["title"],
                "description": f"General discussion about this topic. Share your thoughts, insights, and questions.\n\n{topic.get('summary', '')[:200]}...",
                "discussion_type": "topic",
                "topic_id": topic_id,
                "category": topic.get("category"),
                "tags": [],
                "user_id": None,  # System-created
                "username": "PodNova AI",
                "reply_count": 0,
                "upvote_count": 0,
                "view_count": 0,
                "created_at": topic.get("created_at", datetime.utcnow()),
                "last_activity": topic.get("last_updated", datetime.utcnow()),
                "is_active": True,
                "is_pinned": False,
                "is_auto_created": True
            }
            
            result = await db["discussions"].insert_one(discussion_data)
            discussion_id = str(result.inserted_id)
            
            # Update topic with discussion_id
            await db["topics"].update_one(
                {"_id": topic["_id"]},
                {"$set": {"discussion_id": discussion_id}}
            )
            
            print(f"✅ [{i}/{len(topics)}] Created: {topic['title'][:50]}...")
            created_count += 1
            
        except Exception as e:
            print(f"❌ [{i}/{len(topics)}] Error: {topic['title'][:50]}... - {str(e)}")
            error_count += 1
            continue
    
    print()
    print("=" * 60)
    print("📊 Migration Summary:")
    print(f"   ✅ Created: {created_count}")
    print(f"   ⏭️  Skipped: {skipped_count}")
    print(f"   ❌ Errors:  {error_count}")
    print(f"   📝 Total:   {len(topics)}")
    print("=" * 60)
    
    if error_count > 0:
        print("⚠️  Some errors occurred. Please review the logs above.")
    else:
        print("✅ Migration completed successfully!")
    
    print()


async def verify_migration():
    """Verify that all topics have discussions"""
    
    print("🔍 Verifying migration...")
    print()
    
    # Count topics
    total_topics = await db["topics"].count_documents({
        "status": "active",
        "has_title": True
    })
    
    # Count topics with discussion_id
    topics_with_discussions = await db["topics"].count_documents({
        "status": "active",
        "has_title": True,
        "discussion_id": {"$exists": True, "$ne": None}
    })
    
    # Count topic discussions
    topic_discussions = await db["discussions"].count_documents({
        "discussion_type": "topic"
    })
    
    print(f"📊 Verification Results:")
    print(f"   Topics (active):              {total_topics}")
    print(f"   Topics with discussion_id:    {topics_with_discussions}")
    print(f"   Topic discussions:            {topic_discussions}")
    print()
    
    if total_topics == topics_with_discussions == topic_discussions:
        print("✅ Perfect! All topics have discussions.")
    else:
        print("⚠️  Mismatch detected:")
        missing = total_topics - topics_with_discussions
        print(f"   {missing} topics are missing discussion links")
        print()
        print("💡 Run this script again to fix missing discussions.")
    
    print()


async def main():
    """Main migration function"""
    
    print()
    print("╔════════════════════════════════════════════════════════╗")
    print("║   Topic Discussions Migration Script                  ║")
    print("║   Creates discussions for all existing topics          ║")
    print("╚════════════════════════════════════════════════════════╝")
    print()
    
    # Check database connection
    try:
        await db.command("ping")
        print("✅ Database connection successful")
        print()
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        print("   Please check your MONGODB_URI environment variable")
        return
    
    # Confirm with user
    print("⚠️  This script will create discussions for all existing topics.")
    print("   Existing discussions will be skipped (safe to run multiple times).")
    print()
    
    response = input("Continue? (yes/no): ").strip().lower()
    
    if response not in ["yes", "y"]:
        print("❌ Migration cancelled.")
        return
    
    print()
    
    # Run migration
    await create_discussions_for_existing_topics()
    
    # Verify
    await verify_migration()
    
    print("🎉 All done!")
    print()


if __name__ == "__main__":
    # Run the migration
    asyncio.run(main())