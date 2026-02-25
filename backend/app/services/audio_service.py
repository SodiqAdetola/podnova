# app/services/audio_service.py
"""
Audio generation service for podcast TTS
Handles text-to-speech conversion using Google Cloud TTS
"""
import os
import json
import asyncio
import concurrent.futures
from typing import List, Tuple
from google.cloud import texttospeech
from google.oauth2 import service_account


class AudioService:
    """Service for generating audio from text using Google Cloud TTS"""
    
    def __init__(self):
        """Initialize the TTS client with credentials"""
        if os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
            try:
                creds_dict = json.loads(os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
                credentials = service_account.Credentials.from_service_account_info(creds_dict)
                self.tts_client = texttospeech.TextToSpeechClient(credentials=credentials)
            except:
                # Fallback to default credentials
                self.tts_client = texttospeech.TextToSpeechClient()
        else:
            self.tts_client = texttospeech.TextToSpeechClient()
        
        # Create thread pool for blocking operations
        self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)
    
    def chunk_text(self, text: str, max_chars: int = 4000) -> List[str]:
        """
        Split text into chunks for TTS processing (synchronous, quick)
        
        Args:
            text: The text to split
            max_chars: Maximum characters per chunk
            
        Returns:
            List of text chunks
        """
        chunks = []
        while len(text) > max_chars:
            # Try to split at sentence end
            split_at = text.rfind(".", 0, max_chars)
            if split_at == -1:
                split_at = text.rfind(" ", 0, max_chars)
                if split_at == -1:
                    split_at = max_chars
            chunks.append(text[:split_at + 1].strip())
            text = text[split_at + 1:].strip()
        
        if text:
            chunks.append(text)
        
        return chunks
    
    async def generate_audio(
        self,
        script: str,
        voice_name: str,
        speaking_rate: float = 1.0
    ) -> Tuple[bytes, int]:
        """
        Generate audio from script using Google Cloud TTS (non-blocking)
        
        Args:
            script: The podcast script text
            voice_name: The voice model name
            speaking_rate: Speech speed multiplier (0.8-1.25)
            
        Returns:
            Tuple of (audio_bytes, duration_seconds)
        """
        chunks = self.chunk_text(script)
        full_audio = b""
        
        loop = asyncio.get_event_loop()
        
        for chunk in chunks:
            # Create synthesis function for this chunk
            def synthesize_chunk(text_chunk):
                synthesis_input = texttospeech.SynthesisInput(text=text_chunk)
                
                voice = texttospeech.VoiceSelectionParams(
                    language_code="en-US",
                    name=voice_name,
                )
                
                audio_config = texttospeech.AudioConfig(
                    audio_encoding=texttospeech.AudioEncoding.MP3,
                    speaking_rate=speaking_rate,
                )
                
                response = self.tts_client.synthesize_speech(
                    input=synthesis_input,
                    voice=voice,
                    audio_config=audio_config,
                )
                return response.audio_content
            
            # Run in thread pool
            audio_chunk = await loop.run_in_executor(
                self.executor, 
                synthesize_chunk, 
                chunk
            )
            full_audio += audio_chunk
        
        # Estimate duration based on word count (more accurate)
        word_count = len(script.split())
        # Average speaking rate: 150 words per minute, adjust for speaking_rate
        duration_seconds = int((word_count / 150) * 60 / speaking_rate)
        
        return full_audio, duration_seconds
    
    async def cleanup(self):
        """Clean up thread pool"""
        self.executor.shutdown(wait=True)