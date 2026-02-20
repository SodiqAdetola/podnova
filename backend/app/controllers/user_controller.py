# app/controllers/user_controller.py
from datetime import datetime
from typing import Optional, Dict
from app.db import db
from app.models.user import UserProfile, UserPreferences


async def create_user_profile(firebase_user: dict) -> UserProfile:
    """Create a new user profile in MongoDB"""
    firebase_uid = firebase_user["uid"]
    email = firebase_user.get("email")
    full_name = firebase_user.get("name", email.split("@")[0] if email else "User")

    # Check if user exists
    existing = await db["users"].find_one({"firebase_uid": firebase_uid})
    if existing:
        # Return existing profile instead of error
        existing["id"] = str(existing["_id"])
        return UserProfile(**existing)

    # Create default preferences
    default_prefs = UserPreferences(
        default_categories=[],
        default_podcast_length="medium",
        default_tone="factual",
        playback_speed=1.0,
        push_notifications=True,
        default_voice="calm_female",
        default_ai_style="balanced"
    )

    # Create user document
    profile_data = {
        "firebase_uid": firebase_uid,
        "email": email,
        "full_name": full_name,
        "created_at": datetime.utcnow(),
        "preferences": default_prefs.dict(),
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
    """
    Update user preferences
    
    Args:
        firebase_uid: Firebase UID of the user
        preference_updates: Dictionary of preference fields to update
        
    Returns:
        Updated UserProfile
    """
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