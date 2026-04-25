"""
Rate Limiting Middleware
Limits how many times a specific user can call an endpoint within a time window.
Uses MongoDB to persist counts across server restarts.
"""

from fastapi import HTTPException, status, Depends
from datetime import datetime, timedelta
from app.db import db
from app.middleware.firebase_auth import verify_firebase_token


class RateLimit:
    """
    Rate limiter for endpoints.

    Attributes:
        limit: maximum number of allowed requests per window
        window_minutes: length of the time window in minutes
        action_name: string that identifies the action (e.g., "generate_podcast")
    """

    def __init__(self, limit: int, window_minutes: int, action_name: str):
        self.limit = limit
        self.window_minutes = window_minutes
        self.action_name = action_name

    async def __call__(self, firebase_user: dict = Depends(verify_firebase_token)):
        """
        Check the rate limit and record the current request.

        Returns the same firebase_user dictionary if the request is allowed,
        so that the route can still access the authenticated user data.
        """
        uid = firebase_user["uid"]
        now = datetime.utcnow()
        cutoff = now - timedelta(minutes=self.window_minutes)

        # 1. Delete old records for this user and action to keep the database small.
        await db["rate_limits"].delete_many({
            "uid": uid,
            "action": self.action_name,
            "timestamp": {"$lt": cutoff}
        })

        # 2. Count how many requests this user made within the current window.
        count = await db["rate_limits"].count_documents({
            "uid": uid,
            "action": self.action_name,
            "timestamp": {"$gte": cutoff}
        })

        # 3. Block the request if the limit has been exceeded.
        if count >= self.limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. You can only perform this action {self.limit} times per {self.window_minutes} minutes."
            )

        # 4. Record this request for future rate limit checks.
        await db["rate_limits"].insert_one({
            "uid": uid,
            "action": self.action_name,
            "timestamp": now
        })
        
        # Return the user data so the route can still use it.
        return firebase_user