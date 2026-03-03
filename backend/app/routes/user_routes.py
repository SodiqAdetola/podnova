# app/routes/user_routes.py
from fastapi import APIRouter, Depends, HTTPException, status, Body
from app.middleware.firebase_auth import verify_firebase_token
from app.controllers.user_controller import (
    create_user_profile,
    get_user_profile,
    update_user_preferences,
    save_push_token  # <-- ADDED
)
from app.models.user import UserProfile, UserPreferences, PushTokenRequest  # <-- ADDED
from pydantic import BaseModel

router = APIRouter()


class UpdatePreferencesRequest(BaseModel):
    push_notifications: bool | None = None
    push_podcast_ready: bool | None = None  
    push_reply: bool | None = None          
    push_topic_update: bool | None = None   
    playback_speed: float | None = None
    default_voice: str | None = None
    default_ai_style: str | None = None
    default_categories: list[str] | None = None
    default_podcast_length: str | None = None
    default_tone: str | None = None


@router.post("/profile", response_model=UserProfile, status_code=status.HTTP_201_CREATED)
async def create_user(firebase_user=Depends(verify_firebase_token)):
    """
    Create a new user profile
    
    Called automatically when user first signs up.
    """
    try:
        profile = await create_user_profile(firebase_user)
        return profile
    except Exception as e:
        if "already exists" in str(e):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User profile already exists"
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/profile", response_model=UserProfile)
async def get_current_user(firebase_user=Depends(verify_firebase_token)):
    """
    Get current user's profile
    
    Returns user information and preferences.
    """
    profile = await get_user_profile(firebase_user["uid"])
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found. Please create profile first."
        )
    return profile


@router.patch("/preferences")
async def update_preferences(
    preferences: UpdatePreferencesRequest,
    firebase_user=Depends(verify_firebase_token)
):
    """
    Update user preferences
    
    Allows partial updates - only send fields you want to change.
    """
    try:
        # Get current profile
        profile = await get_user_profile(firebase_user["uid"])
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found"
            )
        
        # Update only provided fields
        updates = preferences.dict(exclude_unset=True)
        if not updates:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields to update"
            )
        
        updated_profile = await update_user_preferences(
            firebase_user["uid"],
            updates
        )
        
        return {
            "message": "Preferences updated successfully",
            "preferences": updated_profile.preferences
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# Save Push Token
@router.post("/push-token")
async def register_push_token(
    request: PushTokenRequest,
    firebase_user=Depends(verify_firebase_token)
):
    """
    Register an Expo Push Token for the current user.
    This allows the backend to send background notifications.
    """
    try:
        await save_push_token(firebase_user["uid"], request.token)
        return {"status": "success", "message": "Push token registered successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save push token: {str(e)}"
        )



@router.get("/stats")
async def get_user_stats(firebase_user=Depends(verify_firebase_token)):
    """
    Get user statistics
    
    Returns podcast counts, discussions, followers, etc.
    """
    from app.db import db
    
    try:
        user_uid = firebase_user["uid"]
        
        # Get podcast stats
        podcasts_cursor = db["podcasts"].find({"user_id": user_uid})
        podcasts = []
        async for p in podcasts_cursor:
            podcasts.append(p)
        
        completed = len([p for p in podcasts if p.get("status") == "completed"])
        total_duration = sum(p.get("duration_seconds", 0) for p in podcasts if p.get("duration_seconds"))
        
        return {
            "podcasts": completed,
            "discussions": 0,  # TODO: Implement when discussions feature is ready
            "followers": 0,    # TODO: Implement when social features are ready
            "total_duration_minutes": round(total_duration / 60, 1) if total_duration else 0,
            "credits_used": sum(p.get("credits_used", 0) for p in podcasts)
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    
@router.post("/block/{blocked_user_id}")
async def block_user_endpoint(
    blocked_user_id: str,
    firebase_user=Depends(verify_firebase_token)
):
    """
    Block another user.
    Their content will be filtered out of the feed.
    """
    try:
        from app.db import db
        # Use MongoDB's $addToSet to add the ID without creating duplicates
        await db["users"].update_one(
            {"firebase_uid": firebase_user["uid"]},
            {"$addToSet": {"blocked_users": blocked_user_id}}
        )
        return {"status": "success", "message": f"User {blocked_user_id} blocked."}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to block user: {str(e)}"
        )
    
@router.post("/replies/{reply_id}/report")
async def report_reply_endpoint(
    reply_id: str,
    firebase_user: dict = Depends(verify_firebase_token)
):
    """
    Report a reply for Terms of Service violations.
    Required for App Store compliance.
    """
    try:
        from app.db import db
        from datetime import datetime
        
        # 1. Log the report in a dedicated collection for admin review
        report_data = {
            "reply_id": reply_id,
            "reporter_uid": firebase_user["uid"],
            "created_at": datetime.utcnow(),
            "status": "pending_review"
        }
        await db["reports"].insert_one(report_data)
        
        # 2. Increment a warning counter on the actual reply
        from bson import ObjectId
        if ObjectId.is_valid(reply_id):
            await db["replies"].update_one(
                {"_id": ObjectId(reply_id)},
                {"$inc": {"report_count": 1}}
            )
            
        return {"success": True, "message": "Content reported successfully."}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )