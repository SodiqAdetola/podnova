# app/controllers/user_controller.py
from datetime import datetime
from bson.objectid import ObjectId
from app.db import db
from app.models.user import UserProfile, UserPreferences

async def create_user_profile(firebase_user: dict) -> UserProfile:
    """
    Create a new user profile in MongoDB.
    If the user already exists, raise an error.
    """
    firebase_uid = firebase_user["uid"]
    email = firebase_user.get("email")
    full_name = firebase_user.get("name", "")

    existing = await db["users"].find_one({"firebase_uid": firebase_uid})
    if existing:
        raise Exception("User profile already exists")

    profile_data = {
        "firebase_uid": firebase_uid,
        "email": email,
        "full_name": full_name,
        "created_at": datetime.utcnow(),
        "preferences": UserPreferences().dict(),
    }

    result = await db["users"].insert_one(profile_data)
    profile_data["id"] = str(result.inserted_id)
    return UserProfile(**profile_data)


async def get_user_profile(firebase_uid: str):
    """
    Get an existing user profile from MongoDB.
    """
    data = await db["users"].find_one({"firebase_uid": firebase_uid})
    if not data:
        return None

    data["id"] = str(data["_id"])
    return UserProfile(**data)


