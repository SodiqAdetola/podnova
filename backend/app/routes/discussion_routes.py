# app/routes/discussion_routes.py
from fastapi import APIRouter, HTTPException, status, Query, Depends
from typing import Optional, List
from app.middleware.firebase_auth import verify_firebase_token, require_firebase_token
from app.controllers.discussion_controller import (
    create_community_discussion,
    get_discussions,
    get_discussion_by_id,
    create_reply,
    delete_reply,
    upvote_discussion,
    upvote_reply,
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
    q: Optional[str] = Query(None, description="Search query"),
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
    - All replies
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
        print(f"\nPOST /discussions called with title: {request.title}")
        
        # Get username from user profile
        from app.db import db
        user = await db["users"].find_one({"firebase_uid": firebase_user["uid"]})
        username = user.get("full_name", "Anonymous") if user else "Anonymous"
        
        discussion = await create_community_discussion(
            request=request,
            user_id=firebase_user["uid"],
            username=username
        )
        
        print(f"Created discussion: {discussion.get('id')}\n")
        return discussion
        
    except Exception as e:
        print(f"Error in create_discussion_endpoint: {e}")
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
    

    - @mentions (notifies mentioned users)
    - Nested replies (use parent_reply_id)
    
    """
    try:
        print(f"\nPOST /discussions/{discussion_id}/replies called")
        
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
        
        print(f"Created reply\n")
        return reply
        
    except Exception as e:
        print(f"Error in create_reply_endpoint: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.delete("/replies/{reply_id}")
async def delete_reply_endpoint(
    reply_id: str,
    firebase_user: dict = Depends(require_firebase_token)
):
    """
    Delete a reply
    
    Users can only delete their own replies.
    This is a soft delete - content is replaced with [deleted].
    """
    try:
        print(f"\nDELETE /replies/{reply_id} called")
        
        result = await delete_reply(
            reply_id=reply_id,
            user_id=firebase_user["uid"]
        )
        
        if result["success"]:
            print(f"Reply deleted\n")
            return result
        else:
            print(f"Failed to delete reply\n")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=result["message"]
            )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in delete_reply_endpoint: {e}")
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
        print(f"\nPOST /discussions/{discussion_id}/upvote called")
        
        result = await upvote_discussion(
            discussion_id=discussion_id,
            user_id=firebase_user["uid"]
        )
        
        print(f"Upvote toggled\n")
        return result
        
    except Exception as e:
        print(f"Error in upvote_discussion_endpoint: {e}")
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
        print(f"Error in upvote_reply_endpoint: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )