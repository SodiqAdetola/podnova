# app/services/notification_service.py
from typing import List, Dict, Optional, Any
from datetime import datetime
from bson import ObjectId
from app.db import db
from app.models.notification import (
    Notification,
    NotificationType,
    NotificationPriority,
    NotificationResponse,
    CreateNotificationRequest
)
import traceback


class NotificationService:
    """Service for managing user notifications"""
    
    async def create_notification(self, request: CreateNotificationRequest) -> Optional[str]:
        """Create a new notification"""
        try:
            print(f"📨 Creating {request.type} notification for user: {request.user_id}")
            
            notification_data = {
                "user_id": request.user_id,
                "type": request.type.value,
                "priority": request.priority.value,
                "source_type": request.source_type,
                "source_id": request.source_id,
                "secondary_id": request.secondary_id,
                "actor_user_id": request.actor_user_id,
                "actor_username": request.actor_username,
                "title": request.title,
                "message": request.message,
                "preview": request.preview,
                "action_path": request.action_path,
                "is_read": False,
                "is_archived": False,
                "created_at": datetime.utcnow(),
                "read_at": None
            }
            
            result = await db["notifications"].insert_one(notification_data)
            notification_id = str(result.inserted_id)
            
            print(f"  ✅ Created notification: {notification_id}")
            return notification_id
            
        except Exception as e:
            print(f"❌ Error creating notification: {e}")
            traceback.print_exc()
            return None
    
    async def get_user_notifications(
        self,
        user_id: str,
        unread_only: bool = False,
        limit: int = 50,
        skip: int = 0
    ) -> List[NotificationResponse]:
        """Get notifications for a user"""
        try:
            print(f"🔍 Getting notifications for user: {user_id}")
            
            query = {"user_id": user_id}
            if unread_only:
                query["is_read"] = False
            
            cursor = db["notifications"].find(query).sort("created_at", -1).skip(skip).limit(limit)
            
            notifications = []
            async for notif in cursor:
                try:
                    notifications.append(self._format_notification(notif))
                except Exception as e:
                    print(f"  ❌ Error formatting notification {notif.get('_id')}: {e}")
                    traceback.print_exc()
                    continue
            
            print(f"  ✅ Found {len(notifications)} notifications")
            return notifications
            
        except Exception as e:
            print(f"❌ Error in get_user_notifications: {e}")
            traceback.print_exc()
            return []
    
    async def get_notification_count(self, user_id: str, unread_only: bool = True) -> int:
        """Get count of notifications for a user"""
        try:
            query = {"user_id": user_id}
            if unread_only:
                query["is_read"] = False
            return await db["notifications"].count_documents(query)
        except Exception as e:
            print(f"❌ Error in get_notification_count: {e}")
            return 0
    
    async def mark_as_read(self, notification_id: str, user_id: str) -> bool:
        """Mark a notification as read"""
        try:
            if not ObjectId.is_valid(notification_id):
                return False
            
            result = await db["notifications"].update_one(
                {
                    "_id": ObjectId(notification_id),
                    "user_id": user_id
                },
                {
                    "$set": {
                        "is_read": True,
                        "read_at": datetime.utcnow()
                    }
                }
            )
            
            return result.modified_count > 0
            
        except Exception as e:
            print(f"❌ Error in mark_as_read: {e}")
            return False
    
    async def mark_all_as_read(self, user_id: str) -> int:
        """Mark all notifications as read for a user"""
        try:
            result = await db["notifications"].update_many(
                {
                    "user_id": user_id,
                    "is_read": False
                },
                {
                    "$set": {
                        "is_read": True,
                        "read_at": datetime.utcnow()
                    }
                }
            )
            
            return result.modified_count
            
        except Exception as e:
            print(f"❌ Error in mark_all_as_read: {e}")
            return 0
    
    # --- Discussion Notifications ---
    
    async def create_reply_notification(
        self,
        discussion_owner_id: str,
        discussion_id: str,
        discussion_title: str,
        reply_author_id: str,
        reply_author_name: str,
        reply_preview: str
    ) -> Optional[str]:
        """Create notification when someone replies to your discussion"""
        
        if discussion_owner_id == reply_author_id:
            return None
        
        request = CreateNotificationRequest(
            user_id=discussion_owner_id,
            type=NotificationType.REPLY,
            priority=NotificationPriority.NORMAL,
            source_type="discussion",
            source_id=discussion_id,
            actor_user_id=reply_author_id,
            actor_username=reply_author_name,
            title="New Reply",
            message=f"{reply_author_name} replied to your discussion",
            preview=reply_preview[:100] if reply_preview else None,
            action_path=f"/discussion/{discussion_id}"
        )
        
        return await self.create_notification(request)
    
    # --- Topic Notifications ---
    
    async def create_topic_update_notification(
        self,
        user_id: str,
        topic_id: str,
        topic_title: str,
        update_type: str,
        update_count: int
    ) -> Optional[str]:
        """Create notification for topic updates (watched topics)"""
        
        title = f"📰 Topic Update"
        message = f"Your watched topic '{topic_title[:50]}' has {update_count} new {'update' if update_count == 1 else 'updates'}"
        
        request = CreateNotificationRequest(
            user_id=user_id,
            type=NotificationType.TOPIC_UPDATE,
            priority=NotificationPriority.NORMAL,
            source_type="topic",
            source_id=topic_id,
            actor_user_id=None,
            actor_username=None,
            title=title,
            message=message,
            preview=f"{update_count} new {'update' if update_count == 1 else 'updates'} available",
            action_path=f"/topic/{topic_id}"
        )
        
        return await self.create_notification(request)
    
    # --- Podcast Notifications ---
    
    async def create_podcast_ready_notification(
        self,
        user_id: str,
        podcast_id: str,
        podcast_title: str,
        topic_title: str
    ) -> Optional[str]:
        """Create notification when a generated podcast is ready"""
        
        request = CreateNotificationRequest(
            user_id=user_id,
            type=NotificationType.PODCAST_READY,
            priority=NotificationPriority.HIGH,
            source_type="podcast",
            source_id=podcast_id,
            actor_user_id=None,
            actor_username=None,
            title="🎧 Your Podcast is Ready!",
            message=f"Your podcast '{podcast_title}' has been generated",
            preview=f"Based on: {topic_title[:60]}",
            action_path=f"/library"  
        )
        
        return await self.create_notification(request)
    
    def _format_time_ago(self, dt) -> str:
        """Safely format datetime as relative time without timezone crashes"""
        try:
            if isinstance(dt, str):
                dt = datetime.fromisoformat(dt.replace('Z', '+00:00')).replace(tzinfo=None)
            elif hasattr(dt, 'tzinfo') and dt.tzinfo is not None:
                dt = dt.replace(tzinfo=None)
                
            if not isinstance(dt, datetime):
                return "Recently"
                
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
        except Exception:
            return "Recently"

    def _format_notification(self, notif: Dict[str, Any]) -> NotificationResponse:
        """Format raw notification from DB to response object safely"""
        created_at = notif.get("created_at") or datetime.utcnow()
        created_at_str = created_at.isoformat() if hasattr(created_at, 'isoformat') else str(created_at)

        return NotificationResponse(
            id=str(notif["_id"]),
            type=NotificationType(notif["type"]),
            priority=NotificationPriority(notif["priority"]),
            source_type=notif.get("source_type", "system"),
            source_id=notif.get("source_id", ""),
            secondary_id=notif.get("secondary_id"),
            actor_username=notif.get("actor_username"),
            title=notif.get("title", "Notification"),
            message=notif.get("message", ""),
            preview=notif.get("preview"),
            action_path=notif.get("action_path"),
            is_read=notif.get("is_read", False),
            created_at=created_at_str,
            time_ago=self._format_time_ago(created_at)
        )

notification_service = NotificationService()