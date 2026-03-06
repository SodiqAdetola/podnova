# app/controllers/podcast_controller.py
"""
PodNova Podcast Generation Controller
Orchestrates podcast generation workflow using service layer
"""
from datetime import datetime
from typing import Dict, Optional, List
from bson import ObjectId
import asyncio
from enum import Enum
import traceback

from app.db import db
from app.services.script_service import ScriptService
from app.services.audio_service import AudioService
from app.services.storage_service import StorageService
from app.services.user_service import UserService
from app.services.notification_service import notification_service
from app.monitor import thread_monitor

from fastapi import UploadFile
from app.services.file_service import file_service


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
    PodcastVoice.CALM_FEMALE: "en-US-Chirp3-HD-Autonoe",       # Stable, high-clarity anchor for technical reporting
    PodcastVoice.CALM_MALE: "en-US-Chirp3-HD-Orus",            # Grounded baritone with premium authoritative resonance
    PodcastVoice.ENERGETIC_FEMALE: "en-US-Chirp3-HD-Zephyr",    # Highly dynamic with natural breath and conversational arc
    PodcastVoice.ENERGETIC_MALE: "en-US-Chirp3-HD-Schedar",     # Versatile narrator with modern podcast-host pacing
    PodcastVoice.PROFESSIONAL_FEMALE: "en-US-Chirp3-HD-Aoede", # Sophisticated reporter with superior punctuation handling
    PodcastVoice.PROFESSIONAL_MALE: "en-US-Chirp3-HD-Charon",  # Clinical precision for data-heavy and technical analysis
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
    """Create a new podcast generation job"""
    user_profile = await user_service.get_user_profile(user_id)
    
    if user_profile:
        prefs = user_profile.preferences
        if length_minutes is None:
            length_minutes = PODCAST_LENGTH_MAP.get(prefs.default_podcast_length, 5)
        if style is None:
            style = TONE_TO_STYLE_MAP.get(prefs.default_tone, PodcastStyle.STANDARD)
        if voice is None:
            voice = PodcastVoice.CALM_FEMALE
    else:
        voice = voice or PodcastVoice.CALM_FEMALE
        style = style or PodcastStyle.STANDARD
        length_minutes = length_minutes or 5
    
    try:
        topic = await db["topics"].find_one({"_id": ObjectId(topic_id)})
    except:
        raise ValueError("Invalid topic ID")
    
    if not topic:
        raise ValueError("Topic not found")
    
    podcast_doc = {
        "user_id": user_id,
        "topic_id": ObjectId(topic_id),
        "topic_title": topic["title"],
        "category": topic.get("category", "general"),
        "status": PodcastStatus.PENDING,
        "voice": voice,
        "style": style,
        "length_minutes": length_minutes,
        "custom_prompt": custom_prompt,
        "focus_areas": focus_areas or [],
        "estimated_credits": length_minutes,
        "credits_used": 0,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "script": None,
        "audio_url": None,
        "transcript_url": None,
        "duration_seconds": None,
        "error_message": None
    }
    
    result = await db["podcasts"].insert_one(podcast_doc)
    podcast_id = str(result.inserted_id)
    
    # Only pass the podcast_id to match the updated background task signature
    asyncio.create_task(_generate_podcast_async(podcast_id))
    
    return {
        "id": podcast_id,
        "status": PodcastStatus.PENDING,
        "topic_id": topic_id,
        "topic_title": topic["title"],
        "estimated_time_seconds": length_minutes * 60,
        "estimated_credits": length_minutes,
        "message": "Podcast generation started. Check the Library tab for updates."
    }



async def create_custom_podcast(
    user_id: str,
    files: List[UploadFile],
    title: str,
    custom_prompt: str,
    voice: str,
    style: str,
    length_minutes: int
) -> Dict:
    """Extract text from files and create a custom podcast job"""
    
    # 1. Extract text from all uploaded files
    extracted_text = ""
    if files:
        for file in files:
            extracted_text += await file_service.extract_text(file)
            
    # 2. Create the Database Record
    podcast_doc = {
        "user_id": user_id,
        "topic_id": None, # No associated news topic
        "topic_title": title,
        "category": "custom",
        "is_custom": True, # Crucial flag
        "custom_source_text": extracted_text,
        "custom_prompt": custom_prompt,
        "status": PodcastStatus.PENDING,
        "voice": voice,
        "style": style,
        "length_minutes": length_minutes,
        "estimated_credits": length_minutes,
        "credits_used": 0,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "script": None,
        "audio_url": None,
        "transcript_url": None,
        "duration_seconds": None,
        "error_message": None
    }
    
    result = await db["podcasts"].insert_one(podcast_doc)
    podcast_id = str(result.inserted_id)
    
    # 3. Trigger background generation
    asyncio.create_task(_generate_podcast_async(podcast_id))
    
    return {
        "id": podcast_id,
        "status": PodcastStatus.PENDING,
        "estimated_time_seconds": length_minutes * 60,
        "message": "Custom podcast generation started."
    }



