"""
Discussion Routes – endpoints for listing, creating, updating discussions
and their replies.
"""

from fastapi import APIRouter, HTTPException, status, Query, Depends
from pydantic import BaseModel
from typing import Optional, List
from app.middleware.firebase_auth import verify_firebase_token, require_firebase_token
from app.middleware.rate_limit import RateLimit
from app.controllers.discussion_controller import (
    create_community_discussion,
    get_discussions,
    get_discussion_by_id,
    update_discussion,
    delete_discussion,
    create_reply,
    delete_reply,
    upvote_discussion,
    upvote_reply,
)
from app.models.discussion import CreateDiscussionRequest
import traceback

router = APIRouter()


class UpdateDiscussionRequest(BaseModel):
    """Request body for updating a discussion's title and description."""
    title: str
    description: str


# Rate limits: 4 discussions per hour, 15 replies per 5 minutes.
create_discussion_limit = RateLimit(limit=4, window_minutes=60, action_name="create_discussion")
create_reply_limit = RateLimit(limit=15, window_minutes=5, action_name="create_reply")


@router.get("/")
async def list_discussions(
    discussion_type: Optional[str] = Query(None, description="topic or community"),
    topic_id: Optional[str] = Query(None, description="Filter by specific topic"),
    category: Optional[str] = Query(None, description="Filter by category"),
    author_id: Optional[str] = Query(None, description="Filter by the user who created it"),
    sort_by: str = Query("latest", regex="^(latest|most_discussed)$"),
    limit: int = Query(10, ge=1, le=50),
    skip: int = Query(0, ge=0),  
    q: Optional[str] = Query(None, description="Search query string"),
    firebase_user: Optional[dict] = Depends(verify_firebase_token)
):
    """
    Get a list of discussions with optional filtering and sorting.

    The `q` parameter triggers full‑text search; otherwise, normal filtering applies.
    """
    try:
        user_id = firebase_user.get("uid") if firebase_user else None
        
        discussions = await get_discussions(
            discussion_type=discussion_type,
            topic_id=topic_id,
            category=category,
            sort_by=sort_by,
            limit=limit,
            skip=skip,   
            user_id=user_id,
            q=q,
            author_id=author_id
        )
        
        return {
            "discussions": discussions,
            "count": len(discussions)
        }
        
    except Exception as e:
        print(f"Error in list_discussions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{discussion_id}")
async def get_discussion(
    discussion_id: str,
    firebase_user: Optional[dict] = Depends(verify_firebase_token)
):
    """Get a single discussion with all its nested replies."""
    try:
        user_id = firebase_user.get("uid") if firebase_user else None
        discussion = await get_discussion_by_id(discussion_id=discussion_id, user_id=user_id)
        
        if not discussion:
            raise HTTPException(status_code=404, detail="Discussion not found")
        
        return discussion
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_discussion_endpoint(
    request: CreateDiscussionRequest,
    firebase_user: dict = Depends(create_discussion_limit)
):
    """Create a new community discussion (not tied to a specific topic)."""
    try:
        from app.db import db
        user = await db["users"].find_one({"firebase_uid": firebase_user["uid"]})
        username = user.get("username", "Anonymous") if user else "Anonymous"
        
        discussion = await create_community_discussion(
            request=request,
            user_id=firebase_user["uid"],
            username=username
        )
        return discussion
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{discussion_id}")
async def update_discussion_endpoint(
    discussion_id: str,
    request: UpdateDiscussionRequest,
    firebase_user: dict = Depends(require_firebase_token)
):
    """Update the title and description of a discussion (author only)."""
    try:
        result = await update_discussion(
            discussion_id=discussion_id, 
            user_id=firebase_user["uid"], 
            title=request.title, 
            description=request.description
        )
        if not result["success"]:
            raise HTTPException(status_code=403, detail=result["message"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{discussion_id}")
async def delete_discussion_endpoint(
    discussion_id: str,
    firebase_user: dict = Depends(require_firebase_token)
):
    """Delete a discussion entirely (author only)."""
    try:
        result = await delete_discussion(discussion_id, firebase_user["uid"])
        if not result["success"]:
            raise HTTPException(status_code=403, detail=result["message"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{discussion_id}/replies", status_code=status.HTTP_201_CREATED)
async def create_reply_endpoint(
    discussion_id: str,
    content: str = Query(..., description="Reply content"),
    parent_reply_id: Optional[str] = Query(None, description="Parent reply ID for threading"),
    firebase_user: dict = Depends(create_reply_limit)
):
    """Create a reply to a discussion or to another reply (threading)."""
    try:
        from app.db import db
        user = await db["users"].find_one({"firebase_uid": firebase_user["uid"]})
        username = user.get("username", "Anonymous") if user else "Anonymous"
        
        reply = await create_reply(
            discussion_id=discussion_id,
            content=content,
            user_id=firebase_user["uid"],
            username=username,
            parent_reply_id=parent_reply_id
        )
        return reply
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/replies/{reply_id}")
async def delete_reply_endpoint(
    reply_id: str,
    firebase_user: dict = Depends(require_firebase_token)
):
    """Soft‑delete a reply (author only)."""
    try:
        result = await delete_reply(reply_id=reply_id, user_id=firebase_user["uid"])
        if not result["success"]:
            raise HTTPException(status_code=403, detail=result["message"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{discussion_id}/upvote")
async def upvote_discussion_endpoint(
    discussion_id: str,
    firebase_user: dict = Depends(require_firebase_token)
):
    """Toggle upvote on a discussion (add if not present, remove if present)."""
    try:
        return await upvote_discussion(discussion_id=discussion_id, user_id=firebase_user["uid"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/replies/{reply_id}/upvote")
async def upvote_reply_endpoint(
    reply_id: str,
    firebase_user: dict = Depends(require_firebase_token)
):
    """Toggle upvote on a reply."""
    try:
        return await upvote_reply(reply_id=reply_id, user_id=firebase_user["uid"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))