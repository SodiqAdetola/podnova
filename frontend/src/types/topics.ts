// frontend/src/types/topics.ts

export interface Category {
  name: string;
  display_name: string;
  topic_count: number;
  trending: string | null;
}

export interface Topic {
  id: string;
  title: string;
  summary?: string;
  article_count: number;
  source_count: number;
  confidence: number;
  last_updated: string;
  time_ago: string;
  category: string;
}

export interface Article {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  published_date: string;
  word_count: number;
}

export interface TopicDetail extends Topic {
  key_insights: string[];
  sources: string[];
  created_at: string;
  articles: Article[];
  tags: string[];
  has_podcast: boolean;
}

export type SortOption = "latest" | "reliable" | "most_discussed";