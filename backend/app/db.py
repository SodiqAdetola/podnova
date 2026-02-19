# app/db.py
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import MONGODB_URI, MONGODB_DB_NAME

# Simple connection - no SSL workarounds needed!
client = AsyncIOMotorClient(MONGODB_URI)
db = client[MONGODB_DB_NAME]

print("MongoDB client initialised")