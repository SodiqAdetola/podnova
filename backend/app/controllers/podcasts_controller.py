"""
PodNova Podcast Generation Controller
Orchestrates podcast generation workflow using service layer
"""
from datetime import datetime
from typing import Dict, Optional, List, Set
from bson import ObjectId
from enum import Enum
from fastapi import BackgroundTasks
import asyncio
import concurrent.futures
import threading

# Import service classes, not instances
from app.services.script_service import ScriptService
from app.services.audio_service import AudioService
from app.services.storage_service import StorageService
from app.services.user_service import UserService


# -------------------- Enums --------------------
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


# -------------------- Configs --------------------
VOICE_CONFIGS = {
    PodcastVoice.CALM_FEMALE: "en-US-Chirp3-HD-Autonoe",
    PodcastVoice.CALM_MALE: "en-US-Chirp3-HD-Achird",
    PodcastVoice.ENERGETIC_FEMALE: "en-US-Chirp3-HD-Achernar",
    PodcastVoice.ENERGETIC_MALE: "en-US-Chirp3-HD-Fenrir",
    PodcastVoice.PROFESSIONAL_FEMALE: "en-US-Chirp3-HD-Aoede",
    PodcastVoice.PROFESSIONAL_MALE: "en-US-Chirp3-HD-Alnilam",
}

PODCAST_LENGTH_MAP = {"short": 5, "medium": 10, "long": 20}
TONE_TO_STYLE_MAP = {
    "factual": PodcastStyle.STANDARD,
    "casual": PodcastStyle.CASUAL,
    "analytical": PodcastStyle.ADVANCED,
    "expert": PodcastStyle.EXPERT,
}

# -------------------- Thread Pool for Background Tasks --------------------
# Create a thread pool executor for CPU-intensive tasks
_thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=4)
# Track background tasks
_background_tasks: Set[concurrent.futures.Future] = set()


# -------------------- Main Functions --------------------
async def create_podcast(
    user_id: str,
    topic_id: str,
    background_tasks: BackgroundTasks,
    voice: Optional[str] = None,
    style: Optional[str] = None,
    length_minutes: Optional[int] = None,
    custom_prompt: Optional[str] = None,
    focus_areas: Optional[List[str]] = None,
) -> Dict:
    """
    Create a new podcast generation job
    Returns immediately while generation happens in background
    """
    # Import db here to avoid circular imports
    from app.db import db
    
    # Fetch user preferences
    user_service = UserService()
    user_profile = await user_service.get_user_profile(user_id)
    if user_profile:
        prefs = user_profile.preferences
        length_minutes = length_minutes or PODCAST_LENGTH_MAP.get(prefs.default_podcast_length, 5)
        style = style or TONE_TO_STYLE_MAP.get(prefs.default_tone, PodcastStyle.STANDARD)
        voice = voice or PodcastVoice.CALM_FEMALE
    else:
        length_minutes = length_minutes or 5
        style = style or PodcastStyle.STANDARD
        voice = voice or PodcastVoice.CALM_FEMALE

    # Verify topic exists
    try:
        topic = await db["topics"].find_one({"_id": ObjectId(topic_id)})
    except:
        raise ValueError("Invalid topic ID")
    
    if not topic:
        raise ValueError("Topic not found")

    # Insert podcast document
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
        "error_message": None,
    }
    result = await db["podcasts"].insert_one(podcast_doc)
    podcast_id = str(result.inserted_id)

    # ✅ FIXED: Run generation in thread pool with podcast_id only
    # Pass minimal data to avoid loop attachment issues
    loop = asyncio.get_running_loop()
    future = loop.run_in_executor(
        _thread_pool, 
        _run_podcast_generation_sync, 
        podcast_id
    )
    _background_tasks.add(future)
    future.add_done_callback(_background_tasks.discard)

    return {
        "id": podcast_id,
        "status": PodcastStatus.PENDING,
        "topic_id": topic_id,
        "topic_title": topic["title"],
        "estimated_time_seconds": length_minutes * 60,
        "estimated_credits": length_minutes,
        "message": "Podcast generation started. Check the Library tab for updates.",
    }


