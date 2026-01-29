# /backend/app/ai_pipeline/feed_config.py
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
        {
            "name": "BBC Technology",
            "url": "http://feeds.bbci.co.uk/news/technology/rss.xml",
            "priority": "high"
        },
        {
            "name": "The Guardian Technology",
            "url": "https://www.theguardian.com/uk/technology/rss",
            "priority": "high"
        },
        {
            "name": "Financial Times Tech",
            "url": "https://www.ft.com/technology?format=rss",
            "priority": "high"
        },
        {
            "name": "Reuters Technology",
            "url": "https://www.reuters.com/technology",
            "priority": "high"
        }
    ],
    
    "finance": [
        {
            "name": "BBC Business",
            "url": "http://feeds.bbci.co.uk/news/business/rss.xml",
            "priority": "high"
        },
        {
            "name": "The Guardian Business",
            "url": "https://www.theguardian.com/uk/business/rss",
            "priority": "high"
        },
        {
            "name": "Financial Times",
            "url": "https://www.ft.com/?format=rss",
            "priority": "high"
        },
        {
            "name": "Reuters Business",
            "url": "https://www.reuters.com/business",
            "priority": "high"
        },
        {
            "name": "The Economist",
            "url": "https://www.economist.com/finance-and-economics/rss.xml",
            "priority": "high"
        }
    ],
    
    
    "politics": [
        {
            "name": "BBC Politics",
            "url": "http://feeds.bbci.co.uk/news/politics/rss.xml",
            "priority": "high"
        },
        {
            "name": "The Guardian Politics",
            "url": "https://www.theguardian.com/politics/rss",
            "priority": "high"
        },
        {
            "name": "Financial Times Politics",
            "url": "https://www.ft.com/politics?format=rss",
            "priority": "high"
        },
        {
            "name": "Reuters Politics",
            "url": "https://www.reuters.com/politics",
            "priority": "high"
        },
        {
            "name": "The Economist Politics",
            "url": "https://www.economist.com/international/rss.xml",
            "priority": "high"
        }
    ]
}

