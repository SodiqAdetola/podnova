# backend/app/ai_pipeline/test_models.py
from google import genai
import os
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

print("Testing Gemini API Access")
print("=" * 80)

# Test 1: Text generation
print("\n1. Testing text generation with gemini-2.5-flash:")
try:
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents="Say hello in 3 words"
    )
    print(f"✓ SUCCESS: {response.text}")
except Exception as e:
    print(f"✗ FAILED: {e}")

# Test 2: Embedding
print("\n2. Testing embedding with text-embedding-004:")
try:
    response = client.models.embed_content(
        model="text-embedding-004",
        contents="This is a test"
    )
    if hasattr(response, 'embeddings'):
        print(f"✓ SUCCESS: Generated embedding with {len(response.embeddings[0].values)} dimensions")
    else:
        print(f"✓ SUCCESS: {response}")
except Exception as e:
    print(f"✗ FAILED: {e}")

# Test 3: List all models
print("\n3. Listing all available models:")
try:
    models = client.models.list()
    model_list = list(models)
    print(f"Found {len(model_list)} models")
    for model in model_list[:5]:  # Show first 5
        print(f"  - {model.name}")
except Exception as e:
    print(f"✗ FAILED: {e}")

print("\n" + "=" * 80)