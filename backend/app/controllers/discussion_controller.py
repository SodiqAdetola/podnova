# app/controllers/discussion_controller.py
from typing import List, Dict, Optional
from app.services.discussion_service import discussion_service
from app.models.discussion import CreateDiscussionRequest


async def create_or_get_topic_discussion(
    topic_id: str,
    topic_title: str,
    topic_summary: str
) -> str:
    """
    Auto-create or get existing discussion for a topic
    Called when topic is created/viewed
    
    Returns: discussion_id
    """
    return await discussion_service.create_or_get_topic_discussion(
        topic_id=topic_id,
        topic_title=topic_title,
        topic_summary=topic_summary
    )


async def create_community_discussion(
    request: CreateDiscussionRequest,
    user_id: str,
    username: str
) -> Dict:
    """Create a user-created community discussion"""
    
    discussion = await discussion_service.create_community_discussion(
        title=request.title,
        description=request.description,
        user_id=user_id,
        username=username,
        tags=request.tags
    )
    
    return discussion.dict() if hasattr(discussion, 'dict') else discussion


async def get_discussions(
    discussion_type: Optional[str] = None,
    topic_id: Optional[str] = None,
    category: Optional[str] = None,
    sort_by: str = "latest",
    limit: int = 20,
    skip: int = 0,
    user_id: Optional[str] = None
) -> List[Dict]:
    """Get discussions with filters"""
    
    return await discussion_service.get_discussions(
        discussion_type=discussion_type,
        topic_id=topic_id,
        category=category,
        sort_by=sort_by,
        limit=limit,
        skip=skip,
        user_id=user_id
    )


async def get_discussion_by_id(
    discussion_id: str,
    user_id: Optional[str] = None
) -> Optional[Dict]:
    """Get single discussion with replies"""
    
    return await discussion_service.get_discussion_by_id(
        discussion_id=discussion_id,
        user_id=user_id
    )


async def create_reply(
    discussion_id: str,
    content: str,
    user_id: str,
    username: str,
    parent_reply_id: Optional[str] = None
) -> Dict:
    """Create a reply to a discussion (with AI analysis)"""
    
    reply = await discussion_service.create_reply(
        discussion_id=discussion_id,
        content=content,
        user_id=user_id,
        username=username,
        parent_reply_id=parent_reply_id
    )
    
    return reply.dict() if hasattr(reply, 'dict') else reply


async def upvote_discussion(
    discussion_id: str,
    user_id: str
) -> Dict:
    """Toggle upvote on discussion"""
    
    return await discussion_service.upvote_discussion(
        discussion_id=discussion_id,
        user_id=user_id
    )


async def upvote_reply(
    reply_id: str,
    user_id: str
) -> Dict:
    """Toggle upvote on reply"""
    
    return await discussion_service.upvote_reply(
        reply_id=reply_id,
        user_id=user_id
    )


async def get_notifications(
    user_id: str,
    unread_only: bool = False,
    limit: int = 20
) -> List[Dict]:
    """Get user notifications"""
    
    return await discussion_service.get_notifications(
        user_id=user_id,
        unread_only=unread_only,
        limit=limit
    )


async def mark_notification_read(
    notification_id: str
) -> bool:
    """Mark notification as read"""
    
    return await discussion_service.mark_notification_read(notification_id)


async def mark_all_notifications_read(
    user_id: str
) -> int:
    """Mark all notifications as read"""
    
    return await discussion_service.mark_all_notifications_read(user_id)