# Important keywords for newsworthiness filtering per category
IMPORTANT_KEYWORDS = {
    "technology": [
        # AI & Machine Learning
        "artificial intelligence", "machine learning", "deep learning", "neural network",
        "large language model", "LLM", "GPT", "transformer", "generative AI", "AGI",
        "OpenAI", "Anthropic", "DeepMind", "AI safety", "AI regulation", "AI ethics",
        
        # Quantum Computing
        "quantum computing", "quantum processor", "quantum algorithm", "qubit",
        "quantum supremacy", "quantum entanglement", "quantum error correction",
        
        # Cybersecurity
        "cybersecurity", "cyberattack", "data breach", "ransomware", "zero-day",
        "vulnerability", "exploit", "malware", "encryption", "authentication",
        "security patch", "critical vulnerability", "state-sponsored", "APT",
        
        # Emerging Tech & Research
        "semiconductor", "chip manufacturing", "5G", "6G", "edge computing",
        "blockchain", "distributed ledger", "smart contract", "autonomous systems",
        "robotics", "automation", "IoT", "quantum cryptography",
        
        # Enterprise & Industry
        "cloud infrastructure", "data center", "enterprise software", "SaaS",
        "API", "open source", "patent", "intellectual property", "R&D",
        "research breakthrough", "peer-reviewed", "IEEE", "ACM",
        
        # Major Players & Deals
        "acquisition", "merger", "partnership", "funding round", "IPO", "valuation",
        "antitrust", "regulation", "FTC", "EU Commission", "billion", "trillion",
        "Microsoft", "Google", "Amazon Web Services", "IBM", "Oracle", "SAP",
        "Nvidia", "Intel", "AMD", "TSMC", "Samsung Electronics"
    ],
    
    "finance": [
        # Macroeconomics
        "GDP", "inflation", "deflation", "stagflation", "interest rate", "yield curve",
        "monetary policy", "fiscal policy", "central bank", "Federal Reserve", "Fed",
        "Bank of England", "ECB", "quantitative easing", "recession", "economic growth",
        
        # Markets & Trading
        "stock market", "equity", "bond market", "treasury", "yield", "volatility",
        "correction", "bear market", "bull market", "S&P 500", "Dow Jones", "FTSE 100",
        "Nasdaq", "index", "benchmark", "derivatives", "futures", "options",
        
        # Corporate Finance
        "earnings report", "quarterly results", "revenue", "profit margin", "EBITDA",
        "merger", "acquisition", "M&A", "IPO", "SPAC", "tender offer", "leveraged buyout",
        "private equity", "venture capital", "valuation", "market capitalization",
        
        # Banking & Financial Services
        "investment bank", "commercial bank", "asset management", "hedge fund",
        "sovereign wealth fund", "credit rating", "Moody's", "S&P", "Fitch",
        "Basel III", "capital requirements", "stress test", "liquidity",
        
        # Regulation & Policy
        "SEC", "FCA", "Basel", "Dodd-Frank", "MiFID", "compliance", "sanctions",
        "financial regulation", "systemic risk", "too big to fail",
        
        # Currencies & Commodities
        "foreign exchange", "forex", "currency", "dollar", "euro", "pound", "yen",
        "reserve currency", "IMF", "World Bank", "commodity", "crude oil", "Brent",
        "WTI", "gold price", "copper", "agricultural commodities",
        
        # Digital Finance
        "cryptocurrency", "bitcoin", "ethereum", "stablecoin", "DeFi", "CBDC",
        "digital currency", "blockchain finance", "tokenization"
    ],
    
    
    "politics": [
        # Legislation & Policy
        "legislation", "bill passed", "senate vote", "parliamentary vote",
        "executive order", "policy reform", "regulation", "act of parliament",
        "constitutional", "supreme court", "judicial review", "ruling",
        
        # Elections & Democracy
        "election", "general election", "primary", "referendum", "ballot",
        "voter turnout", "polling", "caucus", "electoral", "mandate",
        
        # International Relations
        "diplomatic", "foreign policy", "treaty", "alliance", "NATO", "UN Security Council",
        "sanctions", "embargo", "trade agreement", "trade war", "tariff",
        "bilateral", "multilateral", "G7", "G20", "BRICS", "ASEAN",
        
        # Geopolitics
        "geopolitical", "territorial", "sovereignty", "international law",
        "arms control", "nuclear treaty", "non-proliferation", "defense spending",
        "military alliance", "peacekeeping", "conflict resolution",
        
        # Economic Policy
        "budget", "spending bill", "tax reform", "fiscal stimulus", "austerity",
        "infrastructure bill", "social security", "healthcare reform",
        "pension reform", "welfare state", "public spending",
        
        # Governance & Institutions
        "central bank independence", "separation of powers", "checks and balances",
        "cabinet reshuffle", "ministerial appointment", "parliamentary inquiry",
        "select committee", "oversight", "accountability", "transparency",
        
        # Major Issues
        "climate policy", "energy security", "immigration policy", "border control",
        "national security", "intelligence", "surveillance", "civil liberties",
        "human rights", "rule of law", "corruption investigation"
    ]
}

# Keywords that indicate low-value content to avoid
NOISE_KEYWORDS = [
    # Consumer tech & gadgets
    "iPhone", "iPad", "Galaxy phone", "gaming console", "PlayStation", "Xbox",
    "Nintendo", "smartphone review", "laptop review", "best phone", "phone comparison",
    "unboxing", "hands-on", "first look", "specs leaked", "release date",
    
    # Lifestyle & entertainment
    "quiz", "gallery", "slideshow", "photos only", "pictures only", "photo essay",
    "video roundup", "watch:", "in pictures", "best of", "top 10", "top 5",
    "ranked", "opinion:", "comment:", "blog:", "editorial:", "letter to editor",
    "celebrity", "gossip", "rumor", "rumour", "horoscope", "astrology",
    "recipe", "cooking", "fashion", "beauty tips", "style guide", "shopping",
    "deals", "discount", "sale", "buy now", "review roundup", "trailer",
    "preview", "teaser", "spoiler", "recap", "highlights",
    
    # Sports & gaming
    "match report", "player ratings", "transfer news", "video game", "esports",
    "gaming news", "game review", "game trailer", "gameplay",
    
    # Low-substance content
    "things to know", "what you need to know", "explained in", "beginner's guide",
    "how to", "tips and tricks", "life hack", "viral", "trending on"
]