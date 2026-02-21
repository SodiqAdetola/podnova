# app/routes/discussion_routes.py
from fastapi import APIRouter, HTTPException, status, Query, Depends
from typing import Optional, List
from app.middleware.firebase_auth import verify_firebase_token, require_firebase_token
from app.controllers.discussion_controller import (
    create_community_discussion,
    get_discussions,
    get_discussion_by_id,
    create_reply,
    upvote_discussion,
    upvote_reply,
    get_notifications,
    mark_notification_read,
    mark_all_notifications_read
)
from app.models.discussion import CreateDiscussionRequest
import traceback

router = APIRouter()


# PUBLIC GET ENDPOINTS - auth optional
@router.get("/")
async def list_discussions(
    discussion_type: Optional[str] = Query(None, description="topic or community"),
    topic_id: Optional[str] = Query(None, description="Filter by specific topic"),
    category: Optional[str] = Query(None, description="Filter by category"),
    sort_by: str = Query("latest", regex="^(latest|most_discussed)$"),
    limit: int = Query(20, ge=1, le=50),
    skip: int = Query(0, ge=0),
    firebase_user: Optional[dict] = Depends(verify_firebase_token)
):
    """
    Get discussions with filtering
    
    Discussion types:
    - topic: Auto-created for each news topic (one per topic)
    - community: User-created general discussions
    
    Sort options:
    - latest: By last activity
    - most_discussed: By reply count
    """
    try:
        print(f"\n📥 GET /discussions called")
        print(f"  📌 Params: type={discussion_type}, topic={topic_id}, category={category}, sort={sort_by}")
        
        # Get user_id from token if available
        user_id = firebase_user.get("uid") if firebase_user else None
        print(f"  👤 User ID: {user_id}")
        
        discussions = await get_discussions(
            discussion_type=discussion_type,
            topic_id=topic_id,
            category=category,
            sort_by=sort_by,
            limit=limit,
            skip=skip,
            user_id=user_id
        )
        
        print(f"  ✅ Returning {len(discussions)} discussions\n")
        
        return {
            "discussions": discussions,
            "count": len(discussions)
        }
        
    except Exception as e:
        print(f"❌ Error in list_discussions: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/{discussion_id}")
async def get_discussion(
    discussion_id: str,
    firebase_user: Optional[dict] = Depends(verify_firebase_token)
):
    """
    Get single discussion with all replies
    
    Includes:
    - Discussion details
    - All replies with AI analysis (factual vs opinion scoring)
    - User's upvote status
    - Nested reply structure
    
    AI Analysis Disclaimer:
    The factual/opinion scores are AI-generated estimates and should not be 
    considered definitive fact-checks. Users should verify information independently.
    """
    try:
        print(f"\n📥 GET /discussions/{discussion_id} called")
        
        # Get user_id from token if available
        user_id = firebase_user.get("uid") if firebase_user else None
        print(f"  👤 User ID: {user_id}")
        
        discussion = await get_discussion_by_id(
            discussion_id=discussion_id,
            user_id=user_id
        )
        
        if not discussion:
            print(f"  ❌ Discussion not found: {discussion_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Discussion not found"
            )
        
        print(f"  ✅ Found discussion: {discussion.get('title', 'Untitled')}\n")
        return discussion
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error in get_discussion: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# PROTECTED POST ENDPOINTS - require auth
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_discussion_endpoint(
    request: CreateDiscussionRequest,
    firebase_user: dict = Depends(require_firebase_token)
):
    """
    Create a new community discussion
    
    Note: Topic discussions are auto-created by the system when topics are generated.
    Users can only create community discussions here.
    """
    try:
        print(f"\n📥 POST /discussions called with title: {request.title}")
        
        # Get username from user profile
        from app.db import db
        user = await db["users"].find_one({"firebase_uid": firebase_user["uid"]})
        username = user.get("full_name", "Anonymous") if user else "Anonymous"
        
        discussion = await create_community_discussion(
            request=request,
            user_id=firebase_user["uid"],
            username=username
        )
        
        print(f"  ✅ Created discussion: {discussion.get('id')}\n")
        return discussion
        
    except Exception as e:
        print(f"❌ Error in create_discussion_endpoint: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/{discussion_id}/replies", status_code=status.HTTP_201_CREATED)
