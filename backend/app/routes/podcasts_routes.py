"""
Podcast Routes – endpoints for generating, listing, and managing podcasts.
"""

import asyncio
from datetime import datetime
import time

from fastapi import APIRouter, HTTPException, status, Query, Depends, UploadFile, File, Form
from typing import Optional, List
from pydantic import BaseModel, Field
from app.middleware.firebase_auth import verify_firebase_token
from app.controllers.podcasts_controller import (
    create_podcast,
    create_custom_podcast,
    get_user_podcasts,
    get_podcast_by_id,
    regenerate_podcast,
    delete_podcast,
    PodcastStyle,
    PodcastVoice
)
from app.middleware.rate_limit import RateLimit

router = APIRouter()

# Limit podcast generation to 5 per user per hour.
generate_podcast_limit = RateLimit(limit=5, window_minutes=60, action_name="generate_podcast")


class CreatePodcastRequest(BaseModel):
    """Request body for generating a podcast from a topic."""
    topic_id: str = Field(..., description="Topic ID to generate podcast from")
    voice: str = Field(default=PodcastVoice.NORMAL_FEMALE, description="Voice type")
    style: str = Field(default=PodcastStyle.STANDARD, description="Comprehension level")
    length_minutes: int = Field(default=5, ge=1, le=30, description="Target length in minutes")
    custom_prompt: Optional[str] = Field(None, description="Custom instructions")
    focus_areas: Optional[List[str]] = Field(None, description="Specific topics to focus on")


class RegeneratePodcastRequest(BaseModel):
    """Request body for regenerating an existing podcast with new settings."""
    voice: Optional[str] = None
    style: Optional[str] = None
    length_minutes: Optional[int] = Field(None, ge=1, le=30)
    custom_prompt: Optional[str] = None
    focus_areas: Optional[List[str]] = None
    focus_on_updates: Optional[bool] = False


@router.post("/generate")
async def generate_podcast(
    request: CreatePodcastRequest,
    firebase_user=Depends(generate_podcast_limit)
):
    """
    Generate a new podcast from a topic.

    This is an asynchronous operation – the endpoint returns immediately
    with a podcast ID, and generation continues in the background.
    """
    try:
        user_uid = firebase_user["uid"]
        
        result = await create_podcast(
            user_id=user_uid,
            topic_id=request.topic_id,
            voice=request.voice,
            style=request.style,
            length_minutes=request.length_minutes,
            custom_prompt=request.custom_prompt,
            focus_areas=request.focus_areas
        )
        
        return result
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        print(f"Error generating podcast: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create podcast: {str(e)}"
        )


@router.post("/generate-custom")
async def generate_custom_podcast_endpoint(
    files: List[UploadFile] = File(default=[]),
    text_content: Optional[str] = Form(""),
    podcast_title: str = Form("Custom Studio Podcast"), 
    custom_prompt: Optional[str] = Form(""),
    voice: str = Form(PodcastVoice.NORMAL_FEMALE),
    style: str = Form(PodcastStyle.STANDARD),
    length_minutes: int = Form(5),
    firebase_user=Depends(generate_podcast_limit)
):
    """
    Generate a custom podcast from uploaded files and/or pasted text.

    Uses multipart/form-data to accept both files and text content.
    """
    try:
        user_uid = firebase_user["uid"]
        
        # Ensure at least one source of content is provided.
        if not files and not text_content.strip():
            raise ValueError("You must provide either files or pasted text.")
            
        result = await create_custom_podcast(
            user_id=user_uid,
            files=files, 
            text_content=text_content,
            title=podcast_title,
            custom_prompt=custom_prompt or "",
            voice=voice,
            style=style,
            length_minutes=length_minutes
        )
        
        return result
        
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        print(f"Error generating custom podcast: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create custom podcast: {str(e)}"
        )


@router.get("/library")
async def get_podcast_library(
    firebase_user=Depends(verify_firebase_token),
    status_filter: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(50, ge=1, le=100, description="Max podcasts to return"),
    skip: int = Query(0, ge=0, description="Pagination offset")
):
    """
    Get the current user's podcast library.

    Statuses: pending, generating_script, generating_audio, uploading, completed, failed.
    """
    try:
        user_uid = firebase_user["uid"]
        
        podcasts = await get_user_podcasts(
            user_id=user_uid,
            status=status_filter,
            limit=limit,
            skip=skip
        )
        
        return {
            "podcasts": podcasts,
            "count": len(podcasts),
            "user_id": user_uid
        }
        
    except Exception as e:
        print(f"Error fetching library: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/{podcast_id}")
