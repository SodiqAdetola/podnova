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
import re


class DiscussionService:
    """Service for managing discussions, replies, and notifications"""
    
    async def create_or_get_topic_discussion(self, topic_id: str, topic_title: str, topic_summary: str) -> str:
        """
        Get or create discussion for a topic
        Called automatically when a topic is created/viewed
        
        Returns: discussion_id
        """
        
        # Check if discussion already exists for this topic
        existing = await db["discussions"].find_one({
            "topic_id": topic_id,
            "discussion_type": "topic"
        })
        
        if existing:
            return str(existing["_id"])
        
        # Create new topic discussion
        discussion_data = {
            "title": topic_title,
            "description": f"Discuss this topic: {topic_summary[:200]}...",
            "discussion_type": "topic",
            "topic_id": topic_id,
            "category": None,  # Inherit from topic
            "tags": [],
            "user_id": None,  # System-created
            "username": "PodNova AI",
            "reply_count": 0,
            "upvote_count": 0,
            "view_count": 0,
            "created_at": datetime.utcnow(),
            "last_activity": datetime.utcnow(),
            "is_active": True,
            "is_pinned": False,
            "is_auto_created": True
        }
        
        result = await db["discussions"].insert_one(discussion_data)
        return str(result.inserted_id)
    
    async def create_community_discussion(
        self,
        title: str,
        description: str,
        user_id: str,
        username: str,
        tags: List[str] = None
    ) -> Discussion:
        """Create a user-created community discussion"""
        
        discussion_data = {
            "title": title,
            "description": description,
            "discussion_type": "community",
            "topic_id": None,  # Community discussions have no topic
            "category": None,
            "tags": tags or [],
            "user_id": user_id,
            "username": username,
            "reply_count": 0,
            "upvote_count": 0,
            "view_count": 0,
            "created_at": datetime.utcnow(),
            "last_activity": datetime.utcnow(),
            "is_active": True,
            "is_pinned": False,
            "is_auto_created": False
        }
        
        result = await db["discussions"].insert_one(discussion_data)
        discussion_data["id"] = str(result.inserted_id)
        
        return Discussion(**discussion_data)
    
    async def get_discussions(
        self,
        discussion_type: Optional[str] = None,
        topic_id: Optional[str] = None,
        category: Optional[str] = None,
        sort_by: str = "latest",
        limit: int = 20,
        skip: int = 0
    ) -> List[Dict]:
        """Get discussions with filtering and sorting"""
        
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
        else:
            sort = [("created_at", -1)]
        
        cursor = db["discussions"].find(query).sort(sort).skip(skip).limit(limit)
        
        discussions = []
        async for disc in cursor:
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
                "view_count": disc.get("view_count", 0),
                "created_at": disc["created_at"].isoformat(),
                "last_activity": disc["last_activity"].isoformat(),
                "is_pinned": disc.get("is_pinned", False),
                "is_auto_created": disc.get("is_auto_created", False),
                "time_ago": self._format_time_ago(disc["created_at"])
            })
        
        return discussions
    
    async def get_discussion_by_id(
        self,
        discussion_id: str,
        user_id: Optional[str] = None
    ) -> Optional[Dict]:
        """Get single discussion with all replies"""
        
        try:
            disc = await db["discussions"].find_one({"_id": ObjectId(discussion_id)})
        except:
            return None
        
        if not disc:
            return None
        
        # Increment view count
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
            "view_count": disc.get("view_count", 0),
            "created_at": disc["created_at"].isoformat(),
            "last_activity": disc["last_activity"].isoformat(),
            "time_ago": self._format_time_ago(disc["created_at"]),
            "is_auto_created": disc.get("is_auto_created", False),
            "user_has_upvoted": user_has_upvoted,
            "replies": replies,
            "total_replies": len(replies)
        }
    
    async def create_reply(
        self,
        discussion_id: str,
        content: str,
        user_id: str,
        username: str,
        parent_reply_id: Optional[str] = None
    ) -> Reply:
        """Create a reply to a discussion with AI analysis"""
        
        # Extract mentions from content (@username)
        mentions = self._extract_mentions(content)
        
        # Analyze reply content with AI
        analysis = await ai_analysis_service.analyze_reply(content)
        
        reply_data = {
            "discussion_id": discussion_id,
            "parent_reply_id": parent_reply_id,
            "content": content,
            "analysis": analysis,  # AI factual/opinion analysis
            "user_id": user_id,
            "username": username,
            "upvote_count": 0,
            "mentions": mentions,
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
        
        # Create notifications for mentions
        if mentions:
            await self._create_mention_notifications(
                discussion_id=discussion_id,
                reply_id=str(result.inserted_id),
                mentions=mentions,
                actor_user_id=user_id,
                actor_username=username,
                content=content
            )
        
        # Notify discussion creator if it's not their own reply and not auto-created
        discussion = await db["discussions"].find_one({"_id": ObjectId(discussion_id)})
        if discussion and discussion.get("user_id") and discussion["user_id"] != user_id:
            await self._create_reply_notification(
                discussion_id=discussion_id,
                reply_id=str(result.inserted_id),
                recipient_user_id=discussion["user_id"],
                actor_user_id=user_id,
                actor_username=username,
                content=content
            )
        
        return Reply(**reply_data)
    
    async def get_replies(
        self,
        discussion_id: str,
        user_id: Optional[str] = None
    ) -> List[Dict]:
        """Get all replies for a discussion with AI analysis"""
        
        cursor = db["replies"].find({
            "discussion_id": discussion_id,
            "is_deleted": False
        }).sort("created_at", 1)
        
        replies = []
        async for reply in cursor:
            # Check if user has upvoted this reply
            is_upvoted = False
            if user_id:
                upvote = await db["reply_upvotes"].find_one({
                    "reply_id": str(reply["_id"]),
                    "user_id": user_id
                })
                is_upvoted = upvote is not None
            
            # Get analysis data
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
                "analysis": analysis,  # Includes factual_score, confidence, disclaimer
                "user_id": reply["user_id"],
                "username": reply["username"],
                "upvote_count": reply.get("upvote_count", 0),
                "is_upvoted_by_user": is_upvoted,
                "mentions": reply.get("mentions", []),
                "created_at": reply["created_at"].isoformat(),
                "time_ago": self._format_time_ago(reply["created_at"]),
                "is_edited": reply.get("is_edited", False)
            })
        
        return replies
    
    async def upvote_discussion(
        self,
        discussion_id: str,
        user_id: str
    ) -> Dict:
        """Toggle upvote on discussion"""
        
        existing = await db["discussion_upvotes"].find_one({
            "discussion_id": discussion_id,
            "user_id": user_id
        })
        
        if existing:
            await db["discussion_upvotes"].delete_one({"_id": existing["_id"]})
            await db["discussions"].update_one(
                {"_id": ObjectId(discussion_id)},
                {"$inc": {"upvote_count": -1}}
            )
            return {"upvoted": False, "action": "removed"}
        else:
            await db["discussion_upvotes"].insert_one({
                "discussion_id": discussion_id,
                "user_id": user_id,
                "created_at": datetime.utcnow()
            })
            await db["discussions"].update_one(
                {"_id": ObjectId(discussion_id)},
                {"$inc": {"upvote_count": 1}}
            )
            return {"upvoted": True, "action": "added"}
    
    async def upvote_reply(
        self,
        reply_id: str,
        user_id: str
    ) -> Dict:
        """Toggle upvote on reply"""
        
        existing = await db["reply_upvotes"].find_one({
            "reply_id": reply_id,
            "user_id": user_id
        })
        
        if existing:
            await db["reply_upvotes"].delete_one({"_id": existing["_id"]})
            await db["replies"].update_one(
                {"_id": ObjectId(reply_id)},
                {"$inc": {"upvote_count": -1}}
            )
            return {"upvoted": False, "action": "removed"}
        else:
            await db["reply_upvotes"].insert_one({
                "reply_id": reply_id,
                "user_id": user_id,
                "created_at": datetime.utcnow()
            })
            await db["replies"].update_one(
                {"_id": ObjectId(reply_id)},
                {"$inc": {"upvote_count": 1}}
            )
            return {"upvoted": True, "action": "added"}
    
    async def get_notifications(
        self,
        user_id: str,
        unread_only: bool = False,
        limit: int = 20
    ) -> List[Dict]:
        """Get notifications for a user"""
        
        query = {"user_id": user_id}
        if unread_only:
            query["is_read"] = False
        
        cursor = db["notifications"].find(query).sort("created_at", -1).limit(limit)
        
        notifications = []
        async for notif in cursor:
            notifications.append({
                "id": str(notif["_id"]),
                "type": notif["type"],
                "discussion_id": notif["discussion_id"],
                "reply_id": notif.get("reply_id"),
                "actor_user_id": notif["actor_user_id"],
                "actor_username": notif["actor_username"],
                "preview": notif["preview"],
                "is_read": notif["is_read"],
                "created_at": notif["created_at"].isoformat(),
                "time_ago": self._format_time_ago(notif["created_at"])
            })
        
        return notifications
    
    async def mark_notification_read(self, notification_id: str) -> bool:
        """Mark a notification as read"""
        result = await db["notifications"].update_one(
            {"_id": ObjectId(notification_id)},
            {"$set": {"is_read": True}}
        )
        return result.modified_count > 0
    
    async def mark_all_notifications_read(self, user_id: str) -> int:
        """Mark all notifications as read for a user"""
        result = await db["notifications"].update_many(
            {"user_id": user_id, "is_read": False},
            {"$set": {"is_read": True}}
        )
        return result.modified_count
    
    def _extract_mentions(self, content: str) -> List[str]:
        """Extract @mentions from content"""
        pattern = r'@(\w+)'
        matches = re.findall(pattern, content)
        return list(set(matches))
    
    async def _create_mention_notifications(
        self,
        discussion_id: str,
        reply_id: str,
        mentions: List[str],
        actor_user_id: str,
        actor_username: str,
        content: str
    ):
        """Create notifications for mentioned users"""
        
        cursor = db["users"].find({"full_name": {"$in": mentions}})
        
        async for user in cursor:
            if user["firebase_uid"] != actor_user_id:
                await db["notifications"].insert_one({
                    "user_id": user["firebase_uid"],
                    "type": "mention",
                    "discussion_id": discussion_id,
                    "reply_id": reply_id,
                    "actor_user_id": actor_user_id,
                    "actor_username": actor_username,
                    "preview": content[:100],
                    "is_read": False,
                    "created_at": datetime.utcnow()
                })
    
    async def _create_reply_notification(
        self,
        discussion_id: str,
        reply_id: str,
        recipient_user_id: str,
        actor_user_id: str,
        actor_username: str,
        content: str
    ):
        """Create notification when someone replies to a discussion"""
        
        await db["notifications"].insert_one({
            "user_id": recipient_user_id,
            "type": "reply",
            "discussion_id": discussion_id,
            "reply_id": reply_id,
            "actor_user_id": actor_user_id,
            "actor_username": actor_username,
            "preview": content[:100],
            "is_read": False,
            "created_at": datetime.utcnow()
        })
    
    def _format_time_ago(self, dt: datetime) -> str:
        """Format datetime as relative time"""
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


# Singleton instance
discussion_service = DiscussionService()