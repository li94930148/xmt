import { useAuthStore } from '../store';
import type { Template } from '@shared/types';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type { Template };

export type ManagedTemplate = Template & { base_fingerprint?: string };
export type TemplateMutationOperation = 'create' | 'update' | 'delete';
export type TemplateMutationStatus = 'processed' | 'not_found' | 'target_missing' | 'conflict';

export interface TemplateMutationRequestIdentity {
  client_request_id: string;
  request_fingerprint: string;
  base_fingerprint?: string;
}

export interface TemplateMutationError extends Error {
  status: number;
  code: string | null;
}

export class TemplateMutationHttpError extends Error implements TemplateMutationError {
  status: number;
  code: string | null;

  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = 'TemplateMutationError';
    this.status = status;
    this.code = code;
  }
}

export async function getTemplates(): Promise<ManagedTemplate[]> {
  const response = await fetch(`${BASE_URL}/templates`, {
    headers: getAuthHeader(),
    cache: 'no-store',
  });
  if (!response.ok) throw new TemplateMutationHttpError('获取模板列表失败', response.status, null);
  const payload = await response.json() as { data?: ManagedTemplate[] };
  return Array.isArray(payload.data) ? payload.data : [];
}

async function requireOk(response: Response, fallback: string) {
  if (response.ok) return response;
  const payload = await response.json().catch(() => ({}));
  throw new TemplateMutationHttpError(
    typeof payload.message === 'string' ? payload.message : fallback,
    response.status,
    typeof payload.code === 'string' ? payload.code : null,
  );
}

export async function createTemplate(data: {
  name: string;
  platform: string;
  description: string;
  template_data: string | null;
  is_default: boolean;
}, request: TemplateMutationRequestIdentity): Promise<{ message: string; id: number; idempotent_replay?: boolean }> {
  const response = await fetch(`${BASE_URL}/templates`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, ...request }),
  });
  await requireOk(response, '创建模板失败');
  return response.json();
}

export async function updateTemplate(
  id: number,
  data: Partial<{ name: string; platform: string; description: string; is_default: boolean }> & { template_data?: string },
  request: TemplateMutationRequestIdentity,
): Promise<{ message: string; idempotent_replay?: boolean }> {
  const response = await fetch(`${BASE_URL}/templates/${id}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, ...request }),
  });
  await requireOk(response, '更新模板失败');
  return response.json();
}

export async function deleteTemplate(id: number, request: TemplateMutationRequestIdentity): Promise<{ message: string; idempotent_replay?: boolean }> {
  const response = await fetch(`${BASE_URL}/templates/${id}`, {
    method: 'DELETE',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  await requireOk(response, '删除模板失败');
  return response.json();
}

export async function getTemplateMutationStatus(
  requestId: string,
  operation: TemplateMutationOperation,
  requestFingerprint: string,
  targetId: number | null,
): Promise<{ state: TemplateMutationStatus; targetId?: number }> {
  const query = new URLSearchParams({ operation, request_fingerprint: requestFingerprint });
  if (targetId !== null) query.set('target_id', String(targetId));
  const response = await requireOk(await fetch(
    `${BASE_URL}/templates/requests/${encodeURIComponent(requestId)}?${query.toString()}`,
    { headers: getAuthHeader(), cache: 'no-store' },
  ), '核实模板操作结果失败');
  const body = await response.json();
  const state = body?.data?.state;
  if (state !== 'processed' && state !== 'not_found' && state !== 'target_missing' && state !== 'conflict') {
    throw new Error('模板操作结果状态无法识别');
  }
  const targetIdValue = body?.data?.target_id;
  return { state, ...(Number.isSafeInteger(targetIdValue) && targetIdValue > 0 ? { targetId: targetIdValue as number } : {}) };
}
