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
from datetime import datetime
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
            "language": "Clear professional language. Use industry terms but keep the surrounding sentence structure accessible.",
            "audience": "Informed readers who follow news regularly"
        },
        "expert": {
            "approach": "In-depth and critical",
            "depth": "Go beyond surface-level reporting. Analyze underlying factors, systemic issues, and broader patterns. Connect to related developments and historical context.",
            "analysis": "Critical examination of causes, effects, and stakeholder motivations. Question assumptions. Explore second and third-order consequences.",
            "language": "Industry terminology is expected, but it must serve the analysis, not replace it. Focus on substance over unnecessarily complex adjectives.",
            "audience": "Professionals and enthusiasts with domain knowledge"
        }
    }

    # Narrative Lens Configuration
    CATEGORY_INSTRUCTIONS = {
        "finance": "Anchor the narrative in a financial and economic perspective. Highlight market impact, business strategy, and economic consequences. You may discuss tech, politics, or social elements if they are relevant, but ensure they ultimately tie back to the money and markets.",
        "technology": "Anchor the narrative in a technology and innovation perspective. Highlight how the tech works, industry trends, and its impact on the digital landscape. You may discuss business or political factors if relevant, but ensure the spotlight remains on the technological developments.",
        "politics": "Anchor the narrative in a political and policy perspective. Highlight government actions, geopolitical shifts, and societal impact. You may discuss economic or tech factors if they intersect with policy, but ensure the primary focus remains on the political narrative and consequences.",
        "default": "Anchor the narrative in the core themes of this category while naturally incorporating relevant outside context."
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
9. Use Ellipses for "Thinking" Pauses: Instead of "Today we look at tech," write "Today... we’re taking a look at tech."
10. Add Exclamation Points (Sparingly)
11. Use Contractions: For example instead of "It is a great day" use "It’s a great day."
12. Hyphens for Emphasis: Use hyphens to break up technical terms. "The Q-3-report" will sound more natural than "The Q3 report,"
"""

    # NEW: Rules to ensure high intellectual quality but accessible, inclusive vocabulary
    ACCESSIBILITY_RULES = """
CRITICAL INCLUSIVITY & VOCABULARY RULES:
1. ACCESSIBLE INTELLIGENCE: Your analysis must be intellectually rigorous, but your vocabulary MUST remain plain and inclusive. Do not "dumb down" the ideas, but DO simplify the words used to explain them.
2. BAN AI-SPEAK: Absolutely NO overly academic or cliché AI words. You are strictly forbidden from using words like: "delve", "multifaceted", "myriad", "tapestry", "overarching", "paradigm", "catalyst", "realm", "intricate", "navigate", "foster", or "testament".
3. INLINE DEFINITIONS: If you must use a complex industry term, acronym, or jargon (e.g., "quantitative easing", "API", "filibuster"), you MUST immediately define it in half a sentence using plain English so all listeners can follow along.
4. SHORT, PUNCHY SENTENCES: Avoid long, winding sentences with multiple clauses. Keep phrasing direct, conversational, and easy for the ear to process.
"""
    
    def __init__(self):
        self.client = genai.Client(api_key=GEMINI_API_KEY)
        self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)
    
    async def generate_script(self, podcast_id: str) -> str:
        """Generate podcast script using Gemini AI (non-blocking)"""
        try:
            podcast = await db["podcasts"].find_one({"_id": ObjectId(podcast_id)})
            if not podcast:
                raise Exception(f"Podcast {podcast_id} not found")
                
            topic = await db["topics"].find_one({"_id": podcast["topic_id"]})
            if not topic:
                raise Exception(f"Topic for podcast {podcast_id} not found")
            
            articles = await self._fetch_articles(topic.get("article_ids", []))
            
            is_update_focus = podcast.get("focus_on_updates", False)
            podcast_created_at = podcast.get("created_at")
            
            prompt = self._build_prompt(podcast, topic, articles, is_update_focus, podcast_created_at)
            
            loop = asyncio.get_running_loop()
            func = partial(
                self.client.models.generate_content,
                model="gemini-2.5-flash",
                contents=prompt
            )
            
            response = await loop.run_in_executor(self.executor, func)
            script = response.text.strip()
            
            if self._needs_expansion(podcast, script):
                script = await self._expand_script_async(podcast, topic, script)
            
            return self._sanitize_for_tts(script)
            
        except Exception as e:
            raise Exception(f"Failed to generate script: {str(e)}")

    async def generate_custom_script(self, podcast_id: str) -> str:
        """Generate a script entirely from user-uploaded documents and prompts"""
        try:
            podcast = await db["podcasts"].find_one({"_id": ObjectId(podcast_id)})
            if not podcast:
                raise Exception(f"Podcast {podcast_id} not found")
                
            prompt = self._build_custom_prompt(podcast)
            
            loop = asyncio.get_running_loop()
            func = partial(
                self.client.models.generate_content,
                model="gemini-2.5-flash",
                contents=prompt
            )
            
            response = await loop.run_in_executor(self.executor, func)
            script = response.text.strip()
            
            return self._sanitize_for_tts(script)
            
        except Exception as e:
            raise Exception(f"Failed to generate custom script: {str(e)}")
            
    def _sanitize_for_tts(self, text: str) -> str:
        """Deterministic post-processing to strip Markdown and TTS-breaking characters."""
        text = re.sub(r'[*_#`]', '', text)
        text = re.sub(r'\[.*?\]|\(.*?\)', '', text)
        text = re.sub(r'^[-+]\s+', '', text, flags=re.MULTILINE)
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = re.sub(r' {2,}', ' ', text)
        return text.strip()
    
    async def _fetch_articles(self, article_ids: List[ObjectId]) -> List[Dict]:
        """Fetch articles from database, returning raw dates for sorting logic later"""
        articles = []
        cursor = db["articles"].find(
            {"_id": {"$in": article_ids}}
        ).sort("published_date", -1)
        
        async for article in cursor:
            articles.append({
                "title": article["title"],
                "source": article["source"],
                "content": article.get("content", article.get("description", "")),
                "published_date_raw": article.get("published_date"), # Keep raw for comparison
                "published": article["published_date"].strftime("%Y-%m-%d") if article.get("published_date") else "Unknown"
            })
        return articles
    
    def _needs_expansion(self, podcast: Dict, script: str) -> bool:
        """Synchronous check for expansion need"""
        word_count = len(script.split())
        target_words = podcast['length_minutes'] * 150
        return word_count < target_words * 0.8
    
    async def _expand_script_async(self, podcast: Dict, topic: Dict, script: str) -> str:
        """Async version of script expansion, preserving category lens"""
        style_config = self.STYLE_INSTRUCTIONS[podcast['style']]
        category_key = topic.get('category', '').lower()
        category_lens = self.CATEGORY_INSTRUCTIONS.get(category_key, self.CATEGORY_INSTRUCTIONS["default"])
        
        word_count = len(script.split())
        target_words = podcast['length_minutes'] * 150
        
        expansion_prompt = f"""The previous script was too short ({word_count} words vs {target_words} target).

EXPAND by adding MORE DEPTH AND ANALYSIS, not just more words:
- Dig deeper into the underlying factors and mechanisms
- Add critical analysis and multiple perspectives
- Include more specific examples and data points
- Explore broader implications and connections
- For {podcast['style'].upper()} level: {style_config['analysis']}

CATEGORY LENS: {category_lens}

REMEMBER: We need deeper INSIGHT, not longer sentences or fancier vocabulary. Maintain the strict vocabulary rules from the original prompt.

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
    
    def _build_prompt(self, podcast: Dict, topic: Dict, articles: List[Dict], is_update_focus: bool = False, podcast_created_at: datetime = None) -> str:
        """Build the prompt for script generation, adjusting structure if focusing on updates"""
        style_config = self.STYLE_INSTRUCTIONS[podcast['style']]
        category_key = topic.get('category', '').lower()
        category_lens = self.CATEGORY_INSTRUCTIONS.get(category_key, self.CATEGORY_INSTRUCTIONS["default"])
        
        focus_text = ""
        if podcast.get("focus_areas"):
            focus_text = f"\n\nFOCUS AREAS: Pay special attention to: {', '.join(podcast['focus_areas'])}"
        
        custom_text = ""
        if podcast.get("custom_prompt"):
            custom_text = f"\n\nCUSTOM INSTRUCTIONS: {podcast['custom_prompt']}"

        # =========================================================
        # PATH A: UPDATE-FOCUSED REGENERATION
        # =========================================================
        if is_update_focus and podcast_created_at:
            old_articles = []
            new_articles = []
            
            if hasattr(podcast_created_at, 'tzinfo') and podcast_created_at.tzinfo:
                podcast_created_at = podcast_created_at.replace(tzinfo=None)
                
            for a in articles:
                art_date = a.get("published_date_raw")
                if art_date:
                    if hasattr(art_date, 'tzinfo') and art_date.tzinfo:
                        art_date = art_date.replace(tzinfo=None)
                    if art_date > podcast_created_at:
                        new_articles.append(a)
                    else:
                        old_articles.append(a)
                else:
                    old_articles.append(a)
            
            old_text = "\n\n".join([f"**{a['title']}**\n{a['content'][:500]}..." for a in old_articles[:5]])
            new_text = "\n\n".join([f"**{a['title']}**\n{a['content'][:1000]}..." for a in new_articles[:10]])
            
            prompt = f"""You are a seasoned news narrator creating a "Follow-Up / Breaking Update" podcast for PodNova. 
Your audience already knows the basic background of this story. Your job is to focus heavily on the NEW DEVELOPMENTS while briefly contextualizing them.

TOPIC: {topic['title']}
CATEGORY: {topic['category'].upper()}
TARGET LENGTH: {podcast['length_minutes']} minutes
TARGET WORD COUNT: approximately {podcast['length_minutes'] * 150} words
COMPREHENSION LEVEL: {podcast['style'].upper()}

NARRATIVE LENS:
{category_lens}

STYLE PROFILE:
- Audience: {style_config['audience']}
- Approach: {style_config['approach']}
- Depth Required: {style_config['depth']}
- Analysis Style: {style_config['analysis']}

{self.ACCESSIBILITY_RULES}

{self.TTS_STRICT_RULES}

SOURCE MATERIALS:
[HISTORICAL CONTEXT (Summarize this very briefly - they already know this part)]:
{old_text}

[NEW DEVELOPMENTS (THIS IS THE STAR OF THE SHOW. Focus 80% of your time here)]:
{new_text}

{focus_text}{custom_text}

CONSISTENT INTRO & OUTRO PATTERN:
**Intro Pattern (10–15 seconds)** - Must mention "PodNova" and "I'm your host". 
- Frame this as an UPDATE to an ongoing story (e.g., "Welcome back to PodNova... we have major updates regarding [Topic]...").
**Outro Pattern (10–15 seconds)** - Summarize the key takeaway, thank the listener, mention "PodNova", and sign off.

SCRIPT STRUCTURE:
1. **The Update Hook** – What is the big new development?
2. **Brief Refresher** – A 2-3 sentence reminder of how we got here.
3. **Deep Dive into the New Facts** – What actually happened in the new articles?
4. **New Implications** – How does this change the outcome of the story?

Write ONLY the spoken words.
"""
            return prompt

        # =========================================================
        # PATH B: STANDARD GENERATION / FULL REGENERATION
        # =========================================================
        else:
            articles_text = "\n\n".join([
                f"**{a['title']}** (Source: {a['source']}, Date: {a['published']})\n{a['content'][:1000]}..."
                for a in articles[:15]
            ])
            
            prompt = f"""You are a seasoned news narrator creating a spoken monologue for a PodNova podcast. Your script will be read aloud by an AI text-to-speech engine, so it must sound natural, fluid, and engaging—like a thoughtful friend explaining a complex topic.

TOPIC: {topic['title']}
CATEGORY: {topic['category'].upper()}
TARGET LENGTH: {podcast['length_minutes']} minutes
TARGET WORD COUNT: approximately {podcast['length_minutes'] * 150} words (spoken at ~150 words per minute)
COMPREHENSION LEVEL: {podcast['style'].upper()}

NARRATIVE LENS:
{category_lens}

STYLE PROFILE:
- Audience: {style_config['audience']}
- Approach: {style_config['approach']}
- Depth Required: {style_config['depth']}
- Analysis Style: {style_config['analysis']}

{self.ACCESSIBILITY_RULES}

{self.TTS_STRICT_RULES}

SOURCE MATERIALS:
You have {len(articles)} articles covering this topic. Synthesize information from ALL sources, not just one. When sources differ, acknowledge the nuance naturally.

{articles_text}

{focus_text}{custom_text}

CONSISTENT INTRO & OUTRO PATTERN:
**Intro Pattern (10–15 seconds)** - Must mention "PodNova" and "I'm your host". Include a brief teaser.
**Outro Pattern (10–15 seconds)** - Summarize the key takeaway. Thank the listener. Mention "PodNova" and sign off.

SCRIPT STRUCTURE:
1. **Opening Hook** – Grab the listener.
2. **Context & Background** – Set the stage.
3. **Core Analysis** – Synthesize the main developments.
4. **Implications & What's Next** – Broader consequences.

Write ONLY the spoken words.
"""
            return prompt

    def _build_custom_prompt(self, podcast: Dict) -> str:
        """Build the prompt specifically for custom file uploads"""
        style_config = self.STYLE_INSTRUCTIONS[podcast.get('style', 'standard')]
        source_text = podcast.get("custom_source_text", "No documents provided.")
        custom_prompt = podcast.get("custom_prompt", "Summarize these materials.")
        
        prompt = f"""You are a seasoned narrator creating a spoken monologue for a custom PodNova podcast. 
Your script will be read aloud by an AI text-to-speech engine.

TARGET LENGTH: {podcast['length_minutes']} minutes
TARGET WORD COUNT: approximately {podcast['length_minutes'] * 150} words
COMPREHENSION LEVEL: {podcast.get('style', 'standard').upper()}

STYLE PROFILE:
- Audience: {style_config['audience']}
- Approach: {style_config['approach']}
- Depth Required: {style_config['depth']}

{self.ACCESSIBILITY_RULES}

{self.TTS_STRICT_RULES}

SOURCE MATERIALS PROVIDED BY THE USER:
{source_text}

USER'S CUSTOM INSTRUCTIONS:
{custom_prompt}

CONSISTENT INTRO & OUTRO PATTERN:
**Intro (10-15 seconds)** - Mention "PodNova" and "I'm your host". Briefly tease what will be discussed based on the materials and user instructions.
**Outro (10-15 seconds)** - Summarize the key takeaway, thank the listener, mention "PodNova", and sign off.

Now, generate the podcast script. Write ONLY the spoken words.
"""
        return prompt