async def _generate_podcast_async(podcast_id: str):
    """Async task to generate podcast script and audio"""
    thread_monitor.start_task()
    try:
        # Fetch the initial podcast document
        podcast = await db["podcasts"].find_one({"_id": ObjectId(podcast_id)})
        if not podcast:
            print(f"❌ Podcast {podcast_id} not found in DB. Aborting.")
            return

        await _update_podcast_status(podcast_id, PodcastStatus.GENERATING_SCRIPT)
        
        if podcast.get("is_custom"):
            script = await script_service.generate_custom_script(podcast_id)
        else:
            script = await script_service.generate_script(podcast_id)  
                  
        await _update_podcast_status(
            podcast_id, 
            PodcastStatus.GENERATING_AUDIO,
            {"script": script}
        )
        
        audio_data, duration = await _generate_audio_for_podcast(podcast_id, script)
        
        await _update_podcast_status(
            podcast_id,
            PodcastStatus.UPLOADING,
            {"duration_seconds": duration}
        )
        
        audio_url, transcript_url = await storage_service.upload_podcast_files(
            podcast_id,
            audio_data,
            script
        )
        
        credits_used = max(1, int(duration / 60))
        
        await _update_podcast_status(
            podcast_id,
            PodcastStatus.COMPLETED,
            {
                "audio_url": audio_url,
                "transcript_url": transcript_url,
                "credits_used": credits_used,
                "completed_at": datetime.utcnow()
            }
        )
        
        # PROTECTED NOTIFICATION BLOCK
        try:
            print(f"🔔 Attempting to trigger podcast notification for {podcast_id}")
            
            # Fetch fresh podcast document to ensure we have the absolute latest data
            final_podcast = await db["podcasts"].find_one({"_id": ObjectId(podcast_id)})
            if final_podcast:
                topic_title = str(final_podcast.get("topic_title", "Recent News"))
                user_id_str = str(final_podcast.get("user_id"))
                
                await notification_service.create_podcast_ready_notification(
                    user_id=user_id_str,
                    podcast_id=podcast_id,
                    topic_title=topic_title
                )
                print(f"  ✅ Podcast notification queued successfully")
        except Exception as notif_e:
            print(f"⚠️ Non-fatal error creating podcast notification: {notif_e}")
            traceback.print_exc()
        
    except Exception as e:
        print(f"❌ Fatal error in podcast generation: {e}")
        await _update_podcast_status(
            podcast_id,
            PodcastStatus.FAILED,
            {"error_message": str(e)}
        )
    finally:
        thread_monitor.end_task()



async def _update_podcast_status(
    podcast_id: str,
    status: PodcastStatus,
    additional_fields: Optional[Dict] = None
):
    update_fields = {
        "status": status,
        "updated_at": datetime.utcnow()
    }
    if additional_fields:
        update_fields.update(additional_fields)
    
    await db["podcasts"].update_one(
        {"_id": ObjectId(podcast_id)},
        {"$set": update_fields}
    )


async def _generate_audio_for_podcast(podcast_id: str, script: str) -> tuple[bytes, int]:
    podcast = await db["podcasts"].find_one({"_id": ObjectId(podcast_id)})
    voice_name = VOICE_CONFIGS[podcast["voice"]]
    
    user_profile = await user_service.get_user_profile(podcast["user_id"])
    
    try:
        speaking_rate = user_service.calculate_speaking_rate(user_profile)
    except Exception:
        speaking_rate = 1.0
        
    return await audio_service.generate_audio(script, voice_name, speaking_rate)


