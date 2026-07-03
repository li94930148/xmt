import { useAuthStore } from '../store';

const BASE_URL = '/api/retrospectives';

export type RetroTemplateCategory = 'weekly' | 'project' | 'channel' | 'topic' | 'daily' | 'custom';
export type RetrospectiveScopeType = 'team' | 'project' | 'topic' | 'channel' | 'user' | 'daily_report' | 'custom';
export type RetrospectiveStatus = 'draft' | 'published' | 'archived';
export type RetroActionStatus = 'todo' | 'doing' | 'done' | 'cancelled';

export type RetroTemplate = {
  id: number;
  name: string;
  category: RetroTemplateCategory;
  description: string;
  schemaJson: Record<string, unknown> | null;
  metricBindingsJson: Record<string, unknown> | null;
  status: 'active' | 'disabled';
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
};

export type Retrospective = {
  id: number;
  templateId: number | null;
  templateName: string;
  templateCategory: RetroTemplateCategory | '';
  title: string;
  scopeType: RetrospectiveScopeType;
  scopeId: number | null;
  periodStart: string;
  periodEnd: string;
  status: RetrospectiveStatus;
  summaryMd: string;
  ownerId: number | null;
  ownerName: string;
  publishedAt: string | null;
  archivedAt: string | null;
  createdBy: number | null;
  creatorName: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  snapshotCount: number;
  actionCount: number;
};

export type RetroMetricSnapshot = {
  id: number;
  retroId: number;
  metricKey: string;
  metricName: string;
  valueNum: number | null;
  valueText: string | null;
  compareValueNum: number | null;
  dimensionJson: Record<string, unknown> | null;
  sourceRefJson: Record<string, unknown> | null;
  capturedAt: string;
  createdAt: string;
};

export type RetroAction = {
  id: number;
  retroId: number;
  retroTitle?: string;
  title: string;
  descriptionMd: string;
  ownerId: number | null;
  ownerName: string;
  dueDate: string | null;
  status: RetroActionStatus;
  resultMd: string;
  closedAt: string | null;
  createdBy: number | null;
  creatorName?: string;
  createdAt: string;
  updatedAt: string;
};

export type RetroDailyRiskItem = {
  itemId: number;
  reportId: number;
  reportDate: string;
  userId: number;
  userName: string;
  sectionKey: string;
  contentMd: string;
  riskLevel: string;
  reportStatus: string;
};

export type RetrospectivePermissions = {
  canEdit: boolean;
  canPublish: boolean;
  canArchive: boolean;
  canManageActions: boolean;
};

export type RetrospectiveDetail = {
  retrospective: Retrospective;
  template: RetroTemplate | null;
  snapshots: RetroMetricSnapshot[];
  actions: RetroAction[];
  permissions: RetrospectivePermissions;
};

export type RetrospectiveListParams = {
  status?: RetrospectiveStatus | 'all';
  category?: RetroTemplateCategory | 'all';
  start?: string;
  end?: string;
  ownerId?: number;
};

export type CreateRetrospectivePayload = {
  title: string;
  templateId?: number | null;
  category?: RetroTemplateCategory;
  scopeType: RetrospectiveScopeType;
  scopeId?: number | null;
  periodStart: string;
  periodEnd: string;
  ownerId?: number | null;
};

export type UpdateRetrospectivePayload = {
  title?: string;
  summaryMd?: string;
  version: number;
};

export type CreateRetroActionPayload = {
  title: string;
  descriptionMd?: string;
  ownerId?: number | null;
  dueDate?: string | null;
};

export type UpdateRetroActionPayload = Partial<CreateRetroActionPayload> & {
  status?: RetroActionStatus;
  resultMd?: string;
};

export type CreateRetroTemplatePayload = {
  name: string;
  category: RetroTemplateCategory;
  description?: string;
  schemaJson?: Record<string, unknown>;
  metricBindingsJson?: Record<string, unknown>;
};

export type RetroExportResult = {
  filename: string;
  contentType: string;
  content: string;
};

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
  code?: string;
};

export class RetrospectiveApiError extends Error {
  status?: number;
  code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'RetrospectiveApiError';
    this.status = status;
    this.code = code;
  }
}

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function buildQuery(params: Record<string, string | number | undefined | null>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '' && value !== 'all') {
      query.set(key, String(value));
    }
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

async function readEnvelope<T>(response: Response, fallback: string): Promise<T> {
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | T | null;
  if (!response.ok) {
    const envelope = payload as ApiEnvelope<T> | null;
    throw new RetrospectiveApiError(envelope?.message || fallback, response.status, envelope?.code);
  }
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as ApiEnvelope<T>).data as T;
  }
  return payload as T;
}

async function requestJson<T>(path: string, fallback: string, init?: RequestInit) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...getAuthHeader(),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  return readEnvelope<T>(response, fallback);
}

export function getRetroTemplates() {
  return requestJson<{ templates: RetroTemplate[] }>('/templates', '加载复盘模板失败');
}

export function createRetroTemplate(payload: CreateRetroTemplatePayload) {
  return requestJson<RetroTemplate>('/templates', '创建复盘模板失败', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getRetrospectives(params: RetrospectiveListParams = {}) {
  return requestJson<{ retrospectives: Retrospective[] }>(
    buildQuery({
      status: params.status,
      category: params.category,
      start: params.start,
      end: params.end,
      ownerId: params.ownerId,
    }),
    '加载复盘列表失败',
  );
}

export function getMyRetroActions(params: { status?: RetroActionStatus | 'open' | 'all' } = {}) {
  return requestJson<{ actions: RetroAction[] }>(
    `/actions/mine${buildQuery({ status: params.status })}`,
    '加载我的复盘行动项失败',
  );
}

export function createRetrospective(payload: CreateRetrospectivePayload) {
  return requestJson<RetrospectiveDetail>('', '创建复盘失败', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getRetrospectiveDetail(id: number) {
  return requestJson<RetrospectiveDetail>(`/${id}`, '加载复盘详情失败');
}

export function getRetroDailyRisks(id: number) {
  return requestJson<{ risks: RetroDailyRiskItem[] }>(`/${id}/daily-risks`, '加载日报风险失败');
}

export function exportRetrospective(id: number, type: 'markdown' | 'html') {
  return requestJson<RetroExportResult>(`/${id}/export${buildQuery({ type })}`, '导出复盘失败');
}

export function updateRetrospective(id: number, payload: UpdateRetrospectivePayload) {
  return requestJson<RetrospectiveDetail>(`/${id}`, '保存复盘结论失败', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function generateRetroSnapshot(id: number, payload: { mode: 'replace' } = { mode: 'replace' }) {
  return requestJson<RetrospectiveDetail>(`/${id}/snapshot`, '生成指标快照失败', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function publishRetrospective(id: number) {
  return requestJson<RetrospectiveDetail>(`/${id}/publish`, '发布复盘失败', { method: 'POST' });
}

export function archiveRetrospective(id: number) {
  return requestJson<RetrospectiveDetail>(`/${id}/archive`, '归档复盘失败', { method: 'POST' });
}

export function createRetroAction(id: number, payload: CreateRetroActionPayload) {
  return requestJson<RetrospectiveDetail>(`/${id}/actions`, '创建行动项失败', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateRetroAction(actionId: number, payload: UpdateRetroActionPayload) {
  return requestJson<RetrospectiveDetail>(`/actions/${actionId}`, '更新行动项失败', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
