# app/models/user.py
from datetime import datetime
from typing import List
from pydantic import BaseModel, EmailStr, Field


class UserPreferences(BaseModel):
    default_categories: List[str] = Field(default_factory=list)
    default_podcast_length: str = "medium"
    default_tone: str = "factual"
    playback_speed: float = 1.0


class UserProfile(BaseModel):
    id: str
    firebase_uid: str
    email: EmailStr
    full_name: str
    created_at: datetime
    preferences: UserPreferences



