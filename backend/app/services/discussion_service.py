from typing import List, Dict, Optional
from datetime import datetime
from bson import ObjectId
from app.db import db
from app.models.discussion import (
    Discussion,
    Reply,
    Notification,
    DiscussionType
)
from app.services.notification_service import notification_service
import re
import traceback


class DiscussionService:
    """Service for managing discussions, replies, and notifications (AI Analysis removed)"""
    
    async def create_or_get_topic_discussion(self, topic_id: str, topic_title: str, topic_summary: str, category: str) -> str:
        """Get or create discussion for a topic"""
        try:
            print(f"Creating/getting topic discussion for topic: {topic_id}")
            existing = await db["discussions"].find_one({
                "topic_id": topic_id,
                "discussion_type": "topic"
            })
            
            if existing:
                print(f"Found existing discussion: {existing['_id']}")
                return str(existing["_id"])
            
            discussion_data = {
                "title": topic_title,
                "description": f"{topic_summary}",
                "discussion_type": "topic",
                "topic_id": topic_id,
                "category": category, 
                "tags": [],
                "user_id": None,
                "username": "PodNova AI",
                "reply_count": 0,
                "upvote_count": 0,
                "view_count": 0,
                "unique_view_count": 0,
                "viewed_by": [],
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

    async def create_community_discussion(self, title: str, description: str, user_id: str, username: str, tags: List[str] = None, category: Optional[str] = None) -> Discussion:
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
                "unique_view_count": 0,
                "viewed_by": [],
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

    async def get_discussions(self, discussion_type: Optional[str] = None, topic_id: Optional[str] = None, category: Optional[str] = None, sort_by: str = "latest", limit: int = 20, skip: int = 0, user_id: Optional[str] = None, search_query: Optional[str] = None) -> List[Dict]:
        """Get discussions with Atlas Smart Search or Filtered Feeds"""
        try:
            print(f"🔍 Getting discussions: type={discussion_type}, topic={topic_id}, category={category}, search={search_query}")
            
            if search_query and search_query.strip():
                pipeline = [
                    {"$search": {
                        "index": "default",
                        "text": {"query": search_query, "path": ["title", "description", "tags"], "fuzzy": {"maxEdits": 1}}
                    }},
                    {"$match": {"is_active": True}}
                ]
                if category and category != "all": pipeline[1]["$match"]["category"] = category
                if discussion_type and discussion_type != "all": pipeline[1]["$match"]["discussion_type"] = discussion_type
                if topic_id: pipeline[1]["$match"]["topic_id"] = topic_id
                
                pipeline.extend([
                    {"$sort": {"score": {"$meta": "searchScore"}}},
                    {"$skip": skip},
                    {"$limit": limit},
                    {"$project": {"score": {"$meta": "searchScore"}, "document": "$$ROOT"}}
                ])
                cursor = db["discussions"].aggregate(pipeline)
                return await self._process_cursor(cursor, user_id, is_aggregate=True)

            else:
                query = {"is_active": True}
                if topic_id:
                    query["topic_id"] = topic_id
                else:
                    if category and category != "all": query["category"] = category
                    if discussion_type and discussion_type != "all": query["discussion_type"] = discussion_type
                    
                    if discussion_type == "topic":
                        query["reply_count"] = {"$gt": 0}
                    elif not discussion_type or discussion_type == "all":
                        query["$or"] = [
                            {"discussion_type": "community"},
                            {"discussion_type": "topic", "reply_count": {"$gt": 0}}
                        ]
                
                sort = [("last_activity", -1)]
                if sort_by == "most_discussed": sort = [("reply_count", -1)]
                elif sort_by == "most_viewed": sort = [("unique_view_count", -1)]
                
                cursor = db["discussions"].find(query).sort(sort).skip(skip).limit(limit)
                return await self._process_cursor(cursor, user_id, is_aggregate=False)
        except Exception as e:
            print(f"❌ Error in get_discussions: {e}")
            traceback.print_exc()
            return []

    async def _process_cursor(self, cursor, user_id, is_aggregate=False) -> List[Dict]:
        """Consolidated formatting keeping all relevant fields"""
        discussions = []
        async for item in cursor:
            try:
                disc = item["document"] if is_aggregate else item
                d_id = str(disc["_id"])
                
                user_has_upvoted = False
                if user_id:
                    upvote = await db["discussion_upvotes"].find_one({"discussion_id": d_id, "user_id": user_id})
                    user_has_upvoted = upvote is not None
                
                discussions.append({
                    "id": d_id,
                    "title": disc.get("title", "Untitled"),
                    "description": disc.get("description", ""),
                    "discussion_type": disc.get("discussion_type", "community"),
                    "topic_id": disc.get("topic_id"),
                    "category": disc.get("category"),
                    "tags": disc.get("tags", []),
                    "user_id": disc.get("user_id"),
                    "username": disc.get("username", "PodNova AI"),
                    "reply_count": disc.get("reply_count", 0),
                    "upvote_count": disc.get("upvote_count", 0),
                    "view_count": disc.get("unique_view_count", 0),
                    "created_at": disc["created_at"].isoformat() if isinstance(disc["created_at"], datetime) else disc["created_at"],
                    "last_activity": disc["last_activity"].isoformat() if isinstance(disc["last_activity"], datetime) else disc["last_activity"],
                    "is_pinned": disc.get("is_pinned", False),
                    "is_auto_created": disc.get("is_auto_created", False),
                    "time_ago": self._format_time_ago(disc["created_at"]),
                    "user_has_upvoted": user_has_upvoted,
                    "search_score": item.get("score") if is_aggregate else None
                })
            except Exception as e:
                print(f"  ❌ Error processing discussion: {e}")
                continue
        return discussions

    async def get_discussion_by_id(self, discussion_id: str, user_id: Optional[str] = None) -> Optional[Dict]:
        """Get single discussion with all replies and view tracking"""
        try:
            print(f"🔍 Getting discussion by id: {discussion_id}")
            if not ObjectId.is_valid(discussion_id): return None
            
            disc = await db["discussions"].find_one({"_id": ObjectId(discussion_id)})
            if not disc: return None
            
            if user_id:
                viewed = await db["discussion_views"].find_one({"discussion_id": discussion_id, "user_id": user_id})
                if not viewed:
                    await db["discussion_views"].insert_one({"discussion_id": discussion_id, "user_id": user_id, "viewed_at": datetime.utcnow()})
                    await db["discussions"].update_one({"_id": ObjectId(discussion_id)}, {
                        "$inc": {"unique_view_count": 1, "view_count": 1},
                        "$push": {"viewed_by": user_id}
                    })
            
            replies = await self.get_replies(discussion_id, user_id)
            user_has_upvoted = False
            if user_id:
                upvote = await db["discussion_upvotes"].find_one({"discussion_id": discussion_id, "user_id": user_id})
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
                "view_count": disc.get("unique_view_count", 0),
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

    async def create_reply(self, discussion_id: str, content: str, user_id: str, username: str, parent_reply_id: Optional[str] = None) -> Reply:
        """Create a reply and trigger owner notification"""
        try:
            print(f"📝 Creating reply for discussion: {discussion_id}")
            if not ObjectId.is_valid(discussion_id): raise ValueError("Invalid ID")
            
            discussion = await db["discussions"].find_one({"_id": ObjectId(discussion_id)})
            
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
            
            await db["discussions"].update_one({"_id": ObjectId(discussion_id)}, {
                "$inc": {"reply_count": 1},
                "$set": {"last_activity": datetime.utcnow()}
            })
            
            try:
                owner_id = discussion.get("user_id")
                if owner_id and owner_id != user_id:
                    await notification_service.create_reply_notification(
                        discussion_owner_id=owner_id,
                        discussion_id=discussion_id,
                        discussion_title=discussion.get("title", "Discussion"),
                        reply_author_id=user_id,
                        reply_author_name=username,
                        reply_preview=content[:100]
                    )
            except Exception: pass
            
            return Reply(**reply_data)
        except Exception as e:
            traceback.print_exc()
            raise

    async def get_replies(self, discussion_id: str, user_id: Optional[str] = None) -> List[Dict]:
        """Get all replies for a discussion"""
        try:
            print(f"🔍 Getting replies for discussion: {discussion_id}")
            cursor = db["replies"].find({"discussion_id": discussion_id, "is_deleted": False}).sort("created_at", 1)
            replies = []
            async for reply in cursor:
                try:
                    is_upvoted = False
                    if user_id:
                        upvote = await db["reply_upvotes"].find_one({"reply_id": str(reply["_id"]), "user_id": user_id})
                        is_upvoted = upvote is not None
                    
                    replies.append({
                        "id": str(reply["_id"]),
                        "discussion_id": reply["discussion_id"],
                        "parent_reply_id": reply.get("parent_reply_id"),
                        "content": reply["content"],
                        "user_id": reply["user_id"],
                        "username": reply["username"],
                        "upvote_count": reply.get("upvote_count", 0),
                        "is_upvoted_by_user": is_upvoted,
                        "mentions": reply.get("mentions", []),
                        "created_at": reply["created_at"].isoformat() if isinstance(reply["created_at"], datetime) else reply["created_at"],
                        "time_ago": self._format_time_ago(reply["created_at"]),
                        "is_edited": reply.get("is_edited", False)
                    })
                except Exception: continue
            return replies
        except Exception as e:
            print(f"❌ Error in get_replies: {e}")
            return []

    async def upvote_discussion(self, discussion_id: str, user_id: str) -> Dict:
        """Toggle upvote on discussion"""
        try:
            print(f"👍 Toggling upvote for discussion: {discussion_id}")
            if not ObjectId.is_valid(discussion_id): raise ValueError("Invalid ID")
            existing = await db["discussion_upvotes"].find_one({"discussion_id": discussion_id, "user_id": user_id})
            
            if existing:
                await db["discussion_upvotes"].delete_one({"_id": existing["_id"]})
                await db["discussions"].update_one({"_id": ObjectId(discussion_id)}, {"$inc": {"upvote_count": -1}})
                return {"upvoted": False, "action": "removed"}
            else:
                await db["discussion_upvotes"].insert_one({"discussion_id": discussion_id, "user_id": user_id, "created_at": datetime.utcnow()})
                await db["discussions"].update_one({"_id": ObjectId(discussion_id)}, {"$inc": {"upvote_count": 1}})
                return {"upvoted": True, "action": "added"}
        except Exception as e:
            traceback.print_exc()
            raise

    async def upvote_reply(self, reply_id: str, user_id: str) -> Dict:
        """Toggle upvote on reply"""
        try:
            print(f"👍 Toggling upvote for reply: {reply_id}")
            if not ObjectId.is_valid(reply_id): raise ValueError("Invalid ID")
            existing = await db["reply_upvotes"].find_one({"reply_id": reply_id, "user_id": user_id})
            
            if existing:
                await db["reply_upvotes"].delete_one({"_id": existing["_id"]})
                await db["replies"].update_one({"_id": ObjectId(reply_id)}, {"$inc": {"upvote_count": -1}})
                return {"upvoted": False, "action": "removed"}
            else:
                await db["reply_upvotes"].insert_one({"reply_id": reply_id, "user_id": user_id, "created_at": datetime.utcnow()})
                await db["replies"].update_one({"_id": ObjectId(reply_id)}, {"$inc": {"upvote_count": 1}})
                return {"upvoted": True, "action": "added"}
        except Exception as e:
            traceback.print_exc()
            raise

    def _format_time_ago(self, dt) -> str:
        """Format datetime as relative time"""
        try:
            if isinstance(dt, str): dt = datetime.fromisoformat(dt.replace('Z', '+00:00'))
            now = datetime.utcnow()
            diff = now - dt
            if diff.days > 0: return f"{diff.days}d ago" if diff.days > 1 else "1d ago"
            hours = diff.seconds // 3600
            if hours > 0: return f"{hours}h ago" if hours > 1 else "1h ago"
            minutes = diff.seconds // 60
            if minutes > 0: return f"{minutes}m ago" if minutes > 1 else "1m ago"
            return "Just now"
        except Exception: return "Recently"

discussion_service = DiscussionService()