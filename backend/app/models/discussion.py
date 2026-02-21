# app/models/discussion.py
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from enum import Enum


class DiscussionType(str, Enum):
    TOPIC = "topic"  # Auto-created for each news topic
    COMMUNITY = "community"  # User-created general discussion


class AnalysisResult(BaseModel):
    """AI analysis of reply content"""
    factual_score: int = Field(ge=0, le=100, description="0-100% factual")
    confidence: str = Field(description="low, medium, high")
    disclaimer: str = "AI-generated analysis. Not a definitive assessment."
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class Discussion(BaseModel):
    id: Optional[str] = None
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., min_length=1, max_length=2000)
    discussion_type: DiscussionType
    topic_id: Optional[str] = None  # REQUIRED if type is "topic"
    category: Optional[str] = None  # technology, finance, politics
    tags: List[str] = Field(default_factory=list, max_items=5)
    
    # User info
    user_id: Optional[str] = None  # None for auto-created topic discussions
    username: Optional[str] = "PodNova AI"  # "PodNova AI" for auto-created
    
    # Engagement metrics
    reply_count: int = 0
    upvote_count: int = 0
    view_count: int = 0
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_activity: datetime = Field(default_factory=datetime.utcnow)
    
    # Status
    is_active: bool = True
    is_pinned: bool = False
    is_auto_created: bool = False  # True for topic discussions
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class CreateDiscussionRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., min_length=1, max_length=2000)
    tags: List[str] = Field(default_factory=list, max_items=5)
    category: Optional[str] = None
    
    # Community discussions only - no topic_id allowed
    # Topic discussions are auto-created by the system


class Reply(BaseModel):
    id: Optional[str] = None
    discussion_id: str
    parent_reply_id: Optional[str] = None  # For nested replies
    
    content: str = Field(..., min_length=1, max_length=1000)
    
    # AI Analysis (computed by Gemini)
    analysis: Optional[AnalysisResult] = None
    
    # User info
    user_id: str
    username: str
    
    # Engagement
    upvote_count: int = 0
    is_upvoted_by_user: bool = False
    
    # Mentions
    mentions: List[str] = Field(default_factory=list)  # List of usernames mentioned
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None
    
    # Status
    is_deleted: bool = False
    is_edited: bool = False
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class CreateReplyRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=1000)
    parent_reply_id: Optional[str] = None


class Notification(BaseModel):
    id: Optional[str] = None
    user_id: str  # Who receives the notification
    
    # Notification type
    type: str  # "mention", "reply", "upvote"
    
    # Reference to source
    discussion_id: str
    reply_id: Optional[str] = None
    
    # Actor (who triggered the notification)
    actor_user_id: str
    actor_username: str
    
    # Content preview
    preview: str
    
    # Status
    is_read: bool = False
    
    # Timestamp
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class DiscussionWithReplies(BaseModel):
    discussion: Discussion
    replies: List[Reply]
    user_has_upvoted: bool = False
    total_replies: int = 0