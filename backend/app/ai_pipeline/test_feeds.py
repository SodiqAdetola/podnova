import feedparser
import ssl
import certifi
import urllib.request

feeds = [
    "http://feeds.bbci.co.uk/news/technology/rss.xml",
    "https://www.theguardian.com/uk/technology/rss",
    "http://feeds.bbci.co.uk/news/business/rss.xml",
    "https://www.theguardian.com/uk/business/rss"
]

for url in feeds:
    print(f"\nTesting: {url}")
    try:
        # Create SSL context with certifi certificates
        ssl_context = ssl.create_default_context(cafile=certifi.where())
        
        # Parse feed with SSL context
        feed = feedparser.parse(url, handlers=[
            urllib.request.HTTPSHandler(context=ssl_context)
        ])
        
        print(f"  Status: {feed.get('status', 'N/A')}")
        print(f"  Entries: {len(feed.entries)}")
        print(f"  Bozo: {feed.get('bozo', False)}")
        if feed.get('bozo_exception'):
            print(f"  Exception: {feed.bozo_exception}")
        if feed.entries:
            print(f"  First entry: {feed.entries[0].get('title', 'No title')}")
    except Exception as e:
        print(f"  Error: {e}")