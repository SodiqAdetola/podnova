"""
Firebase Authentication Middleware
Verifies JWT tokens from Firebase and provides user identity to protected endpoints.
"""

import firebase_admin
from firebase_admin import auth, credentials
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import Optional
import os
import json

# Initialise Firebase Admin SDK once when the application starts.
# Supports both a local service account file and an environment variable (for cloud deployment).
if not firebase_admin._apps:
    try:
        # First, try to read a local service account file (for development).
        if os.path.exists("firebase-service-account.json"):
            cred = credentials.Certificate("firebase-service-account.json")
            firebase_admin.initialize_app(cred)
            print("Firebase initialized from file")
        else:
            # Fallback to environment variable (for production on Render).
            cred_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY")
            if cred_json:
                cred_dict = json.loads(cred_json)
                cred = credentials.Certificate(cred_dict)
                firebase_admin.initialize_app(cred)
                print("Firebase initialized from env var")
            else:
                print("Firebase credentials not found!")
    except Exception as e:
        print(f"Firebase initialization failed: {e}")

# HTTPBearer extracts the "Authorization: Bearer <token>" header.
# auto_error=False allows us to handle missing tokens gracefully ourselves.
security = HTTPBearer(auto_error=False)


async def verify_firebase_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[dict]:
    """
    Verify a Firebase ID token.

    Returns the decoded token (dictionary with uid, email, etc.) if valid.
    Returns None if no token was provided (for public endpoints).
    Raises HTTP 401 if a token is provided but is invalid or expired.
    """
    # No token at all – this is a public endpoint (e.g., topic listing).
    if not credentials:
        print("No token provided")
        return None
    
    token = credentials.credentials
    
    # The frontend may send literal strings "null" or "undefined" on error.
    # Reject them early to avoid useless Firebase calls.
    if token == "null" or token == "undefined":
        print("Invalid token string: null/undefined")
        return None
    
    try:
        # Verify the token with Firebase. This makes a network call to Firebase.
        decoded = auth.verify_id_token(token)
        print(f"Token verified for user: {decoded.get('uid')}")
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
    Strict version of token verification – requires a valid token.

    Use this for endpoints that absolutely must have an authenticated user.
    Raises HTTP 401 if no token is provided or if the token is invalid.
    """
    if not credentials:
        print("No token provided for protected endpoint")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No authorization token provided"
        )
    
    token = credentials.credentials
    
    if token == "null" or token == "undefined":
        print("Invalid token string: null/undefined")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token"
        )
    
    try:
        decoded = auth.verify_id_token(token)
        print(f"Token verified for user: {decoded.get('uid')}")
        return decoded
    except Exception as e:
        print(f"Firebase auth error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Firebase token"
        )