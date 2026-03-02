# app/services/script_service.py
"""
Script generation service for podcasts
Handles AI-powered script generation using Gemini, optimized for Text-to-Speech (TTS)
"""
from typing import Dict, List
import asyncio
import concurrent.futures
from functools import partial
import re
from google import genai
from app.config import GEMINI_API_KEY
from app.db import db
from bson import ObjectId


class ScriptService:
    """Service for generating podcast scripts using AI"""
    
    # Style configuration for different comprehension levels
    STYLE_INSTRUCTIONS = {
        "casual": {
            "approach": "Friendly and relaxed",
            "depth": "Explain ideas in a very easy-to-understand way with clear explanations and smooth flow. Emphasize clarity and intuitive understanding rather than technical framing.",
            "analysis": "Explain what happened and why it matters in a straightforward, easy-to-follow way while keeping the reasoning clear.",
            "language": "Very simple wording, informal tone, and natural phrasing. Prefer everyday vocabulary and explain any complex terms in plain language.",
            "audience": "People who prefer information explained in a relaxed, highly approachable style"
        },
        "standard": {
            "approach": "Conversational and accessible",
            "depth": "Cover the basics and main takeaways. Explain concepts in simple terms and vocabulary without jargon. Keep it light and easy to follow.",
            "analysis": "Focus on 'what happened' and 'why it matters' at a surface level. Use relatable analogies and examples.",
            "language": "Simple, everyday language. Short sentences. Conversational tone as if explaining to a friend.",
            "audience": "General audience with no prior knowledge"
        },
        "advanced": {
            "approach": "Balanced and professional",
            "depth": "Provide comprehensive coverage of the topic. Explain key concepts clearly while diving into important details.",
            "analysis": "Explore both 'what happened' and 'why it matters'. Include context, multiple perspectives, and immediate implications.",
            "language": "Clear professional language. Explain technical terms when used. Well-structured narrative flow.",
            "audience": "Informed readers who follow news regularly"
        },
        "expert": {
            "approach": "In-depth and critical",
            "depth": "Go beyond surface-level reporting. Analyze underlying factors, systemic issues, and broader patterns. Connect to related developments and historical context.",
            "analysis": "Critical examination of causes, effects, and stakeholder motivations. Question assumptions. Explore second and third-order consequences. Compare with similar past events.",
            "language": "Industry terminology is fine but should serve analysis, not replace it. Focus on substance over vocabulary.",
            "audience": "Professionals and enthusiasts with domain knowledge"
        }
    }

    # Centralized rules applied to ALL prompts to ensure TTS compliance
    TTS_STRICT_RULES = """
CRITICAL TEXT-TO-SPEECH (TTS) FORMATTING RULES:
This text will be fed directly into a machine text-to-speech engine. ANY special formatting will break the audio.
1. ABSOLUTELY NO MARKDOWN. Do not use asterisks (*), underscores (_), hashtags (#), or backticks (`).
2. NO ALL CAPS FOR EMPHASIS. The TTS engine reads ALL CAPS as acronyms (e.g., it reads "HUGE" as "H-U-G-E"). Use normal capitalization only.
3. NO LISTS OR BULLET POINTS. Everything must flow as continuous conversational prose.
4. NO BRACKETS OR PARENTHESES. Do not write [pause], (laughs), or [Intro Music]. Just write the spoken words.
5. NO URLS: Never include web links. Say "according to their website" instead.
6. WRITE FOR THE EAR. Spell out symbols when helpful (e.g., write "one point five billion dollars" instead of "$1.5B", or "percent" instead of "%").
7. USE PUNCTUATION FOR PACING. Use commas, periods, and em-dashes (—) to create natural pauses and breathing room for the AI voice.
8. USE FREQUENT PARAGRAPH BREAKS. Do not write a wall of text. Hit "Enter" twice between every few sentences to separate thoughts into short, distinct paragraphs.
"""
    
    def __init__(self):
        """Initialize the script service with Gemini client"""
        self.client = genai.Client(api_key=GEMINI_API_KEY)
        # Create a thread pool for blocking operations
        self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)
    
    async def generate_script(self, podcast_id: str) -> str:
        """
        Generate podcast script using Gemini AI (non-blocking)
        
        Args:
            podcast_id: MongoDB ObjectId of the podcast
            
        Returns:
            Generated script text sanitized for TTS
            
        Raises:
            Exception: If script generation fails
        """
        try:
            # Fetch podcast and topic data (these are async already)
            podcast = await db["podcasts"].find_one({"_id": ObjectId(podcast_id)})
            if not podcast:
                raise Exception(f"Podcast {podcast_id} not found")
                
            topic = await db["topics"].find_one({"_id": podcast["topic_id"]})
            if not topic:
                raise Exception(f"Topic for podcast {podcast_id} not found")
            
            # Fetch articles (async)
            articles = await self._fetch_articles(topic.get("article_ids", []))
            
            # Build prompt
            prompt = self._build_prompt(podcast, topic, articles)
            
            # Run the blocking Gemini API call in a thread pool
            loop = asyncio.get_running_loop()
            
            # Create a partial function with the arguments
            func = partial(
                self.client.models.generate_content,
                model="gemini-2.5-flash",
                contents=prompt
            )
            
            # Run in thread pool to avoid blocking
            response = await loop.run_in_executor(self.executor, func)
            
            script = response.text.strip()
            
            # Validate and expand if necessary
            if self._needs_expansion(podcast, script):
                script = await self._expand_script_async(podcast, script)
            
            # Sanitize for TTS before returning
            return self._sanitize_for_tts(script)
            
        except Exception as e:
            raise Exception(f"Failed to generate script: {str(e)}")
            
    def _sanitize_for_tts(self, text: str) -> str:
        """
        Deterministic post-processing to strip Markdown and TTS-breaking characters.
        Never trust the LLM to perfectly follow the 'No Markdown' rule.
        """
        # Remove markdown asterisks, underscores, hashes, and backticks
        text = re.sub(r'[*_#`]', '', text)
        
        # Remove any lingering stage directions like [pause], (sigh), or [Music]
        text = re.sub(r'\[.*?\]|\(.*?\)', '', text)
        
        # Replace common markdown list dashes with a space to preserve flow
        text = re.sub(r'^[-+]\s+', '', text, flags=re.MULTILINE)
        
        # Collapse multiple spaces or newlines into clean paragraph breaks
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = re.sub(r' {2,}', ' ', text)
        
        return text.strip()
    
    async def _fetch_articles(self, article_ids: List[ObjectId]) -> List[Dict]:
        """Fetch articles from database"""
        articles = []
        cursor = db["articles"].find(
            {"_id": {"$in": article_ids}}
        ).sort("published_date", -1)
        
        async for article in cursor:
            articles.append({
                "title": article["title"],
                "source": article["source"],
                "content": article.get("content", article.get("description", "")),
                "published": article["published_date"].strftime("%Y-%m-%d") if article.get("published_date") else "Unknown"
            })
        return articles
    
    def _needs_expansion(self, podcast: Dict, script: str) -> bool:
        """Synchronous check for expansion need"""
        word_count = len(script.split())
        target_words = podcast['length_minutes'] * 150
        return word_count < target_words * 0.8
    
    async def _expand_script_async(self, podcast: Dict, script: str) -> str:
        """Async version of script expansion"""
        style_config = self.STYLE_INSTRUCTIONS[podcast['style']]
        word_count = len(script.split())
        target_words = podcast['length_minutes'] * 150
        
        expansion_prompt = f"""The previous script was too short ({word_count} words vs {target_words} target).

EXPAND by adding MORE DEPTH AND ANALYSIS, not just more words:
- Dig deeper into the underlying factors and mechanisms
- Add critical analysis and multiple perspectives
- Include more specific examples and data points
- Explore broader implications and connections
- For {podcast['style'].upper()} level: {style_config['analysis']}

REMEMBER: We need deeper INSIGHT, not longer sentences or fancier vocabulary.

{self.TTS_STRICT_RULES}

Original script:
{script}

Generate an expanded version with significantly more analytical depth:"""
        
        loop = asyncio.get_running_loop()
        func = partial(
            self.client.models.generate_content,
            model="gemini-2.5-flash",
            contents=expansion_prompt
        )
        
        response = await loop.run_in_executor(self.executor, func)
        return response.text.strip()
    
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
        
        prompt = f"""You are a seasoned news narrator creating a spoken monologue for a PodNova podcast. Your script will be read aloud by an AI text-to-speech engine, so it must sound natural, fluid, and engaging—like a thoughtful friend explaining a complex topic.

TOPIC: {topic['title']}
CATEGORY: {topic['category'].upper()}
TARGET LENGTH: {podcast['length_minutes']} minutes
TARGET WORD COUNT: approximately {podcast['length_minutes'] * 150} words (spoken at ~150 words per minute)
COMPREHENSION LEVEL: {podcast['style'].upper()}

STYLE PROFILE:
- Audience: {style_config['audience']}
- Approach: {style_config['approach']}
- Depth Required: {style_config['depth']}
- Analysis Style: {style_config['analysis']}
- Language Guidelines: {style_config['language']}

{self.TTS_STRICT_RULES}

SOURCE MATERIALS:
You have {len(articles)} articles covering this topic. Synthesize information from ALL sources, not just one. When sources differ, acknowledge the nuance naturally (e.g., "While some outlets report X, others point to Y...").

{articles_text}

{focus_text}{custom_text}

CONSISTENT INTRO & OUTRO PATTERN:

**Intro Pattern (10–15 seconds)** - Must mention "PodNova" and "I'm your host".  
- Include a brief teaser of today's topic (a few words, engaging but not detailed).  
- Transition naturally into the main content (e.g., "Let's get into it," "Here's what's happening," etc.).  
- Keep the tone warm, inviting, and consistent with your overall style.

**Outro Pattern (10–15 seconds)** - Summarize the key takeaway in a concise, memorable way.  
- Thank the listener.  
- Mention "PodNova" and sign off.  
- Keep the tone warm and appreciative.

IMPORTANT:  
- Do not copy the example phrases verbatim; instead, use them as a guide to create your own natural-sounding intro and outro.  
- The core elements (PodNova, host mention, teaser, thanks, sign-off) must always be present.  

SCRIPT STRUCTURE (between intro and outro, follow approximate timing):

1. **Opening Hook** (next 15 seconds after intro) – Grab the listener with the most compelling angle: a surprising fact, a provocative question, or a vivid scene.
2. **Context & Background** (~20% of total time) – Set the stage: What's happening and why does it matter now? Provide essential background for the target audience.
3. **Core Analysis** (~50% of total time) – Synthesize the main developments from multiple sources. Go beyond surface facts. Use specific facts, figures, quotes, and attributions naturally.
4. **Implications & What's Next** (~20% of total time) – Who is affected and how? What are the broader consequences?

Now, generate the podcast script. Write ONLY the spoken words, beginning with an intro that follows the consistent pattern and ending with an outro that follows the consistent pattern.
"""
        return prompt