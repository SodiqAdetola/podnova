# app/services/user_service.py
"""
User service for managing user profiles and preferences
"""
from typing import Optional
from datetime import datetime
from app.db import db
from app.models.user import UserProfile, UserPreferences


class UserService:
    """Service for user-related operations"""
    
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
                full_name=user_doc.get("full_name", ""),
                created_at=user_doc.get("created_at", datetime.now()),
                preferences=UserPreferences(**user_doc.get("preferences", {}))
            )
        except Exception as e:
            print(f"Error fetching user profile: {str(e)}")
            return None
    
    def calculate_speaking_rate(
        self,
        user_profile: Optional[UserProfile],
        base_rate: float = 1.0
    ) -> float:
        """
        Calculate speaking rate based on user preferences
        
        Args:
            user_profile: The user's profile
            base_rate: Base speaking rate
            
        Returns:
            Adjusted speaking rate
        """
        if not user_profile:
            return base_rate
        
        # Adjust speaking rate based on user's playback speed preference
        adjustment = (user_profile.preferences.playback_speed - 1.0) * 0.3
        adjusted_rate = base_rate + adjustment
        
        # Clamp to valid range
        return max(0.8, min(1.25, adjusted_rate))