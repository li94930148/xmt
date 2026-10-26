import { useAuthStore } from '../store';

export type AnonymousFeedbackType = 'feature' | 'usage' | 'process' | 'team' | 'other';
export type AnonymousFeedbackStatus = 'pending' | 'processing' | 'completed';

export interface AnonymousFeedback {
  id: number;
  type: AnonymousFeedbackType;
  content: string;
  need_reply: boolean | number;
  reply_content: string | null;
  status: AnonymousFeedbackStatus;
  is_public: boolean | number;
  created_at: string;
  updated_at: string;
  base_fingerprint?: string;
}

export type AnonymousFeedbackUpdatePayload = {
  status?: AnonymousFeedbackStatus;
  reply_content?: string;
  is_public?: boolean;
};

export interface AnonymousFeedbackUpdateRequestIdentity {
  client_request_id: string;
  request_fingerprint: string;
  base_fingerprint: string;
}

export class AnonymousFeedbackApiError extends Error {
  status: number;
  code: string | null;

  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = 'AnonymousFeedbackApiError';
    this.status = status;
    this.code = code;
  }
}

export type PublicAnonymousFeedback = Omit<AnonymousFeedback, 'is_public'>;

function authHeaders(json = false): Record<string, string> {
  const token = useAuthStore.getState().token;
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}) };
}

async function ensureOk(response: Response, fallback: string) {
  if (response.ok) return response;
  const payload = await response.json().catch(() => ({}));
  throw new AnonymousFeedbackApiError(payload.message || payload.error || fallback, response.status,
    typeof payload.code === 'string' ? payload.code : null);
}

export async function submitAnonymousFeedback(payload: { type: AnonymousFeedbackType; content: string; needReply: boolean }) {
  return ensureOk(await fetch('/api/anonymous-feedback', { method: 'POST', headers: authHeaders(true), body: JSON.stringify(payload) }), '提交意见失败');
}

export async function getPublicAnonymousFeedback(): Promise<PublicAnonymousFeedback[]> {
  const response = await ensureOk(await fetch('/api/anonymous-feedback', { headers: authHeaders() }), '获取意见失败');
  const payload = await response.json();
  return payload.data || [];
}

export async function getAnonymousFeedback(): Promise<AnonymousFeedback[]> {
  const response = await ensureOk(await fetch('/api/admin/anonymous-feedback', { headers: authHeaders(), cache: 'no-store' }), '获取意见失败');
  const payload = await response.json();
  return payload.data || [];
}

export async function updateAnonymousFeedback(
  id: number,
  payload: AnonymousFeedbackUpdatePayload,
  request?: AnonymousFeedbackUpdateRequestIdentity,
) {
  return ensureOk(await fetch(`/api/admin/anonymous-feedback/${id}`, {
    method: 'PATCH',
    headers: authHeaders(true),
    body: JSON.stringify(request ? { ...payload, ...request } : payload),
  }), '更新意见失败');
}

export async function deleteAnonymousFeedback(id: number, clientRequestId?: string) {
  return ensureOk(await fetch(`/api/admin/anonymous-feedback/${id}`, {
    method: 'DELETE',
    headers: authHeaders(Boolean(clientRequestId)),
    ...(clientRequestId ? { body: JSON.stringify({ client_request_id: clientRequestId }) } : {}),
  }), '删除意见失败');
}

export type AnonymousFeedbackDeleteRequestStatus = 'committed' | 'not_found' | 'target_missing' | 'conflict';

export async function getAnonymousFeedbackDeleteRequestStatus(targetId: number, requestId: string): Promise<AnonymousFeedbackDeleteRequestStatus> {
  const response = await ensureOk(await fetch(
    `/api/admin/anonymous-feedback/${targetId}/delete-requests/${encodeURIComponent(requestId)}`,
    { headers: authHeaders(), cache: 'no-store' },
  ), '核实删除结果失败');
  const payload = await response.json();
  const state = payload?.data?.state;
  if (state !== 'committed' && state !== 'not_found' && state !== 'target_missing' && state !== 'conflict') {
    throw new Error('删除结果状态无法识别');
  }
  return state;
}

export type AnonymousFeedbackUpdateRequestStatus = 'processed' | 'not_found' | 'target_missing' | 'conflict';

export async function getAnonymousFeedbackUpdateRequestStatus(
  targetId: number,
  requestId: string,
  requestFingerprint: string,
): Promise<AnonymousFeedbackUpdateRequestStatus> {
  const query = new URLSearchParams({ request_fingerprint: requestFingerprint });
  const response = await ensureOk(await fetch(
    `/api/admin/anonymous-feedback/${targetId}/update-requests/${encodeURIComponent(requestId)}?${query.toString()}`,
    { headers: authHeaders(), cache: 'no-store' },
  ), '核实意见修改结果失败');
  const payload = await response.json();
  const state = payload?.data?.state;
  if (state !== 'processed' && state !== 'not_found' && state !== 'target_missing' && state !== 'conflict') {
    throw new Error('意见修改结果状态无法识别');
  }
  return state;
}
