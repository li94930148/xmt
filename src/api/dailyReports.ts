import { useAuthStore } from '../store';

const BASE_URL = '/api/daily-reports';

export type DailyReportStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'archived';
export type DailyReportRiskLevel = 'normal' | 'warning' | 'blocked' | 'none' | 'low' | 'medium' | 'high';

export type DailyReportItem = {
  id?: number;
  sectionKey: string;
  title?: string;
  contentMd: string;
  sourceType?: string | null;
  sourceId?: number | null;
  sortOrder?: number;
  meta?: Record<string, unknown> | null;
};

export type DailyReport = {
  id: number;
  userId: number;
  userName?: string;
  username?: string;
  reportDate: string;
  status: DailyReportStatus;
  manualSummaryMd: string;
  autoSummary?: Record<string, unknown> | null;
  riskLevel: DailyReportRiskLevel;
  version: number;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: number | null;
  reviewerName?: string;
  reviewerUsername?: string;
  reviewComment?: string;
  updatedAt?: string;
  items: DailyReportItem[];
  summaryExcerpt?: string;
  itemSummary?: Array<{ sectionKey: string; title: string; excerpt: string }>;
};

export type DailyReportTemplate = {
  id: number | null;
  name: string;
  description: string;
  sections: Array<{ key: string; title: string }>;
};

export type MyDailyReportResponse = {
  reportDate: string;
  template: DailyReportTemplate;
  report: DailyReport | null;
  canCreate: boolean;
};

export type SaveDailyReportDraftPayload = {
  reportDate: string;
  version?: number;
  manualSummaryMd: string;
  riskLevel: DailyReportRiskLevel;
  items: DailyReportItem[];
};

export type GenerateDraftResponse = {
  reportDate: string;
  sourceStatus: 'ready' | 'empty';
  message: string;
  suggestions: DailyReportItem[];
  autoSummary: Record<string, unknown>;
  updatedReportId: number | null;
};

export type TeamDailyReportResponse = {
  reportDate: string;
  status: DailyReportStatus | null;
  reports: DailyReport[];
};

export type DailyReportArchiveResponse = {
  start: string;
  end: string;
  userId: number | null;
  reports: DailyReport[];
};

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  message?: string;
  code?: string;
};

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readEnvelope<T>(response: Response, fallback: string): Promise<T> {
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok) {
    const message = payload?.message || fallback;
    const error = new Error(message) as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = payload?.code;
    throw error;
  }
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data;
  }
  return payload as T;
}

function buildQuery(params: Record<string, string | number | undefined | null>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

export async function getMyDailyReport(date: string) {
  const response = await fetch(`${BASE_URL}/me${buildQuery({ date })}`, {
    headers: getAuthHeader(),
  });
  return readEnvelope<MyDailyReportResponse>(response, '加载日报失败');
}

export async function saveDailyReportDraft(payload: SaveDailyReportDraftPayload) {
  const response = await fetch(`${BASE_URL}/draft`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return readEnvelope<DailyReport>(response, '保存日报草稿失败');
}

export async function submitDailyReport(id: number) {
  const response = await fetch(`${BASE_URL}/${id}/submit`, {
    method: 'POST',
    headers: getAuthHeader(),
  });
  return readEnvelope<DailyReport>(response, '提交日报失败');
}

export async function getTeamDailyReports(params: { date: string; status?: DailyReportStatus | 'all' }) {
  const response = await fetch(
    `${BASE_URL}/team${buildQuery({ date: params.date, status: params.status === 'all' ? undefined : params.status })}`,
    { headers: getAuthHeader() },
  );
  return readEnvelope<TeamDailyReportResponse>(response, '加载团队日报失败');
}

export async function reviewDailyReport(id: number, payload: { action: 'approve' | 'reject'; comment?: string }) {
  const response = await fetch(`${BASE_URL}/${id}/review`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return readEnvelope<DailyReport>(response, '审核日报失败');
}

export async function getDailyReportArchive(params: { start: string; end: string; userId?: number }) {
  const response = await fetch(`${BASE_URL}/archive${buildQuery(params)}`, {
    headers: getAuthHeader(),
  });
  return readEnvelope<DailyReportArchiveResponse>(response, '加载日报归档失败');
}

export async function generateDailyReportDraft(payload: { date: string }) {
  const response = await fetch(`${BASE_URL}/generate-draft`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return readEnvelope<GenerateDraftResponse>(response, '生成自动草稿失败');
}
