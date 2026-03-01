"""
RSS Feed Configuration for PodNova
High-impact, UK/global news sources for commercial awareness.
Feeds are curated to eliminate consumer gadget reviews, personal finance tips,
and political opinion. Focus is on enterprise, institutional, and market-moving news.
"""

# ----------------------------------------------------------------------
# CONFIGURATION CONSTANTS
# ----------------------------------------------------------------------
FETCH_INTERVAL_HOURS = 6            # How often to fetch feeds
MIN_WORD_COUNT = 400                # Minimum article length (for successful scraping)
MAX_WORD_COUNT = 4000               # Upper limit for very long articles
MAX_ARTICLE_AGE_HOURS = 48          # Discard articles older than this

# ----------------------------------------------------------------------
# RSS FEEDS BY CATEGORY (Scrape-Friendly & Premium)
# ----------------------------------------------------------------------
RSS_FEEDS = {
    "technology": [
        # --- UK-Focused ---
        {"name": "The Register", "url": "https://www.theregister.com/headlines.atom"},
        {"name": "Computer Weekly", "url": "https://www.computerweekly.com/rss/Latest-IT-news.xml"},
        {"name": "BBC Technology", "url": "http://feeds.bbci.co.uk/news/technology/rss.xml"},
        {"name": "UK Gov Tech Blog", "url": "https://technology.blog.gov.uk/feed/"},
        # --- Global ---
        {"name": "VentureBeat", "url": "https://venturebeat.com/feed/"},
        {"name": "Ars Technica", "url": "https://feeds.arstechnica.com/arstechnica/technology"}, 
        {"name": "AP News - Technology", "url": "https://newsunrolled.com/rss/tech"}, 
    ],

    "finance": [
        # --- UK-Focused ---
        {"name": "City A.M.", "url": "https://www.cityam.com/feed/"}, 
        {"name": "Sky News - Business", "url": "https://feeds.skynews.com/feeds/rss/business.xml"}, 
        {"name": "BBC News - Business", "url": "http://feeds.bbci.co.uk/news/business/rss.xml"},
        # --- Global ---
        {"name": "CNBC - World", "url": "https://www.cnbc.com/id/100727362/device/rss/rss.html"},
        {"name": "AP News - Business", "url": "https://newsunrolled.com/rss/business"}, 
        {"name": "NPR Economy", "url": "https://feeds.npr.org/1017/rss.xml"}, 
    ],

    "politics": [
        # --- UK-Focused ---
        {"name": "BBC UK Politics", "url": "http://feeds.bbci.co.uk/news/politics/rss.xml"},
        {"name": "UK Human Rights Blog", "url": "https://ukhumanrightsblog.com/feed/"},
        {"name": "Sky News - Politics", "url": "https://feeds.skynews.com/feeds/rss/politics.xml"},
        # --- Global ---
        {"name": "Chatham House Insights", "url": "https://www.chathamhouse.org/rss/insights"}, 
        {"name": "Politico EU", "url": "https://www.politico.eu/feed/"},
        {"name": "United Nations News", "url": "https://news.un.org/feed/subscribe/en/news/all/rss.xml"},
        {"name": "AP News - World", "url": "https://newsunrolled.com/rss/world"}, 
    ]
}

# ----------------------------------------------------------------------
# KEYWORD FILTERS (Safety net – tuned for high-impact news)
# ----------------------------------------------------------------------

# NOTE: IMPORTANT_KEYWORDS are retained here for potential future use 
# (e.g., auto-tagging or topic clustering). We no longer use them as a 
# strict inclusion gate to avoid dropping valid, uniquely-phrased journalism.
IMPORTANT_KEYWORDS = {
    "technology": [
        "artificial intelligence", "machine learning", "deep learning", "neural network",
        "large language model", "LLM", "foundation model", "transformer",
        "generative AI", "AGI", "AI safety", "AI ethics", "AI regulation",
        "OpenAI", "Anthropic", "DeepMind", "Google AI", "Microsoft AI",
        "Claude", "ChatGPT", "GPT-4", "Gemini", "Llama", "Mistral",
        "AI research", "AI breakthrough", "AI capability", "multimodal AI",
        "cybersecurity", "cyberattack", "data breach", "ransomware", "zero-day",
        "semiconductor", "chip manufacturing", "foundry", "process node",
        "antitrust", "regulation", "FTC", "EU Commission", "investigation",
    ],
    # ... (Truncated here for brevity, keep your full list from your original file)
}

NOISE_KEYWORDS = [
    # Consumer tech & gadgets
    "iphone", "ipad", "macbook", "apple watch", "airpods", "imac", "mac mini",
    "galaxy s", "galaxy z", "galaxy tab", "pixel phone", "oneplus", "xiaomi",
    # Review indicators
    "phone review", "laptop review", "tablet review", "headphone review",
    "camera review", "speaker review", "tv review", "monitor review",
    "review roundup", "first impressions", "hands-on review",
    # Buying guides and comparisons
    "phone comparison", "laptop comparison", "vs", "versus", "compared",
    "best phone", "best laptop", "best tablet", "best headphones",
    "buying guide", "shopping guide",
    # Deals and low-effort
    "deal", "sale", "discount", "price drop", "lowest price", "black friday",
    "cyber monday", "prime day", "holiday sale", "clearance",
    "affiliate", "sponsored", "paid content", "advertisement", "promoted",
    "gallery", "slideshow", "in pictures", "photos only", "things to know",
    "tips and tricks", "hacks", "life hack", "cheat sheet",
    # Entertainment & gaming
    "movie review", "film review", "tv show review", "binge-watch",
    "netflix original", "disney plus", "hulu", "streaming service",
    "gameplay trailer", "game awards", "state of play", "steam sale",
    # Social media / viral
    "viral video", "viral tweet", "tiktok trend", "instagram reel",
    "influencer", "content creator", "streamer", "goes viral",
    # Personal finance noise
    "dividend aristocrats", "monthly dividend stock", "passive income stream",
    "real estate investing tip", "side hustle idea", "crypto trading strategy",
    "day trading tip", "chart pattern breakout",
    # Political noise
    "poll shows", "approval rating drops", "favorability rating", "tracking poll",
    "campaign ad attack", "fundraising email blast", "rally crowd size",
    "stump speech highlights", "town hall meeting",
    # Rumors / support
    "rumor suggests", "leak claims", "unconfirmed report", "how to fix",
    "troubleshooting guide", "battery drain", "overheating fix"
]