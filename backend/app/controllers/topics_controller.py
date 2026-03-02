# app/controllers/topics_controller.py
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from bson import ObjectId
from app.db import db
from app.ai_pipeline.topic_history import TopicHistoryService
from app.config import MONGODB_URI, MONGODB_DB_NAME
import traceback

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
        try:
            last_updated = topic.get("last_updated") or datetime.utcnow()
            time_ago = _format_time_ago(last_updated)
            last_updated_str = last_updated.isoformat() if hasattr(last_updated, 'isoformat') else str(last_updated)
            
            # SAFELY handle lists
            sources = topic.get("sources") or []
            
            topics.append({
                "id": str(topic["_id"]),
                "title": topic.get("title") or "Untitled",
                "summary": topic.get("summary") or "",
                "article_count": topic.get("article_count") or 0,
                "source_count": len(sources),
                "confidence": topic.get("confidence") or 0,
                "last_updated": last_updated_str,
                "time_ago": time_ago,
                "category": topic.get("category") or category,
                "image_url": topic.get("image_url"),
                "history_point_count": topic.get("history_point_count") or 0,
                "development_note": topic.get("development_note")
            })
        except Exception as e:
            print(f"Error mapping topic {topic.get('_id')}: {e}")
            continue
    
    return topics


async def get_topic_by_id(topic_id: str) -> Optional[Dict]:
    """Get full topic details including articles and history"""
    try:
        # Stop invalid IDs gracefully
        if not ObjectId.is_valid(topic_id):
            print(f"Invalid Topic ID passed to backend: {topic_id}")
            return None
            
        topic = await db["topics"].find_one({"_id": ObjectId(topic_id)})
    except Exception as e:
        print(f"Database error fetching topic: {e}")
        return None
    
    if not topic:
        return None
    
    try:
        # SAFELY handle null lists so len() and iterations don't crash
        article_ids = topic.get("article_ids") or []
        sources = topic.get("sources") or []
        key_insights = topic.get("key_insights") or []
        
        # Get all articles for this topic safely
        articles = []
        if article_ids:
            try:
                cursor = db["articles"].find({
                    "_id": {"$in": article_ids}
                }).sort("published_date", -1)
                
                async for article in cursor:
                    pub_date = article.get("published_date")
                    pub_date_str = pub_date.isoformat() if hasattr(pub_date, 'isoformat') else str(pub_date or "")
                    
                    articles.append({
                        "id": str(article["_id"]),
                        "title": article.get("title") or "Unknown Article",
                        "description": article.get("description") or "",
                        "url": article.get("url") or "",
                        "source": article.get("source") or "Unknown Source",
                        "published_date": pub_date_str,
                        "word_count": article.get("word_count") or 0,
                        "image_url": article.get("image_url")
                    })
            except Exception as e:
                print(f"Error fetching articles: {e}")
                traceback.print_exc()
        
        # Safely extract dates
        last_updated = topic.get("last_updated") or datetime.utcnow()
        time_ago = _format_time_ago(last_updated)
        last_updated_str = last_updated.isoformat() if hasattr(last_updated, 'isoformat') else str(last_updated)
        
        created_at = topic.get("created_at") or last_updated
        created_at_str = created_at.isoformat() if hasattr(created_at, 'isoformat') else str(created_at)
        
        tags = _extract_tags(topic)
        
        # Get history timeline safely
        history_timeline = []
        try:
            history_timeline = await history_service.get_topic_timeline(topic_id)
        except Exception as e:
            print(f"Error fetching history timeline: {e}")
        
        return {
            "id": str(topic["_id"]),
            "title": topic.get("title") or "Untitled",
            "summary": topic.get("summary") or "",
            "key_insights": key_insights,
            "category": topic.get("category") or "general",
            "article_count": topic.get("article_count") or 0,
            "source_count": len(sources),
            "sources": sources,
            "confidence": topic.get("confidence") or 0,
            "last_updated": last_updated_str,
            "time_ago": time_ago,
            "created_at": created_at_str,
            "articles": articles,
            "tags": tags,
            "has_podcast": False,
            "image_url": topic.get("image_url"),
            "history_point_count": topic.get("history_point_count") or 0,
            "history_timeline": history_timeline[:10] if history_timeline else [],
            "development_note": topic.get("development_note")
        }
    except Exception as parse_error:
        print(f"CRITICAL PARSE ERROR mapping get_topic_by_id for {topic_id}:")
        traceback.print_exc()
        raise parse_error


