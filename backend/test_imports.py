#!/usr/bin/env python3
# test_imports.py - Run this in your backend directory to find the failing import

import sys
import traceback

print("=" * 60)
print("TESTING IMPORTS STEP BY STEP")
print("=" * 60)

# Test 1: Basic FastAPI
print("\n1. Testing FastAPI...")
try:
    from fastapi import APIRouter
    print("✓ FastAPI imports OK")
except Exception as e:
    print(f"❌ FastAPI import failed: {e}")
    sys.exit(1)

# Test 2: Config
print("\n2. Testing app.config...")
try:
    from app.config import MONGODB_URI, GEMINI_API_KEY
    print("✓ app.config imports OK")
except Exception as e:
    print(f"❌ app.config import failed: {e}")
    traceback.print_exc()

# Test 3: Firebase Auth
print("\n3. Testing Firebase auth middleware...")
try:
    from app.middleware.firebase_auth import verify_firebase_token
    print("✓ Firebase auth imports OK")
except Exception as e:
    print(f"❌ Firebase auth import failed: {e}")
    traceback.print_exc()

# Test 4: Google Generative AI
print("\n4. Testing google.genai...")
try:
    from google import genai
    print("✓ google.genai imports OK")
except Exception as e:
    print(f"❌ google.genai import failed: {e}")
    print("Run: pip install google-generativeai")
    traceback.print_exc()

# Test 5: Google Cloud TTS
print("\n5. Testing google.cloud.texttospeech...")
try:
    from google.cloud import texttospeech
    print("✓ google.cloud.texttospeech imports OK")
except Exception as e:
    print(f"❌ google.cloud.texttospeech import failed: {e}")
    print("Run: pip install google-cloud-texttospeech")
    traceback.print_exc()

# Test 6: Firebase Admin
print("\n6. Testing firebase_admin...")
try:
    import firebase_admin
    from firebase_admin import credentials, storage
    print("✓ firebase_admin imports OK")
except Exception as e:
    print(f"❌ firebase_admin import failed: {e}")
    traceback.print_exc()

# Test 7: Database
print("\n7. Testing app.db...")
try:
    from app.db import db
    print("✓ app.db imports OK")
except Exception as e:
    print(f"❌ app.db import failed: {e}")
    traceback.print_exc()

# Test 8: User models
print("\n8. Testing app.models.user...")
try:
    from app.models.user import UserProfile, UserPreferences
    print("✓ app.models.user imports OK")
except Exception as e:
    print(f"❌ app.models.user import failed: {e}")
    traceback.print_exc()

# Test 9: Controller imports
print("\n9. Testing podcasts_controller imports...")
try:
    from app.controllers.podcasts_controller import (
        create_podcast,
        get_user_podcasts,
        PodcastStyle,
        PodcastVoice
    )
    print("✓ podcasts_controller imports OK")
except Exception as e:
    print(f"❌ podcasts_controller import failed: {e}")
    print("\nThis is the failing import!")
    traceback.print_exc()

# Test 10: Routes
print("\n10. Testing podcasts_routes...")
try:
    from app.routes import podcasts_routes
    print("✓ podcasts_routes imports OK")
    print(f"✓ Router has {len(podcasts_routes.router.routes)} routes")
except Exception as e:
    print(f"❌ podcasts_routes import failed: {e}")
    print("\nThis is why the router isn't registered!")
    traceback.print_exc()

print("\n" + "=" * 60)
print("IMPORT TEST COMPLETE")
print("=" * 60)
print("\nIf any imports failed, fix those issues first.")
print("The first failing import is blocking everything after it.")