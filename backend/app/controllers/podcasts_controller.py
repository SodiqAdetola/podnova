"""
PodNova Podcast Generation Controller
Orchestrates podcast generation workflow using service layer
"""
from datetime import datetime
from typing import Dict, Optional, List
from bson import ObjectId
import asyncio
from enum import Enum

from app.db import db
from app.services.script_service import ScriptService
from app.services.audio_service import AudioService
from app.services.storage_service import StorageService
from app.services.user_service import UserService
from app.monitor import thread_monitor  # Import from monitor.py instead of main


class PodcastStyle(str, Enum):
    CASUAL = "casual"
    STANDARD = "standard"
    ADVANCED = "advanced"
    EXPERT = "expert"


class PodcastStatus(str, Enum):
    PENDING = "pending"
    GENERATING_SCRIPT = "generating_script"
    GENERATING_AUDIO = "generating_audio"
    UPLOADING = "uploading"
    COMPLETED = "completed"
    FAILED = "failed"


class PodcastVoice(str, Enum):
    CALM_FEMALE = "calm_female"
    CALM_MALE = "calm_male"
    ENERGETIC_FEMALE = "energetic_female"
    ENERGETIC_MALE = "energetic_male"
    PROFESSIONAL_FEMALE = "professional_female"
    PROFESSIONAL_MALE = "professional_male"


# Voice configuration mapping
VOICE_CONFIGS = {
    PodcastVoice.CALM_FEMALE: "en-US-Chirp3-HD-Autonoe",
    PodcastVoice.CALM_MALE: "en-US-Chirp3-HD-Achird",
    PodcastVoice.ENERGETIC_FEMALE: "en-US-Chirp3-HD-Achernar",
    PodcastVoice.ENERGETIC_MALE: "en-US-Chirp3-HD-Fenrir",
    PodcastVoice.PROFESSIONAL_FEMALE: "en-US-Chirp3-HD-Aoede",
    PodcastVoice.PROFESSIONAL_MALE: "en-US-Chirp3-HD-Alnilam",
}

# Map user preferences to podcast settings
PODCAST_LENGTH_MAP = {
    "short": 5,
    "medium": 10,
    "long": 20
}

TONE_TO_STYLE_MAP = {
    "factual": PodcastStyle.STANDARD,
    "casual": PodcastStyle.CASUAL,
    "analytical": PodcastStyle.ADVANCED,
    "expert": PodcastStyle.EXPERT
}

# Initialize services
script_service = ScriptService()
audio_service = AudioService()
storage_service = StorageService()
user_service = UserService()


async def create_podcast(
    user_id: str,
    topic_id: str,
    voice: Optional[str] = None,
    style: Optional[str] = None,
    length_minutes: Optional[int] = None,
    custom_prompt: Optional[str] = None,
    focus_areas: Optional[List[str]] = None
) -> Dict:
    """
    Create a new podcast generation job
    Uses user preferences as defaults if parameters not provided
    """
    # Fetch user profile for defaults
    user_profile = await user_service.get_user_profile(user_id)
    
    # Apply user preferences as defaults
    if user_profile:
        prefs = user_profile.preferences
        
        if length_minutes is None:
            length_minutes = PODCAST_LENGTH_MAP.get(prefs.default_podcast_length, 5)
        
        if style is None:
            style = TONE_TO_STYLE_MAP.get(prefs.default_tone, PodcastStyle.STANDARD)
        
        if voice is None:
            voice = PodcastVoice.CALM_FEMALE
    else:
        # Fallback defaults
        voice = voice or PodcastVoice.CALM_FEMALE
        style = style or PodcastStyle.STANDARD
        length_minutes = length_minutes or 5
    
    # Verify topic exists
    try:
        topic = await db["topics"].find_one({"_id": ObjectId(topic_id)})
    except:
        raise ValueError("Invalid topic ID")
    
    if not topic:
        raise ValueError("Topic not found")
    
    # Create podcast document
    podcast_doc = {
        "user_id": user_id,
        "topic_id": ObjectId(topic_id),
        "topic_title": topic["title"],
        "category": topic["category"],
        "status": PodcastStatus.PENDING,
        "voice": voice,
        "style": style,
        "length_minutes": length_minutes,
        "custom_prompt": custom_prompt,
        "focus_areas": focus_areas or [],
        "estimated_credits": length_minutes,
        "credits_used": 0,
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
        "script": None,
        "audio_url": None,
        "transcript_url": None,
        "duration_seconds": None,
        "error_message": None
    }
    
    result = await db["podcasts"].insert_one(podcast_doc)
    podcast_id = result.inserted_id
    
    # Start async generation task
    asyncio.create_task(_generate_podcast_async(str(podcast_id)))
    
    return {
        "id": str(podcast_id),
        "status": PodcastStatus.PENDING,
        "topic_id": topic_id,
        "topic_title": topic["title"],
        "estimated_time_seconds": length_minutes * 60,
        "estimated_credits": length_minutes,
        "message": "Podcast generation started. Check the Library tab for updates."
    }


