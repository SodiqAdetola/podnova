# app/config.py
import os

# On Render, environment variables are set directly
# No need for python-dotenv
MONGODB_URI = os.getenv("MONGODB_URI")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME")

# Verify they're loaded
if not MONGODB_URI:
    raise ValueError("MONGODB_URI environment variable is not set!")
if not MONGODB_DB_NAME:
    raise ValueError("MONGODB_DB_NAME environment variable is not set!")