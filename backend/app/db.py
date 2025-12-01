# app/db.py

import certifi
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import MONGODB_URI, MONGODB_DB_NAME

# Create MongoDB client with proper SSL certificate verification
# certifi provides Mozilla's CA bundle for SSL verification
client = AsyncIOMotorClient(
    MONGODB_URI,
    tlsCAFile=certifi.where(),  # Use certifi's CA bundle for SSL verification
    serverSelectionTimeoutMS=10000,
    connectTimeoutMS=20000,
)

db = client[MONGODB_DB_NAME]