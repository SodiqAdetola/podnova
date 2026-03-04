# backend/app/controllers/notification_controller.py
from typing import List, Dict
import asyncio
from app.services.notification_service import notification_service
from app.models.notification import NotificationListResponse

async def get_user_notifications(
    user_id: str, 
    unread_only: bool = False, 
    limit: int = 50, 
    skip: int = 0
) -> NotificationListResponse:
    """Parallel fetch for notifications, total count, and unread count"""
    
    # Create the concurrent tasks
    list_task = notification_service.get_user_notifications(user_id, unread_only, limit, skip)
    unread_task = notification_service.get_notification_count(user_id, unread_only=True)
    total_task = notification_service.get_notification_count(user_id, unread_only=False)

    # Run all 3 DB queries at the exact same time
    notifications, unread_count, total = await asyncio.gather(list_task, unread_task, total_task)
    
    return NotificationListResponse(
        notifications=notifications,
        total=total,
        unread_count=unread_count,
        page=(skip // limit) + 1 if limit > 0 else 1,
        limit=limit
    )

async def mark_notification_read(notification_id: str, user_id: str) -> Dict:
    """Atomic update and count refresh"""
    success = await notification_service.mark_as_read(notification_id, user_id)
    new_count = await notification_service.get_notification_count(user_id, unread_only=True) if success else 0
    return {"success": success, "unread_count": new_count}

async def mark_all_notifications_read(user_id: str) -> Dict:
    """Atomic bulk update"""
    count = await notification_service.mark_all_as_read(user_id)
    return {"success": True, "marked_read": count, "unread_count": 0}

async def get_unread_count(user_id: str) -> Dict:
    """Standalone count check"""
    count = await notification_service.get_notification_count(user_id, unread_only=True)
    return {"unread_count": count}

# --- DELETION CONTROLLERS ---

async def delete_notification(notification_id: str, user_id: str) -> Dict:
    """Delete a single notification"""
    success = await notification_service.delete_notification(notification_id, user_id)
    if not success:
        return {"success": False, "message": "Notification not found or access denied"}
    return {"success": True, "message": "Notification deleted successfully"}

async def bulk_delete_notifications(notification_ids: list, user_id: str) -> Dict:
    """Pass bulk delete request to the service layer"""
    deleted_count = await notification_service.bulk_delete(notification_ids, user_id)
    return {"success": True, "deleted_count": deleted_count}

async def delete_all_notifications(user_id: str) -> Dict:
    """Pass wipe request to the service layer"""
    deleted_count = await notification_service.delete_all(user_id)
    return {"success": True, "deleted_count": deleted_count}