import { useAuthStore } from '../store';

const BASE_URL = '/api/social-review';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, { headers: getAuthHeader() });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) throw new Error(payload?.message || '数据暂时无法加载，请稍后重试。');
  return payload.data as T;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) throw new Error(payload?.message || '操作未完成，请稍后重试。');
  return payload.data as T;
}

async function del<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, { method: 'DELETE', headers: getAuthHeader() });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) throw new Error(payload?.message || 'Operation could not be completed.');
  return payload.data as T;
}

export type SocialAccountOverview = {
  accountId: number;
  accountName: string;
  displayName: string | null;
  platform: string;
  active: boolean;
  lastFetchedAt: string | null;
  credentialStatus: string | null;
  latestJob: { status: string; failureType: string | null; finishedAt: string | null; createdAt: string | null } | null;
  nextRunAt: string | null;
  scheduleEnabled: boolean;
  health: { successRate: number; totalJobs: number; successJobs: number; failedJobs: number; lastSuccessAt: string | null; lastFailedAt: string | null; lastFailureType: string | null };
};

export type SocialAccountStatus = {
  id: number;
  nickname: string;
  platform: string;
  avatarUrl: string | null;
  credentialStatus: string;
  ingestionStatus: string | null;
  lastSyncTime: string | null;
  videoCount: number;
};

export type AccountConnectStart = {
  accountId: number;
  loginSessionId: string;
  status: 'waiting_scan' | 'failed';
  streamReady: boolean;
};

export type VideoPerformanceItem = {
  id: number;
  title: string | null;
  publishTime?: string | null;
  publish_time: string | null;
  coverUrl?: string | null;
  cover_url?: string | null;
  views: number | null;
  likes: number | null;
  comments?: number | null;
  shares?: number | null;
  collects?: number | null;
  interactionRate?: number | null;
  hotScore?: number;
  scoreMode?: 'play_only' | 'full';
  sourceType?: string | null;
  performance: { interactionRate: number | null; hotScore: number; scoreMode?: 'play_only' | 'full' };
};

export type SocialVideoReview = {
  id: number;
  title: string | null;
  publishTime: string | null;
  coverUrl: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  collects: number | null;
  interactionRate: number | null;
  hotScore: number;
  scoreMode?: 'play_only' | 'full';
  lifecycleStage?: 'early' | 'growth' | 'stable' | 'decline' | null;
  playRank?: number;
  sourceType: string | null;
};

