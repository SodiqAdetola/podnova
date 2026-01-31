// frontend/src/types/podcasts.ts

export interface Podcast {
  id: string;
  user_id: string;
  topic_id: string;
  topic_title: string;
  category: string;
  status: "pending" | "generating_script" | "generating_audio" | "uploading" | "completed" | "failed";
  voice: string;
  style: string;
  length_minutes: number;
  duration_seconds?: number;
  audio_url?: string;
  transcript_url?: string;
  script?: string;
  credits_used: number;
  estimated_credits: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  error_message?: string;
  custom_prompt?: string;
  focus_areas?: string[];
}

export type PodcastStatus = 
  | "pending"
  | "generating_script"
  | "generating_audio"
  | "uploading"
  | "completed"
  | "failed";

export type TabType = "all" | "downloads" | "saved";

export interface PodcastLibraryResponse {
  podcasts: Podcast[];
  count: number;
  user_id: string;
}

export interface PodcastPlayerProps {
  visible: boolean;
  podcast: Podcast | null;
  onClose: () => void;
  isSaved: boolean;
  onToggleSave: () => void;
}