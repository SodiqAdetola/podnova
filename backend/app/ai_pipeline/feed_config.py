"""
RSS Feed Configuration for PodNova
High-quality, reputable sources only for impactful news
"""

# Configuration Constants
FETCH_INTERVAL_HOURS = 6
MIN_WORD_COUNT = 400 
MAX_WORD_COUNT = 4000
MAX_ARTICLE_AGE_HOURS = 48

RSS_FEEDS = {
    "technology": [
        # Tier 1: Major News Outlets (Most Impactful)
        {
            "name": "BBC Technology",
            "url": "http://feeds.bbci.co.uk/news/technology/rss.xml",
        },
        {
            "name": "The Guardian Technology",
            "url": "https://www.theguardian.com/uk/technology/rss",
        },
        {
            "name": "Financial Times Tech",
            "url": "https://www.ft.com/technology?format=rss",
        },
        {
            "name": "Reuters Technology",
            "url": "https://www.reuters.com/technology",
        },
        {
            "name": "Associated Press Technology",
            "url": "https://apnews.com/apf-technology?utm_source=apnews&utm_medium=rss",
        },
        
        # Tier 2: Tech Industry Leaders
        {
            "name": "TechCrunch",
            "url": "https://techcrunch.com/feed/",
        },
        {
            "name": "The Verge",
            "url": "https://www.theverge.com/rss/index.xml",
        },

        
        # Tier 3: Deep Tech & Research
        {
            "name": "MIT Technology Review",
            "url": "https://www.technologyreview.com/feed/",
        },
        {
            "name": "IEEE Spectrum",
            "url": "https://spectrum.ieee.org/feeds/feed.rss",
        },
        {

        },
        
        # Tier 4: Cybersecurity (Critical Infrastructure)
        {
            "name": "Krebs on Security",
            "url": "https://krebsonsecurity.com/feed/",
        },
        {
            "name": "The Hacker News",
            "url": "https://feeds.feedburner.com/TheHackersNews",
        },
        
        # Tier 5: AI Research Leaders
        {
            "name": "Google AI Blog",
            "url": "http://feeds.feedburner.com/blogspot/gJZg",
        },
        {
            "name": "DeepMind Blog",
            "url": "https://deepmind.com/blog/feed/basic/",
        },
        {
            "name": "OpenAI Blog",
            "url": "https://openai.com/news/rss/",
        },
    ],
    
    "finance": [
        {
            "name": "BBC Business",
            "url": "http://feeds.bbci.co.uk/news/business/rss.xml",
        },
        {
            "name": "The Guardian Business",
            "url": "https://www.theguardian.com/uk/business/rss",
        },
        {
            "name": "Financial Times",
            "url": "https://www.ft.com/?format=rss",
        },
        {
            "name": "Reuters Business",
            "url": "https://www.reuters.com/business",
        },
        {
            "name": "Wall Street Journal",
            "url": "https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml",
        },
        {
            "name": "Bloomberg",
            "url": "https://feeds.bloomberg.com/markets/news.rss",
        },
        {
            "name": "The Economist",
            "url": "https://www.economist.com/finance-and-economics/rss.xml",
        },
        {
            "name": "CNBC",
            "url": "https://www.cnbc.com/id/10001147/device/rss/rss.html",
        },
        {
            "name": "Harvard Business Review",
            "url": "https://hbr.org/feed.xml",
        },
    ],
    
    "politics": [
        {
            "name": "BBC Politics",
            "url": "http://feeds.bbci.co.uk/news/politics/rss.xml",
        },
        {
            "name": "The Guardian Politics",
            "url": "https://www.theguardian.com/politics/rss",
        },
        {
            "name": "Financial Times Politics",
            "url": "https://www.ft.com/politics?format=rss",
        },
        {
            "name": "Reuters Politics",
            "url": "https://www.reuters.com/politics",
        },
        {
            "name": "The Economist Politics",
            "url": "https://www.economist.com/international/rss.xml",
        },
        {
            "name": "Politico",
            "url": "https://rss.politico.com/politics-news.xml",
        },
        {
            "name": "Foreign Policy",
            "url": "https://foreignpolicy.com/feed/",
        },
        {
            "name": "Council on Foreign Relations",
            "url": "https://www.cfr.org/feed/publications",
        },
    ]
}

