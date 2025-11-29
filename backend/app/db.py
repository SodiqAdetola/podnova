# app/db.py

from motor.motor_asyncio import AsyncIOMotorClient
from app.config import MONGODB_URI, MONGODB_DB_NAME

client = AsyncIOMotorClient(MONGODB_URI)
db = client[MONGODB_DB_NAME]

