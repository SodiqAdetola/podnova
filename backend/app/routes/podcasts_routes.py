# app/routes/podcast_routes.py
from fastapi import APIRouter, HTTPException, status, BackgroundTasks, Depends, Query
from typing import Optional, List
from pydantic import BaseModel, Field
from app.middleware.firebase_auth import verify_firebase_token
from app.controllers.podcasts_controller import (
    create_podcast,
    get_user_podcasts,
    get_podcast_by_id,
    regenerate_podcast,
    delete_podcast,
    PodcastStyle,
    PodcastVoice
)

router = APIRouter()


# -------------------- Pydantic Models --------------------
class CreatePodcastRequest(BaseModel):
    topic_id: str = Field(..., description="Topic ID to generate podcast from")
    voice: str = Field(default=PodcastVoice.CALM_FEMALE, description="Voice type")
    style: str = Field(default=PodcastStyle.STANDARD, description="Comprehension level")
    length_minutes: int = Field(default=5, ge=1, le=30, description="Target length in minutes")
    custom_prompt: Optional[str] = Field(None, description="Custom instructions")
    focus_areas: Optional[List[str]] = Field(None, description="Specific topics to focus on")


class RegeneratePodcastRequest(BaseModel):
    voice: Optional[str] = None
    style: Optional[str] = None
    length_minutes: Optional[int] = Field(None, ge=1, le=30)
    custom_prompt: Optional[str] = None
    focus_areas: Optional[List[str]] = None


# -------------------- Routes --------------------
@router.post("/generate")
async def generate_podcast(
    request: CreatePodcastRequest,
    background_tasks: BackgroundTasks,
    firebase_user=Depends(verify_firebase_token)
):
    """
    Generate a new podcast from a topic
    
    This is an async operation - the podcast will be generated in the background.
    The API returns immediately with a pending status.
    Check the /podcasts/library endpoint or poll the specific podcast for updates.
    
    Requires Firebase authentication.
    """
    try:
        user_uid = firebase_user["uid"]
        
        result = await create_podcast(
            user_id=user_uid,
            topic_id=request.topic_id,
            background_tasks=background_tasks,
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


@router.get("/library")
async def get_podcast_library(
    firebase_user=Depends(verify_firebase_token),
    status_filter: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(50, ge=1, le=100, description="Max podcasts to return"),
    skip: int = Query(0, ge=0, description="Pagination offset")
):
    """
    Get user's podcast library
    
    Query parameters:
    - status_filter: Filter by status (pending, completed, failed, etc.)
    - limit: Max podcasts to return (default 50, max 100)
    - skip: Pagination offset (default 0)
    
    Requires Firebase authentication.
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
    """
    Get detailed information about a specific podcast
    
    User must own the podcast to access it.
    Requires Firebase authentication.
    """
    try:
        user_uid = firebase_user["uid"]
        
        podcast = await get_podcast_by_id(podcast_id)
        
        if not podcast:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Podcast not found"
            )
        
        # Verify user owns this podcast
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
    background_tasks: BackgroundTasks,
    firebase_user=Depends(verify_firebase_token)
):
    """
    Regenerate an existing podcast with updated settings
    
    Useful for:
    - Updating podcast when new articles are added to the topic
    - Changing voice, style, or length
    - Applying different custom instructions
    
    User must own the podcast to regenerate it.
    Requires Firebase authentication.
    """
    try:
        user_uid = firebase_user["uid"]
        
        # Verify ownership first
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
            background_tasks=background_tasks,
            voice=request.voice,
            style=request.style,
            length_minutes=request.length_minutes,
            custom_prompt=request.custom_prompt,
            focus_areas=request.focus_areas
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
    """
    Delete a podcast
    
    User must own the podcast to delete it.
    Requires Firebase authentication.
    """
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
    """
    Get list of available voice options
    
    No authentication required - this is public information.
    """
    return {
        "voices": [
            {
                "id": PodcastVoice.CALM_FEMALE,
                "name": "Calm (Female)",
                "description": "Soothing female voice, ideal for relaxed listening",
                "language": "en-US"
            },
            {
                "id": PodcastVoice.CALM_MALE,
                "name": "Calm (Male)",
                "description": "Soothing male voice, ideal for relaxed listening",
                "language": "en-US"
            },
            {
                "id": PodcastVoice.ENERGETIC_FEMALE,
                "name": "Energetic (Female)",
                "description": "Upbeat female voice, great for engaging content",
                "language": "en-US"
            },
            {
                "id": PodcastVoice.ENERGETIC_MALE,
                "name": "Energetic (Male)",
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
    """
    Get list of available comprehension styles
    
    No authentication required - this is public information.
    """
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
    """
    Get user's podcast generation statistics
    
    Returns summary of user's podcast activity.
    Requires Firebase authentication.
    """
    try:
        user_uid = firebase_user["uid"]
        
        # Get all user podcasts
        all_podcasts = await get_user_podcasts(user_id=user_uid, limit=1000)
        
        # Calculate stats
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