# Important keywords for newsworthiness filtering per category
IMPORTANT_KEYWORDS = {
    "technology": [
        # AI & Machine Learning (added a few key terms)
        "artificial intelligence", "machine learning", "deep learning", "neural network",
        "large language model", "LLM", "foundation model", "transformer",
        "generative AI", "AGI", "AI safety", "AI ethics", "AI regulation",
        "OpenAI", "Anthropic", "DeepMind", "Google AI", "Microsoft AI",
        "Claude", "ChatGPT", "GPT-4", "Gemini", "Llama", "Mistral",
        "AI research", "AI breakthrough", "AI capability", "multimodal AI",
        "computer vision", "natural language processing", "NLP", "reinforcement learning",
        "reasoning", "agentic", "autonomous AI",  # NEW
        
        # Quantum Computing
        "quantum computing", "quantum processor", "quantum algorithm", "qubit",
        "quantum supremacy", "quantum advantage", "quantum error correction",
        "IBM Quantum", "Google Quantum", "Microsoft Quantum",
        
        # Cybersecurity
        "cybersecurity", "cyberattack", "data breach", "ransomware", "zero-day",
        "vulnerability", "exploit", "malware", "advanced persistent threat", "APT",
        "state-sponsored", "encryption", "zero trust", "security patch",
        "critical vulnerability", "CVE", "incident response", "threat intelligence",
        "supply chain attack", "nation-state actor",  # NEW
        
        # Semiconductors & Hardware
        "semiconductor", "chip manufacturing", "foundry", "process node",
        "EUV lithography", "3nm", "5nm", "chiplets", "TSMC", "Intel Foundry",
        "ARM", "RISC-V", "Nvidia", "AMD", "AI chip", "GPU", "data center",
        "HBM", "high-bandwidth memory", "advanced packaging",  # NEW
        
        # Enterprise & Cloud
        "cloud infrastructure", "cloud computing", "hyperscale", "data center",
        "enterprise software", "SaaS", "cloud native", "Kubernetes", "container",
        "open source", "database", "vector database", "API", "microservices",
        "edge computing", "hybrid cloud", "multi-cloud",  # NEW
        
        # Major Tech & Deals
        "acquisition", "merger", "partnership", "funding round", "venture capital",
        "IPO", "valuation", "unicorn", "billion", "trillion", "market cap",
        "antitrust", "regulation", "FTC", "EU Commission", "investigation",
        "Microsoft", "Google", "Amazon", "AWS", "Apple", "Meta", "Nvidia",
        "breakup", "divestiture", "consent decree",  # NEW
        
        # Research & Breakthroughs
        "research breakthrough", "scientific discovery", "peer-reviewed", "Nature",
        "Science", "IEEE", "ACM", "NeurIPS", "ICML", "research paper", "patent",
        "preprint", "arXiv", "milestone", "first-ever",  # NEW
    ],
    
    "finance": [
        # Macroeconomics
        "GDP", "inflation", "CPI", "PPI", "interest rate", "federal reserve", "fed",
        "central bank", "monetary policy", "quantitative easing", "recession",
        "economic growth", "yield curve", "bond yield", "treasury", "soft landing",  # NEW
        "hard landing", "stagflation", "disinflation",  # NEW
        
        # Markets
        "stock market", "equity", "bear market", "bull market", "correction",
        "volatility", "S&P 500", "Dow Jones", "Nasdaq", "FTSE 100",
        "earnings", "quarterly results", "revenue", "profit", "EPS", "guidance",
        "all-time high", "record high", "sell-off", "rally",  # NEW
        
        # Corporate & Deals
        "merger", "acquisition", "M&A", "takeover", "IPO", "SPAC", "buyback",
        "valuation", "market cap", "private equity", "venture capital",
        "hostile takeover", "activist investor",  # NEW
        
        # Banking & Finance
        "investment bank", "commercial bank", "asset management", "hedge fund",
        "BlackRock", "Vanguard", "Goldman Sachs", "JPMorgan", "regulation",
        "Basel III", "stress test", "capital requirements",  # NEW
        
        # Fintech & Crypto
        "fintech", "digital payments", "cryptocurrency", "bitcoin", "ethereum",
        "stablecoin", "CBDC", "blockchain", "DeFi", "crypto regulation", "SEC",
        "spot ETF", "futures ETF", "institutional adoption",  # NEW
        
        # Global Trade
        "trade war", "tariff", "supply chain", "commodity", "oil price", "gold",
        "crude oil", "inflation", "interest rates", "federal reserve",
        "OPEC", "energy crisis", "food security",  # NEW
    ],
    
    "politics": [
        # Elections & Democracy
        "election", "general election", "presidential", "primary", "caucus",
        "referendum", "voting", "polling", "campaign", "fundraising",
        "swing state", "battleground", "landslide", "runoff",  # NEW
        
        # Legislation & Policy
        "legislation", "bill", "act", "law", "executive order", "congress",
        "parliament", "senate", "house", "vote", "passage", "regulation",
        "filibuster", "cloture", "reconciliation", "veto",  # NEW
        
        # International Relations
        "foreign policy", "diplomacy", "summit", "G7", "G20", "UN", "NATO",
        "EU", "treaty", "agreement", "sanctions", "alliance", "geopolitics",
        "BRICS", "Global South", "non-aligned",  # NEW
        
        # Geopolitics
        "US-China", "US-Russia", "China-Russia", "Taiwan", "Ukraine", "Middle East",
        "territorial dispute", "great power competition", "geopolitical risk",
        "Indo-Pacific", "South China Sea", "strategic competition",  # NEW
        
        # Defense & Security
        "national security", "defense", "military", "intelligence", "cyber warfare",
        "nuclear", "arms control", "non-proliferation", "defense spending",
        "deterrence", "mutual defense", "Article 5",  # NEW
        
        # Political Issues
        "healthcare", "climate change", "immigration", "border security", "tax",
        "budget", "debt ceiling", "social security", "entitlements", "reform",
        "abortion", "gun control", "voting rights",  # NEW
        
        # Government
        "president", "prime minister", "cabinet", "minister", "governor", "mayor",
        "congress", "parliament", "supreme court", "justice", "judicial",
        "impeachment", "indictment", "testimony",  # NEW
    ]
}

