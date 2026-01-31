# app/controllers/podcast_controller.py
"""
PodNova Podcast Generation Controller
Handles podcast script generation, TTS conversion, and Firebase storage
Integrates with existing UserProfile and UserPreferences models
"""
from app.config import (
    MONGODB_URI, 
    MONGODB_DB_NAME, 
    GEMINI_API_KEY, 
    FIREBASE_SERVICE_ACCOUNT_KEY, 
    FIREBASE_STORAGE_BUCKET
)
from datetime import datetime
from typing import Dict, Optional, List
from bson import ObjectId
import os
import json
from google import genai
from google.cloud import texttospeech
import firebase_admin
from firebase_admin import credentials, storage
from app.db import db
from app.models.user import UserProfile, UserPreferences
import asyncio
from enum import Enum
from google.oauth2 import service_account



if  os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
    creds_dict = json.loads(os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
    credentials = service_account.Credentials.from_service_account_info(creds_dict)
    tts_client = texttospeech.TextToSpeechClient(credentials=credentials)
else:
    tts_client = texttospeech.TextToSpeechClient()


# Initialize Gemini client
client = genai.Client(api_key=GEMINI_API_KEY)

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
    PodcastVoice.CALM_FEMALE: "en-US-Chirp3-HD-Achernar",
    PodcastVoice.CALM_MALE: "en-US-Chirp3-HD-Charon",
    PodcastVoice.ENERGETIC_FEMALE: "en-US-Chirp3-HD-Zephyr",
    PodcastVoice.ENERGETIC_MALE: "en-US-Chirp3-HD-Fenrir",
    PodcastVoice.PROFESSIONAL_FEMALE: "en-US-Chirp3-HD-Aoede",
    PodcastVoice.PROFESSIONAL_MALE: "en-US-Chirp3-HD-Orus",
}


# Map user preferences to podcast settings
PODCAST_LENGTH_MAP = {
    "short": 5,    # 5 minutes
    "medium": 10,   # 10 minutes
    "long": 20     # 20 minutes
}

TONE_TO_STYLE_MAP = {
    "factual": PodcastStyle.STANDARD,
    "casual": PodcastStyle.CASUAL,
    "analytical": PodcastStyle.ADVANCED,
    "expert": PodcastStyle.EXPERT
}


async def get_user_profile(user_id: str) -> Optional[UserProfile]:
    """Fetch user profile from MongoDB"""
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
    user_profile = await get_user_profile(user_id)
    
    # Apply user preferences as defaults
    if user_profile:
        prefs = user_profile.preferences
        
        # Use user's default length if not specified
        if length_minutes is None:
            length_minutes = PODCAST_LENGTH_MAP.get(
                prefs.default_podcast_length, 
                5  # fallback to 5 minutes
            )
        
        # Use user's default tone/style if not specified
        if style is None:
            style = TONE_TO_STYLE_MAP.get(
                prefs.default_tone,
                PodcastStyle.STANDARD  # fallback
            )
        
        # Default voice (can add to UserPreferences later)
        if voice is None:
            voice = PodcastVoice.CALM_FEMALE
    else:
        # Fallback defaults if user profile not found
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
    
    # Estimate credits
    estimated_credits = length_minutes
    
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
        "estimated_credits": estimated_credits,
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
        "estimated_credits": estimated_credits,
        "message": "Podcast generation started. Check the Library tab for updates."
    }


async def _generate_podcast_async(podcast_id: str):
    """Async task to generate podcast script and audio"""
    try:
        # Update status to generating script
        await db["podcasts"].update_one(
            {"_id": ObjectId(podcast_id)},
            {
                "$set": {
                    "status": PodcastStatus.GENERATING_SCRIPT,
                    "updated_at": datetime.now()
                }
            }
        )
        
        # Generate script
        script = await _generate_script(podcast_id)
        
        # Update status to generating audio
        await db["podcasts"].update_one(
            {"_id": ObjectId(podcast_id)},
            {
                "$set": {
                    "status": PodcastStatus.GENERATING_AUDIO,
                    "script": script,
                    "updated_at": datetime.now()
                }
            }
        )
        
        # Generate audio from script
        audio_data, duration = await _generate_audio(podcast_id, script)
        
        # Update status to uploading
        await db["podcasts"].update_one(
            {"_id": ObjectId(podcast_id)},
            {
                "$set": {
                    "status": PodcastStatus.UPLOADING,
                    "duration_seconds": duration,
                    "updated_at": datetime.now()
                }
            }
        )
        
        # Upload to Firebase Storage
        audio_url, transcript_url = await _upload_to_firebase(
            podcast_id, 
            audio_data, 
            script
        )
        
        # Calculate actual credits used
        credits_used = max(1, int(duration / 60))
        
        # Mark as completed
        await db["podcasts"].update_one(
            {"_id": ObjectId(podcast_id)},
            {
                "$set": {
                    "status": PodcastStatus.COMPLETED,
                    "audio_url": audio_url,
                    "transcript_url": transcript_url,
                    "credits_used": credits_used,
                    "completed_at": datetime.now(),
                    "updated_at": datetime.now()
                }
            }
        )
        
    except Exception as e:
        # Mark as failed
        await db["podcasts"].update_one(
            {"_id": ObjectId(podcast_id)},
            {
                "$set": {
                    "status": PodcastStatus.FAILED,
                    "error_message": str(e),
                    "updated_at": datetime.now()
                }
            }
        )