# -------------------- Synchronous Podcast Generation (Runs in Thread) --------------------
def _run_podcast_generation_sync(podcast_id: str):
    """
    Synchronous wrapper that runs in a thread pool
    This prevents blocking the main event loop
    """
    # Create a new event loop for this thread
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        # Run the async generation in this thread's loop
        loop.run_until_complete(_generate_podcast_async_in_thread(podcast_id))
    except Exception as e:
        print(f"❌ Thread error for podcast {podcast_id}: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        loop.close()


# -------------------- Async Podcast Generation (Runs in Thread's Loop) --------------------
async def _generate_podcast_async_in_thread(podcast_id: str):
    """
    Generates podcast script, audio, uploads files, updates status
    This runs in a background thread with its own event loop
    """
    # Import db here to get a fresh connection for this thread
    from app.db import db
    
    # Create NEW service instances for this thread
    script_service = ScriptService()
    audio_service = AudioService()
    storage_service = StorageService()
    user_service = UserService()
    
    try:
        print(f"🎙️  Starting podcast generation in thread: {podcast_id}")
        
        # Get podcast details first
        podcast = await db["podcasts"].find_one({"_id": ObjectId(podcast_id)})
        if not podcast:
            print(f"❌ Podcast {podcast_id} not found")
            return
        
        # Step 1: Generate script
        await _update_podcast_status_in_thread(db, podcast_id, PodcastStatus.GENERATING_SCRIPT)
        script = await script_service.generate_script(podcast_id)
        print(f"✅ Script generated ({len(script)} chars)")

        # Step 2: Generate audio
        await _update_podcast_status_in_thread(db, podcast_id, PodcastStatus.GENERATING_AUDIO)
        audio_data, duration = await _generate_audio_for_podcast_in_thread(
            db, user_service, audio_service, podcast_id, script
        )
        print(f"✅ Audio generated ({duration}s)")

        # Step 3: Upload to storage
        await _update_podcast_status_in_thread(db, podcast_id, PodcastStatus.UPLOADING)
        audio_url, transcript_url = await storage_service.upload_podcast_files(podcast_id, audio_data, script)
        print(f"✅ Uploaded to Firebase")

        # Step 4: Mark as completed
        credits_used = max(1, int(duration / 60))
        await _update_podcast_status_in_thread(
            db,
            podcast_id,
            PodcastStatus.COMPLETED,
            {
                "audio_url": audio_url,
                "transcript_url": transcript_url,
                "credits_used": credits_used,
                "duration_seconds": duration,
                "completed_at": datetime.now(),
            },
        )
        
        print(f"✅ Podcast generation complete: {podcast_id}")

    except Exception as e:
        print(f"❌ Podcast generation failed: {str(e)}")
        import traceback
        traceback.print_exc()
        await _update_podcast_status_in_thread(db, podcast_id, PodcastStatus.FAILED, {"error_message": str(e)})


async def _update_podcast_status_in_thread(db, podcast_id: str, status: PodcastStatus, additional_fields: Optional[Dict] = None):
    """Helper to update podcast status in database - uses passed db instance"""
    update_fields = {"status": status, "updated_at": datetime.now()}
    if additional_fields:
        update_fields.update(additional_fields)

    await db["podcasts"].update_one({"_id": ObjectId(podcast_id)}, {"$set": update_fields})


async def _generate_audio_for_podcast_in_thread(db, user_service, audio_service, podcast_id: str, script: str) -> tuple[bytes, int]:
    """Generate audio using audio service with user preferences - uses passed instances"""
    podcast = await db["podcasts"].find_one({"_id": ObjectId(podcast_id)})
    voice_name = VOICE_CONFIGS[podcast["voice"]]

    user_profile = await user_service.get_user_profile(podcast["user_id"])
    speaking_rate = user_service.calculate_speaking_rate(user_profile)

    return await audio_service.generate_audio(script, voice_name, speaking_rate)


# -------------------- Get Podcasts (Main Loop Functions) --------------------
async def get_user_podcasts(
    user_id: str,
    status: Optional[str] = None,
    limit: int = 50,
    skip: int = 0
) -> List[Dict]:
    """Get all podcasts for a user - runs in main loop"""
    from app.db import db
    
    query = {"user_id": user_id}
    if status:
        query["status"] = status
    
    podcasts = []
    cursor = db["podcasts"].find(query).sort("created_at", -1).skip(skip).limit(limit)
    
    async for podcast in cursor:
        podcasts.append({
            "id": str(podcast["_id"]),
            "user_id": podcast["user_id"],
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
    """Get podcast details by ID - runs in main loop"""
    from app.db import db
    
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


# -------------------- Regenerate Podcast --------------------
async def regenerate_podcast(
    podcast_id: str,
    background_tasks: BackgroundTasks,
    voice: Optional[str] = None,
    style: Optional[str] = None,
    length_minutes: Optional[int] = None,
    custom_prompt: Optional[str] = None,
    focus_areas: Optional[List[str]] = None,
) -> Dict:
    """
    Regenerate an existing podcast with updated settings
    Returns immediately while regeneration happens in background
    """
    from app.db import db
    
    podcast = await db["podcasts"].find_one({"_id": ObjectId(podcast_id)})
    if not podcast:
        raise ValueError("Podcast not found")

    # Prepare updated fields
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
        "completed_at": None,
    })

    # Apply updates in DB
    await db["podcasts"].update_one({"_id": ObjectId(podcast_id)}, {"$set": update_fields})

    # ✅ FIXED: Run regeneration in thread pool
    loop = asyncio.get_running_loop()
    future = loop.run_in_executor(
        _thread_pool,
        _run_podcast_generation_sync,
        podcast_id
    )
    _background_tasks.add(future)
    future.add_done_callback(_background_tasks.discard)

    return {
        "id": podcast_id,
        "status": PodcastStatus.PENDING,
        "message": "Podcast regeneration started"
    }


# -------------------- Delete Podcast --------------------
async def delete_podcast(podcast_id: str, user_id: str) -> bool:
    """
    Delete a podcast - ensures user owns the podcast
    Deletes audio from storage and removes DB entry
    """
    from app.db import db
    from app.services.storage_service import StorageService
    
    podcast = await db["podcasts"].find_one({"_id": ObjectId(podcast_id), "user_id": user_id})
    if not podcast:
        return False

    # Delete files from storage if audio exists
    if podcast.get("audio_url"):
        storage_service = StorageService()
        await storage_service.delete_podcast_files(podcast_id)

    # Remove from MongoDB
    await db["podcasts"].delete_one({"_id": ObjectId(podcast_id)})

    return True


# -------------------- Cleanup on Shutdown --------------------
async def shutdown_cleanup():
    """Clean up thread pool on application shutdown"""
    _thread_pool.shutdown(wait=True)