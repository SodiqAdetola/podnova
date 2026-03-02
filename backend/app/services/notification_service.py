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
import traceback
import logging

# NEW: Import Expo Push SDK
from exponent_server_sdk import (
    DeviceNotRegisteredError,
    PushClient,
    PushMessage,
    PushServerError,
)

logger = logging.getLogger(__name__)

class NotificationService:
    
    # NEW: Helper function to trigger the actual device push
    async def _send_push_notification(self, user_id: str, title: str, message: str, data: dict):
        """Looks up user push token and fires the notification to Expo."""
        try:
            # Look up the user by their ID (assuming user_id is firebase_uid)
            user = await db["users"].find_one({"firebase_uid": user_id})
            
            if not user:
                return
                
            # Check preferences to respect user opt-outs
            prefs = user.get("preferences", {})
            if prefs.get("push_notifications") is False:
                return

            token = user.get("expo_push_token")
            if not token:
                return

            # Fire to Apple/Google via Expo
            PushClient().publish(
                PushMessage(
                    to=token,
                    title=title,
                    body=message,
                    data=data,
                    sound="default",
                    badge=1 # Increments the red dot on the iOS app icon
                )
            )
            logger.info(f"Push notification sent to {user_id}")
            
        except DeviceNotRegisteredError:
            # Token is dead (user uninstalled). Clean it up.
            await db["users"].update_one(
                {"firebase_uid": user_id},
                {"$set": {"expo_push_token": None}}
            )
            logger.warning(f"Cleaned up dead push token for {user_id}")
        except PushServerError as exc:
            logger.error(f"Expo Server Error: {exc.errors}")
        except Exception as exc:
            logger.error(f"Push Notification Failed: {str(exc)}")

    async def create_notification(self, req: CreateNotificationRequest) -> str:
        """Create a standard notification document AND fire a push notification"""
        try:
            doc = {
                "user_id": req.user_id,
                "type": req.type.value,
                "priority": req.priority.value,
                "source_type": req.source_type,
                "source_id": req.source_id,
                "secondary_id": req.secondary_id,
                "actor_user_id": getattr(req, "actor_user_id", None),
                "actor_username": req.actor_username,
                "title": req.title,
                "message": req.message,
                "preview": req.preview,
                "action_path": req.action_path,
                "is_read": False,
                "created_at": datetime.utcnow()
            }
            res = await db["notifications"].insert_one(doc)
            
            # NEW: Trigger the push notification in the background
            await self._send_push_notification(
                user_id=req.user_id,
                title=req.title,
                message=req.message,
                data={
                    "source_type": req.source_type,
                    "source_id": req.source_id,
                    "action_path": req.action_path
                }
            )
            
            return str(res.inserted_id)
        except Exception as e:
            print(f"❌ Error creating notification: {e}")
            traceback.print_exc()
            return None

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
            "actor_username": 1,
            "preview": 1,
            "action_path": 1,
            "secondary_id": 1
        }

        cursor = db["notifications"].find(query, projection).sort("created_at", -1).skip(skip).limit(limit)
        
        notifications = []
        async for n in cursor:
            # ✅ SHIELD: Safely parse each item. If one is broken, skip it, don't crash the whole screen!
            try:
                notifications.append(self._format_notification(n))
            except Exception as e:
                print(f"⚠️ Skipping malformed legacy notification {n.get('_id')}: {e}")
                continue
                
        return notifications

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

    # --- RESTORED SPECIALIZED CREATORS ---

    async def create_podcast_ready_notification(
        self, user_id: str, podcast_id: str, topic_title: str
    ) -> Optional[str]:
        """Triggered when the background podcast generation finishes"""
        req = CreateNotificationRequest(
            user_id=user_id,
            type=NotificationType.PODCAST_READY,
            priority=NotificationPriority.HIGH,
            source_type="podcast",
            source_id=podcast_id,
            actor_user_id=None,
            actor_username=None,
            title="Your Podcast is Ready!",
            message=f"Your podcast on '{topic_title[:50]}...' has been generated.",
            preview="Tap here to listen in your library.",
            action_path="/library"
        )
        return await self.create_notification(req)

    async def create_reply_notification(
        self, discussion_owner_id: str, discussion_id: str, discussion_title: str, 
        reply_author_id: str, reply_author_name: str, reply_preview: str
    ) -> Optional[str]:
        """Triggered when a user gets a reply in a discussion"""
        if discussion_owner_id == reply_author_id:
            return None
        
        req = CreateNotificationRequest(
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
        return await self.create_notification(req)

    async def create_topic_update_notification(
        self, user_id: str, topic_id: str, topic_title: str, update_type: str, update_count: int
    ) -> Optional[str]:
        """Triggered when a watched topic receives significant updates"""
        req = CreateNotificationRequest(
            user_id=user_id,
            type=NotificationType.TOPIC_UPDATE,
            priority=NotificationPriority.NORMAL,
            source_type="topic",
            source_id=topic_id,
            title="Topic Update",
            message=f"Your watched topic '{topic_title[:50]}' has {update_count} new {'update' if update_count == 1 else 'updates'}",
            preview=f"{update_count} new {'update' if update_count == 1 else 'updates'} available",
            action_path=f"/topic/{topic_id}"
        )
        return await self.create_notification(req)

    # --- FORMATTERS ---

    def _format_time_ago(self, dt: datetime) -> str:
        """Human-readable time difference"""
        try:
            if isinstance(dt, str):
                dt = datetime.fromisoformat(dt.replace('Z', '+00:00')).replace(tzinfo=None)
            elif hasattr(dt, 'tzinfo') and dt.tzinfo is not None:
                dt = dt.replace(tzinfo=None)
                
            diff = datetime.utcnow() - dt
            if diff.days > 0: 
                return f"{diff.days}d ago"
            elif diff.seconds // 3600 > 0: 
                return f"{diff.seconds // 3600}h ago"
            elif diff.seconds // 60 > 0: 
                return f"{diff.seconds // 60}m ago"
            return "Just now"
        except Exception:
            return "Recently"

    def _format_notification(self, n: Dict) -> NotificationResponse:
        """Map DB dictionary to Pydantic Response Model safely"""
        dt = n.get("created_at", datetime.utcnow())
        dt_str = dt.isoformat() if hasattr(dt, 'isoformat') else str(dt)
        
        try:
            n_type = NotificationType(n.get("type", "topic_update"))
        except ValueError:
            n_type = NotificationType.TOPIC_UPDATE
            
        try:
            n_priority = NotificationPriority(n.get("priority", "normal"))
        except ValueError:
            n_priority = NotificationPriority.NORMAL

        return NotificationResponse(
            id=str(n["_id"]),
            type=n_type,
            priority=n_priority,
            source_type=n.get("source_type", "system"),
            source_id=n.get("source_id", ""),
            title=n.get("title", "Update"),
            message=n.get("message", ""),
            is_read=n.get("is_read", False),
            created_at=dt_str,
            time_ago=self._format_time_ago(dt),
            secondary_id=n.get("secondary_id"),
            actor_username=n.get("actor_username"),
            preview=n.get("preview"),
            action_path=n.get("action_path")
        )

notification_service = NotificationService()