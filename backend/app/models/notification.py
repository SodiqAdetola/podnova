from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class NotificationType(str, Enum):
    REPLY = "reply"  # Someone replied to your discussion
    TOPIC_UPDATE = "topic_update"  # Watched topic has updates
    PODCAST_READY = "podcast_ready"  # Generated podcast is ready


class NotificationPriority(str, Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"


class Notification(BaseModel):
    id: Optional[str] = None
    user_id: str  # Who receives the notification
    
    type: NotificationType
    priority: NotificationPriority = NotificationPriority.NORMAL
    
    # Reference to source
    source_type: str  # "discussion", "topic", "podcast"
    source_id: str
    
    # Optional secondary reference (e.g., reply_id within a discussion)
    secondary_id: Optional[str] = None
    
    # Actor (who triggered the notification, if applicable)
    actor_user_id: Optional[str] = None
    actor_username: Optional[str] = None
    
    # Content
    title: str
    message: str
    preview: Optional[str] = None
    
    # Action URL/path
    action_path: Optional[str] = None
    
    # Status
    is_read: bool = False
    is_archived: bool = False
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    read_at: Optional[datetime] = None
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class NotificationResponse(BaseModel):
    id: str
    type: NotificationType
    priority: NotificationPriority
    source_type: str
    source_id: str
    secondary_id: Optional[str]
    actor_username: Optional[str]
    title: str
    message: str
    preview: Optional[str]
    action_path: Optional[str]
    is_read: bool
    created_at: str
    time_ago: str


class CreateNotificationRequest(BaseModel):
    user_id: str
    type: NotificationType
    priority: NotificationPriority
    source_type: str
    source_id: str
    secondary_id: Optional[str] = None
    actor_user_id: Optional[str] = None
    actor_username: Optional[str] = None
    title: str
    message: str
    preview: Optional[str] = None
    action_path: Optional[str] = None

class NotificationListResponse(BaseModel):
    notifications: List[NotificationResponse]
    total: int
    unread_count: int
    page: int
    limit: int