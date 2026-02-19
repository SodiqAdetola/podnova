# app/db.py
from motor.motor_asyncio import AsyncIOMotorClient
import os

# Don't create the client at module level
# Instead, create it when needed or use a connection pool

async def get_database():
    """Get database connection - creates new client each call"""
    client = AsyncIOMotorClient(os.getenv("MONGODB_URL"))
    db = client[os.getenv("MONGODB_DB_NAME")]
    return db, client

# Or if you must have a global client, use it carefully
class Database:
    def __init__(self):
        self.client = None
        self.db = None
    
    async def connect(self):
        self.client = AsyncIOMotorClient(os.getenv("MONGODB_URL"))
        self.db = self.client[os.getenv("MONGODB_DB_NAME")]
    
    async def close(self):
        if self.client:
            self.client.close()

# Create global instance
database = Database()

