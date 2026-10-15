import { useAuthStore } from '../store';

export type GlobalSearchHit = {
  id: string;
  label: string;
  group: string;
  detail?: string;
  path: string;
};

export type GlobalSearchScopes = {
  topics: boolean;
  production: boolean;
  resources: boolean;
  dailyReports: boolean;
  retrospectives: boolean;
  users: boolean;
};

type SearchRequest = {
  scope: keyof GlobalSearchScopes;
  path: string;
  map: (payload: unknown) => GlobalSearchHit[];
};

type JsonRecord = Record<string, unknown>;

const productionStatusLabels: Record<string, string> = {
  draft: '草稿',
  reviewing: '审核中',
  approved: '已通过',
  rejected: '已退回',
  published: '已发布',
  archived: '已归档',
};

const retrospectiveStatusLabels: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}

function text(record: JsonRecord, key: string, fallback: string) {
  return String(record[key] ?? fallback);
}

function unwrap(payload: unknown) {
  const record = asRecord(payload);
  const data = record.data;
  const nested = asRecord(data);
  return 'data' in nested ? nested.data : data ?? payload;
}

export async function searchGlobalContent(keyword: string, scopes: GlobalSearchScopes, signal: AbortSignal) {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const encodedKeyword = encodeURIComponent(keyword);
  const requests: SearchRequest[] = [
    {
      scope: 'topics',
      path: `/api/topics?search=${encodedKeyword}&page=1&limit=8`,
      map: (payload) => records(asRecord(payload).data).map((topic) => ({
        id: `topic-${topic.id}`, label: text(topic, 'title', '未命名选题'), group: '选题', path: `/topics/${encodeURIComponent(String(topic.id))}`,
      })),
    },
    {
      scope: 'production',
      path: `/api/workflow/production?search=${encodedKeyword}&limit=8`,
      map: (payload) => records(asRecord(payload).data).map((production) => ({
        id: `production-${production.id}`, label: text(production, 'topic_title', '未命名稿件'), group: '创作稿件',
        detail: `${text(production, 'version', 'v1.0')} · ${productionStatusLabels[text(production, 'status', '')] || '状态待确认'}`, path: `/production/${encodeURIComponent(String(production.id))}`,
      })),
    },
    {
      scope: 'resources',
      path: `/api/resource-center/search?keyword=${encodedKeyword}`,
      map: (payload) => records(asRecord(payload).data).slice(0, 8).map((resource) => ({
        id: `resource-${resource.resource_id}`, label: text(resource, 'title', '未命名资料'), group: '资料',
        detail: text(asRecord(resource.category), 'name', text(resource, 'library_type', '')), path: `/asset-center/resources/${encodeURIComponent(String(resource.resource_id))}`,
      })),
    },
    {
      scope: 'dailyReports',
      path: `/api/daily-reports/search?keyword=${encodedKeyword}`,
      map: (payload) => records(asRecord(unwrap(payload)).reports).map((report) => ({
        id: `daily-${report.id}`, label: `${text(report, 'userName', '我的日报')} · ${text(report, 'reportDate', '')}`, group: '日报',
        detail: text(report, 'summary', '').slice(0, 90),
        path: `/daily-report/summary?date=${encodeURIComponent(text(report, 'reportDate', ''))}${report.userId ? `&userId=${encodeURIComponent(String(report.userId))}` : ''}`,
      })),
    },
    {
      scope: 'retrospectives',
      path: `/api/retrospectives?keyword=${encodedKeyword}&limit=8`,
      map: (payload) => records(asRecord(unwrap(payload)).retrospectives).map((retro) => ({
        id: `retro-${retro.id}`, label: text(retro, 'title', '未命名复盘'), group: '复盘',
        detail: retrospectiveStatusLabels[text(retro, 'status', '')] || '状态待确认', path: `/retrospectives/${encodeURIComponent(String(retro.id))}`,
      })),
    },
    {
      scope: 'users',
      path: `/api/users?search=${encodedKeyword}&page=1&limit=8`,
      map: (payload) => records(asRecord(payload).data).map((user) => ({
        id: `user-${user.id}`, label: text(user, 'name', text(user, 'username', '未命名成员')), group: '用户',
        path: `/users?search=${encodeURIComponent(text(user, 'name', text(user, 'username', keyword)))}`,
      })),
    },
  ];

  const enabledRequests = requests.filter((request) => scopes[request.scope]);
  const settled = await Promise.allSettled(enabledRequests.map(async (request) => {
    const response = await fetch(request.path, { headers, signal });
    if (!response.ok) throw new Error(`Search ${request.scope} failed (${response.status})`);
    return request.map(await response.json());
  }));

  return {
    hits: settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []),
    unavailableScopes: settled.filter((result) => result.status === 'rejected').length,
  };
}
