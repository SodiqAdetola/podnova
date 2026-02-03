# app/services/audio_service.py
"""
Audio generation service for podcast TTS
Handles text-to-speech conversion using Google Cloud TTS
"""
import os
import json
from typing import List, Tuple
from google.cloud import texttospeech
from google.oauth2 import service_account


class AudioService:
    """Service for generating audio from text using Google Cloud TTS"""
    
    def __init__(self):
        """Initialize the TTS client with credentials"""
        if os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
            creds_dict = json.loads(os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
            credentials = service_account.Credentials.from_service_account_info(creds_dict)
            self.tts_client = texttospeech.TextToSpeechClient(credentials=credentials)
        else:
            self.tts_client = texttospeech.TextToSpeechClient()
    
    def chunk_text(self, text: str, max_chars: int = 4000) -> List[str]:
        """
        Split text into chunks for TTS processing
        
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
        Generate audio from script using Google Cloud TTS
        
        Args:
            script: The podcast script text
            voice_name: The voice model name
            speaking_rate: Speech speed multiplier (0.8-1.25)
            
        Returns:
            Tuple of (audio_bytes, duration_seconds)
        """
        chunks = self.chunk_text(script)
        full_audio = b""
        
        for chunk in chunks:
            synthesis_input = texttospeech.SynthesisInput(text=chunk)
            
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
            
            full_audio += response.audio_content
        
        # Estimate duration based on word count
        word_count = len(script.split())
        duration_seconds = int((word_count / 160) * 60 / speaking_rate)
        
        return full_audio, duration_seconds