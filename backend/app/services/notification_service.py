# backend/app/services/notification_service.py
from typing import List, Dict, Optional, Any
from datetime import datetime
from bson import ObjectId
from app.db import db
from app.models.notification import (
    NotificationResponse,
    NotificationType,
    NotificationPriority,
    CreateNotificationRequest
)

class NotificationService:
    async def create_notification(self, req: CreateNotificationRequest) -> str:
        """Create a standard notification document"""
        doc = {
            "user_id": req.user_id,
            "type": req.type.value,
            "priority": req.priority.value,
            "source_type": req.source_type,
            "source_id": req.source_id,
            "secondary_id": req.secondary_id,
            "actor_username": req.actor_username,
            "title": req.title,
            "message": req.message,
            "preview": req.preview,
            "action_path": req.action_path,
            "is_read": False,
            "created_at": datetime.utcnow()
        }
        res = await db["notifications"].insert_one(doc)
        return str(res.inserted_id)

    async def get_user_notifications(self, user_id: str, unread_only: bool, limit: int, skip: int) -> List[NotificationResponse]:
        """Fetch notifications using optimized projection and index-hinted sorting"""
        query = {"user_id": user_id}
        if unread_only: 
            query["is_read"] = False
        
        # PROJECTION: Only pull what the UI card actually displays
        projection = {
            "type": 1, 
            "priority": 1, 
            "source_type": 1, 
            "source_id": 1, 
            "title": 1, 
            "message": 1, 
            "is_read": 1, 
            "created_at": 1, 
            "actor_username": 1
        }

        # Uses the {user_id: 1, created_at: -1} index automatically
        cursor = db["notifications"].find(query, projection).sort("created_at", -1).skip(skip).limit(limit)
        
        # List comprehension for faster processing than .append()
        return [self._format_notification(n) async for n in cursor]

    async def get_notification_count(self, user_id: str, unread_only: bool) -> int:
        """High-speed document counting using metadata index"""
        query = {"user_id": user_id}
        if unread_only: 
            query["is_read"] = False
        return await db["notifications"].count_documents(query)

    async def mark_as_read(self, n_id: str, user_id: str) -> bool:
        """Atomic update to mark as read"""
        if not ObjectId.is_valid(n_id): 
            return False
        res = await db["notifications"].update_one(
            {"_id": ObjectId(n_id), "user_id": user_id}, 
            {"$set": {"is_read": True}}
        )
        return res.modified_count > 0

    async def mark_all_as_read(self, user_id: str) -> int:
        """Bulk update for the whole user collection"""
        res = await db["notifications"].update_many(
            {"user_id": user_id, "is_read": False}, 
            {"$set": {"is_read": True}}
        )
        return res.modified_count

    def _format_time_ago(self, dt: datetime) -> str:
        """Human-readable time difference"""
        diff = datetime.utcnow() - dt.replace(tzinfo=None)
        if diff.days > 0: 
            return f"{diff.days}d ago"
        elif diff.seconds // 3600 > 0: 
            return f"{diff.seconds // 3600}h ago"
        elif diff.seconds // 60 > 0: 
            return f"{diff.seconds // 60}m ago"
        return "Just now"

    def _format_notification(self, n: Dict) -> NotificationResponse:
        """Map DB dictionary to Pydantic Response Model"""
        dt = n["created_at"]
        return NotificationResponse(
            id=str(n["_id"]),
            type=NotificationType(n["type"]),
            priority=NotificationPriority(n["priority"]),
            source_type=n.get("source_type", "system"),
            source_id=n.get("source_id", ""),
            title=n.get("title", ""),
            message=n.get("message", ""),
            is_read=n.get("is_read", False),
            created_at=dt.isoformat(),
            time_ago=self._format_time_ago(dt),
            secondary_id=n.get("secondary_id"),
            actor_username=n.get("actor_username"),
            preview=n.get("preview"),
            action_path=n.get("action_path")
        )

notification_service = NotificationService()