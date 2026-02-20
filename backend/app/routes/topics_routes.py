# app/routes/topics_routes.py
from fastapi import APIRouter, HTTPException, status, Query
from typing import Optional
from app.controllers.topics_controller import (
    get_all_categories,
    get_topics_by_category,
    get_topic_by_id,
    get_topic_history,
    force_history_check
)

router = APIRouter()


@router.get("/categories")
async def list_categories():
    """Get all categories with topic counts"""
    try:
        categories = await get_all_categories()
        return {"categories": categories}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/categories/{category_name}")
async def get_category_topics(
    category_name: str,
    sort_by: Optional[str] = Query("latest", regex="^(latest|reliable|most_discussed)$")
):
    """Get topics for a specific category with optional sorting"""
    try:
        topics = await get_topics_by_category(category_name, sort_by)
        return {
            "category": category_name,
            "sort_by": sort_by,
            "topics": topics
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/{topic_id}")
async def get_topic_details(topic_id: str):
    """
    Get full details for a specific topic
    
    Now includes:
    - Last 10 history points in timeline
    - History point count
    - Development notes
    """
    try:
        topic = await get_topic_by_id(topic_id)
        
        if not topic:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Topic not found"
            )
        
        return topic
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/{topic_id}/history")
async def get_topic_history_timeline(
    topic_id: str,
    limit: int = Query(20, ge=1, le=50, description="Maximum history points to return")
):
    """
    Get complete history timeline for a topic
    
    Returns chronological list of significant updates showing how the topic evolved.
    Each history point includes:
    - Snapshot of title/summary/insights at that time
    - Significance score and type
    - Article count and sources
    - What changed (development note)
    
    Use this to build a timeline view in the frontend.
    """
    try:
        history = await get_topic_history(topic_id, limit)
        
        return {
            "topic_id": topic_id,
            "history_points": history,
            "count": len(history)
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/{topic_id}/history/check")
async def trigger_history_check(topic_id: str):
    """
    Manually trigger history check for a topic
    
    **Admin/Debug Endpoint**
    
    Forces the system to evaluate if current topic state warrants
    a new history point. Useful for:
    - Testing the history algorithm
    - Manual intervention when needed
    - Debugging significance scoring
    
    Returns the result of the check including whether a history
    point was created and the significance breakdown.
    """
    try:
        result = await force_history_check(topic_id)
        
        if "error" in result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=result["error"]
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/categories/{category_name}/developing")
async def get_developing_stories(
    category_name: str,
    min_history_points: int = Query(3, ge=2, le=10, description="Minimum history points")
):
    """
    Get developing stories in a category
    
    Returns topics that have evolved significantly over time,
    based on number of history points created.
    
    Perfect for highlighting stories that are actively developing
    with new information coming in.
    """
    try:
        from app.db import db
        
        cursor = db["topics"].find({
            "category": category_name,
            "status": "active",
            "has_title": True,
            "history_point_count": {"$gte": min_history_points}
        }).sort("last_updated", -1).limit(20)
        
        topics = []
        async for topic in cursor:
            from app.controllers.topics_controller import _format_time_ago
            
            topics.append({
                "id": str(topic["_id"]),
                "title": topic["title"],
                "summary": topic.get("summary"),
                "article_count": topic.get("article_count", 0),
                "history_point_count": topic.get("history_point_count", 0),
                "last_updated": topic["last_updated"].isoformat(),
                "time_ago": _format_time_ago(topic["last_updated"]),
                "development_note": topic.get("development_note"),
                "image_url": topic.get("image_url")
            })
        
        return {
            "category": category_name,
            "developing_stories": topics,
            "count": len(topics)
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )