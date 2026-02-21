# app/middleware/firebase_auth.py
import firebase_admin
from firebase_admin import auth, credentials
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import Optional
import os
import json

# Initialize Firebase Admin
if not firebase_admin._apps:
    try:
        # Try file first
        if os.path.exists("firebase-service-account.json"):
            cred = credentials.Certificate("firebase-service-account.json")
            firebase_admin.initialize_app(cred)
            print("✅ Firebase initialized from file")
        else:
            # Try environment variable
            cred_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY")
            if cred_json:
                cred_dict = json.loads(cred_json)
                cred = credentials.Certificate(cred_dict)
                firebase_admin.initialize_app(cred)
                print("✅ Firebase initialized from env var")
            else:
                print("⚠️ Firebase credentials not found!")
    except Exception as e:
        print(f"❌ Firebase initialization failed: {e}")

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
        print("  🔑 No token provided")
        return None
    
    token = credentials.credentials
    
    # Don't try to parse "null" or "undefined" as a token
    if token == "null" or token == "undefined":
        print("  🔑 Invalid token string: null/undefined")
        return None
    
    try:
        decoded = auth.verify_id_token(token)
        print(f"  🔑 Token verified for user: {decoded.get('uid')}")
        return decoded
    except Exception as e:
        print(f"  🔑 Firebase auth error: {e}")
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
        print("  🔑 No token provided for protected endpoint")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No authorization token provided"
        )
    
    token = credentials.credentials
    
    # Don't try to parse "null" or "undefined" as a token
    if token == "null" or token == "undefined":
        print("  🔑 Invalid token string: null/undefined")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token"
        )
    
    try:
        decoded = auth.verify_id_token(token)
        print(f"  🔑 Token verified for user: {decoded.get('uid')}")
        return decoded
    except Exception as e:
        print(f"  🔑 Firebase auth error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Firebase token"
        )