async def get_topic_history(topic_id: str, limit: int = 20) -> List[Dict]:
    """Get full history timeline for a topic"""
    try:
        if not ObjectId.is_valid(topic_id):
            return []
        return await history_service.get_topic_timeline(topic_id)
    except Exception as e:
        print(f"Error in get_topic_history: {e}")
        return []


async def force_history_check(topic_id: str) -> Dict:
    """Manually trigger history check for a topic (admin function)"""
    try:
        if not ObjectId.is_valid(topic_id):
            return {"error": "Invalid topic ID"}
        result = await history_service.check_and_create_history(topic_id)
        if not result:
            return {"error": "Topic not found or not active"}
        return result
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}


def _format_time_ago(dt) -> str:
    """Format datetime as relative time string safely"""
    try:
        if isinstance(dt, str):
            dt = datetime.fromisoformat(dt.replace('Z', '+00:00')).replace(tzinfo=None)
            
        if not isinstance(dt, datetime):
            return "Recently"
            
        now = datetime.utcnow()
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
    except Exception:
        return "Recently"


def _extract_tags(topic: Dict) -> List[str]:
    """Extract relevant tags from topic safely"""
    tags = []
    try:
        category = topic.get("category") or ""
        if category == "technology":
            tags.append("tech")
        elif category == "finance":
            tags.append("finance")
        elif category == "politics":
            tags.append("politics")
        
        # Safely get sources length
        sources = topic.get("sources") or []
        if len(sources) >= 3:
            tags.append("multi-source")
        
        # CRITICAL FIX: Safe integer evaluation 
        history_count = topic.get("history_point_count") or 0
        if history_count >= 3:
            tags.append("developing-story")
            
    except Exception as e:
        print(f"Error extracting tags: {e}")
        
    return tags


async def search_topics(query: str, category: Optional[str] = None, limit: int = 50) -> Dict:
    """Search topics by query string across multiple fields"""
    from app.db import db
    
    search_query = {
        "status": "active",
        "has_title": True
    }
    
    if category and category != "all":
        search_query["category"] = category
    
    search_pattern = {"$regex": query, "$options": "i"}
    search_query["$or"] = [
        {"title": search_pattern},
        {"summary": search_pattern},
        {"category": search_pattern}
    ]
    
    cursor = db["topics"].find(search_query).limit(limit)
    
    topics = []
    async for topic in cursor:
        try:
            last_updated = topic.get("last_updated") or datetime.utcnow()
            time_ago = _format_time_ago(last_updated)
            tags = _extract_tags(topic)
            
            last_updated_str = last_updated.isoformat() if hasattr(last_updated, 'isoformat') else str(last_updated)
            
            topics.append({
                "id": str(topic["_id"]),
                "title": topic.get("title") or "Untitled",
                "summary": topic.get("summary") or "",
                "category": topic.get("category") or "general",
                "article_count": topic.get("article_count") or 0,
                "confidence_score": topic.get("confidence") or 0,
                "last_updated": last_updated_str,
                "time_ago": time_ago,
                "tags": tags,
                "image_url": topic.get("image_url"),
                "history_point_count": topic.get("history_point_count") or 0,
                "development_note": topic.get("development_note")
            })
        except Exception as e:
            print(f"Error mapping search topic {topic.get('_id')}: {e}")
            continue
            
    return {
        "query": query,
        "category": category or "all",
        "topics": topics,
        "count": len(topics)
    }