async def get_podcast_details(
    podcast_id: str,
    firebase_user=Depends(verify_firebase_token)
):
    """Get detailed information about a specific podcast, including its script."""
    try:
        user_uid = firebase_user["uid"]
        
        podcast = await get_podcast_by_id(podcast_id)
        
        if not podcast:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Podcast not found"
            )
        
        # Ensure the user can only see their own podcasts.
        if podcast["user_id"] != user_uid:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You don't own this podcast"
            )
        
        return podcast
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching podcast: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/{podcast_id}/regenerate")
async def regenerate_podcast_endpoint(
    podcast_id: str,
    request: RegeneratePodcastRequest,
    firebase_user=Depends(verify_firebase_token)
):
    """
    Regenerate an existing podcast with updated settings.

    Deletes the previous audio/transcript files and starts a fresh generation.
    """
    try:
        user_uid = firebase_user["uid"]
        
        podcast = await get_podcast_by_id(podcast_id)
        if not podcast:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Podcast not found"
            )
        
        if podcast["user_id"] != user_uid:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You don't own this podcast"
            )
        
        result = await regenerate_podcast(
            podcast_id=podcast_id,
            voice=request.voice,
            style=request.style,
            length_minutes=request.length_minutes,
            custom_prompt=request.custom_prompt,
            focus_areas=request.focus_areas,
            focus_on_updates=request.focus_on_updates
        )
        
        return result
        
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        print(f"Error regenerating podcast: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.delete("/{podcast_id}")
async def delete_podcast_endpoint(
    podcast_id: str,
    firebase_user=Depends(verify_firebase_token)
):
    """Delete a podcast and its associated audio/transcript files."""
    try:
        user_uid = firebase_user["uid"]
        
        success = await delete_podcast(podcast_id, user_uid)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Podcast not found or access denied"
            )
        
        return {
            "message": "Podcast deleted successfully",
            "podcast_id": podcast_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting podcast: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/voices/list")
async def list_available_voices():
    """Get the list of available TTS voice options for the frontend."""
    return {
        "voices": [
            {
                "id": PodcastVoice.NORMAL_FEMALE,
                "name": "Normal (Female)",
                "description": "Soothing female voice, ideal for relaxed listening",
                "language": "en-US"
            },
            {
                "id": PodcastVoice.NORMAL_MALE,
                "name": "Normal (Male)",
                "description": "Soothing male voice, ideal for relaxed listening",
                "language": "en-US"
            },
            {
                "id": PodcastVoice.CALM_FEMALE,
                "name": "Calm (Female)",
                "description": "Upbeat female voice, great for engaging content",
                "language": "en-US"
            },
            {
                "id": PodcastVoice.CALM_MALE,
                "name": "Calm (Male)",
                "description": "Upbeat male voice, great for engaging content",
                "language": "en-US"
            },
            {
                "id": PodcastVoice.PROFESSIONAL_FEMALE,
                "name": "Professional (Female)",
                "description": "Clear professional female voice",
                "language": "en-US"
            },
            {
                "id": PodcastVoice.PROFESSIONAL_MALE,
                "name": "Professional (Male)",
                "description": "Clear professional male voice",
                "language": "en-US"
            }
        ]
    }


@router.get("/styles/list")
async def list_available_styles():
    """Get the list of available comprehension style options for the frontend."""
    return {
        "styles": [
            {
                "id": PodcastStyle.CASUAL,
                "name": "Casual",
                "description": "Simple language, conversational tone. Perfect for quick understanding.",
                "target_audience": "General audience, casual listeners"
            },
            {
                "id": PodcastStyle.STANDARD,
                "name": "Standard",
                "description": "Clear professional language. Balanced depth and accessibility.",
                "target_audience": "Regular news consumers"
            },
            {
                "id": PodcastStyle.ADVANCED,
                "name": "Advanced",
                "description": "Industry terminology with deeper analysis and context.",
                "target_audience": "Informed readers, professionals"
            },
            {
                "id": PodcastStyle.EXPERT,
                "name": "Expert",
                "description": "Technical language with comprehensive analysis and implications.",
                "target_audience": "Domain experts, researchers"
            }
        ]
    }


@router.get("/stats")
async def get_user_podcast_stats(
    firebase_user=Depends(verify_firebase_token)
):
    """Get aggregated statistics about the user's podcast generation activity."""
    try:
        user_uid = firebase_user["uid"]
        all_podcasts = await get_user_podcasts(user_id=user_uid, limit=1000)
        
        total_podcasts = len(all_podcasts)
        completed = len([p for p in all_podcasts if p["status"] == "completed"])
        generating = len([p for p in all_podcasts if p["status"] in ["pending", "generating_script", "generating_audio", "uploading"]])
        failed = len([p for p in all_podcasts if p["status"] == "failed"])
        
        total_duration = sum(p.get("duration_seconds", 0) for p in all_podcasts if p.get("duration_seconds"))
        total_credits = sum(p.get("credits_used", 0) for p in all_podcasts)
        
        return {
            "user_id": user_uid,
            "total_podcasts": total_podcasts,
            "completed": completed,
            "generating": generating,
            "failed": failed,
            "total_duration_seconds": total_duration,
            "total_duration_minutes": round(total_duration / 60, 1),
            "total_credits_used": total_credits,
            "average_podcast_length": round(total_duration / completed / 60, 1) if completed > 0 else 0
        }
        
    except Exception as e:
        print(f"Error fetching stats: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    

@router.get("/debug/event-loop")
async def check_event_loop():
    """Debug endpoint to check if the asyncio event loop is responsive."""
    start = time.time()
    await asyncio.sleep(0.1)
    return {
        "status": "responsive",
        "response_time_ms": int((time.time() - start) * 1000),
        "timestamp": datetime.now().isoformat()
    }


@router.get("/debug/health")
async def debug_health():
    """Simple health check that does not depend on any external services."""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "event_loop": "responsive"
    }