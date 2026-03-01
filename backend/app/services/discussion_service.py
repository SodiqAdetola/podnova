# app/services/discussion_service.py
from typing import List, Dict, Optional
from datetime import datetime
from bson import ObjectId
from app.db import db
from app.models.discussion import (
    Discussion,
    Reply,
    Notification,
    DiscussionType,
    AnalysisResult
)
from app.services.ai_analysis_service import ai_analysis_service
from app.services.notification_service import notification_service
from app.models.notification import NotificationType
import re
import traceback


class DiscussionService:
    """Service for managing discussions, replies, and notifications"""
    
    async def create_or_get_topic_discussion(self, topic_id: str, topic_title: str, topic_summary: str, category: str) -> str:
        """
        Get or create discussion for a topic
        Called automatically when a topic is created/viewed
        
        Returns: discussion_id
        """
        try:
            print(f"Creating/getting topic discussion for topic: {topic_id}")
            
            # Check if discussion already exists for this topic
            existing = await db["discussions"].find_one({
                "topic_id": topic_id,
                "discussion_type": "topic"
            })
            
            if existing:
                print(f"Found existing discussion: {existing['_id']}")
                return str(existing["_id"])
            
            # Create new topic discussion
            discussion_data = {
                "title": topic_title,
                "description": f"{topic_summary}",
                "discussion_type": "topic",
                "topic_id": topic_id,
                "category": category, 
                "tags": [],
                "user_id": None,  # System-created
                "username": "PodNova AI",
                "reply_count": 0,
                "upvote_count": 0,
                "view_count": 0,
                "unique_view_count": 0,  # Add unique view count
                "viewed_by": [],  # Track users who viewed
                "created_at": datetime.utcnow(),
                "last_activity": datetime.utcnow(),
                "is_active": True,
                "is_pinned": False,
                "is_auto_created": True
            }
            
            result = await db["discussions"].insert_one(discussion_data)
            print(f"  ✅ Created new discussion: {result.inserted_id}")
            return str(result.inserted_id)
            
        except Exception as e:
            print(f"❌ Error in create_or_get_topic_discussion: {e}")
            traceback.print_exc()
            raise
    
    async def create_community_discussion(
        self,
        title: str,
        description: str,
        user_id: str,
        username: str,
        tags: List[str] = None,
        category: Optional[str] = None 
    ) -> Discussion:
        """Create a user-created community discussion"""
        try:
            print(f"📝 Creating community discussion: {title}")
            
            discussion_data = {
                "title": title,
                "description": description,
                "discussion_type": "community",
                "topic_id": None,
                "category": category,
                "tags": tags or [],
                "user_id": user_id,
                "username": username,
                "reply_count": 0,
                "upvote_count": 0,
                "view_count": 0,
                "unique_view_count": 0,  # Add unique view count
                "viewed_by": [],  # Track users who viewed
                "created_at": datetime.utcnow(),
                "last_activity": datetime.utcnow(),
                "is_active": True,
                "is_pinned": False,
                "is_auto_created": False
            }
            
            result = await db["discussions"].insert_one(discussion_data)
            discussion_data["id"] = str(result.inserted_id)
            
            print(f"  ✅ Created discussion: {result.inserted_id}")
            return Discussion(**discussion_data)
            
        except Exception as e:
            print(f"❌ Error in create_community_discussion: {e}")
            traceback.print_exc()
            raise
    
    async def get_discussions(
        self,
        discussion_type: Optional[str] = None,
        topic_id: Optional[str] = None,
        category: Optional[str] = None,
        sort_by: str = "latest",
        limit: int = 20,
        skip: int = 0,
        user_id: Optional[str] = None
    ) -> List[Dict]:
        """Get discussions with filtering and sorting"""
        try:
            print(f"🔍 Getting discussions with filters: type={discussion_type}, topic={topic_id}, category={category}")
            
            query = {"is_active": True}
            
            if discussion_type:
                query["discussion_type"] = discussion_type
            
            if topic_id:
                query["topic_id"] = topic_id
            
            if category:
                query["category"] = category
            
            # Sorting
            if sort_by == "latest":
                sort = [("last_activity", -1)]
            elif sort_by == "most_discussed":
                sort = [("reply_count", -1)]
            elif sort_by == "most_viewed":
                sort = [("unique_view_count", -1)]  # Sort by unique views
            else:
                sort = [("created_at", -1)]
            
            cursor = db["discussions"].find(query).sort(sort).skip(skip).limit(limit)
            
            discussions = []
            async for disc in cursor:
                try:
                    # Check if user has upvoted (if user_id provided)
                    user_has_upvoted = False
                    if user_id:
                        upvote = await db["discussion_upvotes"].find_one({
                            "discussion_id": str(disc["_id"]),
                            "user_id": user_id
                        })
                        user_has_upvoted = upvote is not None
                    
                    discussions.append({
                        "id": str(disc["_id"]),
                        "title": disc["title"],
                        "description": disc["description"],
                        "discussion_type": disc["discussion_type"],
                        "topic_id": disc.get("topic_id"),
                        "category": disc.get("category"),
                        "tags": disc.get("tags", []),
                        "user_id": disc.get("user_id"),
                        "username": disc.get("username", "PodNova AI"),
                        "reply_count": disc.get("reply_count", 0),
                        "upvote_count": disc.get("upvote_count", 0),
                        "view_count": disc.get("unique_view_count", 0),  # Return unique view count
                        "created_at": disc["created_at"].isoformat() if isinstance(disc["created_at"], datetime) else disc["created_at"],
                        "last_activity": disc["last_activity"].isoformat() if isinstance(disc["last_activity"], datetime) else disc["last_activity"],
                        "is_pinned": disc.get("is_pinned", False),
                        "is_auto_created": disc.get("is_auto_created", False),
                        "time_ago": self._format_time_ago(disc["created_at"]),
                        "user_has_upvoted": user_has_upvoted
                    })
                except Exception as e:
                    print(f"  ❌ Error processing discussion {disc.get('_id')}: {e}")
                    continue
            
            print(f"  ✅ Returning {len(discussions)} discussions")
            return discussions
            
        except Exception as e:
            print(f"❌ Error in get_discussions: {e}")
            traceback.print_exc()
            return []
    
    async def get_discussion_by_id(
        self,
        discussion_id: str,
        user_id: Optional[str] = None
    ) -> Optional[Dict]:
        """Get single discussion with all replies"""
        try:
            print(f"🔍 Getting discussion by id: {discussion_id}")
            
            if not ObjectId.is_valid(discussion_id):
                print(f"  ❌ Invalid ObjectId: {discussion_id}")
                return None
            
            disc = await db["discussions"].find_one({"_id": ObjectId(discussion_id)})
            
            if not disc:
                print(f"  ❌ Discussion not found: {discussion_id}")
                return None
            
            # Increment view count ONLY if user hasn't viewed before and user is authenticated
            if user_id:
                # Check if user has already viewed
                viewed = await db["discussion_views"].find_one({
                    "discussion_id": discussion_id,
                    "user_id": user_id
                })
                
                if not viewed:
                    # Record this view
                    await db["discussion_views"].insert_one({
                        "discussion_id": discussion_id,
                        "user_id": user_id,
                        "viewed_at": datetime.utcnow()
                    })
                    
                    # Increment unique view count
                    await db["discussions"].update_one(
                        {"_id": ObjectId(discussion_id)},
                        {
                            "$inc": {"unique_view_count": 1},
                            "$push": {"viewed_by": user_id}
                        }
                    )
                    
                    # Also update total views for backward compatibility
                    await db["discussions"].update_one(
                        {"_id": ObjectId(discussion_id)},
                        {"$inc": {"view_count": 1}}
                    )
            
            # Get all replies
            replies = await self.get_replies(discussion_id, user_id)
            
            # Check if user has upvoted
            user_has_upvoted = False
            if user_id:
                upvote = await db["discussion_upvotes"].find_one({
                    "discussion_id": discussion_id,
                    "user_id": user_id
                })
                user_has_upvoted = upvote is not None
            
            return {
                "id": str(disc["_id"]),
                "title": disc["title"],
                "description": disc["description"],
                "discussion_type": disc["discussion_type"],
                "topic_id": disc.get("topic_id"),
                "category": disc.get("category"),
                "tags": disc.get("tags", []),
                "user_id": disc.get("user_id"),
                "username": disc.get("username", "PodNova AI"),
                "reply_count": disc.get("reply_count", 0),
                "upvote_count": disc.get("upvote_count", 0),
                "view_count": disc.get("unique_view_count", 0),  # Return unique view count
                "created_at": disc["created_at"].isoformat() if isinstance(disc["created_at"], datetime) else disc["created_at"],
                "last_activity": disc["last_activity"].isoformat() if isinstance(disc["last_activity"], datetime) else disc["last_activity"],
                "time_ago": self._format_time_ago(disc["created_at"]),
                "is_auto_created": disc.get("is_auto_created", False),
                "user_has_upvoted": user_has_upvoted,
                "replies": replies,
                "total_replies": len(replies)
            }
            
        except Exception as e:
            print(f"❌ Error in get_discussion_by_id: {e}")
            traceback.print_exc()
            return None
    

    async def create_reply(
        self,
        discussion_id: str,
        content: str,
        user_id: str,
        username: str,
        parent_reply_id: Optional[str] = None
    ) -> Reply:
        """Create a reply to a discussion"""
        try:
            print(f"📝 Creating reply for discussion: {discussion_id}")
            
            if not ObjectId.is_valid(discussion_id):
                raise ValueError(f"Invalid discussion_id: {discussion_id}")
            
            discussion = await db["discussions"].find_one({"_id": ObjectId(discussion_id)})
            if not discussion:
                raise ValueError(f"Discussion not found: {discussion_id}")
            
            reply_data = {
                "discussion_id": discussion_id,
                "parent_reply_id": parent_reply_id,
                "content": content,
                "user_id": user_id,
                "username": username,
                "upvote_count": 0,
                "mentions": [],
                "created_at": datetime.utcnow(),
                "updated_at": None,
                "is_deleted": False,
                "is_edited": False
            }
            
            result = await db["replies"].insert_one(reply_data)
            reply_data["id"] = str(result.inserted_id)
            
            # Update discussion reply count and last activity
            await db["discussions"].update_one(
                {"_id": ObjectId(discussion_id)},
                {
                    "$inc": {"reply_count": 1},
                    "$set": {"last_activity": datetime.utcnow()}
                }
            )
            
            print(f"Created reply: {result.inserted_id}")
            
            # Create notification for discussion owner (if not their own reply)
            if discussion and discussion.get("user_id") and discussion["user_id"] != user_id:
                from app.services.notification_service import notification_service
                
                await notification_service.create_reply_notification(
                    discussion_owner_id=discussion["user_id"],
                    discussion_id=discussion_id,
                    discussion_title=discussion.get("title", "Discussion"),
                    reply_author_id=user_id,
                    reply_author_name=username,
                    reply_preview=content[:100]
                )
            
            return Reply(**reply_data)
            
        except Exception as e:
            print(f"Error in create_reply: {e}")
            traceback.print_exc()
            raise
    
    async def delete_reply(
        self,
        reply_id: str,
        user_id: str
    ) -> bool:
        """Delete a reply (soft delete) - only if user owns it"""
        try:
            print(f"🗑️ Deleting reply: {reply_id}")
            
            if not ObjectId.is_valid(reply_id):
                print(f"Invalid reply_id: {reply_id}")
                return False
            
            # Find the reply
            reply = await db["replies"].find_one({"_id": ObjectId(reply_id)})
            
            if not reply:
                print(f"Reply not found: {reply_id}")
                return False
            
            # Check if user owns this reply
            if reply["user_id"] != user_id:
                print(f"User {user_id} does not own reply {reply_id}")
                return False
            
            # Soft delete - mark as deleted instead of removing
            result = await db["replies"].update_one(
                {"_id": ObjectId(reply_id)},
                {
                    "$set": {
                        "is_deleted": True,
                        "content": "[deleted]",
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            
            if result.modified_count > 0:
                # Decrement reply count in discussion
                discussion_id = reply["discussion_id"]
                await db["discussions"].update_one(
                    {"_id": ObjectId(discussion_id)},
                    {"$inc": {"reply_count": -1}}
                )
                
                print(f"  ✅ Reply deleted successfully")
                return True
            
            return False
            
        except Exception as e:
            print(f"❌ Error in delete_reply: {e}")
            traceback.print_exc()
            return False
    
    async def get_replies(
        self,
        discussion_id: str,
        user_id: Optional[str] = None
    ) -> List[Dict]:
        """Get all replies for a discussion with AI analysis"""
        try:
            print(f"🔍 Getting replies for discussion: {discussion_id}")
            
            cursor = db["replies"].find({
                "discussion_id": discussion_id,
                "is_deleted": False
            }).sort("created_at", 1)
            
            replies = []
            async for reply in cursor:
                try:
                    # Check if user has upvoted this reply
                    is_upvoted = False
                    if user_id:
                        upvote = await db["reply_upvotes"].find_one({
                            "reply_id": str(reply["_id"]),
                            "user_id": user_id
                        })
                        is_upvoted = upvote is not None
                    
                    # Get analysis data with defaults
                    analysis = reply.get("analysis", {
                        "factual_score": 50,
                        "confidence": "low",
                        "disclaimer": "AI analysis unavailable."
                    })
                    
                    replies.append({
                        "id": str(reply["_id"]),
                        "discussion_id": reply["discussion_id"],
                        "parent_reply_id": reply.get("parent_reply_id"),
                        "content": reply["content"],
                        "analysis": analysis,
                        "user_id": reply["user_id"],
                        "username": reply["username"],
                        "upvote_count": reply.get("upvote_count", 0),
                        "is_upvoted_by_user": is_upvoted,
                        "mentions": reply.get("mentions", []),
                        "created_at": reply["created_at"].isoformat() if isinstance(reply["created_at"], datetime) else reply["created_at"],
                        "time_ago": self._format_time_ago(reply["created_at"]),
                        "is_edited": reply.get("is_edited", False)
                    })
                except Exception as e:
                    print(f"  ❌ Error processing reply {reply.get('_id')}: {e}")
                    continue
            
            print(f"  ✅ Found {len(replies)} replies")
            return replies
            
        except Exception as e:
            print(f"❌ Error in get_replies: {e}")
            traceback.print_exc()
            return []
    
    async def upvote_discussion(
        self,
        discussion_id: str,
        user_id: str
    ) -> Dict:
        """Toggle upvote on discussion"""
        try:
            print(f"👍 Toggling upvote for discussion: {discussion_id}")
            
            if not ObjectId.is_valid(discussion_id):
                raise ValueError(f"Invalid discussion_id: {discussion_id}")
            
            existing = await db["discussion_upvotes"].find_one({
                "discussion_id": discussion_id,
                "user_id": user_id
            })
            
            if existing:
                # Remove upvote
                await db["discussion_upvotes"].delete_one({"_id": existing["_id"]})
                await db["discussions"].update_one(
                    {"_id": ObjectId(discussion_id)},
                    {"$inc": {"upvote_count": -1}}
                )
                print(f"  ✅ Upvote removed")
                return {"upvoted": False, "action": "removed"}
            else:
                # Add upvote
                await db["discussion_upvotes"].insert_one({
                    "discussion_id": discussion_id,
                    "user_id": user_id,
                    "created_at": datetime.utcnow()
                })
                await db["discussions"].update_one(
                    {"_id": ObjectId(discussion_id)},
                    {"$inc": {"upvote_count": 1}}
                )
                print(f"  ✅ Upvote added")
                return {"upvoted": True, "action": "added"}
                
        except Exception as e:
            print(f"❌ Error in upvote_discussion: {e}")
            traceback.print_exc()
            raise
    
    async def upvote_reply(
        self,
        reply_id: str,
        user_id: str
    ) -> Dict:
        """Toggle upvote on reply"""
        try:
            print(f"👍 Toggling upvote for reply: {reply_id}")
            
            if not ObjectId.is_valid(reply_id):
                raise ValueError(f"Invalid reply_id: {reply_id}")
            
            existing = await db["reply_upvotes"].find_one({
                "reply_id": reply_id,
                "user_id": user_id
            })
            
            if existing:
                # Remove upvote
                await db["reply_upvotes"].delete_one({"_id": existing["_id"]})
                await db["replies"].update_one(
                    {"_id": ObjectId(reply_id)},
                    {"$inc": {"upvote_count": -1}}
                )
                print(f"  ✅ Upvote removed")
                return {"upvoted": False, "action": "removed"}
            else:
                # Add upvote
                await db["reply_upvotes"].insert_one({
                    "reply_id": reply_id,
                    "user_id": user_id,
                    "created_at": datetime.utcnow()
                })
                await db["replies"].update_one(
                    {"_id": ObjectId(reply_id)},
                    {"$inc": {"upvote_count": 1}}
                )
                print(f"  ✅ Upvote added")
                return {"upvoted": True, "action": "added"}
                
        except Exception as e:
            print(f"❌ Error in upvote_reply: {e}")
            traceback.print_exc()
            raise
    
    
    def _format_time_ago(self, dt) -> str:
        """Format datetime as relative time"""
        try:
            if isinstance(dt, str):
                dt = datetime.fromisoformat(dt.replace('Z', '+00:00'))
            
            now = datetime.utcnow()
            diff = now - dt
            
            if diff.days > 0:
                return f"{diff.days}d ago" if diff.days > 1 else "1d ago"
            
            hours = diff.seconds // 3600
            if hours > 0:
                return f"{hours}h ago" if hours > 1 else "1h ago"
            
            minutes = diff.seconds // 60
            if minutes > 0:
                return f"{minutes}m ago" if minutes > 1 else "1m ago"
            
            return "Just now"
        except Exception as e:
            print(f"⚠️ Error formatting time: {e}")
            return "Unknown"

 


discussion_service = DiscussionService()