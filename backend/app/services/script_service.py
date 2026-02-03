# app/services/script_service.py
"""
Script generation service for podcasts
Handles AI-powered script generation using Gemini
"""
from typing import Dict, List
from google import genai
from app.config import GEMINI_API_KEY
from app.db import db
from bson import ObjectId


class ScriptService:
    """Service for generating podcast scripts using AI"""
    
    # Style configuration for different comprehension levels
    STYLE_INSTRUCTIONS = {
        "casual": {
            "approach": "Conversational and accessible",
            "depth": "Cover the basics and main takeaways. Explain concepts in simple terms without jargon. Keep it light and easy to follow.",
            "analysis": "Focus on 'what happened' and 'why it matters' at a surface level. Use relatable analogies and examples.",
            "language": "Simple, everyday language. Short sentences. Conversational tone as if explaining to a friend.",
            "audience": "General audience with no prior knowledge"
        },
        "standard": {
            "approach": "Balanced and professional",
            "depth": "Provide comprehensive coverage of the topic. Explain key concepts clearly while diving into important details.",
            "analysis": "Explore both 'what happened' and 'why it matters'. Include context, multiple perspectives, and immediate implications.",
            "language": "Clear professional language. Explain technical terms when used. Well-structured narrative flow.",
            "audience": "Informed readers who follow news regularly"
        },
        "advanced": {
            "approach": "In-depth and critical",
            "depth": "Go beyond surface-level reporting. Analyze underlying factors, systemic issues, and broader patterns. Connect to related developments and historical context.",
            "analysis": "Critical examination of causes, effects, and stakeholder motivations. Question assumptions. Explore second and third-order consequences. Compare with similar past events.",
            "language": "Industry terminology is fine but should serve analysis, not replace it. Focus on substance over vocabulary.",
            "audience": "Professionals and enthusiasts with domain knowledge"
        },
        "expert": {
            "approach": "Comprehensive and analytical",
            "depth": "Provide expert-level analysis with deep dives into mechanisms, methodologies, and implications. Challenge conventional wisdom. Explore edge cases and nuance.",
            "analysis": "Multi-dimensional analysis considering economic, political, social, and technical factors. Discuss competing theories and interpretations. Project future scenarios and strategic implications. Identify gaps in current understanding.",
            "language": "Technical precision where appropriate, but clarity remains paramount. The goal is insight, not complexity.",
            "audience": "Domain experts, researchers, and serious analysts"
        }
    }
    
    def __init__(self):
        """Initialize the script service with Gemini client"""
        self.client = genai.Client(api_key=GEMINI_API_KEY)
    
    async def generate_script(self, podcast_id: str) -> str:
        """
        Generate podcast script using Gemini AI
        
        Args:
            podcast_id: MongoDB ObjectId of the podcast
            
        Returns:
            Generated script text
            
        Raises:
            Exception: If script generation fails
        """
        # Fetch podcast and topic data
        podcast = await db["podcasts"].find_one({"_id": ObjectId(podcast_id)})
        topic = await db["topics"].find_one({"_id": podcast["topic_id"]})
        
        # Fetch articles
        articles = await self._fetch_articles(topic.get("article_ids", []))
        
        # Build prompt
        prompt = self._build_prompt(podcast, topic, articles)
        
        # Generate script
        try:
            response = self.client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt
            )
            
            script = response.text.strip()
            
            # Validate and expand if necessary
            script = await self._validate_and_expand(podcast, script)
            
            return script
            
        except Exception as e:
            raise Exception(f"Failed to generate script: {str(e)}")
    
    async def _fetch_articles(self, article_ids: List[ObjectId]) -> List[Dict]:
        """Fetch articles from database"""
        articles = []
        async for article in db["articles"].find(
            {"_id": {"$in": article_ids}}
        ).sort("published_date", -1):
            articles.append({
                "title": article["title"],
                "source": article["source"],
                "content": article.get("content", article.get("description", "")),
                "published": article["published_date"].strftime("%Y-%m-%d")
            })
        return articles
    
    def _build_prompt(self, podcast: Dict, topic: Dict, articles: List[Dict]) -> str:
        """Build the prompt for script generation"""
        style_config = self.STYLE_INSTRUCTIONS[podcast['style']]
        
        # Format articles
        articles_text = "\n\n".join([
            f"**{a['title']}** (Source: {a['source']}, Date: {a['published']})\n{a['content'][:1000]}..."
            for a in articles[:15]
        ])
        
        # Optional sections
        focus_text = ""
        if podcast.get("focus_areas"):
            focus_text = f"\n\nFOCUS AREAS: Pay special attention to: {', '.join(podcast['focus_areas'])}"
        
        custom_text = ""
        if podcast.get("custom_prompt"):
            custom_text = f"\n\nCUSTOM INSTRUCTIONS: {podcast['custom_prompt']}"
        
        prompt = f"""You are creating a podcast script about this news topic. This will be converted to natural speech, so write ONLY the spoken words - no stage directions, sound effects, formatting, or meta-commentary.

Write a spoken monologue intended to be read aloud by a human. Insert natural pauses using ellipses (...) or line breaks, occasional light fillers and light rhetorical phrases all sparingly. Avoid polished transitions. Prefer thinking-aloud style.

TOPIC: {topic['title']}
CATEGORY: {topic['category'].upper()}
TARGET LENGTH: {podcast['length_minutes']} minutes (~{podcast['length_minutes'] * 150} words)
COMPREHENSION LEVEL: {podcast['style'].upper()}

AUDIENCE & APPROACH:
- Target Audience: {style_config['audience']}
- Approach: {style_config['approach']}
- Depth Required: {style_config['depth']}
- Analysis Style: {style_config['analysis']}
- Language Guidelines: {style_config['language']}

CRITICAL INSTRUCTION FOR {podcast['style'].upper()} LEVEL:
{style_config['analysis']}

SOURCE ARTICLES ({len(articles)} total):
{articles_text}

{focus_text}{custom_text}

SCRIPT STRUCTURE:
1. **Opening Hook** (15 seconds): Lead with the most compelling angle. Make them want to keep listening.

2. **Context Setting** (20%): 
   - What's happening and why does it matter?
   - Essential background
   - {style_config['depth']}

3. **Core Analysis** (50%): 
   - Main developments synthesized from multiple sources
   - {style_config['analysis']}
   - For {podcast['style'].upper()} level: Go deeper than surface facts. Explore the 'why behind the why.'

4. **Implications & Significance** (20%):
   - Who's affected and how?
   - Broader consequences
   - What might happen next?
   - For ADVANCED/EXPERT: Discuss competing scenarios

5. **Closing** (10 seconds): 
   - Memorable synthesis or thought-provoking question

CRITICAL REQUIREMENTS:
- Write ONLY spoken words (no [music], stage directions, or "In this podcast...")
- Natural speech with conversational flow
- Synthesize information from MULTIPLE sources
- Include specific facts, figures, and quotes
- Attribute information naturally ("According to Reuters...")
- For {podcast['style'].upper()} level: DEPTH OF INSIGHT matters more than vocabulary complexity
- Avoid unnecessary jargon
- Avoid using the character *
- Stay objective and balanced
- End with a clear conclusion

Remember: {podcast['style'].upper()} level means deeper THINKING and ANALYSIS, not just fancier words.

Generate the podcast script now:"""

        return prompt
    
    async def _validate_and_expand(self, podcast: Dict, script: str) -> str:
        """Validate script length and expand if necessary"""
        word_count = len(script.split())
        target_words = podcast['length_minutes'] * 150
        
        if word_count < target_words * 0.7:
            style_config = self.STYLE_INSTRUCTIONS[podcast['style']]
            
            expansion_prompt = f"""The previous script was too short ({word_count} words vs {target_words} target).

EXPAND by adding MORE DEPTH AND ANALYSIS, not just more words:
- Dig deeper into the underlying factors and mechanisms
- Add critical analysis and multiple perspectives
- Include more specific examples and data points
- Explore broader implications and connections
- For {podcast['style'].upper()} level: {style_config['analysis']}

REMEMBER: We need deeper INSIGHT, not longer sentences or fancier vocabulary.

Original script:
{script}

Generate an expanded version with significantly more analytical depth:"""
            
            response = self.client.models.generate_content(
                model="gemini-2.5-flash",
                contents=expansion_prompt
            )
            script = response.text.strip()
        
        return script