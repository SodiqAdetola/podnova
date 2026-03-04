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
        # --- UK-Focused Enterprise & Government ---
        {"name": "Computer Weekly", "url": "https://www.computerweekly.com/rss/Latest-IT-news.xml"},
        {"name": "UK Gov Tech Blog", "url": "https://technology.blog.gov.uk/feed/"},
        
        # --- Trade & Cybersecurity (High Signal) ---
        {"name": "The Register - AI", "url": "https://www.theregister.com/ai/headlines.atom"},
        {"name": "The Register - Security", "url": "https://www.theregister.com/security/headlines.atom"},
        {"name": "The Register - Software", "url": "https://www.theregister.com/software/headlines.atom"},
        
        # --- Global: Emerging Tech, Quantum & Deep Tech ---
        {"name": "MIT Technology Review", "url": "https://www.technologyreview.com/feed/"}, 
        {"name": "IEEE Spectrum", "url": "https://spectrum.ieee.org/feeds/feed.rss"}, 
        
        # --- Global: AI & Cloud (Big Tech) ---
        {"name": "TechCrunch - Enterprise", "url": "https://techcrunch.com/category/enterprise/feed/"}, 
        {"name": "TechCrunch - AI", "url": "https://techcrunch.com/category/artificial-intelligence/feed/"},
        {"name": "VentureBeat - AI", "url": "https://venturebeat.com/category/ai/feed/"},
        {"name": "Wired - Business Tech", "url": "https://www.wired.com/feed/category/business/latest/rss"},
        

    ],

    "finance": [
        # --- UK-Focused: Markets, Corporate & Banking ---
        {"name": "City A.M. - Markets", "url": "https://www.cityam.com/category/markets/feed/"}, 
        {"name": "City A.M. - Finance", "url": "https://www.cityam.com/category/finance/feed/"}, 
        {"name": "City A.M. - Banking", "url": "https://www.cityam.com/category/banking/feed/"},
        {"name": "London Stock Exchange - News", "url": "https://www.londonstockexchange.com/news-article/rss-news-feed"},
        
        # --- UK-Focused: Broad Business News ---
        {"name": "Sky News - Business", "url": "https://feeds.skynews.com/feeds/rss/business.xml"}, 
        {"name": "BBC News - Business", "url": "http://feeds.bbci.co.uk/news/business/rss.xml"},
        
        # --- Global (Market, Economic, Corporate Focus) ---
        {"name": "WSJ - Markets", "url": "https://feeds.a.dj.com/rss/RSSMarketsMain.xml"}, 
        {"name": "WSJ - Corporate Business", "url": "https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml"},
        {"name": "CNBC - Economy", "url": "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258"},
        {"name": "CNBC - Investing & Markets", "url": "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839069"},
        {"name": "Yahoo Finance - Global Markets", "url": "https://finance.yahoo.com/news/rssindex"},
    ],

    "politics": [
        # --- UK-Focused ---
        {"name": "BBC UK Politics", "url": "http://feeds.bbci.co.uk/news/politics/rss.xml"},
        {"name": "Sky News - Politics", "url": "https://feeds.skynews.com/feeds/rss/politics.xml"},
        {"name": "UK Human Rights Blog", "url": "https://ukhumanrightsblog.com/feed/"}, 
        {"name": "Politico UK", "url": "https://www.politico.eu/uk/feed/"}, 
        
        # --- Global ---
        {"name": "BBC World News", "url": "http://feeds.bbci.co.uk/news/world/rss.xml"},
        {"name": "Chatham House Insights", "url": "https://www.chathamhouse.org/rss/insights"}, 
        {"name": "United Nations News", "url": "https://news.un.org/feed/subscribe/en/news/all/rss.xml"},
        {"name": "Politico EU", "url": "https://www.politico.eu/feed/"}, 

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
    "finance": [
        "stock market", "equity", "bond market", "interest rate", "inflation",
        "recession", "economic growth", "GDP", "unemployment rate",
        "corporate earnings", "merger", "acquisition", "IPO", "SPAC",
        "banking regulation", "central bank", "Federal Reserve", "ECB",
        "quantitative easing", "fiscal policy", "tax reform",
    ],
    "politics": [
        "election", "parliament", "legislation", "policy", "diplomacy",
        "international relations", "geopolitics", "human rights", "climate policy",
        "trade agreement", "sanctions", "military conflict", "peace talks",
        "prime minister", "president", "chancellor", "foreign secretary",
        "congress", "senate", "house of representatives", "MP", "MP", "minister", "cabinet", "think tank", "NGO", "activist group"
    ]
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