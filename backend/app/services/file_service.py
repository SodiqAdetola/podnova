# app/services/file_service.py
import io
import PyPDF2
from fastapi import UploadFile

class FileService:
    """Service for extracting text from user-uploaded files"""
    
    async def extract_text(self, file: UploadFile) -> str:
        # Read the file bytes into memory
        content = await file.read()
        text = f"\n--- Source Document: {file.filename} ---\n"
        
        # Handle PDFs
        if file.filename.lower().endswith('.pdf') or file.content_type == 'application/pdf':
            try:
                pdf_reader = PyPDF2.PdfReader(io.BytesIO(content))
                for page in pdf_reader.pages:
                    extracted = page.extract_text()
                    if extracted:
                        text += extracted + "\n"
            except Exception as e:
                print(f"Error reading PDF {file.filename}: {e}")
                text += "[Could not extract text from this PDF due to formatting/encryption]\n"
        
        # Handle Standard Text Files
        else:
            try:
                # Try standard UTF-8 first
                text += content.decode('utf-8')
            except UnicodeDecodeError:
                try:
                    # Fallback for older file types
                    text += content.decode('latin-1')
                except Exception:
                    text += "[Could not decode text from this file]\n"
                    
        return text + "\n"

file_service = FileService()