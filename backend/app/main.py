# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import (
    user_routes,
    topics_routes,
    podcasts_routes,
    # discussion_routes,
    # auth,  # only for explicit auth routes
)
import firebase_admin
from firebase_admin import credentials
import os

# Initialise Firebase Admin SDK
if not firebase_admin._apps:
    try:
        cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY")
        if cred_path and os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred, {
                'storageBucket': os.getenv("FIREBASE_STORAGE_BUCKET")
            })
            print("Firebase initialized successfully")
        else:
            print("Firebase key not found")
    except Exception as e:
        print(f"Firebase initialization failed: {str(e)}")


app = FastAPI(title="PodNova Backend")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """Test MongoDB connection on startup"""
    try:
        from app.db import client
        await client.admin.command('ping')
        print("MongoDB connection successful!")
    except Exception as e:
        print(f"MongoDB connection failed: {e}")

@app.get("/")
def root():
    return {"message": "Welcome to PodNova Backend!"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

app.include_router(user_routes.router, prefix="/users", tags=["users"])
app.include_router(topics_routes.router, prefix="/topics", tags=["topics"])
app.include_router(podcasts_routes.router, prefix="/podcasts", tags=["podcasts"])
# app.include_router(discussion_routes.router, prefix="/discussions", tags=["discussions"])
# app.include_router(auth.router, prefix="/auth", tags=["auth"])
