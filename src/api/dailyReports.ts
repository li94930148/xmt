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
  teamId?: number | null;
  templateId?: number | null;
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

export type MonthlyRecord = { id?: number; year: number; month: number; work_summary_md: string; key_projects_md: string; issues_plan_md: string; display_content_md: string; baseline_fingerprint?: string; user_name?: string; username?: string; created_at?: string | null; updated_at?: string | null };
export type YearlyRecord = { id?: number; year: number; annual_summary_md: string; achievements_md: string; shortcomings_md: string; next_year_plan_md: string; display_content_md: string; baseline_fingerprint?: string; user_name?: string; username?: string; created_at?: string | null; updated_at?: string | null };
export type SummaryArchive = { year: number; monthly: MonthlyRecord[]; yearly: YearlyRecord[] };
export type ReportTemplate = { id: number; name: string; description?: string; sections: Array<{ key: string; title: string }>; isDefault?: boolean; sortOrder?: number; userId?: number | null };

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

async function summaryRequest<T>(path: string, options?: RequestInit) {
  const method = options?.method ?? 'GET';
  const response = await fetch(`/api/report-summaries${path}`, { ...options, cache: options?.cache ?? (method === 'GET' ? 'no-store' : undefined), headers: { ...getAuthHeader(), ...(options?.body ? { 'Content-Type': 'application/json' } : {}) } });
  return readEnvelope<T>(response, '加载日报总结失败');
}
export const getMonthlyRecord = (year: number, month: number) => summaryRequest<MonthlyRecord>(`/monthly${buildQuery({ year, month })}`);
export type MonthlySummaryWritePayload = { content_md: string; work_summary_md: string; key_projects_md: string; issues_plan_md: string };
export type YearlySummaryWritePayload = { content_md: string; annual_summary_md: string; achievements_md: string; shortcomings_md: string; next_year_plan_md: string };
export type ReportSummaryUpdateRequest = { client_request_id: string; base_fingerprint: string };
export const saveMonthlyRecord = (year: number, month: number, payload: MonthlySummaryWritePayload, request: ReportSummaryUpdateRequest) => summaryRequest<MonthlyRecord>(`/monthly${buildQuery({ year, month })}`, { method: 'PUT', body: JSON.stringify({ ...payload, ...request }) });
export const getYearlyRecord = (year: number) => summaryRequest<YearlyRecord>(`/yearly${buildQuery({ year })}`);
export const saveYearlyRecord = (year: number, payload: YearlySummaryWritePayload, request: ReportSummaryUpdateRequest) => summaryRequest<YearlyRecord>(`/yearly${buildQuery({ year })}`, { method: 'PUT', body: JSON.stringify({ ...payload, ...request }) });

export type ReportSummaryMutationStatus<T> =
  | { status: 'processed'; data: T }
  | { status: 'not_found' }
  | { status: 'conflict' };

async function getReportSummaryMutationStatus<T>(kind: 'monthly' | 'yearly', year: number, month: number | null, requestId: string, fingerprint: string): Promise<ReportSummaryMutationStatus<T>> {
  const params = { year, ...(kind === 'monthly' ? { month: month ?? undefined } : {}), fingerprint };
  const response = await fetch(`/api/report-summaries/${kind}/requests/${encodeURIComponent(requestId)}${buildQuery(params)}`, {
    headers: getAuthHeader(),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null) as ({ status?: string; data?: T; success?: boolean; message?: string; code?: string } | null);
  if (response.status === 409 && payload?.status === 'conflict') return { status: 'conflict' };
  if (!response.ok) {
    const error = new Error(payload?.message || '核实总结保存结果失败') as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = payload?.code;
    throw error;
  }
  if (payload?.status === 'processed' && payload.data) return { status: 'processed', data: payload.data };
  if (payload?.status === 'not_found') return { status: 'not_found' };
  if (payload?.status === 'conflict') return { status: 'conflict' };
  throw new Error('总结保存状态无法识别');
}

export const getMonthlyRecordUpdateStatus = (year: number, month: number, requestId: string, fingerprint: string) =>
  getReportSummaryMutationStatus<MonthlyRecord>('monthly', year, month, requestId, fingerprint);
export const getYearlyRecordUpdateStatus = (year: number, requestId: string, fingerprint: string) =>
  getReportSummaryMutationStatus<YearlyRecord>('yearly', year, null, requestId, fingerprint);
export const getSummaryArchive = (year: number, userId?: number) => summaryRequest<SummaryArchive>(`/archive${buildQuery({ year, userId })}`);
export const getSummaryArchiveDetail = (kind: 'monthly' | 'yearly', id: number) => summaryRequest<MonthlyRecord | YearlyRecord>(`/archive/${kind}/${id}`);
