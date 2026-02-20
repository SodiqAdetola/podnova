# app/models/user.py
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field


class UserPreferences(BaseModel):
    """User preferences for podcast generation and playback"""
    
    # Podcast generation preferences
    default_categories: List[str] = Field(default_factory=list, description="Preferred news categories")
    default_podcast_length: str = Field(default="medium", description="short, medium, or long")
    default_tone: str = Field(default="factual", description="factual, casual, analytical, or expert")
    
    # Playback preferences
    playback_speed: float = Field(default=1.0, ge=0.5, le=2.0, description="Default playback speed")
    
    # Notification preferences
    push_notifications: bool = Field(default=True, description="Enable push notifications")
    
    # AI preferences
    default_voice: str = Field(default="calm_female", description="Default TTS voice")
    default_ai_style: str = Field(default="balanced", description="AI generation style")
    
    class Config:
        schema_extra = {
            "example": {
                "default_categories": ["technology", "finance"],
                "default_podcast_length": "medium",
                "default_tone": "factual",
                "playback_speed": 1.0,
                "push_notifications": True,
                "default_voice": "calm_female",
                "default_ai_style": "balanced"
            }
        }


class UserProfile(BaseModel):
    """Complete user profile"""
    
    id: str
    firebase_uid: str
    email: EmailStr
    full_name: str
    created_at: datetime
    preferences: UserPreferences
    
    class Config:
        schema_extra = {
            "example": {
                "id": "507f1f77bcf86cd799439011",
                "firebase_uid": "abc123xyz789",
                "email": "user@example.com",
                "full_name": "John Doe",
                "created_at": "2024-01-01T00:00:00",
                "preferences": {
                    "default_categories": ["technology"],
                    "default_podcast_length": "medium",
                    "default_tone": "factual",
                    "playback_speed": 1.0,
                    "push_notifications": True,
                    "default_voice": "calm_female",
                    "default_ai_style": "balanced"
                }
            }
        }