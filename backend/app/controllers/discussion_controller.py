"""
Discussion Controller – handles topic‑based and community discussions.
"""
from typing import List, Dict, Optional
from app.services.discussion_service import discussion_service
from app.models.discussion import CreateDiscussionRequest


async def create_or_get_topic_discussion(
    topic_id: str,
    topic_title: str,
    topic_summary: str,
    category: str
) -> str:
    """
    Automatically create a discussion for a topic or return the existing one.

    Used by the clustering pipeline when a new topic is formed.
    """
    return await discussion_service.create_or_get_topic_discussion(
        topic_id=topic_id,
        topic_title=topic_title,
        topic_summary=topic_summary,
        category=category
    )


async def create_community_discussion(
    request: CreateDiscussionRequest,
    user_id: str,
    username: str
) -> Dict:
    """
    Create a user‑initiated community discussion (not tied to a specific topic).
    """
    category = getattr(request, 'category', None)
    
    discussion = await discussion_service.create_community_discussion(
        title=request.title,
        description=request.description,
        user_id=user_id,
        username=username,
        tags=request.tags,
        category=category  
    )
    return discussion.dict() if hasattr(discussion, 'dict') else discussion


async def get_discussions(
    discussion_type: Optional[str] = None,
    topic_id: Optional[str] = None,
    category: Optional[str] = None,
    sort_by: str = "latest",
    limit: int = 10,
    skip: int = 0,
    user_id: Optional[str] = None,
    q: Optional[str] = None,
    author_id: Optional[str] = None
) -> List[Dict]:
    """
    Get discussions with optional filters, sorting, and search support.

    Supports filtering by type (topic/community), topic ID, category,
    author, and full‑text search via the `q` parameter.
    """
    return await discussion_service.get_discussions(
        discussion_type=discussion_type,
        topic_id=topic_id,
        category=category,
        sort_by=sort_by,
        limit=limit,
        skip=skip,
        user_id=user_id,
        search_query=q,
        author_id=author_id
    )


async def get_discussion_by_id(
    discussion_id: str,
    user_id: Optional[str] = None
) -> Optional[Dict]:
    """
    Get a single discussion with its nested replies.

    Includes view counting and upvote status for the current user.
    """
    return await discussion_service.get_discussion_by_id(
        discussion_id=discussion_id,
        user_id=user_id
    )


async def update_discussion(
    discussion_id: str,
    user_id: str,
    title: str,
    description: str
) -> Dict:
    """Update a discussion title and description (author only)."""
    updated = await discussion_service.update_discussion(discussion_id, user_id, title, description)
    if not updated:
        return {"success": False, "message": "Failed to update or unauthorized"}
    return {"success": True, "discussion": updated}


async def delete_discussion(
    discussion_id: str,
    user_id: str
) -> Dict:
    """Completely delete a discussion (author only)."""
    success = await discussion_service.delete_discussion(discussion_id, user_id)
    if success:
        return {"success": True, "message": "Discussion deleted successfully"}
    return {"success": False, "message": "Failed to delete or unauthorized"}


async def create_reply(
    discussion_id: str,
    content: str,
    user_id: str,
    username: str,
    parent_reply_id: Optional[str] = None
) -> Dict:
    """
    Create a reply in a discussion.

    Supports threaded replies via parent_reply_id.
    """
    reply = await discussion_service.create_reply(
        discussion_id=discussion_id,
        content=content,
        user_id=user_id,
        username=username,
        parent_reply_id=parent_reply_id
    )
    return reply.dict() if hasattr(reply, 'dict') else reply


async def delete_reply(
    reply_id: str,
    user_id: str
) -> Dict:
    """Soft‑delete a reply (author only)."""
    success = await discussion_service.delete_reply(
        reply_id=reply_id,
        user_id=user_id
    )
    if success:
        return {"success": True, "message": "Reply deleted successfully"}
    else:
        return {"success": False, "message": "Failed to delete reply or unauthorized"}


async def upvote_discussion(
    discussion_id: str,
    user_id: str
) -> Dict:
    """Toggle upvote on a discussion."""
    return await discussion_service.upvote_discussion(
        discussion_id=discussion_id,
        user_id=user_id
    )


async def upvote_reply(
    reply_id: str,
    user_id: str
) -> Dict:
    """Toggle upvote on a reply."""
    return await discussion_service.upvote_reply(
        reply_id=reply_id,
        user_id=user_id
    )