# app/controllers/notification_controller.py
from typing import List, Dict, Optional
import asyncio
from app.services.notification_service import notification_service
from app.models.notification import NotificationType, NotificationResponse, NotificationListResponse


async def get_user_notifications(
    user_id: str,
    unread_only: bool = False,
    limit: int = 50,
    skip: int = 0
) -> NotificationListResponse:
    """Get notifications with total and unread counts in parallel"""
    
    # Run all database queries simultaneously to minimize wait time
    notifications_task = notification_service.get_user_notifications(
        user_id=user_id,
        unread_only=unread_only,
        limit=limit,
        skip=skip
    )
    total_task = notification_service.get_notification_count(user_id=user_id, unread_only=False)
    unread_task = notification_service.get_notification_count(user_id=user_id, unread_only=True)
    
    # Perform parallel execution
    notifications, total, unread_count = await asyncio.gather(
        notifications_task, total_task, unread_task
    )
    
    return NotificationListResponse(
        notifications=notifications,
        total=total,
        unread_count=unread_count,
        page=skip // limit + 1 if limit > 0 else 1,
        limit=limit
    )


async def mark_notification_read(
    notification_id: str,
    user_id: str
) -> Dict:
    """Mark a notification as read and return new unread count"""
    success = await notification_service.mark_as_read(notification_id, user_id)
    
    if not success:
        return {"success": False, "message": "Notification not found or unauthorized"}
    
    unread_count = await notification_service.get_notification_count(
        user_id=user_id,
        unread_only=True
    )
    
    return {
        "success": True,
        "unread_count": unread_count
    }


async def mark_all_notifications_read(
    user_id: str
) -> Dict:
    """Mark all notifications as read"""
    count = await notification_service.mark_all_as_read(user_id)
    return {
        "success": True,
        "marked_read": count
    }


async def get_unread_count(
    user_id: str
) -> Dict:
    """Get unread notification count"""
    count = await notification_service.get_notification_count(
        user_id=user_id,
        unread_only=True
    )
    return {"unread_count": count}