async def get_user_podcasts(
    user_id: str,
    status: Optional[str] = None,
    limit: int = 50,
    skip: int = 0
) -> List[Dict]:
    """Get all podcasts for a user, automatically failing zombie jobs"""
    query = {"user_id": user_id}
    if status:
        query["status"] = status
    
    # ZOMBIE CLEANUP: If a podcast has been "generating" for more than 15 minutes, fail it.
    fifteen_mins_ago = datetime.utcnow().timestamp() - 900
    zombie_query = {
        "user_id": user_id,
        "status": {"$in": [PodcastStatus.PENDING, PodcastStatus.GENERATING_SCRIPT, PodcastStatus.GENERATING_AUDIO, PodcastStatus.UPLOADING]},
    }
    
    # We find zombies and mark them failed so the UI doesn't spin forever
    zombies = db["podcasts"].find(zombie_query)
    async for zombie in zombies:
        zombie_time = zombie.get("updated_at")
        if zombie_time:
            if isinstance(zombie_time, datetime):
                z_ts = zombie_time.timestamp()
            elif isinstance(zombie_time, str):
                z_ts = datetime.fromisoformat(zombie_time.replace("Z", "+00:00")).timestamp()
            else:
                continue
                
            if z_ts < fifteen_mins_ago:
                await db["podcasts"].update_one(
                    {"_id": zombie["_id"]},
                    {"$set": {"status": PodcastStatus.FAILED, "error_message": "Generation timed out."}}
                )

    podcasts = []
    cursor = db["podcasts"].find(query).sort("created_at", -1).skip(skip).limit(limit)
    
    async for podcast in cursor:
        # Check if topic is updated
        has_update = False
        if not podcast.get("is_custom") and podcast.get("topic_id"):
            topic = await db["topics"].find_one(
                {"_id": ObjectId(podcast["topic_id"])}, 
                {"last_history_point": 1} # <--- CHANGED THIS TO CHECK HISTORY
            )
            
            if topic and topic.get("last_history_point"):
                # Use completed_at so the tag clears out after regeneration finishes!
                compare_time = podcast.get("completed_at") or podcast.get("created_at")
                
                # Compare timezone-naive datetimes safely
                topic_time = topic["last_history_point"]
                if hasattr(topic_time, 'tzinfo') and topic_time.tzinfo:
                    topic_time = topic_time.replace(tzinfo=None)
                if hasattr(compare_time, 'tzinfo') and compare_time.tzinfo:
                    compare_time = compare_time.replace(tzinfo=None)

                if topic_time > compare_time:
                    has_update = True

        podcasts.append({
            "id": str(podcast["_id"]),
            "topic_id": str(podcast["topic_id"]) if podcast.get("topic_id") else None,
            "topic_title": podcast["topic_title"],
            "category": podcast["category"],
            "is_custom": podcast.get("is_custom", False),
            "status": podcast["status"],
            "voice": podcast["voice"],
            "style": podcast["style"],
            "length_minutes": podcast["length_minutes"],
            "duration_seconds": podcast.get("duration_seconds"),
            "audio_url": podcast.get("audio_url"),
            "transcript_url": podcast.get("transcript_url"),
            "script": podcast.get("script"),
            "credits_used": podcast.get("credits_used", 0),
            "created_at": podcast["created_at"].isoformat() if isinstance(podcast.get("created_at"), datetime) else podcast.get("created_at"),
            "completed_at": podcast.get("completed_at").isoformat() if isinstance(podcast.get("completed_at"), datetime) else podcast.get("completed_at"),
            "error_message": podcast.get("error_message"),
            "has_topic_update": has_update
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
        "topic_id": str(podcast["topic_id"]) if podcast.get("topic_id") else None,
        "topic_title": podcast["topic_title"],
        "category": podcast["category"],
        "is_custom": podcast.get("is_custom", False),
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
        "created_at": podcast["created_at"].isoformat() if isinstance(podcast.get("created_at"), datetime) else podcast.get("created_at"),
        "updated_at": podcast["updated_at"].isoformat() if isinstance(podcast.get("updated_at"), datetime) else podcast.get("updated_at"),
        "completed_at": podcast.get("completed_at").isoformat() if isinstance(podcast.get("completed_at"), datetime) else podcast.get("completed_at"),
        "error_message": podcast.get("error_message")
    }


async def regenerate_podcast(
    podcast_id: str,
    voice: Optional[str] = None,
    style: Optional[str] = None,
    length_minutes: Optional[int] = None,
    custom_prompt: Optional[str] = None,
    focus_areas: Optional[List[str]] = None,
    focus_on_updates: Optional[bool] = False
) -> Dict:
    """Regenerate an existing podcast with updated settings"""
    podcast = await db["podcasts"].find_one({"_id": ObjectId(podcast_id)})
    if not podcast:
        raise ValueError("Podcast not found")
    
    # 🚨 CRITICAL FIX: Delete the old audio files from Cloud Storage
    if podcast.get("audio_url"):
        try:
            from app.services.storage_service import storage_service
            # Delete the old files so we don't pay for orphaned data
            await storage_service.delete_podcast_files(podcast_id)
        except Exception as e:
            print(f"Warning: Failed to delete old storage files during regeneration: {e}")
    
    # Update settings if provided
    update_fields = {"updated_at": datetime.utcnow(), "status": PodcastStatus.PENDING}
    
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
    
    # Clear previous results so the UI knows it is empty
    update_fields.update({
        "script": None,
        "audio_url": None,
        "transcript_url": None,
        "duration_seconds": None,
        "error_message": None,
        "completed_at": None,
        "is_regenerated": True,
        "focus_on_updates": focus_on_updates
    })
    
    await db["podcasts"].update_one(
        {"_id": ObjectId(podcast_id)},
        {"$set": update_fields}
    )
    
    # Start the generation task in the background
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