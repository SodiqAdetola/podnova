# /backend/app/ai_pipeline/clustering.py
"""
PodNova Clustering Module
Handles article embeddings, topic assignment, and clustering logic
WITH INTEGRATED MAINTENANCE AND IMAGE HANDLING

UPDATED: Now using gemini-embedding-001 (replaces text-embedding-004)
"""
from app.config import MONGODB_URI, MONGODB_DB_NAME
import os
import json
import time
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import numpy as np
from pymongo import MongoClient
import certifi
from google import genai

# Import maintenance service
from app.ai_pipeline.article_maintenance import MaintenanceService

# Configuration
SIMILARITY_THRESHOLD = 0.7
MIN_ARTICLES_FOR_TITLE = 2
CONFIDENCE_THRESHOLD = 0.6
TOPIC_INACTIVE_DAYS = 90
EMBEDDING_MODEL = "gemini-embedding-001"  # UPDATED: Changed from text-embedding-004
TEXT_MODEL = "gemini-2.5-flash"

# Initialize Gemini client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))


class ClusteringService:
    def __init__(self, mongo_uri: str, db_name: str):
        """Initialize the clustering service with MongoDB connection"""
        self.client = MongoClient(mongo_uri, tlsCAFile=certifi.where())
        self.db = self.client[db_name]
        self.articles_collection = self.db["articles"]
        self.topics_collection = self.db["topics"]
        
        # Initialize maintenance service
        self.maintenance_service = MaintenanceService(mongo_uri, db_name)
        
        # Create indexes
        self.topics_collection.create_index("category")
        self.topics_collection.create_index("last_updated")
        self.topics_collection.create_index("status")
        self.topics_collection.create_index([("category", 1), ("status", 1)])
        
    def compute_embedding(self, text: str) -> Optional[np.ndarray]:
        """Compute embedding for given text using Gemini"""
        try:
            response = client.models.embed_content(
                model=EMBEDDING_MODEL,
                contents=text
            )
            
            if hasattr(response, 'embeddings') and len(response.embeddings) > 0:
                return np.array(response.embeddings[0].values)
            elif hasattr(response, 'embedding'):
                return np.array(response.embedding)
            
            print(f"  Unexpected embedding response format")
            return None
            
        except Exception as e:
            print(f"  Error computing embedding: {str(e)}")
            return None
    
    def cosine_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Calculate cosine similarity between two vectors"""
        dot_product = np.dot(vec1, vec2)
        norm_product = np.linalg.norm(vec1) * np.linalg.norm(vec2)
        return dot_product / norm_product if norm_product != 0 else 0.0
    
    def check_and_resurrect_topic(self, topic: Dict) -> bool:
        """
        Check if a stale topic should be resurrected when a new highly relevant article arrives
        Returns True if topic was resurrected
        """
        if topic.get("status") != "stale":
            return False
        
        # Check if topic is not too old
        stale_since = topic.get("stale_since")
        if stale_since:
            days_stale = (datetime.now() - stale_since).days
            if days_stale > self.maintenance_service.config.MAX_RESURRECTION_AGE_DAYS:
                return False
        
        # Resurrect the topic
        self.topics_collection.update_one(
            {"_id": topic["_id"]},
            {
                "$set": {
                    "status": "active",
                    "resurrected_at": datetime.now()
                },
                "$unset": {"stale_since": ""}
            }
        )
        
        print(f"  Resurrected stale topic: {topic.get('title', 'Untitled')}")
        return True
    
    def find_matching_topic(self, article_embedding: np.ndarray, category: str) -> Optional[Dict]:
        """
        Find existing topic that matches the article embedding
        Now considers both active and stale topics (stale can be resurrected)
        """
        # Look for active topics first
        active_topics = self.topics_collection.find({
            "category": category,
            "status": "active"
        })
        
        best_match = None
        best_similarity = 0.0
        
        for topic in active_topics:
            if "centroid_embedding" not in topic:
                continue
            
            topic_embedding = np.array(topic["centroid_embedding"])
            similarity = self.cosine_similarity(article_embedding, topic_embedding)
            
            if similarity > best_similarity and similarity >= SIMILARITY_THRESHOLD:
                best_similarity = similarity
                best_match = topic
        
        # If no active match, check stale topics with higher threshold
        if not best_match:
            stale_topics = self.topics_collection.find({
                "category": category,
                "status": "stale"
            })
            
            resurrection_threshold = SIMILARITY_THRESHOLD + self.maintenance_service.config.RESURRECTION_SIMILARITY_BONUS
            
            for topic in stale_topics:
                if "centroid_embedding" not in topic:
                    continue
                
                topic_embedding = np.array(topic["centroid_embedding"])
                similarity = self.cosine_similarity(article_embedding, topic_embedding)
                
                # Higher threshold for resurrecting stale topics
                if similarity > best_similarity and similarity >= resurrection_threshold:
                    best_similarity = similarity
                    best_match = topic
                    # Resurrect the topic
                    self.check_and_resurrect_topic(topic)
        
        if best_match:
            print(f"  Found matching topic: {best_match.get('title', 'Untitled')} (similarity: {best_similarity:.3f})")
        
        return best_match
    
    def compute_centroid(self, article_ids: List[str]) -> Optional[np.ndarray]:
        """Compute centroid embedding from list of article IDs"""
        embeddings = []
        
        for article_id in article_ids:
            article = self.articles_collection.find_one({"_id": article_id})
            if article and "embedding" in article:
                embeddings.append(np.array(article["embedding"]))
        
        return np.mean(embeddings, axis=0) if embeddings else None
    
    def create_new_topic(self, article_doc: Dict, article_embedding: np.ndarray) -> str:
        """Create a new topic seeded with this article"""
        topic_doc = {
            "category": article_doc["category"],
            "article_ids": [article_doc["_id"]],
            "sources": [article_doc["source"]],
            "centroid_embedding": article_embedding.tolist(),
            "confidence": 0.5,
            "created_at": datetime.now(),
            "last_updated": datetime.now(),
            "status": "active",
            "article_count": 1,
            "has_title": False,
            "title": None,
            "summary": None,
            "key_insights": None,
            "image_url": article_doc.get("image_url")
        }
        
        result = self.topics_collection.insert_one(topic_doc)
        topic_id = result.inserted_id
        
        print(f"  Created new topic (ID: {topic_id})")
        
        self.articles_collection.update_one(
            {"_id": article_doc["_id"]},
            {"$set": {"topic_id": topic_id, "status": "clustered"}}
        )
        
        return topic_id
    
    def update_existing_topic(self, topic: Dict, article_doc: Dict, article_embedding: np.ndarray) -> None:
        """
        Add article to existing topic and update metadata
        Now includes automatic topic trimming and image handling
        """
        topic_id = topic["_id"]
        article_ids = topic["article_ids"]
        sources = set(topic.get("sources", []))
        
        article_ids.append(article_doc["_id"])
        is_new_source = article_doc["source"] not in sources
        sources.add(article_doc["source"])
        
        new_centroid = self.compute_centroid(article_ids)
        confidence = topic.get("confidence", 0.5)
        if is_new_source:
            confidence = min(1.0, confidence + 0.1)
        
        # Prepare update fields
        update_fields = {
            "article_ids": article_ids,
            "sources": list(sources),
            "centroid_embedding": new_centroid.tolist() if new_centroid is not None else topic["centroid_embedding"],
            "confidence": confidence,
            "last_updated": datetime.now(),
            "article_count": len(article_ids)
        }
        
        # Update image if topic doesn't have one
        if not topic.get("image_url") and article_doc.get("image_url"):
            update_fields["image_url"] = article_doc["image_url"]
        
        self.topics_collection.update_one(
            {"_id": topic_id},
            {"$set": update_fields}
        )
        
        self.articles_collection.update_one(
            {"_id": article_doc["_id"]},
            {"$set": {"topic_id": topic_id, "status": "clustered"}}
        )
        
        print(f"  Updated topic (ID: {topic_id}, articles: {len(article_ids)}, confidence: {confidence:.2f})")
        
        # Check if topic needs trimming after adding article
        age_category = self.maintenance_service.get_topic_age_category(topic)
        max_articles = self.maintenance_service.config.TOPIC_LIMITS[age_category]["max_articles"]
        
        if len(article_ids) > max_articles:
            print(f"  Topic exceeds limit ({len(article_ids)} > {max_articles}), trimming...")
            trim_result = self.maintenance_service.trim_topic_articles(topic_id)
            print(f"  Trimmed {trim_result.get('trimmed', 0)} articles, kept {trim_result.get('retained', 0)}")
        
        should_generate_title = (
            not topic.get("has_title", False) and
            len(article_ids) >= MIN_ARTICLES_FOR_TITLE and
            confidence >= CONFIDENCE_THRESHOLD
        )
        
        if should_generate_title:
            print(f"  Topic ready for title generation")
    
    def generate_topic_title(self, topic_id: str) -> bool:
        """Generate title and summary for a topic using Gemini LLM"""
        try:
            topic = self.topics_collection.find_one({"_id": topic_id})
            if not topic:
                print(f"  Topic {topic_id} not found")
                return False
            
            articles = list(self.articles_collection.find({
                "_id": {"$in": topic["article_ids"]}
            }))
            
            if not articles:
                print(f"  No articles found for topic {topic_id}")
                return False
            
            article_texts = []
            for article in articles:
                article_texts.append(
                    f"Title: {article['title']}\n"
                    f"Source: {article['source']}\n"
                    f"Summary: {article['description']}\n"
                )
            
            combined_articles = "\n---\n".join(article_texts)
            
            prompt = f"""You are an AI news analyst tasked with creating a balanced, informative podcast topic by synthesizing information from multiple news articles covering the same story.

