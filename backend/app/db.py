# app/db.py
from motor.motor_asyncio import AsyncIOMotorClient
import os
import threading

# Global client for main thread only
_client = None
_db = None

# Thread-local storage for background threads
_thread_local = threading.local()


async def connect_to_mongo():
    """Initialize MongoDB connection for main thread"""
    global _client, _db, client, db
    mongo_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    db_name = os.getenv("MONGODB_DB_NAME", "podnova")
    
    try:
        _client = AsyncIOMotorClient(mongo_url)
        _db = _client[db_name]
        
        # Test connection
        await _client.admin.command('ping')
        print(f"Connected to MongoDB: {db_name}")
        
        # Set global references for backward compatibility
        client = _client
        db = _db
        
        return _db
    except Exception as e:
        print(f"Failed to connect to MongoDB: {e}")
        raise


async def close_mongo_connection():
    """Close MongoDB connection for main thread"""
    global _client, _db, client, db
    if _client:
        _client.close()
        _client = None
        _db = None
        client = None
        db = None
        print("Closed MongoDB connection")


def get_database():
    """
    Get database instance for current context.
    Returns main thread db or creates thread-local connection.
    """
    global _db
    
    # Check if we're in a background thread
    if threading.current_thread() is not threading.main_thread():
        # We're in a background thread - use thread-local connection
        if not hasattr(_thread_local, 'db'):
            # Create thread-local connection
            mongo_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
            db_name = os.getenv("MONGODB_DB_NAME", "podnova")
            
            # Create new client for this thread
            client = AsyncIOMotorClient(mongo_url)
            _thread_local.client = client
            _thread_local.db = client[db_name]
            print(f"Created thread-local MongoDB connection for {threading.current_thread().name}")
        
        return _thread_local.db
    else:
        # We're in the main thread - return global db
        return _db


def cleanup_thread_local():
    """Clean up thread-local connection"""
    if hasattr(_thread_local, 'client'):
        _thread_local.client.close()
        delattr(_thread_local, 'client')
        delattr(_thread_local, 'db')
        print(f"Cleaned up thread-local connection for {threading.current_thread().name}")


# For backward compatibility - these will be set in connect_to_mongo()
client = None
db = None