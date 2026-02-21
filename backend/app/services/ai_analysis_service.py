# app/services/ai_analysis_service.py
from google import genai
import os
import json
from typing import Dict


class AIAnalysisService:
    """Service for analysing reply content using Gemini"""
    
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key:
            self.client = genai.Client(api_key=api_key)
            self.model = "gemini-2.5-flash"
        else:
            self.client = None
            self.model = None
            print("Warning: GEMINI_API_KEY not set. AI analysis will be skipped.")
    
    async def analyze_reply(self, content: str) -> Dict:
        """
        Analyze a reply to determine factual vs opinion content
        
        LEGAL DISCLAIMER: This is an AI-generated estimate, not a definitive 
        fact-check. Users should verify information independently.
        
        Args:
            content: The reply text to analyze
            
        Returns:
            {
                "factual_score": 0-100 (percentage),
                "confidence": "low" | "medium" | "high",
                "disclaimer": "AI-generated analysis..."
            }
        """
        
        if not self.client:
            # Return default if Gemini not configured
            return {
                "factual_score": 50,
                "confidence": "low",
                "disclaimer": "AI analysis unavailable. Please verify information independently."
            }
        
        try:
            prompt = f"""Analyze this discussion reply and estimate what percentage is factual vs opinion.

Reply: "{content}"

Provide ONLY a JSON response with this exact format:
{{
    "factual_score": <number 0-100>,
    "confidence": "<low|medium|high>",
    "reasoning": "<brief explanation>"
}}

Guidelines:
- Factual: Contains verifiable claims, data, sources, or objective statements
- Opinion: Contains subjective views, predictions, beliefs, or personal preferences
- factual_score: 0 = pure opinion, 100 = pure facts
- confidence: 
  - low = ambiguous or unclear
  - medium = reasonably clear distinction
  - high = very clear factual or opinion content

Example:
- "I think AI is the future" = 10-20 (mostly opinion)
- "AI chip sales grew 40% in 2024" = 80-90 (mostly factual if verifiable)
- "Studies show AI improves productivity" = 60-70 (factual claim but vague)

Respond ONLY with JSON, no other text."""

            response = self.client.models.generate_content(
                model=self.model,
                contents=prompt
            )
            
            # Parse JSON response
            result_text = response.text.strip()
            
            # Remove markdown code blocks if present
            if result_text.startswith("```"):
                result_text = result_text.split("```")[1]
                if result_text.startswith("json"):
                    result_text = result_text[4:]
                result_text = result_text.strip()
            
            result = json.loads(result_text)
            
            # Validate and clamp score
            factual_score = max(0, min(100, int(result.get("factual_score", 50))))
            confidence = result.get("confidence", "medium").lower()
            
            if confidence not in ["low", "medium", "high"]:
                confidence = "medium"
            
            return {
                "factual_score": factual_score,
                "confidence": confidence,
                "disclaimer": "AI-generated analysis. Not a definitive fact-check. Please verify information independently."
            }
            
        except Exception as e:
            print(f"AI analysis error: {str(e)}")
            # Return conservative default on error
            return {
                "factual_score": 50,
                "confidence": "low",
                "disclaimer": "AI analysis unavailable. Please verify information independently."
            }
    
    def format_for_display(self, analysis: Dict) -> str:
        """
        Format analysis for user display
        
        Examples:
        - "Factual 87%" (high confidence)
        - "Opinion 13%" (high confidence)
        - "Mixed 45%" (medium/low confidence)
        """
        
        score = analysis.get("factual_score", 50)
        confidence = analysis.get("confidence", "low")
        
        if confidence == "high":
            if score >= 70:
                return f"Factual {score}%"
            elif score <= 30:
                return f"Opinion {100 - score}%"
            else:
                return f"Mixed {score}%"
        else:
            # Lower confidence = show as "Mixed"
            return f"Mixed {score}%"


# Singleton instance
ai_analysis_service = AIAnalysisService()