async def _generate_script(podcast_id: str) -> str:
    """Generate podcast script using Gemini AI with improved prompt engineering"""
    podcast = await db["podcasts"].find_one({"_id": ObjectId(podcast_id)})
    topic = await db["topics"].find_one({"_id": podcast["topic_id"]})
    
    # Fetch all articles
    articles = []
    async for article in db["articles"].find(
        {"_id": {"$in": topic.get("article_ids", [])}}
    ).sort("published_date", -1):
        articles.append({
            "title": article["title"],
            "source": article["source"],
            "content": article.get("content", article.get("description", "")),
            "published": article["published_date"].strftime("%Y-%m-%d")
        })
    
    # Build style-specific instructions with IMPROVED depth guidelines
    style_instructions = {
        PodcastStyle.CASUAL: {
            "approach": "Conversational and accessible",
            "depth": "Cover the basics and main takeaways. Explain concepts in simple terms without jargon. Keep it light and easy to follow.",
            "analysis": "Focus on 'what happened' and 'why it matters' at a surface level. Use relatable analogies and examples.",
            "language": "Simple, everyday language. Short sentences. Conversational tone as if explaining to a friend.",
            "audience": "General audience with no prior knowledge"
        },
        PodcastStyle.STANDARD: {
            "approach": "Balanced and professional",
            "depth": "Provide comprehensive coverage of the topic. Explain key concepts clearly while diving into important details.",
            "analysis": "Explore both 'what happened' and 'why it matters'. Include context, multiple perspectives, and immediate implications.",
            "language": "Clear professional language. Explain technical terms when used. Well-structured narrative flow.",
            "audience": "Informed readers who follow news regularly"
        },
        PodcastStyle.ADVANCED: {
            "approach": "In-depth and critical",
            "depth": "Go beyond surface-level reporting. Analyze underlying factors, systemic issues, and broader patterns. Connect to related developments and historical context.",
            "analysis": "Critical examination of causes, effects, and stakeholder motivations. Question assumptions. Explore second and third-order consequences. Compare with similar past events.",
            "language": "Industry terminology is fine but should serve analysis, not replace it. Focus on substance over vocabulary.",
            "audience": "Professionals and enthusiasts with domain knowledge"
        },
        PodcastStyle.EXPERT: {
            "approach": "Comprehensive and analytical",
            "depth": "Provide expert-level analysis with deep dives into mechanisms, methodologies, and implications. Challenge conventional wisdom. Explore edge cases and nuance.",
            "analysis": "Multi-dimensional analysis considering economic, political, social, and technical factors. Discuss competing theories and interpretations. Project future scenarios and strategic implications. Identify gaps in current understanding.",
            "language": "Technical precision where appropriate, but clarity remains paramount. The goal is insight, not complexity.",
            "audience": "Domain experts, researchers, and serious analysts"
        }
    }
    
    style_config = style_instructions[podcast['style']]
    
    # Build prompt
    articles_text = "\n\n".join([
        f"**{a['title']}** (Source: {a['source']}, Date: {a['published']})\n{a['content'][:1000]}..."
        for a in articles[:15]
    ])
    
    focus_text = ""
    if podcast.get("focus_areas"):
        focus_text = f"\n\nFOCUS AREAS: Pay special attention to: {', '.join(podcast['focus_areas'])}"
    
    custom_text = ""
    if podcast.get("custom_prompt"):
        custom_text = f"\n\nCUSTOM INSTRUCTIONS: {podcast['custom_prompt']}"
    
    prompt = f"""You are creating a podcast script about this news topic. This will be converted to natural speech, so write ONLY the spoken words - no stage directions, sound effects, formatting, or meta-commentary.

TOPIC: {topic['title']}
CATEGORY: {topic['category'].upper()}
TARGET LENGTH: {podcast['length_minutes']} minutes (~{podcast['length_minutes'] * 150} words)
COMPREHENSION LEVEL: {podcast['style'].upper()}

AUDIENCE & APPROACH:
- Target Audience: {style_config['audience']}
- Approach: {style_config['approach']}
- Depth Required: {style_config['depth']}
- Analysis Style: {style_config['analysis']}
- Language Guidelines: {style_config['language']}

CRITICAL INSTRUCTION FOR {podcast['style'].upper()} LEVEL:
{style_config['analysis']}

SOURCE ARTICLES ({len(articles)} total):
{articles_text}

{focus_text}{custom_text}

SCRIPT STRUCTURE:
1. **Opening Hook** (15 seconds): Lead with the most compelling or surprising angle. Make them want to keep listening.

2. **Context Setting** (20%): 
   - What's happening and why does it matter?
   - Essential background and setup
   - {style_config['depth']}

3. **Core Analysis** (50%): 
   - Main developments synthesized from multiple sources
   - {style_config['analysis']}
   - For {podcast['style'].upper()} level: Go deeper than surface facts. Challenge the obvious. Explore the 'why behind the why.'

4. **Implications & Significance** (20%):
   - Who's affected and how?
   - Broader consequences and connections
   - What might happen next and why?
   - For ADVANCED/EXPERT: Discuss competing scenarios and strategic considerations

5. **Closing** (10 seconds): 
   - Memorable synthesis or thought-provoking question
   - Leave them thinking

CRITICAL REQUIREMENTS:
- Write ONLY spoken words (no [pauses], [music], stage directions, or "In this podcast...")
- Synthesize information from MULTIPLE sources, not just one
- Natural speech patterns with conversational flow
- Include specific facts, figures, and quotes where relevant
- Attribute information naturally ("According to Reuters..." or "As reported by...")
- For {podcast['style'].upper()} level: DEPTH OF INSIGHT matters more than vocabulary complexity
- Avoid unnecessary jargon - use technical terms only when they serve understanding
- Stay objective and balanced
- End with a clear conclusion

Remember: {podcast['style'].upper()} level means deeper THINKING and ANALYSIS, not just fancier words.

Generate the podcast script now:"""

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt
        )
        
        script = response.text.strip()
        
        # Basic validation
        word_count = len(script.split())
        target_words = podcast['length_minutes'] * 150
        
        if word_count < target_words * 0.7:
            # Script too short, request expansion with emphasis on depth
            expansion_prompt = f"""The previous script was too short ({word_count} words vs {target_words} target).

EXPAND by adding MORE DEPTH AND ANALYSIS, not just more words:
- Dig deeper into the underlying factors and mechanisms
- Add critical analysis and multiple perspectives
- Include more specific examples and data points
- Explore broader implications and connections
- For {podcast['style'].upper()} level: {style_config['analysis']}

REMEMBER: We need deeper INSIGHT, not longer sentences or fancier vocabulary.

Original script:
{script}

Generate an expanded version with significantly more analytical depth:"""
            
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=expansion_prompt
            )
            script = response.text.strip()
        
        return script
        
    except Exception as e:
        raise Exception(f"Failed to generate script: {str(e)}")