async def _generate_podcast_async(podcast_id: str):
    """Async task to generate podcast script and audio"""
    thread_monitor.start_task()  # Track thread usage
    try:
        # Update status: generating script
        await _update_podcast_status(podcast_id, PodcastStatus.GENERATING_SCRIPT)
        
        # Generate script using script service
        script = await script_service.generate_script(podcast_id)
        
        # Update status: generating audio
        await _update_podcast_status(
            podcast_id, 
            PodcastStatus.GENERATING_AUDIO,
            {"script": script}
        )
        
        # Generate audio using audio service
        audio_data, duration = await _generate_audio_for_podcast(podcast_id, script)
        
        # Update status: uploading
        await _update_podcast_status(
            podcast_id,
            PodcastStatus.UPLOADING,
            {"duration_seconds": duration}
        )
        
        # Upload to Firebase using storage service
        audio_url, transcript_url = await storage_service.upload_podcast_files(
            podcast_id,
            audio_data,
            script
        )
        
        # Calculate credits used
        credits_used = max(1, int(duration / 60))
        
        # Mark as completed
        await _update_podcast_status(
            podcast_id,
            PodcastStatus.COMPLETED,
            {
                "audio_url": audio_url,
                "transcript_url": transcript_url,
                "credits_used": credits_used,
                "completed_at": datetime.now()
            }
        )
        
    except Exception as e:
        # Mark as failed
        await _update_podcast_status(
            podcast_id,
            PodcastStatus.FAILED,
            {"error_message": str(e)}
        )
    finally:
        thread_monitor.end_task()  # Stop tracking


async def _update_podcast_status(
    podcast_id: str,
    status: PodcastStatus,
    additional_fields: Optional[Dict] = None
):
    """Helper to update podcast status"""
    update_fields = {
        "status": status,
        "updated_at": datetime.now()
    }
    
    if additional_fields:
        update_fields.update(additional_fields)
    
    await db["podcasts"].update_one(
        {"_id": ObjectId(podcast_id)},
        {"$set": update_fields}
    )


async def _generate_audio_for_podcast(podcast_id: str, script: str) -> tuple[bytes, int]:
    """Generate audio for podcast using audio service"""
    podcast = await db["podcasts"].find_one({"_id": ObjectId(podcast_id)})
    voice_name = VOICE_CONFIGS[podcast["voice"]]
    
    # Get user's speaking rate preference
    user_profile = await user_service.get_user_profile(podcast["user_id"])
    speaking_rate = 1.0  # Default speaking rate
    
    # Generate audio
    return await audio_service.generate_audio(script, voice_name, speaking_rate)


