# app/routes/user_routes.py
from fastapi import APIRouter, Depends, HTTPException, status
from app.middleware.firebase_auth import verify_firebase_token
from app.controllers.user_controller import (
    create_user_profile,
    delete_user_account,
    get_user_profile,
    update_user_preferences,
    save_push_token,
    get_user_stats_data,
    block_target_user,
    get_blocked_users_list,
    unblock_target_user,
    report_reply_content
)
from app.models.user import UserProfile, PushTokenRequest
from pydantic import BaseModel
from app.db import db
from bson import ObjectId
from datetime import datetime

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
    """Create a new user profile"""
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
    """Get current user's profile"""
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
    """Update user preferences"""
    try:
        profile = await get_user_profile(firebase_user["uid"])
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found"
            )
        
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


@router.post("/push-token")
async def register_push_token(
    request: PushTokenRequest,
    firebase_user=Depends(verify_firebase_token)
):
    """Register an Expo Push Token for the current user."""
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
    """Get user statistics"""
    try:
        stats = await get_user_stats_data(firebase_user["uid"])
        return stats
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
    """Block another user"""
    try:
        await block_target_user(firebase_user["uid"], blocked_user_id)
        return {"status": "success", "message": f"User {blocked_user_id} blocked."}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to block user: {str(e)}"
        )


@router.get("/blocked")
async def fetch_blocked_users_endpoint(firebase_user=Depends(verify_firebase_token)):
    """Fetch the list of blocked users with their usernames"""
    try:
        blocked_users = await get_blocked_users_list(firebase_user["uid"])
        return {"blocked_users": blocked_users}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.delete("/blocked/{target_uid}")
async def unblock_user_endpoint(
    target_uid: str, 
    firebase_user=Depends(verify_firebase_token)
):
    """Remove a user from the blocked list"""
    try:
        success = await unblock_target_user(firebase_user["uid"], target_uid)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail="User not found in blocked list"
            )
        return {"success": True, "message": "User unblocked successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/replies/{reply_id}/report")
async def report_reply_endpoint(
    reply_id: str,
    firebase_user: dict = Depends(verify_firebase_token)
):
    """Report a reply for Terms of Service violations."""
    try:
        await report_reply_content(reply_id, firebase_user["uid"])
        return {"success": True, "message": "Content reported successfully."}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    
    
@router.delete("/account")
async def delete_account_endpoint(firebase_user=Depends(verify_firebase_token)):
    """
    Permanently delete the current user's account and all associated data.
    """
    try:
        user_uid = firebase_user["uid"]
        success = await delete_user_account(user_uid)
        
        if success:
            return {"status": "success", "message": "Account successfully deleted."}
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete account data."
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/topics/{topic_id}/follow")
async def toggle_topic_follow(topic_id: str, firebase_user=Depends(verify_firebase_token)):
    """Toggle following a topic using the mapping collection pattern"""
    try:
        if not ObjectId.is_valid(topic_id):
            raise HTTPException(status_code=400, detail="Invalid topic ID format")
            
        user_uid = firebase_user["uid"]
        topic = await db["topics"].find_one({"_id": ObjectId(topic_id)})
        
        if not topic:
            raise HTTPException(status_code=404, detail="Topic not found")
            
        existing_follow = await db["topic_followers"].find_one({
            "user_uid": user_uid,
            "topic_id": topic_id
        })
        
        if existing_follow:
            await db["topic_followers"].delete_one({"_id": existing_follow["_id"]})
            return {"status": "unfollowed"}
        else:
            await db["topic_followers"].insert_one({
                "user_uid": user_uid,
                "topic_id": topic_id,
                "created_at": datetime.utcnow()
            })
            return {"status": "followed"}
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/topics/{topic_id}/follow-status")
async def get_topic_follow_status(topic_id: str, firebase_user=Depends(verify_firebase_token)):
    """Check if the current user is following a specific topic"""
    try:
        if not ObjectId.is_valid(topic_id):
            raise HTTPException(status_code=400, detail="Invalid topic ID format")
            
        user_uid = firebase_user["uid"]
        existing_follow = await db["topic_followers"].find_one({
            "user_uid": user_uid,
            "topic_id": topic_id
        })
        
        return {"is_following": bool(existing_follow)}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )