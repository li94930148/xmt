import { useAuthStore } from '../store';
import type { Topic } from '../types';
import type { TopicCreatePayload } from '../utils/topicCreateRecovery';

const BASE_URL = '/api';

export class TopicApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'TopicApiError';
  }
}

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getErrorMessage(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  if (payload && typeof payload === 'object') {
    const record = payload as { message?: unknown; error?: unknown };
    if (typeof record.message === 'string' && record.message) {
      return record.message;
    }
    if (typeof record.error === 'string' && record.error) {
      return record.error;
    }
  }
  return fallback;
}

function buildTopicsQuery(params?: { status?: string; topic_filter?: 'mine' | 'active'; search?: string; page?: number; limit?: number }): string {
  const query = new URLSearchParams();
  const status = params?.status?.trim();
  const topicFilter = params?.topic_filter;
  const search = params?.search?.trim();
  if (status) query.set('status', status);
  if (topicFilter) query.set('topic_filter', topicFilter);
  if (search) query.set('search', search);
  query.set('page', String(params?.page ?? 1));
  query.set('limit', String(params?.limit ?? 10));
  return query.toString();
}

type TopicsListResponse = {
  data: Topic[];
  total: number;
  page: number;
  limit: number;
};

export async function getTopics(params?: { status?: string; topic_filter?: 'mine' | 'active'; search?: string; page?: number; limit?: number }): Promise<TopicsListResponse> {
  const query = buildTopicsQuery(params);
  const response = await fetch(`${BASE_URL}/topics?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '获取选题列表失败'));

  const result = await response.json();

  if (result?.success) {
    return {
      data: result.data || [],
      total: result.pagination?.total || 0,
      page: result.pagination?.page || params?.page || 1,
      limit: result.pagination?.limit || params?.limit || 10,
    };
  }

  return {
    data: result?.data || [],
    total: result?.total || 0,
    page: result?.page || params?.page || 1,
    limit: result?.limit || params?.limit || 10,
  };
}

export async function getTopic(id: number): Promise<Topic> {
  const response = await fetch(`${BASE_URL}/topics/${id}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new TopicApiError(await getErrorMessage(response, '获取选题详情失败'), response.status);
  const result = await response.json();
  return result.data;
}

export async function getTopicDeleteStatus(id: number): Promise<'present' | 'missing'> {
  try {
    await getTopic(id);
    return 'present';
  } catch (error) {
    if (error instanceof TopicApiError && error.status === 404) return 'missing';
    throw error;
  }
}

export async function repairCurrentTopicStageRecord(id: number): Promise<{ stage: 'production' | 'shooting' | 'publishing'; created: boolean }> {
  const response = await fetch(`${BASE_URL}/topics/${id}/repair-stage-record`, {
    method: 'POST',
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new TopicApiError(await getErrorMessage(response, '补齐阶段记录失败'), response.status);
  const result = await response.json();
  return result.data;
}

export type TopicCreateRequestStatus =
  | { state: 'not_found' }
  | { state: 'created'; topicId: number };

export async function createTopic(data: TopicCreatePayload & { client_request_id?: string }): Promise<{ message: string; topicId: number }> {
  const response = await fetch(`${BASE_URL}/topics`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new TopicApiError(await getErrorMessage(response, '创建选题失败'), response.status);
  const result = await response.json();
  return { message: result.message, topicId: result.data.topicId };
}

export async function getTopicCreateRequestStatus(requestId: string): Promise<TopicCreateRequestStatus> {
  const response = await fetch(`${BASE_URL}/topics/create-requests/${encodeURIComponent(requestId)}`, {
    headers: getAuthHeader(),
    cache: 'no-store',
  });
  if (!response.ok) throw new TopicApiError(await getErrorMessage(response, '核实选题创建状态失败'), response.status);
  const body: unknown = await response.json();
  const envelope = body as { data?: unknown } | null;
  const payload = envelope?.data && typeof envelope.data === 'object'
    ? envelope.data as { state?: unknown; topicId?: unknown }
    : body as { state?: unknown; topicId?: unknown } | null;
  const state = payload?.state;
  if (state === 'not_found') return { state };
  const topicId = Number(payload?.topicId);
  if (state !== 'created' || !Number.isSafeInteger(topicId) || topicId <= 0) {
    throw new Error('选题创建状态响应格式无效');
  }
  return { state, topicId };
}

export async function updateTopic(id: number, data: Partial<Topic> & { version_action?: 'minor' | 'major' | 'none'; expected_content?: string }): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/topics/${id}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new TopicApiError(await getErrorMessage(response, '更新选题失败'), response.status);
  return response.json();
}

export async function getTopicOutlineVersions(id: number): Promise<import('./workflow').WorkflowDocumentVersion[]> {
  const response = await fetch(`${BASE_URL}/topics/${id}/versions`, { headers: getAuthHeader() });
  if (!response.ok) throw new Error(await getErrorMessage(response, '获取选题版本历史失败'));
  const result = await response.json() as { data?: import('./workflow').WorkflowDocumentVersion[] };
  return Array.isArray(result.data) ? result.data : [];
}

export async function deleteTopic(id: number): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/topics/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader()
  });
  if (!response.ok) throw new TopicApiError(await getErrorMessage(response, '删除选题失败'), response.status);
  return response.json();
}

export async function auditTopic(id: number, data: { status: 'approved' | 'rejected'; comment: string; assignee_id?: number }): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/topics/${id}/audit`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const error = new TopicApiError(await getErrorMessage(response, '审核选题失败'), response.status);
    throw error;
  }
  return response.json();
}

export async function updateTopicStatus(id: number, status: string): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/topics/${id}/status`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  if (!response.ok) throw new TopicApiError(await getErrorMessage(response, '更新状态失败'), response.status);
  return response.json();
}

export interface TopicResource {
  id: number;
  title: string;
  summary: string | null;
  library_type: 'project' | 'content_archive' | 'knowledge' | 'media';
  category: { id: number; name: string; path?: string } | null;
}

export async function getTopicResources(topicId: number): Promise<TopicResource[]> {
  const response = await fetch(`${BASE_URL}/topics/${topicId}/resources`, { headers: getAuthHeader() });
  if (!response.ok) throw new Error(await getErrorMessage(response, '获取关联资料失败'));
  return (await response.json()).data;
}

export async function addTopicResource(topicId: number, resourceId: number): Promise<void> {
  const response = await fetch(`${BASE_URL}/topics/${topicId}/resources`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ resource_id: resourceId }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '关联资料失败'));
}

export async function removeTopicResource(topicId: number, resourceId: number): Promise<void> {
  const response = await fetch(`${BASE_URL}/topics/${topicId}/resources/${resourceId}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '解除关联失败'));
}