# Keywords that indicate low-value content to avoid - added a few but kept balanced
NOISE_KEYWORDS = [
    # Consumer tech & gadgets - specific product lines
    "iphone", "ipad", "macbook", "apple watch", "airpods", "imac", "mac mini",
    "galaxy s", "galaxy z", "galaxy tab", "pixel phone", "oneplus", "xiaomi", 
    "nothing phone", "fairphone", "pixel"
    
    # Review content - must include "review" to avoid false positives
    "phone review", "laptop review", "tablet review", "headphone review", 
    "camera review", "speaker review", "tv review", "monitor review", 
    "keyboard review", "mouse review", "chair review", "game review",
    "review roundup", "review round-up", "first impressions", "hands-on review",
    
    # Comparison/buying guide content
    "phone comparison", "laptop comparison", "vs", "versus", "compared", 
    "best phone", "best laptop", "best tablet", "best headphones", 
    "best camera", "best tv", "best monitor", "best of", "top 10", "top 5", 
    "top 20", "ranked", "listicle", "roundup", "buying guide", "shopping guide",
    
    # Unboxing/first look content
    "unboxing", "unboxed", "first look", "hands-on", "first impressions",
    
    # Specs/release content (unless significant)
    "specs leaked", "specifications revealed", "render leak", "design leak",
    "launch date", "release date", "pre-order", "preorder", "available now",
    "coming soon", "teaser", "teased", "hints at", "suggests",
    
    # Deal/shopping content
    "deal", "sale", "discount", "price drop", "lowest price", "black friday",
    "cyber monday", "prime day", "holiday sale", "clearance",
    "affiliate", "sponsored", "paid content", "advertisement", "promoted",
    
    # Low-effort content formats
    "gallery", "slideshow", "in pictures", "photos only", "things to know", 
    "what you need to know", "beginner's guide", "how to", "tips and tricks", 
    "tips", "tricks", "hacks", "life hack", "cheat sheet", "explained simply",
    "for beginners", "guide to", "primer", "explained in 5 minutes",
    
    # Entertainment (specific shows/platforms)
    "movie review", "film review", "tv show review", "binge-watch", "bingeable",
    "netflix original", "disney plus", "hulu", "max streaming", "paramount plus", 
    "apple tv plus", "peacock", "streaming service", "episode recap", "season finale",
    
    # Gaming (specific titles)
    "gameplay trailer", "gameplay reveal", "game awards", "state of play",
    "nintendo direct", "xbox showcase", "playstation state of play",
    "steam sale", "epic games store", "game pass", "ps plus", "free games",
    
    # Social media/viral content
    "viral video", "viral tweet", "trending on", "tiktok trend", "instagram reel",
    "influencer", "content creator", "streamer", "twitch stream", "youtube video",
    "subscriber count", "follower count", "goes viral",
    
    # Personal finance noise (avoid single words)
    "dividend aristocrats", "monthly dividend stock", "passive income stream",
    "real estate investing tip", "rental property investment", "side hustle idea",
    "crypto trading strategy", "day trading tip", "swing trading setup",
    "technical analysis pattern", "chart pattern breakout",
    
    # Political noise (avoid single words)
    "poll shows", "approval rating drops", "favorability rating", "tracking poll",
    "campaign ad attack", "fundraising email blast", "rally crowd size", 
    "campaign stop speech", "stump speech highlights", "town hall meeting",
    
    # Rumor/speculation (requires context)
    "rumor suggests", "leak claims", "speculation grows", "reportedly planning",
    "allegedly working on", "insider says", "source claims", "tipster claims",
    "unconfirmed report", "might launch", "could release", "expected to unveil",
    
    # Tech support/problem articles
    "how to fix", "troubleshooting guide", "common problem", "issue with",
    "not working", "won't turn on", "battery drain", "overheating fix",
    "error message", "solution for", "workaround for",
]