# app/controllers/topics_controller.py - UPDATED WITH HISTORY
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from bson import ObjectId
from app.db import db
from app.ai_pipeline.topic_history import TopicHistoryService
from app.config import MONGODB_URI, MONGODB_DB_NAME

# Initialize history service
history_service = TopicHistoryService(MONGODB_URI, MONGODB_DB_NAME)


async def get_all_categories() -> List[Dict]:
    """Get all categories with their active topic counts and trending info"""
    categories = ["technology", "finance", "politics"]
    result = []
    
    for category in categories:
        topic_count = await db["topics"].count_documents({
            "category": category,
            "status": "active",
            "has_title": True
        })
        
        recent_topic = await db["topics"].find_one(
            {
                "category": category,
                "status": "active",
                "has_title": True
            },
            sort=[("last_updated", -1)]
        )
        
        trending = None
        if recent_topic and recent_topic.get("title"):
            trending = recent_topic["title"]
        
        result.append({
            "name": category,
            "display_name": category.capitalize(),
            "topic_count": topic_count,
            "trending": trending
        })
    
    return result


async def get_topics_by_category(category: str, sort_by: str = "latest") -> List[Dict]:
    """Get topics for a specific category with sorting"""
    query = {
        "category": category,
        "status": "active",
        "has_title": True
    }
    
    if sort_by == "latest":
        sort = [("last_updated", -1)]
    elif sort_by == "reliable":
        sort = [("confidence", -1), ("article_count", -1)]
    elif sort_by == "most_discussed":
        sort = [("article_count", -1)]
    else:
        sort = [("last_updated", -1)]
    
    cursor = db["topics"].find(query).sort(sort).limit(50)
    topics = []
    
    async for topic in cursor:
        time_ago = _format_time_ago(topic["last_updated"])
        
        topics.append({
            "id": str(topic["_id"]),
            "title": topic["title"],
            "summary": topic.get("summary"),
            "article_count": topic.get("article_count", 0),
            "source_count": len(topic.get("sources", [])),
            "confidence": topic.get("confidence", 0),
            "last_updated": topic["last_updated"].isoformat(),
            "time_ago": time_ago,
            "category": topic["category"],
            "image_url": topic.get("image_url"),
            "history_point_count": topic.get("history_point_count", 0),  # ✅ NEW
            "development_note": topic.get("development_note")  # ✅ NEW
        })
    
    return topics


async def get_topic_by_id(topic_id: str) -> Optional[Dict]:
    """Get full topic details including articles and history"""
    try:
        topic = await db["topics"].find_one({"_id": ObjectId(topic_id)})
    except:
        return None
    
    if not topic:
        return None
    
    # Get all articles for this topic
    articles = []
    cursor = db["articles"].find({
        "_id": {"$in": topic.get("article_ids", [])}
    }).sort("published_date", -1)
    
    async for article in cursor:
        articles.append({
            "id": str(article["_id"]),
            "title": article["title"],
            "description": article["description"],
            "url": article["url"],
            "source": article["source"],
            "published_date": article["published_date"].isoformat(),
            "word_count": article.get("word_count", 0),
            "image_url": article.get("image_url")
        })
    
    time_ago = _format_time_ago(topic["last_updated"])
    tags = _extract_tags(topic)
    
    # ✅ NEW: Get history timeline (limit to last 10 points)
    history_timeline = await history_service.get_topic_timeline(topic_id)
    
    return {
        "id": str(topic["_id"]),
        "title": topic["title"],
        "summary": topic.get("summary"),
        "key_insights": topic.get("key_insights", []),
        "category": topic["category"],
        "article_count": topic.get("article_count", 0),
        "source_count": len(topic.get("sources", [])),
        "sources": topic.get("sources", []),
        "confidence": topic.get("confidence", 0),
        "last_updated": topic["last_updated"].isoformat(),
        "time_ago": time_ago,
        "created_at": topic["created_at"].isoformat(),
        "articles": articles,
        "tags": tags,
        "has_podcast": False,
        "image_url": topic.get("image_url"),
        "history_point_count": topic.get("history_point_count", 0),  # ✅ NEW
        "history_timeline": history_timeline[:10] if history_timeline else [],  # ✅ NEW: Last 10 points
        "development_note": topic.get("development_note")  # ✅ NEW
    }


async def get_topic_history(topic_id: str, limit: int = 20) -> List[Dict]:
    """Get full history timeline for a topic"""
    return await history_service.get_topic_timeline(topic_id)


async def force_history_check(topic_id: str) -> Dict:
    """Manually trigger history check for a topic (admin function)"""
    result = await history_service.check_and_create_history(topic_id)
    if not result:
        return {"error": "Topic not found or not active"}
    return result


def _format_time_ago(dt: datetime) -> str:
    """Format datetime as relative time string"""
    now = datetime.now()
    diff = now - dt
    
    if diff.days > 0:
        if diff.days == 1:
            return "1 day ago"
        return f"{diff.days} days ago"
    
    hours = diff.seconds // 3600
    if hours > 0:
        if hours == 1:
            return "1 hour ago"
        return f"{hours} hours ago"
    
    minutes = diff.seconds // 60
    if minutes > 0:
        if minutes == 1:
            return "1 minute ago"
        return f"{minutes} minutes ago"
    
    return "Just now"


def _extract_tags(topic: Dict) -> List[str]:
    """Extract relevant tags from topic"""
    tags = []
    
    category = topic.get("category", "")
    if category == "technology":
        tags.append("tech")
    elif category == "finance":
        tags.append("finance")
    elif category == "politics":
        tags.append("politics")
    
    if len(topic.get("sources", [])) >= 3:
        tags.append("multi-source")
    
    if topic.get("history_point_count", 0) >= 3:
        tags.append("developing-story")
    
    return tags


async def search_topics(query: str, category: Optional[str] = None, limit: int = 50) -> Dict:
    """
    Search topics by query string across multiple fields
    
    Args:
        query: Search query string
        category: Optional category filter (None or 'all' for all categories)
        limit: Maximum number of results to return
        
    Returns:
        Dict with query info and matching topics
    """
    from app.db import db
    
    # Build search query
    search_query = {
        "status": "active",
        "has_title": True
    }
    
    # Add category filter if provided and not "all"
    if category and category != "all":
        search_query["category"] = category
    
    # Search in title, summary, category using regex (case-insensitive)
    search_pattern = {"$regex": query, "$options": "i"}
    search_query["$or"] = [
        {"title": search_pattern},
        {"summary": search_pattern},
        {"category": search_pattern}
    ]
    
    # Fetch topics
    cursor = db["topics"].find(search_query).limit(limit)
    
    topics = []
    async for topic in cursor:
        time_ago = _format_time_ago(topic["last_updated"])
        tags = _extract_tags(topic)
        
        topics.append({
            "id": str(topic["_id"]),
            "title": topic["title"],
            "summary": topic.get("summary"),
            "category": topic["category"],
            "article_count": topic.get("article_count", 0),
            "confidence_score": topic.get("confidence", 0),
            "last_updated": topic["last_updated"].isoformat(),
            "time_ago": time_ago,
            "tags": tags,
            "image_url": topic.get("image_url"),
            "history_point_count": topic.get("history_point_count", 0),
            "development_note": topic.get("development_note")
        })
    
    return {
        "query": query,
        "category": category or "all",
        "topics": topics,
        "count": len(topics)
    }