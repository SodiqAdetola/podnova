# app/middleware/firebase_auth.py
import firebase_admin
from firebase_admin import auth, credentials
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import os

# Initialize Firebase Admin
if not firebase_admin._apps:
    if os.path.exists("firebase-service-account.json"):
        cred = credentials.Certificate("firebase-service-account.json")
        firebase_admin.initialize_app(cred)
        print("Firebase initialized")
    else:
        raise FileNotFoundError("firebase-service-account.json not found!")

security = HTTPBearer()

def verify_firebase_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify Firebase ID token"""
    token = credentials.credentials
    try:
        decoded = auth.verify_id_token(token)
        return decoded
    except Exception as e:
        print(f"Firebase auth error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Firebase token"
        )