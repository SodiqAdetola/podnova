# app/services/storage_service.py
"""
Storage service for managing Firebase Storage uploads
Handles podcast audio and transcript file uploads
"""
from firebase_admin import storage
from typing import Tuple


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
        
        Args:
            podcast_id: The podcast ID (used for file paths)
            audio_data: The audio file bytes
            script: The podcast script text
            
        Returns:
            Tuple of (audio_url, transcript_url)
        """
        # Upload audio
        audio_blob = self.bucket.blob(f"podcasts/{podcast_id}/audio.mp3")
        audio_blob.upload_from_string(
            audio_data,
            content_type="audio/mpeg"
        )
        audio_blob.make_public()
        audio_url = audio_blob.public_url
        
        # Upload transcript
        transcript_blob = self.bucket.blob(f"podcasts/{podcast_id}/transcript.txt")
        transcript_blob.upload_from_string(
            script,
            content_type="text/plain"
        )
        transcript_blob.make_public()
        transcript_url = transcript_blob.public_url
        
        return audio_url, transcript_url
    
    async def delete_podcast_files(self, podcast_id: str) -> bool:
        """
        Delete podcast files from Firebase Storage
        
        Args:
            podcast_id: The podcast ID
            
        Returns:
            True if deletion was successful
        """
        try:
            self.bucket.blob(f"podcasts/{podcast_id}/audio.mp3").delete()
            self.bucket.blob(f"podcasts/{podcast_id}/transcript.txt").delete()
            return True
        except Exception as e:
            print(f"Error deleting podcast files: {str(e)}")
            return False