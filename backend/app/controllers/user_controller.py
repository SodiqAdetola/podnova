"""
User Controller – manages user profiles, preferences, push tokens,
blocked users, and account deletion.
"""
from datetime import datetime
from typing import Optional, Dict, List
from bson import ObjectId
from app.db import db
from app.models.user import UserProfile, UserPreferences
from app.middleware import firebase_auth
from app.services.storage_service import StorageService

storage_service = StorageService()


async def create_user_profile(firebase_user: dict) -> UserProfile:
    """
    Create a new user profile in MongoDB after Firebase authentication.

    If a profile already exists, it returns the existing one.
    """
    firebase_uid = firebase_user["uid"]
    email = firebase_user.get("email")
    username = firebase_user.get("name", email.split("@")[0] if email else "User")

    existing = await db["users"].find_one({"firebase_uid": firebase_uid})
    if existing:
        existing["id"] = str(existing["_id"])
        return UserProfile(**existing)

    # Default preferences.
    default_prefs = UserPreferences(
        default_categories=[],
        default_podcast_length="short",
        default_tone="factual",
        playback_speed=1.0,
        push_notifications=True,
        default_voice="calm_female",
        default_ai_style="standard"
    )

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
    """Retrieve a user profile from MongoDB by Firebase UID."""
    data = await db["users"].find_one({"firebase_uid": firebase_uid})
    if not data:
        return None

    data["id"] = str(data["_id"])
    return UserProfile(**data)


async def update_user_preferences(
    firebase_uid: str,
    preference_updates: Dict
) -> UserProfile:
    """
    Update user preferences (e.g., default voice, length, push settings).

    Merges the provided updates into the existing preferences document.
    """
    user = await db["users"].find_one({"firebase_uid": firebase_uid})
    if not user:
        raise ValueError("User profile not found")
    
    current_prefs = user.get("preferences", {})
    
    # Merge only the keys that are provided.
    for key, value in preference_updates.items():
        if value is not None:
            current_prefs[key] = value
    
    await db["users"].update_one(
        {"firebase_uid": firebase_uid},
        {"$set": {"preferences": current_prefs}}
    )
    
    updated_user = await db["users"].find_one({"firebase_uid": firebase_uid})
    updated_user["id"] = str(updated_user["_id"])
    
    return UserProfile(**updated_user)


async def save_push_token(firebase_uid: str, token: str) -> bool:
    """Save the Expo push notification token for the user."""
    result = await db["users"].update_one(
        {"firebase_uid": firebase_uid},
        {"$set": {"expo_push_token": token}}
    )
    return result.modified_count > 0 or result.matched_count > 0


async def get_user_stats_data(user_uid: str) -> dict:
    """
    Calculate user statistics: number of completed podcasts,
    total listening duration, and credits used.
    """
    podcasts_cursor = db["podcasts"].find({"user_id": user_uid})
    podcasts = []
    async for p in podcasts_cursor:
        podcasts.append(p)
    
    completed = len([p for p in podcasts if p.get("status") == "completed"])
    total_duration = sum(p.get("duration_seconds", 0) for p in podcasts if p.get("duration_seconds"))
    
    return {
        "podcasts": completed,
        "discussions": 0,          # To be implemented in a future iteration.
        "followers": 0,            # To be implemented in a future iteration.
        "total_duration_minutes": round(total_duration / 60, 1) if total_duration else 0,
        "credits_used": sum(p.get("credits_used", 0) for p in podcasts)
    }


async def block_target_user(user_uid: str, target_uid: str) -> bool:
    """Add a target user to the current user's blocked list."""
    result = await db["users"].update_one(
        {"firebase_uid": user_uid},
        {"$addToSet": {"blocked_users": target_uid}}
    )
    return result.modified_count > 0


async def get_blocked_users_list(user_uid: str) -> List[Dict]:
    """
    Fetch the list of blocked users with their usernames.

    Returns a list of objects containing firebase_uid and username.
    """
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
    """Remove a target user from the current user's blocked list."""
    result = await db["users"].update_one(
        {"firebase_uid": user_uid},
        {"$pull": {"blocked_users": target_uid}}
    )
    return result.modified_count > 0


async def report_reply_content(reply_id: str, reporter_uid: str) -> bool:
    """
    Report a reply for moderation.

    Inserts a report document and increments the reply's report count.
    """
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


async def delete_user_account(user_uid: str) -> bool:
    """
    Permanently delete a user's entire account and all associated data.

    This includes:
    - Podcasts, audio files, transcripts
    - Discussions, replies, upvotes, views
    - Notifications
    - The user profile in MongoDB
    - The user in Firebase Authentication
    """
    try:
        # Delete podcasts and their storage files.
        podcasts_cursor = db["podcasts"].find({"user_id": user_uid})
        async for podcast in podcasts_cursor:
            podcast_id = str(podcast["_id"])
            if podcast.get("audio_url"):
                try:
                    await storage_service.delete_podcast_files(podcast_id)
                except Exception as e:
                    print(f"Failed to delete storage files for {podcast_id}: {e}")
        
        await db["podcasts"].delete_many({"user_id": user_uid})

        # Delete discussions and related replies/views/upvotes.
        user_discussions = db["discussions"].find({"user_id": user_uid})
        async for disc in user_discussions:
            await db["replies"].delete_many({"discussion_id": str(disc["_id"])})
            await db["discussion_views"].delete_many({"discussion_id": str(disc["_id"])})
            await db["discussion_upvotes"].delete_many({"discussion_id": str(disc["_id"])})
            
        await db["discussions"].delete_many({"user_id": user_uid})

        # Delete all replies, upvotes, and views authored by the user.
        await db["replies"].delete_many({"user_id": user_uid})
        await db["discussion_upvotes"].delete_many({"user_id": user_uid})
        await db["reply_upvotes"].delete_many({"user_id": user_uid})
        await db["discussion_views"].delete_many({"user_id": user_uid})

        # Delete notifications.
        await db["notifications"].delete_many({"user_id": user_uid})

        # Delete the user profile from MongoDB.
        await db["users"].delete_one({"firebase_uid": user_uid})

        # Delete the user from Firebase Authentication.
        try:
            firebase_auth.delete_user(user_uid)
        except Exception as e:
            print(f"Warning: Failed to delete user from Firebase Auth: {e}")
            # Continue – the database cleanup was successful.

        return True
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise ValueError(f"Failed to delete account: {str(e)}")