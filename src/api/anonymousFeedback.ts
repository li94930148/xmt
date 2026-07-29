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
}

export type PublicAnonymousFeedback = Omit<AnonymousFeedback, 'is_public'>;

function authHeaders(json = false): Record<string, string> {
  const token = useAuthStore.getState().token;
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}) };
}

async function ensureOk(response: Response, fallback: string) {
  if (response.ok) return response;
  const payload = await response.json().catch(() => ({}));
  throw new Error(payload.message || payload.error || fallback);
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
  const response = await ensureOk(await fetch('/api/admin/anonymous-feedback', { headers: authHeaders() }), '获取意见失败');
  const payload = await response.json();
  return payload.data || [];
}

export async function updateAnonymousFeedback(id: number, payload: { status?: AnonymousFeedbackStatus; reply_content?: string; is_public?: boolean }) {
  return ensureOk(await fetch(`/api/admin/anonymous-feedback/${id}`, { method: 'PATCH', headers: authHeaders(true), body: JSON.stringify(payload) }), '更新意见失败');
}

export async function deleteAnonymousFeedback(id: number) {
  return ensureOk(await fetch(`/api/admin/anonymous-feedback/${id}`, { method: 'DELETE', headers: authHeaders() }), '删除意见失败');
}