Category: {topic['category'].upper()}
Number of articles analyzed: {len(articles)}

Below are the article excerpts (titles and content) from various sources:

{combined_articles}

Your task is to produce a JSON object containing a title, summary, key insights, and a confidence score that will serve as the foundation for a podcast episode. The podcast aims to inform listeners with a comprehensive, unbiased overview.

Follow these steps internally before generating the output:
1. **Identify core narrative**: Determine the central story that all articles revolve around.
2. **Detect consensus and conflicts**: Note points where sources agree, and highlight any significant disagreements or different angles.
3. **Extract key facts**: Pull out the most important facts, developments, statistics, quotes, and implications.
4. **Synthesize across sources**: Combine information from all articles to create a cohesive picture, avoiding over-reliance on a single source.
5. **Assess confidence**: Based on factors such as source authority, consistency across articles, number of sources, recency, and any contradictions, assign a confidence score (0-100%) reflecting how reliable and well-established the synthesized narrative is.

Now, generate a JSON object with the following fields:

- **title** (string): A concise, engaging, and newsworthy title (maximum 10 words). It should capture the core story without sensationalism.
- **summary** (string): A 2-3 sentence summary that synthesizes the key narrative across all sources. It should include the main event, context, and significance.
- **key_insights** (array of strings): Exactly 3-5 bullet points highlighting the most important facts, developments, or implications. Each insight should be a complete sentence, focus on facts (not opinions), and be distinct from the others. If sources conflict, you may note the different perspectives or choose the most supported view, but avoid simply listing "Source A says X, Source B says Y".
- **confidence_score** (integer): A number from 0 to 100 representing the confidence in the synthesized information. Base this on:
  - **Source authority** (e.g., major news outlets vs. blogs)
  - **Consistency** (how much the sources agree)
  - **Number of sources** (more sources generally increase confidence)
  - **Recency** (prefer recent articles)
  - **Contradictions** (lower confidence if major conflicts exist)

