# app/middleware/rate_limit.py
from fastapi import HTTPException, status, Depends
from datetime import datetime, timedelta
from app.db import db
from app.middleware.firebase_auth import verify_firebase_token

class RateLimit:
    """
    Limits the number of times a specific user can hit an endpoint.
    Uses MongoDB to persist limits across server restarts.
    """
    def __init__(self, limit: int, window_minutes: int, action_name: str):
        self.limit = limit
        self.window_minutes = window_minutes
        self.action_name = action_name

    async def __call__(self, firebase_user: dict = Depends(verify_firebase_token)):
        uid = firebase_user["uid"]
        now = datetime.utcnow()
        cutoff = now - timedelta(minutes=self.window_minutes)

        # 1. Clean up old records for this user & action to keep DB small
        await db["rate_limits"].delete_many({
            "uid": uid,
            "action": self.action_name,
            "timestamp": {"$lt": cutoff}
        })

        # 2. Count how many requests they made within the active window
        count = await db["rate_limits"].count_documents({
            "uid": uid,
            "action": self.action_name,
            "timestamp": {"$gte": cutoff}
        })

        # 3. Block if they exceeded the limit
        if count >= self.limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. You can only perform this action {self.limit} times per {self.window_minutes} minutes."
            )

        # 4. Log this new request
        await db["rate_limits"].insert_one({
            "uid": uid,
            "action": self.action_name,
            "timestamp": now
        })
        
        # Return the user so the route can still use the Firebase auth data
        return firebase_user