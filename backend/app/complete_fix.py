"""
COMPLETE ALL-IN-ONE FIX SCRIPT
Does everything in one go:
1. Reset invalid topics to proper base state (remove titles, summaries, insights)
2. Generate CLEAR, STRAIGHTFORWARD titles for ALL valid topics (including existing ones)
3. Follow your clustering service thresholds exactly
"""
from app.config import MONGODB_URI, MONGODB_DB_NAME
import motor.motor_asyncio
import certifi
import asyncio
import logging
from datetime import datetime
from bson import ObjectId
import os
import json
import re
import traceback
from google import genai

# Initialize Gemini client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Match your clustering service thresholds exactly
MIN_ARTICLES_FOR_TITLE = 2
CONFIDENCE_THRESHOLD = 0.6
TEXT_MODEL = "gemini-2.5-flash"
BATCH_SIZE = 5
DELAY_BETWEEN_BATCHES = 10
DELAY_BETWEEN_TOPICS = 2


class CompleteFix:
    def __init__(self, mongo_uri: str, db_name: str):
        self.client = motor.motor_asyncio.AsyncIOMotorClient(
            mongo_uri,
            tlsCAFile=certifi.where(),
        )
        self.db = self.client[db_name]
        self.articles = self.db["articles"]
        self.topics = self.db["topics"]
        
        self.stats = {
            "invalid_topics_reset": 0,
            "valid_titles_generated": 0,
            "failed_generations": 0
        }

    async def reset_invalid_topics(self):
        """Step 1: Reset topics that don't meet thresholds to base state"""
        logger.info("=" * 80)
        logger.info("STEP 1: Resetting invalid topics to base state")
        logger.info("=" * 80)

        # Find topics that have titles but shouldn't (don't meet thresholds)
        invalid_topics = []
        cursor = self.topics.find({
            "has_title": True,
            "$or": [
                {"article_count": {"$lt": MIN_ARTICLES_FOR_TITLE}},
                {"confidence": {"$lt": CONFIDENCE_THRESHOLD}}
            ]
        })
        
        async for topic in cursor:
            invalid_topics.append(topic)
            logger.info(f"\n  Found invalid topic: {topic['_id']}")
            logger.info(f"    article_count: {topic.get('article_count')}")
            logger.info(f"    confidence: {topic.get('confidence')}")
            logger.info(f"    current title: {topic.get('title')}")

        # Reset them to proper base state
        base_state = {
            "title": None,
            "summary": None,
            "key_insights": None,
            "has_title": False,
            "reset_at": datetime.now()
        }
        
        # Fields to remove completely
        fields_to_remove = [
            "title_generated_at",
            "regenerated_at",
            "regeneration_version",
            "cleaned_at",
            "temp_title",
            "temp_summary"
        ]
        
        for topic in invalid_topics:
            unset_dict = {field: "" for field in fields_to_remove if field in topic}
            
            if unset_dict:
                await self.topics.update_one(
                    {"_id": topic["_id"]},
                    {"$set": base_state, "$unset": unset_dict}
                )
            else:
                await self.topics.update_one(
                    {"_id": topic["_id"]},
                    {"$set": base_state}
                )
            
            self.stats["invalid_topics_reset"] += 1
            logger.info(f"  ✅ Reset topic {topic['_id']} to base state")

        logger.info(f"\n✅ Reset {self.stats['invalid_topics_reset']} invalid topics")

    async def get_articles_for_topic(self, topic):
        """Get articles for a specific topic"""
        articles = []
        cursor = self.articles.find({
            "_id": {"$in": topic.get("article_ids", [])}
        })
        async for article in cursor:
            articles.append(article)
        return articles

    async def generate_clear_title(self, topic, articles):
        """Generate a clear, straightforward title that anyone can understand"""
        try:
            if not articles:
                return False

            # Prepare article summaries
            article_texts = []
            for article in articles[:10]:
                description = (
                    article.get('description') or 
                    article.get('content', '')[:300] or 
                    "No description available"
                )
                article_texts.append(
                    f"Title: {article.get('title', 'Untitled')}\n"
                    f"Source: {article.get('source', 'Unknown')}\n"
                    f"Summary: {description}\n"
                )

            combined_articles = "\n---\n".join(article_texts)

            # Current title (if exists) for reference only - not used in generation
            current_title = topic.get('title', 'No current title')
            if topic.get('has_title'):
                logger.info(f"    Current title: {current_title}")

            # Clear, simple prompt for titles - NO JARGON, NO SLANG
            prompt = f"""Write a clear, straightforward headline for a news podcast. Use simple words that everyone can understand.

Category: {topic.get('category', 'general').upper()}
Number of articles: {len(articles)}

Articles:
{combined_articles}

RULES FOR THE HEADLINE:
- MAX 10 WORDS
- Say WHAT happened in plain English
- Use everyday words, no jargon or slang
- Be specific - include names, numbers, key details
- Make it easy to understand in 2 seconds

✅ GOOD EXAMPLES (clear, specific):
• "Google fined €2.4 billion by EU regulators"
• "Tesla delays Cybertruck production to 2025"
• "AI software creates fake videos of UK streets"
• "US Supreme Court blocks Trump trade tariffs"
• "Microsoft bug exposes confidential emails"

❌ BAD EXAMPLES (confusing, vague, jargon):
• "AI slop costs threaten global economic reckoning" (uses slang, vague)
• "Tech giant faces regulatory scrutiny" (too vague)
• "The future of AI in question" (vague, says nothing)
• "Paradigm shift in tech landscape" (jargon, meaningless)

Generate a JSON object with:

- **title** (string, MAX 10 WORDS): Clear, straightforward headline following the rules above.

- **summary** (string, 2-3 sentences): Clear overview of what happened and why it matters.

- **key_insights** (array, 3-5 strings): Specific, concrete takeaways.

- **confidence_score** (integer, 0-100): How reliable is this information?

JSON only, no markdown:"""

            response = client.models.generate_content(
                model=TEXT_MODEL,
                contents=prompt
            )

            response_text = response.text.strip()
            response_text = response_text.replace("```json", "").replace("```", "").strip()
            
            # Parse response
            result = None
            try:
                parsed = json.loads(response_text)
                if isinstance(parsed, list) and len(parsed) > 0:
                    result = parsed[0]
                elif isinstance(parsed, dict):
                    result = parsed
                else:
                    logger.error(f"    Unexpected JSON type: {type(parsed)}")
                    return False
            except json.JSONDecodeError:
                # Try regex extraction
                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if json_match:
                    try:
                        result = json.loads(json_match.group())
                    except:
                        logger.error(f"    Regex extraction failed")
                        return False
                else:
                    logger.error(f"    No JSON object found")
                    return False

            if not result or not isinstance(result, dict):
                logger.error(f"    Result is not a dictionary")
                return False

            new_title = result.get("title")
            if not new_title:
                logger.error(f"    No title in response")
                return False

            # Check word count
            word_count = len(new_title.split())
            if word_count > 12:
                logger.warning(f"    Title has {word_count} words, exceeds 10")

            # Validate no slang/jargon (simple check for common bad words)
            bad_words = ['slop', 'reckoning', 'scrutiny', 'landscape', 'paradigm', 'ecosystem', 'synergy', 'disruption', 'revolutionize']
            title_lower = new_title.lower()
            for word in bad_words:
                if word in title_lower:
                    logger.warning(f"    Title contains potentially confusing word: '{word}'")

            # Update topic with new content
            await self.topics.update_one(
                {"_id": topic["_id"]},
                {
                    "$set": {
                        "title": new_title,
                        "summary": result.get("summary", ""),
                        "key_insights": result.get("key_insights", []),
                        "has_title": True,
                        "title_generated_at": datetime.now(),
                        "confidence": result.get("confidence_score", 70) / 100.0,
                        "regenerated_at": datetime.now()
                    }
                }
            )

            logger.info(f"  ✅ Generated ({word_count} words): {new_title}")
            return True

        except Exception as e:
            logger.error(f"  ❌ Failed: {str(e)[:100]}")
            traceback.print_exc()
            return False

    async def generate_titles_for_all_valid_topics(self):
        """Step 2: Generate clear titles for ALL valid topics (including existing ones)"""
        logger.info("\n" + "=" * 80)
        logger.info("STEP 2: Generating clear titles for ALL valid topics")
        logger.info("=" * 80)

        # Find ALL topics that meet thresholds (regardless of whether they have titles)
        valid_topics = []
        cursor = self.topics.find({
            "status": "active",
            "article_count": {"$gte": MIN_ARTICLES_FOR_TITLE},
            "confidence": {"$gte": CONFIDENCE_THRESHOLD}
        }).sort("article_count", -1)  # Process larger topics first
        
        async for topic in cursor:
            valid_topics.append(topic)

        logger.info(f"Found {len(valid_topics)} valid topics to process")

        if len(valid_topics) == 0:
            logger.info("No valid topics found to generate titles for")
            return

        # Process in batches
        for i in range(0, len(valid_topics), BATCH_SIZE):
            batch = valid_topics[i:i + BATCH_SIZE]
            logger.info(f"\n📦 Batch {i//BATCH_SIZE + 1}/{(len(valid_topics) + BATCH_SIZE - 1)//BATCH_SIZE}")
            
            for topic in batch:
                logger.info(f"\n  Processing: {topic['_id']}")
                logger.info(f"    article_count: {topic.get('article_count')}")
                logger.info(f"    confidence: {topic.get('confidence')}")
                if topic.get('title'):
                    logger.info(f"    current title: {topic.get('title')}")
                
                articles = await self.get_articles_for_topic(topic)
                
                if len(articles) >= MIN_ARTICLES_FOR_TITLE:
                    if await self.generate_clear_title(topic, articles):
                        self.stats["valid_titles_generated"] += 1
                    else:
                        self.stats["failed_generations"] += 1
                else:
                    logger.info(f"    Skipping - only {len(articles)} articles found")
                
                await asyncio.sleep(DELAY_BETWEEN_TOPICS)
            
            if i + BATCH_SIZE < len(valid_topics):
                logger.info(f"\n⏳ Waiting {DELAY_BETWEEN_BATCHES} seconds...")
                await asyncio.sleep(DELAY_BETWEEN_BATCHES)

    async def verify_results(self):
        """Step 3: Verify everything is correct"""
        logger.info("\n" + "=" * 80)
        logger.info("STEP 3: Verifying results")
        logger.info("=" * 80)

        total = await self.topics.count_documents({})
        
        # Topics that should have titles
        valid_with_titles = await self.topics.count_documents({
            "has_title": True,
            "article_count": {"$gte": MIN_ARTICLES_FOR_TITLE},
            "confidence": {"$gte": CONFIDENCE_THRESHOLD}
        })
        
        # Topics that should NOT have titles (in base state)
        invalid_without_titles = await self.topics.count_documents({
            "has_title": False,
            "$or": [
                {"article_count": {"$lt": MIN_ARTICLES_FOR_TITLE}},
                {"confidence": {"$lt": CONFIDENCE_THRESHOLD}}
            ]
        })
        
        # Topics that still have titles but shouldn't (errors)
        invalid_with_titles = await self.topics.count_documents({
            "has_title": True,
            "$or": [
                {"article_count": {"$lt": MIN_ARTICLES_FOR_TITLE}},
                {"confidence": {"$lt": CONFIDENCE_THRESHOLD}}
            ]
        })

        logger.info(f"Total topics: {total}")
        logger.info(f"✅ Valid topics with titles: {valid_with_titles}")
        logger.info(f"✅ Invalid topics (no titles): {invalid_without_titles}")
        logger.info(f"❌ Invalid topics with titles (need fixing): {invalid_with_titles}")

        # Show sample of new titles
        if self.stats["valid_titles_generated"] > 0:
            logger.info("\n📰 Sample of new titles generated:")
            cursor = self.topics.find({
                "regenerated_at": {"$exists": True}
            }).limit(10)
            
            async for topic in cursor:
                logger.info(f"  • {topic.get('title')} ({topic.get('article_count')} articles)")

        return invalid_with_titles == 0

    async def run_all(self):
        """Run all fix steps"""
        logger.info("=" * 80)
        logger.info("🚀 COMPLETE ALL-IN-ONE FIX SCRIPT")
        logger.info("=" * 80)
        logger.info("This script will:")
        logger.info("1. Reset invalid topics to proper base state (remove titles, summaries, insights)")
        logger.info("2. Generate CLEAR, STRAIGHTFORWARD titles for ALL valid topics (including existing ones)")
        logger.info("3. Follow your clustering service thresholds exactly")
        logger.info(f"\nThresholds:")
        logger.info(f"  MIN_ARTICLES_FOR_TITLE: {MIN_ARTICLES_FOR_TITLE}")
        logger.info(f"  CONFIDENCE_THRESHOLD: {CONFIDENCE_THRESHOLD}")
        
        response = input("\nContinue? (yes/no): ")
        
        if response.lower() != "yes":
            logger.info("Fix cancelled")
            return

        start_time = datetime.now()
        
        # Step 1: Reset invalid topics
        await self.reset_invalid_topics()
        
        # Step 2: Generate titles for ALL valid topics
        await self.generate_titles_for_all_valid_topics()
        
        # Step 3: Verify results
        all_clean = await self.verify_results()
        
        # Summary
        duration = (datetime.now() - start_time).total_seconds()
        
        logger.info("\n" + "=" * 80)
        logger.info("📊 FINAL SUMMARY")
        logger.info("=" * 80)
        logger.info(f"Invalid topics reset: {self.stats['invalid_topics_reset']}")
        logger.info(f"Valid titles generated: {self.stats['valid_titles_generated']}")
        logger.info(f"Failed generations: {self.stats['failed_generations']}")
        logger.info(f"Total time: {duration:.2f} seconds")
        logger.info("=" * 80)
        
        if all_clean:
            logger.info(f"\n✅ ALL DONE! Generated {self.stats['valid_titles_generated']} clear, straightforward titles.")
            if self.stats['failed_generations'] > 0:
                logger.info(f"⚠️  {self.stats['failed_generations']} topics failed - you may want to retry them.")
        else:
            logger.warning("\n⚠️  Some issues remain. Run the script again?")

    async def close(self):
        self.client.close()


async def main():
    fixer = None
    try:
        fixer = CompleteFix(MONGODB_URI, MONGODB_DB_NAME)
        await fixer.run_all()
    except KeyboardInterrupt:
        logger.info("\n\n⚠️  Fix interrupted by user")
    except Exception as e:
        logger.error(f"❌ Fix failed: {e}")
        traceback.print_exc()
    finally:
        if fixer:
            await fixer.close()


if __name__ == "__main__":
    asyncio.run(main())