def _chunk_text(text: str, max_chars: int = 4000) -> List[str]:
    chunks = []
    while len(text) > max_chars:
        split_at = text.rfind(".", 0, max_chars)
        if split_at == -1:
            split_at = max_chars
        chunks.append(text[:split_at + 1].strip())
        text = text[split_at + 1:].strip()
    if text:
        chunks.append(text)
    return chunks


async def _generate_audio(podcast_id: str, script: str) -> tuple[bytes, int]:

    podcast = await db["podcasts"].find_one({"_id": ObjectId(podcast_id)})
    voice_name = VOICE_CONFIGS[podcast["voice"]]

    user_profile = await get_user_profile(podcast["user_id"])
    speaking_rate = 1.0

    if user_profile:
        adjustment = (user_profile.preferences.playback_speed - 1.0) * 0.3
        speaking_rate = max(0.8, min(1.25, 1.0 + adjustment))

    chunks = _chunk_text(script)
    full_audio = b""

    for chunk in chunks:
        synthesis_input = texttospeech.SynthesisInput(text=chunk)

        voice = texttospeech.VoiceSelectionParams(
            language_code="en-US",
            name=voice_name,
        )

        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=speaking_rate,
        )

        response = tts_client.synthesize_speech(
            input=synthesis_input,
            voice=voice,
            audio_config=audio_config,
        )

        full_audio += response.audio_content

    word_count = len(script.split())
    duration_seconds = int((word_count / 160) * 60 / speaking_rate)

    return full_audio, duration_seconds

async def _upload_to_firebase(
    podcast_id: str, 
    audio_data: bytes, 
    script: str
    ) -> tuple[str, str]:
    """Upload audio and transcript to Firebase Storage"""
    bucket = storage.bucket("podnova-9ecc2.firebasestorage.app")
    
    # Upload audio
    audio_blob = bucket.blob(f"podcasts/{podcast_id}/audio.mp3")
    audio_blob.upload_from_string(
        audio_data,
        content_type="audio/mpeg"
    )
    audio_blob.make_public()
    audio_url = audio_blob.public_url
    
    # Upload transcript
    transcript_blob = bucket.blob(f"podcasts/{podcast_id}/transcript.txt")
    transcript_blob.upload_from_string(
        script,
        content_type="text/plain"
    )
    transcript_blob.make_public()
    transcript_url = transcript_blob.public_url
    
    return audio_url, transcript_url


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
        try:
            bucket = storage.bucket("podnova-9ecc2.firebasestorage.app")
            bucket.blob(f"podcasts/{podcast_id}/audio.mp3").delete()
            bucket.blob(f"podcasts/{podcast_id}/transcript.txt").delete()
        except:
            pass
    
    # Delete from MongoDB
    await db["podcasts"].delete_one({"_id": ObjectId(podcast_id)})
    
    return True