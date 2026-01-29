"""
Quick test module to diagnose Gemini embedding issues
"""
import os
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from google import genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get API key
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    print("❌ ERROR: GEMINI_API_KEY not found in environment!")
    print("Make sure you have a .env file with GEMINI_API_KEY set")
    sys.exit(1)

# Initialize client
client = genai.Client(api_key=GEMINI_API_KEY)

def test_list_models():
    """List all available models"""
    print("=" * 80)
    print("Available Models")
    print("=" * 80)
    
    try:
        models = client.models.list()
        
        print("\nAll available models:")
        for model in models:
            print(f"  - {model.name}")
            if hasattr(model, 'supported_generation_methods'):
                print(f"    Methods: {model.supported_generation_methods}")
        
        print("\n" + "=" * 80)
        print("Embedding-specific models:")
        print("=" * 80)
        
        embedding_models = [m for m in models if 'embed' in m.name.lower() or 'embedding' in m.name.lower()]
        for model in embedding_models:
            print(f"\n  Model: {model.name}")
            if hasattr(model, 'supported_generation_methods'):
                print(f"  Methods: {model.supported_generation_methods}")
                
    except Exception as e:
        print(f"Error listing models: {str(e)}")


def test_embedding_with_different_models():
    """Test embedding with different model names"""
    print("\n" + "=" * 80)
    print("Testing Different Embedding Model Names")
    print("=" * 80)
    
    test_text = "This is a test article about technology and AI."
    
    # Different model name formats to try
    models_to_try = [
        "text-embedding-004",
        "models/text-embedding-004",
        "embedding-001",
        "models/embedding-001",
        "text-embedding-preview-0815",
        "models/text-embedding-preview-0815",
    ]
    
    for model_name in models_to_try:
        print(f"\nTrying model: {model_name}")
        try:
            response = client.models.embed_content(
                model=model_name,
                contents=test_text
            )
            
            if hasattr(response, 'embeddings') and len(response.embeddings) > 0:
                embedding = response.embeddings[0].values
                print(f"  ✓ SUCCESS! Embedding length: {len(embedding)}")
                print(f"  First 5 values: {embedding[:5]}")
                return model_name  # Return the working model
            elif hasattr(response, 'embedding'):
                embedding = response.embedding
                print(f"  ✓ SUCCESS! Embedding length: {len(embedding)}")
                print(f"  First 5 values: {embedding[:5]}")
                return model_name
            else:
                print(f"  ✗ Unexpected response format")
                
        except Exception as e:
            print(f"  ✗ FAILED: {str(e)}")
    
    return None


def test_correct_embedding():
    """Test with the correct embedding approach"""
    print("\n" + "=" * 80)
    print("Testing Correct Embedding Method")
    print("=" * 80)
    
    test_text = "Reform's Matt Goodwin is sure he's the right man for Gorton"
    
    # Try the correct API for embeddings
    try:
        # Gemini embeddings use a different endpoint
        response = client.models.embed_content(
            model="models/embedding-001",  # Try this one
            contents=test_text
        )
        
        print("\nResponse structure:")
        print(f"  Has 'embeddings': {hasattr(response, 'embeddings')}")
        print(f"  Has 'embedding': {hasattr(response, 'embedding')}")
        
        if hasattr(response, 'embeddings'):
            embedding = response.embeddings[0].values
            print(f"\n✓ SUCCESS!")
            print(f"  Embedding dimension: {len(embedding)}")
            print(f"  First 10 values: {embedding[:10]}")
        elif hasattr(response, 'embedding'):
            embedding = response.embedding
            print(f"\n✓ SUCCESS!")
            print(f"  Embedding dimension: {len(embedding)}")
            print(f"  First 10 values: {embedding[:10]}")
            
    except Exception as e:
        print(f"\n✗ FAILED: {str(e)}")


def get_recommended_fix():
    """Show the recommended fix for clustering.py"""
    print("\n" + "=" * 80)
    print("RECOMMENDED FIX")
    print("=" * 80)
    
    print("""
Based on the error, you need to update your clustering.py:

CHANGE THIS (line ~47):
    EMBEDDING_MODEL = "text-embedding-004"

TO THIS:
    EMBEDDING_MODEL = "models/embedding-001"

The issue is that:
1. The v1beta API version doesn't support text-embedding-004
2. You need to use the older embedding-001 model
3. Model names need the "models/" prefix

After making this change, restart your clustering process.
    """)


if __name__ == "__main__":
    print("🔍 Gemini Embedding Diagnostic Tool")
    print("=" * 80)
    
    print(f"✓ API Key found (starts with: {GEMINI_API_KEY[:10]}...)")
    
    # Run tests
    test_list_models()
    working_model = test_embedding_with_different_models()
    
    if working_model:
        print(f"\n✅ WORKING MODEL FOUND: {working_model}")
    else:
        print(f"\n❌ NO WORKING MODEL FOUND")
    
    test_correct_embedding()
    get_recommended_fix()
    
    print("\n" + "=" * 80)
    print("Diagnostic complete!")
    print("=" * 80)