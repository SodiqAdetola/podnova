from pymongo import MongoClient
import certifi
from app.config import MONGODB_URI, MONGODB_DB_NAME

client = MongoClient(MONGODB_URI, tlsCAFile=certifi.where())
db = client[MONGODB_DB_NAME]

# Check existing embeddings
articles_with_embeddings = db.articles.count_documents({"embedding": {"$exists": True}})
print(f"Articles with embeddings: {articles_with_embeddings}")

# Check topics
topics_count = db.topics.count_documents({})
print(f"Total topics: {topics_count}")

# Check when they were created
sample = db.articles.find_one({"embedding": {"$exists": True}})
if sample:
    print(f"\nSample article:")
    print(f"  Title: {sample['title'][:60]}")
    print(f"  Ingested: {sample['ingested_at']}")
    print(f"  Embedding dimension: {len(sample['embedding'])}")
    print(f"  Has topic: {'topic_id' in sample}")
else:
    print("\nNo articles with embeddings found!")
