# app/controllers/user_controller.py
from datetime import datetime
from app.db import db, get_database
from app.models.user import UserProfile, UserPreferences

async def create_user_profile(firebase_user: dict) -> UserProfile:
    """Create a new user profile in MongoDB"""
    # Use the global db for main thread operations
    database = db if db is not None else get_database()
    
    firebase_uid = firebase_user["uid"]
    email = firebase_user.get("email")
    full_name = firebase_user.get("name", "")

    # Check if user exists
    existing = await database["users"].find_one({"firebase_uid": firebase_uid})
    if existing:
        raise Exception("User profile already exists")

    # Create user
    profile_data = {
        "firebase_uid": firebase_uid,
        "email": email,
        "full_name": full_name,
        "created_at": datetime.utcnow(),
        "preferences": UserPreferences().dict(),
    }

    result = await database["users"].insert_one(profile_data)
    profile_data["id"] = str(result.inserted_id)
    
    return UserProfile(**profile_data)

async def get_user_profile(firebase_uid: str):
    """Get user profile from MongoDB"""
    # Use the global db for main thread operations
    database = db if db is not None else get_database()
    
    data = await database["users"].find_one({"firebase_uid": firebase_uid})
    if not data:
        return None

    data["id"] = str(data["_id"])
    return UserProfile(**data)