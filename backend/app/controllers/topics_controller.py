# app/controllers/topics_controller.py
from datetime import datetime
from typing import List, Dict, Optional
from bson import ObjectId
from app.db import db, get_database  # Import both


async def get_all_categories() -> List[Dict]:
    """
    Get all categories with their active topic counts and trending info
    """
    # Use the global db for main thread operations
    database = db if db is not None else get_database()
    
    categories = ["technology", "finance", "politics"]
    result = []
    
    for category in categories:
        # Count active topics
        topic_count = await database["topics"].count_documents({
            "category": category,
            "status": "active",
            "has_title": True
        })
        
        # Get most recent topic for trending info
        recent_topic = await database["topics"].find_one(
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
    """
    Get topics for a specific category with sorting
    
    Args:
        category: Category name
        sort_by: Sorting option (latest, reliable, most_discussed)
    """
    # Use the global db for main thread operations
    database = db if db is not None else get_database()
    
    # Base query
    query = {
        "category": category,
        "status": "active",
        "has_title": True
    }
    
    # Determine sort order
    if sort_by == "latest":
        sort = [("last_updated", -1)]
    elif sort_by == "reliable":
        sort = [("confidence", -1), ("article_count", -1)]
    elif sort_by == "most_discussed":
        sort = [("article_count", -1)]
    else:
        sort = [("last_updated", -1)]
    
    # Fetch topics
    cursor = database["topics"].find(query).sort(sort).limit(50)
    topics = []
    
    async for topic in cursor:
        # Calculate time ago
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
            "image_url": topic.get("image_url")
        })
    
    return topics


async def get_topic_by_id(topic_id: str) -> Optional[Dict]:
    """
    Get full topic details including articles
    
    Args:
        topic_id: Topic ID
    """
    # Use the global db for main thread operations
    database = db if db is not None else get_database()
    
    try:
        topic = await database["topics"].find_one({"_id": ObjectId(topic_id)})
    except:
        return None
    
    if not topic:
        return None
    
    # Get all articles for this topic
    articles = []
    cursor = database["articles"].find({
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
            "image_url": topic.get("image_url")
        })
    
    # Format time ago
    time_ago = _format_time_ago(topic["last_updated"])
    
    # Extract tags from key insights (simple approach)
    tags = _extract_tags(topic)
    
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
        "image_url": topic.get("image_url")
    }


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
    """Extract relevant tags from topic - will be enhanced with AI later"""
    # TODO: Implement AI-based tag extraction
    # For now, return basic tags based on category
    tags = []
    
    category = topic.get("category", "")
    if category == "technology":
        tags.append("tech")
    elif category == "finance":
        tags.append("finance")
    elif category == "politics":
        tags.append("politics")
    
    # Add multi-source tag if applicable
    if len(topic.get("sources", [])) >= 3:
        tags.append("multi-source")
    
    return tags