export type IngestionJob = {
  id: number;
  accountId: number | null;
  platform: string;
  status: string;
  triggerSource: string;
  failureType: string | null;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type AccountDashboard = {
  accountId: number;
  health: { healthScore: number; averageViews: number; averageInteractionRate: number | null; followerGrowth: number };
  topVideos: VideoPerformanceItem[];
};

export type DailySummary = {
  accountId: number;
  summaryDate: string;
  newVideoCount: number;
  viewsGrowth: number;
  interactionChange: number;
  bestContent: { videoId: number; title: string | null; publishTime: string | null; hotScore: number; views: number } | null;
  collection: { lastSuccessAt: string | null; lastFailedAt: string | null; successRate: number; latestFailureType: string | null };
};

export type DataQuality = {
  warnings: Array<{ code: string; message: string }>;
  errors: Array<{ code: string; message: string }>;
};

export type MetricStatus = { views: boolean; likes: boolean; comments: boolean; shares: boolean; collects: boolean };
export type CredentialHealth = { status: 'active' | 'expired' | 'need_login' | 'checking'; code?: 'credential_expired' | 'need_login'; reason: string | null };

export type SocialReviewReport = {
  accountId: number;
  periodType: '7d' | '30d' | '90d' | null;
  periodStart: string;
  periodEnd: string;
  report: {
    summary: { videoCount: number; newVideoCount: number; averageViews: number; averageInteractionRate: number | null; averageShareRate: number | null; accountHealth?: { healthScore?: number }; dataQualityStatus?: { warningCount: number; errorCount: number } };
    contentDistribution: { categoryCount: number; categories: Array<{ category: string; count: number; avgViews: number; avgInteractionRate: number }> };
    performanceRanking: { topViews: RankingVideo | null; topInteraction: RankingVideo | null; topShares: RankingVideo | null; fastestGrowth: RankingVideo | null };
    contentPatterns: { highPerformanceKeywords: FeaturePattern[]; highPerformanceCategories: FeaturePattern[]; highPerformancePublishTimeBuckets: FeaturePattern[]; highPerformanceDurationLevels: FeaturePattern[] };
    suggestions: Array<{ feature: string; reason: string; suggestion: string }>;
    metricAvailability?: MetricStatus;
  };
};

export type RankingVideo = { videoId: number; title: string | null; metrics: { views?: number; interactionRate?: number; shares?: number; viewsGrowth?: number } };
export type FeaturePattern = { feature: string; avgViews: number; avgInteractionRate: number; avgShares: number; count: number };
export type ContentInsights = { highPerformanceFeatures: FeaturePattern[] };
export type OperationSuggestion = { id: number; type: 'content_direction' | 'publish_strategy' | 'performance_warning' | 'growth_opportunity'; title: string; content: string; source: string; createdAt: string };

export async function getSocialAccountsOverview() {
  return request<{ items: SocialAccountOverview[] }>('/accounts/overview');
}

export async function getSocialAccountStatuses() {
  return request<{ items: SocialAccountStatus[] }>('/accounts/status');
}

export async function startAccountConnect(nickname: string, remark?: string) {
  return post<AccountConnectStart>('/accounts/connect/start', { platform: 'douyin', nickname, remark: remark || undefined });
}

export async function deleteSocialAccount(accountId: number) {
  return del<{ message: string }>(`/accounts/${accountId}`);
}

export async function getSocialHotVideos(accountId?: number) {
  const query = accountId ? `?accountId=${accountId}` : '';
  return request<{ items: VideoPerformanceItem[] }>(`/videos/hot${query}`);
}

export async function getSocialAccountVideos(accountId: number, page = 1, limit = 20) {
  return request<{ items: SocialVideoReview[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(`/accounts/${accountId}/videos?page=${page}&limit=${limit}`);
}

export async function getSocialVideo(accountId: number, videoId: number) {
  return request<{ video: SocialVideoReview & { playScore: number; interactionScore: number; growthScore: number; growthSpeed?: { viewsPerDay: number; recentGrowthRate: number | null } | null } }>(`/accounts/${accountId}/videos/${videoId}`);
}

export async function syncSocialExport(accountId: number) {
  return post<{ insertCount: number; updateCount: number; skipCount: number; videoCount: number; message: string }>(`/accounts/${accountId}/sync-export`);
}

export async function getSocialIngestionJobs() {
  return request<{ items: IngestionJob[] }>('/jobs');
}

export async function getSocialAccount(accountId: number) {
  return request<{ account: { id: number; accountName: string; displayName: string | null; platform: string; active: boolean } }>(`/accounts/${accountId}`);
}

export async function getSocialDashboard(accountId: number) {
  return request<AccountDashboard>(`/accounts/${accountId}/dashboard`);
}

export async function getSocialDailySummary(accountId: number) {
  return request<DailySummary>(`/accounts/${accountId}/daily-summary`);
}

export async function getSocialDataQuality(accountId: number) {
  return request<DataQuality>(`/accounts/${accountId}/data-quality`);
}

export async function getSocialMetricStatus(accountId: number) {
  return request<MetricStatus>(`/accounts/${accountId}/metric-status`);
}

export async function getSocialLatestSnapshot(accountId: number) {
  return request<{ snapshot: { followers: number | null } | null }>(`/accounts/${accountId}/latest-snapshot`);
}

export async function getSocialLatestReport(accountId: number) {
  return request<SocialReviewReport>(`/accounts/${accountId}/reports/latest`);
}

export async function generateSocialReport(accountId: number, period: '7d' | '30d' | '90d') {
  return post<Omit<SocialReviewReport, 'id'>>(`/accounts/${accountId}/reports/generate`, { period });
}

export async function getSocialContentInsights(accountId: number) {
  return request<ContentInsights>(`/accounts/${accountId}/content-insights`);
}

export async function getSocialOperationSuggestions(accountId: number) {
  return request<{ items: OperationSuggestion[] }>(`/accounts/${accountId}/suggestions`);
}
export async function checkCredentialHealth(accountId: number) { return post<CredentialHealth>(`/accounts/${accountId}/credential-health`); }
export type VideoMetricPoint = { snapshotDate: string; views: number; likes: number; comments: number; shares: number; collects: number; interactionRate: number };
export async function getSocialVideoLifecycle(videoId: number) { return request<{ historicalTrend: VideoMetricPoint[]; growthStage: string; growthSpeed: { viewsPerDay: number; recentGrowthRate: number | null } }>(`/videos/${videoId}/lifecycle`); }
export async function getSocialVideoFeatures(videoId: number) { return request<{ items: Array<{ featureType: string; featureValue: string }> }>(`/videos/${videoId}/features`); }
export async function getSocialVideoInsights(videoId: number) { return request<{ items: Array<{ type: string; content: string }> }>(`/videos/${videoId}/insights`); }
export async function getSimilarSocialVideos(videoId: number) { return request<{ items: Array<{ id: number; title: string | null; coverUrl: string | null; publishTime: string | null; views: number | null; score: number }> }>(`/videos/${videoId}/similar`); }
export async function createSocialLoginSession(accountId: number) { return post<{ sessionId: string; status: 'waiting_scan' }>(`/accounts/${accountId}/login/start`); }
export type LoginSessionStatus = 'waiting_scan' | 'scanned' | 'manual_verify_required' | 'auth_required' | 'success' | 'failed' | 'expired';
export type RemoteBrowserFrame = { image: string; mimeType: string; screenshotWidth: number; screenshotHeight: number; viewportWidth: number; viewportHeight: number; updatedAt?: number; code?: string; message?: string | null };
export type RemoteBrowserClick = { x: number; y: number; screenshotWidth: number; screenshotHeight: number; renderedWidth: number; renderedHeight: number; viewportWidth: number; viewportHeight: number };
export async function getSocialLoginStatus(sessionId: string) { return request<{ sessionId: string; status: LoginSessionStatus; message: string | null }>(`/login-session/${encodeURIComponent(sessionId)}`); }
export async function getSocialLoginScreenshot(sessionId: string) { return request<RemoteBrowserFrame>(`/login-session/${encodeURIComponent(sessionId)}/screenshot`); }
export async function clickSocialLoginBrowser(sessionId: string, click: RemoteBrowserClick) { return post<RemoteBrowserFrame>(`/login-session/${encodeURIComponent(sessionId)}/click`, { ...click, imageWidth: click.screenshotWidth, imageHeight: click.screenshotHeight }); }
export async function scrollSocialLoginBrowser(sessionId: string, deltaX: number, deltaY: number) { return post<RemoteBrowserFrame>(`/login-session/${encodeURIComponent(sessionId)}/scroll`, { deltaX, deltaY }); }
export async function typeSocialLoginBrowser(sessionId: string, text: string) { return post<RemoteBrowserFrame>(`/login-session/${encodeURIComponent(sessionId)}/type`, { text }); }
export async function pressSocialLoginBrowser(sessionId: string, key: string) { return post<RemoteBrowserFrame>(`/login-session/${encodeURIComponent(sessionId)}/press`, { key }); }
export async function cancelSocialLoginSession(sessionId: string) { return post<{ sessionId: string; status: 'failed' }>(`/login-session/${encodeURIComponent(sessionId)}/cancel`); }
export const startLoginRecovery = createSocialLoginSession;
export const getLoginSessionStatus = getSocialLoginStatus;
export const cancelLoginRecovery = cancelSocialLoginSession;
