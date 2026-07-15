export type SocialPlatform =
  | 'douyin'
  | 'kuaishou'
  | 'xiaohongshu'
  | 'shipinhao'
  | 'tiktok'
  | 'bilibili'
  | 'weibo'
  | 'other';

export type FetchStrategy = 'manual' | 'cookie' | 'api' | 'scraper' | 'import' | 'native_playwright';

export interface SocialAccount {
  id: number;
  platform: SocialPlatform;
  external_account_id?: string | null;
  account_name: string;
  display_name?: string | null;
  profile_url?: string | null;
  avatar_url?: string | null;
  owner_id?: number | null;
  active: boolean;
  fetch_strategy: FetchStrategy;
  cookie_ref?: string | null;
  credential_ref?: string | null;
  remark?: string | null;
  last_fetched_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SocialSnapshot {
  id: number;
  account_id: number;
  platform: SocialPlatform;
  snapshot_date: string;
  followers: number;
  following_count: number;
  likes_total: number;
  video_count: number;
  works_count: number;
  engagement_est: number;
  source_method?: string | null;
  source_project?: string | null;
  raw_json?: string | null;
  fetched_at?: string | null;
  created_at: string;
}

export interface SocialVideo {
  id: number;
  account_id: number;
  snapshot_id: number;
  platform: SocialPlatform;
  internal_video_key: string;
  external_video_id?: string | null;
  title?: string | null;
  video_url?: string | null;
  cover_url?: string | null;
  publish_time?: string | null;
  likes: number;
  comments: number;
  shares: number;
  collects: number;
  views: number;
  duration?: number | null;
  status?: string | null;
  visibility?: string | null;
  raw_json?: string | null;
  source_type?: string | null;
  created_at: string;
}

export interface SocialIngestionJob {
  id: number;
  account_id?: number | null;
  platform: SocialPlatform;
  strategy: FetchStrategy;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled' | 'skipped';
  retry_count: number;
  last_error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface NormalizedAccountSnapshot {
  platform: SocialPlatform;
  external_account_id: string;
  account_name: string;
  display_name?: string | null;
  profile_url?: string | null;
  avatar_url?: string | null;
  snapshot_date: string;
  followers?: number;
  following_count?: number;
  likes_total?: number;
  video_count?: number;
  works_count?: number;
  engagement_est?: number;
  source_method?: string | null;
  source_project?: string | null;
  raw_json?: unknown;
  fetched_at?: string | null;
}

export interface NormalizedVideoSnapshot {
  platform: SocialPlatform;
  internal_video_key?: string | null;
  external_video_id?: string | null;
  title?: string | null;
  video_url?: string | null;
  cover_url?: string | null;
  publish_time?: string | null;
  likes?: number;
  comments?: number;
  shares?: number;
  collects?: number;
  views?: number;
  duration?: number | null;
  status?: string | null;
  visibility?: string | null;
  raw_json?: unknown;
  source_type?: string | null;
}

export interface SocialMetricRollup {
  id: number;
  scope_date: string;
  platform: SocialPlatform;
  metric_key: string;
  metric_name: string;
  metric_value: number;
  dimension_json?: string | null;
  created_at: string;
}

export type SocialCredentialStatus = 'active' | 'expired' | 'pending_login' | 'failed' | 'revoked';

export type SocialCredentialType = 'creator_center_storage_state';

export interface SocialCredential {
  id: number;
  platform: SocialPlatform;
  account_id: number;
  credential_type: SocialCredentialType | string;
  credential_ref: string;
  encrypted_payload?: string | null;
  status: SocialCredentialStatus;
  expires_at?: string | null;
  last_verified_at?: string | null;
  last_failed_at?: string | null;
  last_error?: string | null;
  created_by?: number | null;
  updated_by?: number | null;
  created_at: string;
  updated_at: string;
}
