# app/routes/user_routes.py
from fastapi import APIRouter, Depends, HTTPException, status
from app.middleware.firebase_auth import verify_firebase_token
from app.controllers.user_controller import create_user_profile, get_user_profile
from app.models.user import UserProfile

router = APIRouter()


@router.post("/user", response_model=UserProfile)
async def create_user(firebase_user=Depends(verify_firebase_token)):
    try:
        return await create_user_profile(firebase_user)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/user", response_model=UserProfile)
async def get_current_user(firebase_user=Depends(verify_firebase_token)):
    profile = await get_user_profile(firebase_user["uid"])
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found"
        )
    return profile
