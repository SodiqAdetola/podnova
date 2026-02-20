# app/services/script_service.py
"""
Script generation service for podcasts
Handles AI-powered script generation using Gemini
"""
from typing import Dict, List
from click import prompt
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
        
        prompt = f"""You are a seasoned news narrator creating a spoken monologue for a PodNova podcast. Your script will be read aloud, so it must sound natural, fluid, and engaging—like a thoughtful friend explaining a complex topic. Write ONLY the words to be spoken; no stage directions, sound cues, formatting marks, or meta-commentary.

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

SOURCE MATERIALS:
You have {len(articles)} articles covering this topic. Synthesize information from ALL sources, not just one. When sources differ, acknowledge the nuance naturally (e.g., "While some outlets report X, others point to Y...").

{articles_text}

{focus_text}{custom_text}

CONSISTENT INTRO & OUTRO PATTERN:

**Intro Pattern (10–15 seconds)**  
- Must mention "PodNova" and "I'm your host" (or similar phrasing).  
- Include a brief teaser of today's topic (a few words, engaging but not detailed).  
- Transition naturally into the main content (e.g., "Let's get into it," "Here's what's happening," etc.).  
- Keep the tone warm, inviting, and consistent with your overall style.

*Example variations (not to be copied exactly, but to illustrate the pattern):*  
- "You're listening to PodNova. I'm your host, and today we're unpacking [topic teaser]. Let's dive in."  
- "Welcome to PodNova. I'm your host, and this time we're looking at [topic teaser]. Here's the story."  
- "Hey there, this is PodNova. I'm your host, and today we're talking about [topic teaser]. Let's get started."

**Outro Pattern (10–15 seconds)**  
- Summarize the key takeaway in a concise, memorable way.  
- Thank the listener.  
- Mention "PodNova" and sign off (e.g., "I'm your host, signing off").  
- Keep the tone warm and appreciative.

*Example variations:*  
- "So that's the quick take on [key takeaway]. Thanks for listening to PodNova. I'm your host, signing off."  
- "To wrap it up: [key takeaway]. Thanks for tuning in to PodNova. I'm your host, see you next time."  
- "That's your PodNova update on [key takeaway]. Appreciate you listening. I'm your host, until next time."

IMPORTANT:  
- Do not copy the example phrases verbatim; instead, use them as a guide to create your own natural-sounding intro and outro that fit the flow of this specific script.  
- The core elements (PodNova, host mention, teaser, thanks, sign-off) must always be present, but the exact wording can vary.  
- Keep both intro and outro brief (10–15 seconds each).

SCRIPT STRUCTURE (between intro and outro, follow approximate timing):

1. **Opening Hook** (next 15 seconds after intro) – Grab the listener with the most compelling angle: a surprising fact, a provocative question, or a vivid scene.

2. **Context & Background** (~20% of total time)  
   - Set the stage: What's happening and why does it matter now?  
   - Provide essential background for the target audience (avoid over-explaining basics for Advanced/Expert levels).  
   - {style_config['depth']}

3. **Core Analysis** (~50% of total time)  
   - Synthesize the main developments from multiple sources.  
   - Go beyond surface facts: {style_config['analysis']}  
   - For ADVANCED/EXPERT levels, explore the "why behind the why"—uncover underlying causes, conflicting interpretations, and systemic implications.  
   - Use specific facts, figures, quotes, and attributions (e.g., "According to Reuters...") to build credibility.  
   - Weave in analogies, examples, or historical parallels if they illuminate the story.

4. **Implications & What's Next** (~20% of total time)  
   - Who is affected and how?  
   - What are the broader consequences—economic, political, social?  
   - For ADVANCED/EXPERT, discuss competing future scenarios or strategic considerations.  
   - Connect the dots to related issues or trends.

5. **Outro** – Use the pattern described above, varying the wording but always including the key takeaway, thanks, PodNova mention, and sign-off.

CRITICAL GUIDELINES:

✅ DO:
- Write in a conversational, thinking-aloud style. Use natural pauses (ellipses … or line breaks), occasional light fillers ("well," "you know," "the thing is…"), and rhetorical questions.
- Synthesize across sources—your script should reflect the full range of reporting.
- Attribute information naturally ("Bloomberg reports that…", "Experts quoted by the BBC suggest…").
- Use concrete details: numbers, dates, names, quotes.
- Keep sentences varied in length—mix short punchy statements with longer explanatory ones.
- Match the depth and language to the comprehension level:  
  *Casual*: simple words, explain terms, focus on the big picture.  
  *Standard*: clear professional tone, balanced.  
  *Advanced*: critical analysis, industry terms used purposefully.  
  *Expert*: deep multi‑factor analysis, nuanced, precise.
- Stay objective and balanced; avoid editorializing.
- Ensure the intro and outro follow the consistent pattern (core elements present) but vary the wording naturally.

❌ DO NOT:
- Include any stage directions, sound effects, or music cues (e.g., [intro music], [pause]).
- Use markdown formatting like asterisks, underscores, or bullet lists.
- Write numbered lists or bullet points—everything must flow as continuous prose.
- Say "in this episode" or "today's episode"—PodNova is a continuous podcast feed, not episode‑based. Just dive in.
- Use overly polished, scripted transitions; aim for natural segues.
- Exceed the target word count significantly; be concise but rich.
- Copy the example intros/outros verbatim—create your own variations.

STYLE EXAMPLES (illustrative only—match your level):
- Casual: "So, have you been following the news about the big tech hearing? It's kind of a mess, honestly. Here's what's going on…"
- Standard: "This week's antitrust hearing brought the CEOs of four major tech companies before Congress. The core issue? Whether these firms have become too powerful…"
- Advanced: "The hearing revealed a fundamental tension in how we regulate digital monopolies. On one hand, there's bipartisan appetite for reform; on the other, the legal frameworks from the 20th century may be ill-equipped…"
- Expert: "Examining the testimonies, one sees a clash between two competing antitrust philosophies: the Chicago School's consumer welfare standard versus the Neo-Brandeisian focus on market structure and democracy…"

Now, generate the podcast script. Remember: for {podcast['style'].upper()} level, depth of insight matters more than vocabulary complexity. Write ONLY the spoken words, beginning with an intro that follows the consistent pattern and ending with an outro that follows the consistent pattern.
"""

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