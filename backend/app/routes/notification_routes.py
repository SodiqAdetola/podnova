# app/routes/notification_routes.py
from fastapi import APIRouter, HTTPException, status, Query, Depends
from typing import Optional
from app.middleware.firebase_auth import require_firebase_token
from app.controllers import notification_controller
import traceback

router = APIRouter()


@router.get("/")
async def get_notifications(
    unread_only: bool = Query(False, description="Only show unread notifications"),
    limit: int = Query(50, ge=1, le=100, description="Number of notifications to return"),
    skip: int = Query(0, ge=0, description="Number of notifications to skip"),
    firebase_user: dict = Depends(require_firebase_token)
):
    """
    Get user notifications with pagination
    
    Returns:
    - List of notifications
    - Total count
    - Unread count
    - Pagination info
    """
    try:
        print(f"\n📥 GET /notifications called for user: {firebase_user['uid']}")
        
        result = await notification_controller.get_user_notifications(
            user_id=firebase_user["uid"],
            unread_only=unread_only,
            limit=limit,
            skip=skip
        )
        
        print(f"  ✅ Returning {len(result.notifications)} notifications ({result.unread_count} unread)\n")
        
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
    """
    Get unread notification count for current user
    
    Useful for showing badge counts in UI
    """
    try:
        print(f"\n📥 GET /notifications/unread-count called for user: {firebase_user['uid']}")
        
        result = await notification_controller.get_unread_count(firebase_user["uid"])
        
        print(f"  ✅ Unread count: {result['unread_count']}\n")
        
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
    """
    Mark a notification as read
    
    Returns updated unread count
    """
    try:
        print(f"\n📌 POST /notifications/{notification_id}/read called")
        
        result = await notification_controller.mark_notification_read(
            notification_id=notification_id,
            user_id=firebase_user["uid"]
        )
        
        if not result["success"]:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=result["message"]
            )
        
        print(f"  ✅ Notification marked as read. Unread count: {result.get('unread_count', 0)}\n")
        
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
    """
    Mark all notifications as read for current user
    """
    try:
        print(f"\n📌 POST /notifications/read-all called for user: {firebase_user['uid']}")
        
        result = await notification_controller.mark_all_notifications_read(firebase_user["uid"])
        
        print(f"  ✅ Marked {result['marked_read']} notifications as read\n")
        
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
    """
    Archive a notification (hide from main view)
    """
    try:
        print(f"\n📦 POST /notifications/{notification_id}/archive called")
        
        result = await notification_controller.archive_notification(
            notification_id=notification_id,
            user_id=firebase_user["uid"]
        )
        
        if not result["success"]:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=result["message"]
            )
        
        print(f"  ✅ Notification archived\n")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error in archive_notification: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    firebase_user: dict = Depends(require_firebase_token)
):
    """
    Permanently delete a notification
    """
    try:
        print(f"\n🗑️ DELETE /notifications/{notification_id} called")
        
        result = await notification_controller.delete_notification(
            notification_id=notification_id,
            user_id=firebase_user["uid"]
        )
        
        if not result["success"]:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=result["message"]
            )
        
        print(f"  ✅ Notification deleted\n")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error in delete_notification: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )