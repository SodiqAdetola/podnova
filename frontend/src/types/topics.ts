// frontend/src/types/topics.ts - UPDATED WITH HISTORY
export interface Topic {
  id: string;
  title: string;
  summary: string;
  article_count: number;
  source_count: number;
  confidence: number;
  last_updated: string;
  time_ago: string;
  category: string;
  image_url?: string;
  history_point_count?: number;  
  development_note?: string; 
}

export interface Article {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  published_date: string;
  word_count: number;
  image_url?: string;
}

export interface HistoryPoint {
  id: string;
  history_type: "initial" | "major_update" | "source_expansion" | "confidence_shift" | "periodic";
  created_at: string;
  title: string;
  summary: string;
  key_insights: string[];
  article_count: number;
  sources: string[];
  confidence: number;
  significance_score: number;
  was_regenerated: boolean;
  development_note?: string;
  image_url?: string;
}

export interface TopicDetail extends Topic {
  key_insights: string[];
  sources: string[];
  created_at: string;
  articles: Article[];
  tags: string[];
  has_podcast: boolean;
  history_timeline?: HistoryPoint[]; 
}

export type TabType = "all" | "downloads" | "saved";

export interface PodcastLibraryResponse {
  podcasts: any[];
  count: number;
  user_id: string;
}

export interface TopicHistoryResponse {
  topic_id: string;
  history_points: HistoryPoint[];
  count: number;
}

export interface Category {
    name: string;
    display_name: string;
    topic_count: number;
    trending: string | null;
}

export type SortOption = "latest" | "reliable" | "most_discussed";