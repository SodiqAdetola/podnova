# app/services/storage_service.py
"""
Storage service for managing Firebase Storage uploads
Handles podcast audio and transcript file uploads
"""
from firebase_admin import storage
from typing import Tuple
import time

class StorageService:
    """Service for managing file uploads to Firebase Storage"""
    
    def __init__(self, bucket_name: str = "podnova-9ecc2.firebasestorage.app"):
        """
        Initialize the storage service
        
        Args:
            bucket_name: Firebase Storage bucket name
        """
        self.bucket_name = bucket_name
        self.bucket = storage.bucket(bucket_name)
    
    async def upload_podcast_files(
        self,
        podcast_id: str,
        audio_data: bytes,
        script: str
    ) -> Tuple[str, str]:
        """
        Upload podcast audio and transcript to Firebase Storage
        Appends a timestamp to bypass frontend caching on regeneration.
        """
        # Create a unique timestamp for this generation
        timestamp = int(time.time())
        
        # Upload audio with timestamped name
        audio_blob = self.bucket.blob(f"podcasts/{podcast_id}/audio_{timestamp}.mp3")
        audio_blob.upload_from_string(
            audio_data,
            content_type="audio/mpeg"
        )
        audio_blob.make_public()
        audio_url = audio_blob.public_url
        
        # Upload transcript with timestamped name
        transcript_blob = self.bucket.blob(f"podcasts/{podcast_id}/transcript_{timestamp}.txt")
        transcript_blob.upload_from_string(
            script,
            content_type="text/plain"
        )
        transcript_blob.make_public()
        transcript_url = transcript_blob.public_url
        
        return audio_url, transcript_url
    
    async def delete_podcast_files(self, podcast_id: str) -> bool:
        """
        Delete all podcast files from Firebase Storage for a specific ID.
        Uses prefix deletion to catch files regardless of their timestamp.
        """
        try:
            # List all files in this podcast's "folder" and delete them
            blobs = self.bucket.list_blobs(prefix=f"podcasts/{podcast_id}/")
            
            deleted_count = 0
            for blob in blobs:
                blob.delete()
                deleted_count += 1
                
            print(f"Deleted {deleted_count} files for podcast {podcast_id}")
            return True
        except Exception as e:
            print(f"Error deleting podcast files: {str(e)}")
            return False

# Initialize a singleton instance to be imported by controllers
storage_service = StorageService()