Output format requirements:
- The JSON must be valid and parseable.
- Do not include any additional text outside the JSON.
- Ensure the JSON keys are exactly as specified: "title", "summary", "key_insights", "confidence_score".

Example output:
{{
  "title": "Global Climate Summit Reaches Historic Deforestation Deal",
  "summary": "Leaders from over 100 nations pledged to halt deforestation by 2030 at the COP26 climate summit, backed by $19 billion in public and private funds. Environmental groups welcome the commitment but question enforcement mechanisms.",
  "key_insights": [
    "More than 100 countries, representing 85% of the world's forests, signed the pledge.",
    "The funding package includes $12 billion from public sources and $7 billion from private investors.",
    "Critics point out that previous similar pledges, such as the 2014 New York Declaration on Forests, failed to meet targets.",
    "Indigenous rights groups demand inclusion in decision-making processes for forest conservation."
  ],
  "confidence_score": 85
}}

Now produce the JSON output for the provided articles."""

            try:
                response = client.models.generate_content(
                    model=TEXT_MODEL,
                    contents=prompt
                )
                
                response_text = response.text.strip()
                
            except Exception as api_error:
                error_str = str(api_error)
                if "429" in error_str or "quota" in error_str.lower():
                    print(f"  Quota exceeded - skipping for now")
                    return False
                raise api_error
            
            # Clean markdown formatting
            response_text = response_text.replace("```json", "").replace("```", "").strip()
            result = json.loads(response_text)
            
            self.topics_collection.update_one(
                {"_id": topic_id},
                {
                    "$set": {
                        "title": result["title"],
                        "summary": result["summary"],
                        "key_insights": result["key_insights"],
                        "has_title": True,
                        "title_generated_at": datetime.now()
                    }
                }
            )
            
            print(f"  Generated title: {result['title']}")
            print(f"  Key insights: {len(result['key_insights'])} points")
            
            return True
            
        except Exception as e:
            print(f"  Error generating topic title: {str(e)}")
            return False
    
    def assign_to_topic(self, article_doc: Dict) -> Optional[str]:
        """Main function: compute embedding and assign article to topic"""
        print(f"\nProcessing article: {article_doc['title'][:60]}...")
        
        text_for_embedding = f"{article_doc['title']} {article_doc['description']}"
        embedding = self.compute_embedding(text_for_embedding)
        
        if embedding is None:
            print(f"  Failed to compute embedding")
            return None
        
        self.articles_collection.update_one(
            {"_id": article_doc["_id"]},
            {"$set": {"embedding": embedding.tolist()}}
        )
        
        matching_topic = self.find_matching_topic(embedding, article_doc["category"])
        
        if matching_topic:
            self.update_existing_topic(matching_topic, article_doc, embedding)
            return matching_topic["_id"]
        else:
            return self.create_new_topic(article_doc, embedding)
    
    def process_pending_articles(self) -> Dict:
        """Process all articles with status 'pending_clustering'"""
        print("=" * 80)
        print("Starting Article Clustering")
        print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 80)
        
        pending_articles = list(self.articles_collection.find({
            "status": "pending_clustering"
        }))
        
        stats = {
            "total_processed": 0,
            "new_topics": 0,
            "updated_topics": 0,
            "titles_generated": 0,
            "failed": 0,
            "start_time": datetime.now()
        }
        
        print(f"\nFound {len(pending_articles)} articles to process")
        
        for article in pending_articles:
            try:
                topics_before = self.topics_collection.count_documents({})
                topic_id = self.assign_to_topic(article)
                
                if topic_id:
                    stats["total_processed"] += 1
                    topics_after = self.topics_collection.count_documents({})
                    
                    if topics_after > topics_before:
                        stats["new_topics"] += 1
                    else:
                        stats["updated_topics"] += 1
                else:
                    stats["failed"] += 1
                    
            except Exception as e:
                print(f"  Error processing article: {str(e)}")
                stats["failed"] += 1
        
        # Generate titles for ready topics
        print("\n" + "=" * 80)
        print("Generating Titles for Ready Topics")
        print("=" * 80)
        
        ready_topics = list(self.topics_collection.find({
            "has_title": False,
            "status": "active",
            "article_count": {"$gte": MIN_ARTICLES_FOR_TITLE},
            "confidence": {"$gte": CONFIDENCE_THRESHOLD}
        }))
        
        print(f"Found {len(ready_topics)} topics ready for title generation")
        
        for i, topic in enumerate(ready_topics):
            if i > 0:
                time.sleep(4)  # Rate limiting
            
            if self.generate_topic_title(topic["_id"]):
                stats["titles_generated"] += 1
        
        stats["end_time"] = datetime.now()
        stats["duration_seconds"] = (stats["end_time"] - stats["start_time"]).total_seconds()
        
        print("\n" + "=" * 80)
        print("Clustering Summary")
        print("=" * 80)
        print(f"Articles processed: {stats['total_processed']}")
        print(f"New topics created: {stats['new_topics']}")
        print(f"Existing topics updated: {stats['updated_topics']}")
        print(f"Titles generated: {stats['titles_generated']}")
        print(f"Failed: {stats['failed']}")
        print(f"Duration: {stats['duration_seconds']:.2f} seconds")
        print("=" * 80)
        
        return stats
    
    def mark_inactive_topics(self) -> int:
        """Mark topics as inactive if not updated recently"""
        cutoff_date = datetime.now() - timedelta(days=TOPIC_INACTIVE_DAYS)
        
        result = self.topics_collection.update_many(
            {"last_updated": {"$lt": cutoff_date}, "status": "active"},
            {"$set": {"status": "inactive"}}
        )
        
        if result.modified_count > 0:
            print(f"Marked {result.modified_count} topics as inactive")
        
        return result.modified_count


def main():
    """Main entry point for manual execution or scheduling"""
    service = ClusteringService(MONGODB_URI, MONGODB_DB_NAME)
    service.process_pending_articles()
    service.mark_inactive_topics()


if __name__ == "__main__":
    main()