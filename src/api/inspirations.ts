import { useAuthStore } from '../store';
import type { Inspiration, InspirationComment } from '@shared/types';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type { Inspiration, InspirationComment };

export class InspirationDeleteError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'InspirationDeleteError';
  }
}

export async function getInspirations(params?: {
  search?: string;
  category?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: Inspiration[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.category) query.set('category', params.category);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));

  const response = await fetch(`${BASE_URL}/inspirations?${query}`, {
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new Error('获取灵感列表失败');
  return response.json();
}

export async function createInspirition(data: {
  title: string;
  description?: string;
  category?: string;
}, clientRequestId?: string): Promise<{ message: string; id: number; inspiration: Inspiration; idempotent_replay?: boolean }> {
  const response = await fetch(`${BASE_URL}/inspirations`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, ...(clientRequestId ? { client_request_id: clientRequestId } : {}) }),
  });
  if (!response.ok) throw new Error('创建灵感失败');
  return response.json();
}

export async function getInspirationCreateRequest(clientRequestId: string): Promise<{ id: number; inspiration: Inspiration; deleted: false } | { deleted: true } | null> {
  const response = await fetch(`${BASE_URL}/inspirations/create-request/${encodeURIComponent(clientRequestId)}`, {
    headers: getAuthHeader(),
  });
  if (response.status === 404) return null;
  if (response.status === 410) return { deleted: true };
  if (!response.ok) throw new Error('核实灵感创建状态失败');
  const result = await response.json() as { id: number; inspiration: Inspiration };
  return { ...result, deleted: false };
}

export type InspirationVoteRequest = { clientRequestId: string; voted: boolean };
export type InspirationVoteResult = {
  message: string;
  /** Current actor state; on an idempotent replay this may reflect a later request. */
  voted: boolean;
  /** State processed by this request key when it was first accepted. */
  processedVoted?: boolean;
  votes?: number;
  idempotent_replay?: boolean;
};

export async function voteInspiration(id: number, request?: InspirationVoteRequest): Promise<InspirationVoteResult> {
  const response = await fetch(`${BASE_URL}/inspirations/${id}/vote`, {
    method: 'POST',
    headers: request
      ? { ...getAuthHeader(), 'Content-Type': 'application/json' }
      : getAuthHeader(),
    ...(request ? { body: JSON.stringify({ client_request_id: request.clientRequestId, voted: request.voted }) } : {}),
    ...(request ? { cache: 'no-store' as RequestCache } : {}),
  });
  if (!response.ok) throw new Error('投票失败');
  return response.json();
}

export type InspirationVoteRequestStatus = {
  inspirationId: number;
  processedVoted: boolean;
  voted: boolean;
  votes: number;
} | { deleted: true };

export async function getInspirationVoteRequest(clientRequestId: string): Promise<InspirationVoteRequestStatus | null> {
  const response = await fetch(`${BASE_URL}/inspirations/vote-requests/${encodeURIComponent(clientRequestId)}`, {
    headers: getAuthHeader(),
    cache: 'no-store',
  });
  if (response.status === 404) return null;
  if (response.status === 410) return { deleted: true };
  if (!response.ok) throw new Error('核实点赞状态失败');
  return response.json();
}

export async function deleteInspiration(id: number): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/inspirations/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: '删除灵感失败' }));
    throw new InspirationDeleteError(data.message || '删除灵感失败', response.status);
  }
  return response.json();
}

export async function getInspirationDeleteStatus(id: number): Promise<'present' | 'missing'> {
  const response = await fetch(`${BASE_URL}/inspirations/${id}`, {
    headers: getAuthHeader(),
  });
  if (response.status === 404) return 'missing';
  if (!response.ok) throw new Error('核实灵感删除状态失败');
  return 'present';
}

export async function promoteInspiration(id: number): Promise<{ message: string; topicId: number }> {
  const response = await fetch(`${BASE_URL}/inspirations/${id}/promote`, {
    method: 'POST',
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new Error('转为选题失败');
  return response.json();
}

export async function getInspirationDetail(
  id: number
): Promise<{ inspiration: Inspiration; comments: InspirationComment[] }> {
  const response = await fetch(`${BASE_URL}/inspirations/${id}`, {
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new Error('获取灵感详情失败');
  return response.json();
}

export async function createInspirationComment(
  id: number,
  content: string,
  clientRequestId?: string
): Promise<{ message: string; comment: InspirationComment; comment_count: number; idempotent_replay?: boolean }> {
  const response = await fetch(`${BASE_URL}/inspirations/${id}/comments`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, ...(clientRequestId ? { client_request_id: clientRequestId } : {}) }),
  });
  if (!response.ok) throw new Error('发表评论失败');
  return response.json();
}