async def create_reply_endpoint(
    discussion_id: str,
    content: str = Query(..., description="Reply content"),
    parent_reply_id: Optional[str] = Query(None, description="Parent reply ID for nested replies"),
    firebase_user: dict = Depends(require_firebase_token)
):
    """
    Create a reply to a discussion
    
    Features:
    - AI analysis of factual vs opinion content (auto-generated)
    - @mentions (notifies mentioned users)
    - Nested replies (use parent_reply_id)
    
    AI Analysis:
    Each reply is automatically analyzed to estimate how factual vs opinionated 
    it is. This is an AI-generated estimate, not a definitive fact-check.
    The disclaimer is always included with the analysis.
    """
    try:
        print(f"\n📥 POST /discussions/{discussion_id}/replies called")
        
        # Get username
        from app.db import db
        user = await db["users"].find_one({"firebase_uid": firebase_user["uid"]})
        username = user.get("full_name", "Anonymous") if user else "Anonymous"
        
        reply = await create_reply(
            discussion_id=discussion_id,
            content=content,
            user_id=firebase_user["uid"],
            username=username,
            parent_reply_id=parent_reply_id
        )
        
        print(f"  ✅ Created reply\n")
        return reply
        
    except Exception as e:
        print(f"❌ Error in create_reply_endpoint: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/{discussion_id}/upvote")
async def upvote_discussion_endpoint(
    discussion_id: str,
    firebase_user: dict = Depends(require_firebase_token)
):
    """Toggle upvote on discussion"""
    try:
        print(f"\n📥 POST /discussions/{discussion_id}/upvote called")
        
        result = await upvote_discussion(
            discussion_id=discussion_id,
            user_id=firebase_user["uid"]
        )
        
        print(f"  ✅ Upvote toggled\n")
        return result
        
    except Exception as e:
        print(f"❌ Error in upvote_discussion_endpoint: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/replies/{reply_id}/upvote")
async def upvote_reply_endpoint(
    reply_id: str,
    firebase_user: dict = Depends(require_firebase_token)
):
    """Toggle upvote on reply"""
    try:
        print(f"\n📥 POST /replies/{reply_id}/upvote called")
        
        result = await upvote_reply(
            reply_id=reply_id,
            user_id=firebase_user["uid"]
        )
        
        print(f"  ✅ Upvote toggled\n")
        return result
        
    except Exception as e:
        print(f"❌ Error in upvote_reply_endpoint: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/notifications/list")
async def list_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(20, ge=1, le=50),
    firebase_user: dict = Depends(require_firebase_token)
):
    """Get user notifications"""
    try:
        print(f"\n📥 GET /notifications/list called")
        
        notifications = await get_notifications(
            user_id=firebase_user["uid"],
            unread_only=unread_only,
            limit=limit
        )
        
        unread_count = len([n for n in notifications if not n.get("is_read", False)])
        
        print(f"  ✅ Returning {len(notifications)} notifications ({unread_count} unread)\n")
        
        return {
            "notifications": notifications,
            "total": len(notifications),
            "unread_count": unread_count
        }
        
    except Exception as e:
        print(f"❌ Error in list_notifications: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/notifications/{notification_id}/read")
async def mark_notification_read_endpoint(
    notification_id: str,
    firebase_user: dict = Depends(require_firebase_token)
):
    """Mark a notification as read"""
    try:
        print(f"\n📥 POST /notifications/{notification_id}/read called")
        
        success = await mark_notification_read(notification_id)
        
        if not success:
            print(f"  ❌ Notification not found: {notification_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Notification not found"
            )
        
        print(f"  ✅ Notification marked as read\n")
        return {"success": True}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error in mark_notification_read_endpoint: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/notifications/read-all")
async def mark_all_read_endpoint(
    firebase_user: dict = Depends(require_firebase_token)
):
    """Mark all notifications as read"""
    try:
        print(f"\n📥 POST /notifications/read-all called")
        
        count = await mark_all_notifications_read(firebase_user["uid"])
        
        print(f"  ✅ Marked {count} notifications as read\n")
        return {"success": True, "marked_read": count}
        
    except Exception as e:
        print(f"❌ Error in mark_all_read_endpoint: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )