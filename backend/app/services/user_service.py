# backend/app/services/user_service.py
"""
User service for managing user profiles, preferences, and optimized authentication
Includes high-speed token caching to reduce Firebase network latency.
"""
from typing import Optional, Dict
from datetime import datetime
import time
from firebase_admin import auth
from app.db import db
from app.models.user import UserProfile, UserPreferences

# Local cache to prevent redundant Firebase API calls
# Schema: { "token_string": {"uid": "user123", "expires": 1700000000} }
_VERIFIED_TOKEN_CACHE: Dict[str, Dict] = {}

class UserService:
    """Service for user-related operations including auth and profiles"""

    async def verify_firebase_token(self, id_token: str) -> Optional[str]:
        """Verify Firebase token with local caching for extreme speed"""
        if not id_token:
            return None
        
        # 1. Check local memory cache first
        now = time.time()
        if id_token in _VERIFIED_TOKEN_CACHE:
            cached = _VERIFIED_TOKEN_CACHE[id_token]
            if now < cached["expires"]:
                # Token is still valid in our local cache, return UID instantly
                return cached["uid"]
        
        try:
            # 2. If not in cache, call Firebase (Network Latency occurs here)
            decoded_token = auth.verify_id_token(id_token)
            uid = decoded_token['uid']
            
            # 3. Store in cache for 5 minutes (300 seconds)
            _VERIFIED_TOKEN_CACHE[id_token] = {
                "uid": uid,
                "expires": now + 300  
            }
            return uid
        except Exception as e:
            print(f"Firebase Auth error: {e}")
            return None

    def get_auth_header(self, authorization: str = None) -> str:
        """Helper to extract token from Bearer string"""
        if not authorization or not authorization.startswith("Bearer "):
            return ""
        return authorization.split("Bearer ")[1]
    
    async def get_user_profile(self, user_id: str) -> Optional[UserProfile]:
        """
        Fetch user profile from MongoDB
        
        Args:
            user_id: Firebase UID of the user
            
        Returns:
            UserProfile object or None if not found
        """
        try:
            user_doc = await db["users"].find_one({"firebase_uid": user_id})
            if not user_doc:
                return None
            
            # Convert MongoDB document to UserProfile
            return UserProfile(
                id=str(user_doc["_id"]),
                firebase_uid=user_doc.get("firebase_uid", ""),
                email=user_doc.get("email", ""),
                username=user_doc.get("username", ""),
                created_at=user_doc.get("created_at", datetime.now()),
                preferences=UserPreferences(**user_doc.get("preferences", {}))
            )
        except Exception as e:
            print(f"Error fetching user profile: {str(e)}")
            return None
    
