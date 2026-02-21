# app/middleware/firebase_auth.py
import firebase_admin
from firebase_admin import auth, credentials
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import Optional
import os

# Initialize Firebase Admin
if not firebase_admin._apps:
    if os.path.exists("firebase-service-account.json"):
        cred = credentials.Certificate("firebase-service-account.json")
        firebase_admin.initialize_app(cred)
        print("Firebase initialized")
    else:
        # Try environment variable as fallback
        cred_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY")
        if cred_json:
            import json
            cred_dict = json.loads(cred_json)
            cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(cred)
            print("Firebase initialized from env var")
        else:
            raise FileNotFoundError("Firebase credentials not found!")

# Set auto_error=False to handle missing tokens gracefully
security = HTTPBearer(auto_error=False)

async def verify_firebase_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[dict]:
    """
    Verify Firebase ID token.
    Returns None if no token provided (for public endpoints).
    Raises 401 if token is invalid.
    """
    # No token provided - return None instead of raising error
    if not credentials:
        return None
    
    token = credentials.credentials
    
    # Don't try to parse "null" or "undefined" as a token
    if token == "null" or token == "undefined":
        return None
    
    try:
        decoded = auth.verify_id_token(token)
        return decoded
    except Exception as e:
        print(f"Firebase auth error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Firebase token"
        )


async def require_firebase_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> dict:
    """
    Strict version - requires valid token.
    Use this for endpoints that absolutely need authentication.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No authorization token provided"
        )
    
    token = credentials.credentials
    
    # Don't try to parse "null" or "undefined" as a token
    if token == "null" or token == "undefined":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token"
        )
    
    try:
        decoded = auth.verify_id_token(token)
        return decoded
    except Exception as e:
        print(f"Firebase auth error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Firebase token"
        )