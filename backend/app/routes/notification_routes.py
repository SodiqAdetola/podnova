# app/routes/notification_routes.py
from fastapi import APIRouter, HTTPException, status, Query, Depends
from typing import Optional, List
from pydantic import BaseModel
from app.middleware.firebase_auth import require_firebase_token
from app.controllers import notification_controller
import traceback

router = APIRouter()

# Schema for bulk deletion
class BulkDeleteRequest(BaseModel):
    notification_ids: List[str]

# Removed the trailing slash ("/" -> "") to prevent 307 Redirects from stripping auth headers
@router.get("")
async def get_notifications(
    unread_only: bool = Query(False, description="Only show unread notifications"),
    limit: int = Query(50, ge=1, le=100, description="Number of notifications to return"),
    skip: int = Query(0, ge=0, description="Number of notifications to skip"),
    firebase_user: dict = Depends(require_firebase_token)
):
    """Get user notifications with pagination"""
    try:
        result = await notification_controller.get_user_notifications(
            user_id=firebase_user["uid"],
            unread_only=unread_only,
            limit=limit,
            skip=skip
        )
        return result
    except Exception as e:
        print(f"❌ Error in get_notifications: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/unread-count")
async def get_unread_count(
    firebase_user: dict = Depends(require_firebase_token)
):
    """Get unread notification count for current user"""
    try:
        result = await notification_controller.get_unread_count(firebase_user["uid"])
        return result
    except Exception as e:
        print(f"❌ Error in get_unread_count: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    firebase_user: dict = Depends(require_firebase_token)
):
    """Mark a notification as read"""
    try:
        result = await notification_controller.mark_notification_read(
            notification_id=notification_id,
            user_id=firebase_user["uid"]
        )
        if not result["success"]:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=result["message"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error in mark_notification_read: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/read-all")
async def mark_all_read(
    firebase_user: dict = Depends(require_firebase_token)
):
    """Mark all notifications as read for current user"""
    try:
        result = await notification_controller.mark_all_notifications_read(firebase_user["uid"])
        return result
    except Exception as e:
        print(f"❌ Error in mark_all_read: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/{notification_id}/archive")
async def archive_notification(
    notification_id: str,
    firebase_user: dict = Depends(require_firebase_token)
):
    """Archive a notification (hide from main view)"""
    try:
        result = await notification_controller.archive_notification(
            notification_id=notification_id,
            user_id=firebase_user["uid"]
        )
        if not result["success"]:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=result["message"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

# --- NEW BULK DELETE ENDPOINT ---
@router.post("/bulk-delete")
async def bulk_delete_notifications(
    request: BulkDeleteRequest,
    firebase_user: dict = Depends(require_firebase_token)
):
    """Delete multiple notifications at once"""
    try:
        result = await notification_controller.bulk_delete_notifications(
            notification_ids=request.notification_ids,
            user_id=firebase_user["uid"]
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

# --- NEW DELETE ALL ENDPOINT ---
@router.delete("/delete-all")
async def delete_all_notifications(
    firebase_user: dict = Depends(require_firebase_token)
):
    """Wipe all notifications for the current user"""
    try:
        result = await notification_controller.delete_all_notifications(
            user_id=firebase_user["uid"]
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    firebase_user: dict = Depends(require_firebase_token)
):
    """Permanently delete a single notification"""
    try:
        result = await notification_controller.delete_notification(
            notification_id=notification_id,
            user_id=firebase_user["uid"]
        )
        if not result["success"]:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=result["message"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))