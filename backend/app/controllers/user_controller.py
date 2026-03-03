# app/controllers/user_controller.py
from datetime import datetime
from typing import Optional, Dict, List
from bson import ObjectId
from app.db import db
from app.models.user import UserProfile, UserPreferences


async def create_user_profile(firebase_user: dict) -> UserProfile:
    """Create a new user profile in MongoDB"""
    firebase_uid = firebase_user["uid"]
    email = firebase_user.get("email")
    username = firebase_user.get("name", email.split("@")[0] if email else "User")

    # Check if user exists
    existing = await db["users"].find_one({"firebase_uid": firebase_uid})
    if existing:
        # Return existing profile instead of error
        existing["id"] = str(existing["_id"])
        return UserProfile(**existing)

    # Create default preferences
    default_prefs = UserPreferences(
        default_categories=[],
        default_podcast_length="short",
        default_tone="factual",
        playback_speed=1.0,
        push_notifications=True,
        default_voice="calm_female",
        default_ai_style="standard"
    )

    # Create user document
    profile_data = {
        "firebase_uid": firebase_uid,
        "email": email,
        "username": username,
        "created_at": datetime.utcnow(),
        "preferences": default_prefs.dict(),
        "expo_push_token": None,
        "blocked_users": []
    }

    result = await db["users"].insert_one(profile_data)
    profile_data["id"] = str(result.inserted_id)
    
    return UserProfile(**profile_data)


async def get_user_profile(firebase_uid: str) -> Optional[UserProfile]:
    """Get user profile from MongoDB"""
    data = await db["users"].find_one({"firebase_uid": firebase_uid})
    if not data:
        return None

    data["id"] = str(data["_id"])
    return UserProfile(**data)


async def update_user_preferences(
    firebase_uid: str,
    preference_updates: Dict
) -> UserProfile:
    """Update user preferences"""
    # Get current profile
    user = await db["users"].find_one({"firebase_uid": firebase_uid})
    if not user:
        raise ValueError("User profile not found")
    
    # Update preferences fields
    current_prefs = user.get("preferences", {})
    
    # Merge updates into current preferences
    for key, value in preference_updates.items():
        if value is not None:  # Only update if value is provided
            current_prefs[key] = value
    
    # Update in database
    await db["users"].update_one(
        {"firebase_uid": firebase_uid},
        {"$set": {"preferences": current_prefs}}
    )
    
    # Fetch and return updated profile
    updated_user = await db["users"].find_one({"firebase_uid": firebase_uid})
    updated_user["id"] = str(updated_user["_id"])
    
    return UserProfile(**updated_user)


async def save_push_token(firebase_uid: str, token: str) -> bool:
    """Save the Expo push token to the user's profile."""
    result = await db["users"].update_one(
        {"firebase_uid": firebase_uid},
        {"$set": {"expo_push_token": token}}
    )
    return result.modified_count > 0 or result.matched_count > 0


async def get_user_stats_data(user_uid: str) -> dict:
    """Calculate and return user statistics from the database"""
    podcasts_cursor = db["podcasts"].find({"user_id": user_uid})
    podcasts = []
    async for p in podcasts_cursor:
        podcasts.append(p)
    
    completed = len([p for p in podcasts if p.get("status") == "completed"])
    total_duration = sum(p.get("duration_seconds", 0) for p in podcasts if p.get("duration_seconds"))
    
    return {
        "podcasts": completed,
        "discussions": 0,  # TODO: Implement when discussions feature is ready
        "followers": 0,    # TODO: Implement when social features are ready
        "total_duration_minutes": round(total_duration / 60, 1) if total_duration else 0,
        "credits_used": sum(p.get("credits_used", 0) for p in podcasts)
    }


async def block_target_user(user_uid: str, target_uid: str) -> bool:
    """Add a target user's UID to the current user's blocked list"""
    result = await db["users"].update_one(
        {"firebase_uid": user_uid},
        {"$addToSet": {"blocked_users": target_uid}}
    )
    return result.modified_count > 0


async def get_blocked_users_list(user_uid: str) -> List[Dict]:
    """Fetch the list of blocked users with their usernames"""
    user_doc = await db["users"].find_one({"firebase_uid": user_uid})
    if not user_doc:
        return []

    blocked_uids = user_doc.get("blocked_users", [])
    if not blocked_uids:
        return []

    blocked_users_cursor = db["users"].find({"firebase_uid": {"$in": blocked_uids}})
    blocked_users = []
    
    async for bu in blocked_users_cursor:
        blocked_users.append({
            "firebase_uid": bu["firebase_uid"],
            "username": bu.get("username", "Unknown User")
        })

    return blocked_users


async def unblock_target_user(user_uid: str, target_uid: str) -> bool:
    """Remove a target user's UID from the current user's blocked list"""
    result = await db["users"].update_one(
        {"firebase_uid": user_uid},
        {"$pull": {"blocked_users": target_uid}}
    )
    return result.modified_count > 0


async def report_reply_content(reply_id: str, reporter_uid: str) -> bool:
    """Log a report and flag the reply in the database"""
    report_data = {
        "reply_id": reply_id,
        "reporter_uid": reporter_uid,
        "created_at": datetime.utcnow(),
        "status": "pending_review"
    }
    await db["reports"].insert_one(report_data)
    
    if ObjectId.is_valid(reply_id):
        await db["replies"].update_one(
            {"_id": ObjectId(reply_id)},
            {"$inc": {"report_count": 1}}
        )
    return True