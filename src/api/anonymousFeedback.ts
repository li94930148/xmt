import { useAuthStore } from '../store';

export type AnonymousFeedbackType = 'feature' | 'usage' | 'process' | 'team' | 'other';
export type AnonymousFeedbackStatus = 'pending' | 'read' | 'done';

export interface AnonymousFeedback {
  id: number;
  type: AnonymousFeedbackType;
  content: string;
  need_reply: boolean | number;
  reply_content: string | null;
  status: AnonymousFeedbackStatus;
  created_at: string;
  updated_at: string;
}

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

export async function getAnonymousFeedback(): Promise<AnonymousFeedback[]> {
  const response = await ensureOk(await fetch('/api/anonymous-feedback/admin', { headers: authHeaders() }), '获取意见失败');
  const payload = await response.json();
  return payload.data || [];
}

export async function updateAnonymousFeedback(id: number, payload: { status?: AnonymousFeedbackStatus; reply_content?: string }) {
  return ensureOk(await fetch(`/api/anonymous-feedback/admin/${id}`, { method: 'PATCH', headers: authHeaders(true), body: JSON.stringify(payload) }), '更新意见失败');
}

export async function deleteAnonymousFeedback(id: number) {
  return ensureOk(await fetch(`/api/anonymous-feedback/admin/${id}`, { method: 'DELETE', headers: authHeaders() }), '删除意见失败');
}