async def get_user_podcasts(
    user_id: str,
    status: Optional[str] = None,
    limit: int = 50,
    skip: int = 0
) -> List[Dict]:
    """Get all podcasts for a user"""
    query = {"user_id": user_id}
    if status:
        query["status"] = status
    
    podcasts = []
    cursor = db["podcasts"].find(query).sort("created_at", -1).skip(skip).limit(limit)
    
    async for podcast in cursor:
        podcasts.append({
            "id": str(podcast["_id"]),
            "topic_id": str(podcast["topic_id"]),
            "topic_title": podcast["topic_title"],
            "category": podcast["category"],
            "status": podcast["status"],
            "voice": podcast["voice"],
            "style": podcast["style"],
            "length_minutes": podcast["length_minutes"],
            "duration_seconds": podcast.get("duration_seconds"),
            "audio_url": podcast.get("audio_url"),
            "transcript_url": podcast.get("transcript_url"),
            "script": podcast.get("script"),
            "credits_used": podcast.get("credits_used", 0),
            "created_at": podcast["created_at"].isoformat(),
            "completed_at": podcast.get("completed_at").isoformat() if podcast.get("completed_at") else None,
            "error_message": podcast.get("error_message")
        })
    
    return podcasts


async def get_podcast_by_id(podcast_id: str) -> Optional[Dict]:
    """Get podcast details by ID"""
    try:
        podcast = await db["podcasts"].find_one({"_id": ObjectId(podcast_id)})
    except:
        return None
    
    if not podcast:
        return None
    
    return {
        "id": str(podcast["_id"]),
        "user_id": podcast["user_id"],
        "topic_id": str(podcast["topic_id"]),
        "topic_title": podcast["topic_title"],
        "category": podcast["category"],
        "status": podcast["status"],
        "voice": podcast["voice"],
        "style": podcast["style"],
        "length_minutes": podcast["length_minutes"],
        "custom_prompt": podcast.get("custom_prompt"),
        "focus_areas": podcast.get("focus_areas", []),
        "script": podcast.get("script"),
        "duration_seconds": podcast.get("duration_seconds"),
        "audio_url": podcast.get("audio_url"),
        "transcript_url": podcast.get("transcript_url"),
        "estimated_credits": podcast.get("estimated_credits", 0),
        "credits_used": podcast.get("credits_used", 0),
        "created_at": podcast["created_at"].isoformat(),
        "updated_at": podcast["updated_at"].isoformat(),
        "completed_at": podcast.get("completed_at").isoformat() if podcast.get("completed_at") else None,
        "error_message": podcast.get("error_message")
    }


async def regenerate_podcast(
    podcast_id: str,
    voice: Optional[str] = None,
    style: Optional[str] = None,
    length_minutes: Optional[int] = None,
    custom_prompt: Optional[str] = None,
    focus_areas: Optional[List[str]] = None
) -> Dict:
    """Regenerate an existing podcast with updated settings"""
    podcast = await db["podcasts"].find_one({"_id": ObjectId(podcast_id)})
    if not podcast:
        raise ValueError("Podcast not found")
    
    # Update settings if provided
    update_fields = {"updated_at": datetime.now(), "status": PodcastStatus.PENDING}
    
    if voice:
        update_fields["voice"] = voice
    if style:
        update_fields["style"] = style
    if length_minutes:
        update_fields["length_minutes"] = length_minutes
        update_fields["estimated_credits"] = length_minutes
    if custom_prompt is not None:
        update_fields["custom_prompt"] = custom_prompt
    if focus_areas is not None:
        update_fields["focus_areas"] = focus_areas
    
    # Clear previous results
    update_fields.update({
        "script": None,
        "audio_url": None,
        "transcript_url": None,
        "duration_seconds": None,
        "error_message": None,
        "completed_at": None
    })
    
    await db["podcasts"].update_one(
        {"_id": ObjectId(podcast_id)},
        {"$set": update_fields}
    )
    
    # Start regeneration
    asyncio.create_task(_generate_podcast_async(podcast_id))
    
    return {
        "id": podcast_id,
        "status": PodcastStatus.PENDING,
        "message": "Podcast regeneration started"
    }


async def delete_podcast(podcast_id: str, user_id: str) -> bool:
    """Delete a podcast (user must own it)"""
    podcast = await db["podcasts"].find_one({
        "_id": ObjectId(podcast_id),
        "user_id": user_id
    })
    
    if not podcast:
        return False
    
    # Delete from Firebase Storage if exists
    if podcast.get("audio_url"):
        await storage_service.delete_podcast_files(podcast_id)
    
    # Delete from MongoDB
    await db["podcasts"].delete_one({"_id": ObjectId(podcast_id)})
    
    return True