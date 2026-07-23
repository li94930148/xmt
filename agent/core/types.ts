export type SyncInterval = 'manual' | '12h' | 'daily';
export type BrowserMode = 'system_chrome' | 'embedded_chromium';

export type AgentConfig = {
  serverUrl: string; agentId: number; deviceId: string; platform: 'douyin'; accountId: string; accountName: string;
  browserConfig: { mode: BrowserMode; cdpEndpoint: string; chromePath?: string };
  syncConfig: { enabled: boolean; interval: SyncInterval; dailyHour: number };
};

export type MetricMap = Record<string, string | number | boolean | null>;
export type CreatorWork = { item_id: string; title: string; published_at?: string; cover?: string; status?: string; raw?: unknown; [key: string]: unknown };
export type CreatorWorkDetail = { item_id: string; overview: MetricMap; traffic: unknown; audience: unknown; comments: unknown; raw: unknown };
export type NetworkCapture = { name: string; url: string; method: string; params: unknown; response: unknown; captured_at: string };

export type CreatorSnapshot = {
  platform: 'douyin'; source: 'local_creator_center'; collected_at: string;
  account: { nickname: string; avatar: string; uid: string; fans_count: number; [key: string]: unknown };
  works: CreatorWork[]; work_details: CreatorWorkDetail[];
  dashboard: Record<string, unknown>; content_analysis: Record<string, unknown>; fans: Record<string, unknown>;
  raw: { api_map: Array<{ name: string; url: string; params: unknown; response_keys: string[] }>; captures: NetworkCapture[] };
  /** Compatibility for the existing desktop UI. */
  videos: CreatorWork[]; operations: { last7Days: unknown; last30Days: unknown; trafficSources: unknown; contentPerformance: unknown };
};

export type SyncResult = { collectedAt: string; snapshot: CreatorSnapshot; local?: unknown; upload: { success: boolean; snapshot_id?: number; source?: string; modules?: unknown } };
