# app/middleware/firebase_auth.py
import firebase_admin
from firebase_admin import auth, credentials
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

# Initialise Firebase Admin once
cred = credentials.Certificate("firebase-service-account.json")
firebase_admin.initialize_app(cred)

security = HTTPBearer()

def verify_firebase_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    FastAPI dependency to verify Firebase ID token from Authorization: Bearer <token>
    """
    token = credentials.credentials
    try:
        decoded = auth.verify_id_token(token)
        # decoded has fields like: uid, email, name, etc.
        return decoded
    except Exception as e:
        print("Firebase auth error:", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Firebase token"
        )
