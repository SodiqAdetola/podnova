# app/routes/topics_routes.py
from fastapi import APIRouter, HTTPException, status, Query
from typing import Optional
from app.controllers.topics_controller import (
    get_all_categories,
    get_topics_by_category,
    get_topic_by_id
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


@router.get("/category/{category_name}")
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
    """Get full details for a specific topic"""
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