import { useAuthStore } from '../store';
import type { Production, ProductionHistory, Shooting, Publishing, Comment } from '../types';

const BASE_URL = '/api';

export type PublishedArchiveSyncState = 'synced' | 'pending' | 'skipped' | 'not_required';

export interface WorkflowDocumentVersion {
  id: number;
  document_type: 'topic_outline' | 'shooting_script' | 'publishing_script';
  document_id: string;
  version: string;
  content: string;
  change_type: 'baseline' | 'minor' | 'major';
  is_baseline: number;
  operator_id: number | null;
  operator_name: string | null;
  source_production_id: number | null;
  source_production_version: string | null;
  created_at: string | null;
}

async function getWorkflowDocumentVersions(path: string): Promise<WorkflowDocumentVersion[]> {
  const response = await fetch(`${BASE_URL}${path}`, { headers: getAuthHeader() });
  if (!response.ok) {
    const error = new Error(await getErrorMessage(response, '获取剧本版本历史失败')) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  const payload = await response.json() as { data?: WorkflowDocumentVersion[] };
  return Array.isArray(payload.data) ? payload.data : [];
}

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getErrorMessage(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  if (payload && typeof payload === 'object' && 'message' in payload) {
    return String((payload as { message: unknown }).message);
  }
  return fallback;
}

// Production
export async function getProduction(): Promise<Production[]>;
export async function getProduction(params: { topic_id: number }): Promise<Production[]>;
export async function getProduction(params: { topic_id?: number; page: number; limit: number }): Promise<PaginatedWorkflowResult<Production>>;
export async function getProduction(params?: { topic_id?: number; page?: number; limit?: number }): Promise<Production[] | PaginatedWorkflowResult<Production>> {
  const query = new URLSearchParams();
  if (params?.topic_id !== undefined) query.set('topic_id', String(params.topic_id));
  if (params?.page !== undefined) query.set('page', String(params.page));
  if (params?.limit !== undefined) query.set('limit', String(params.limit));
  const response = await fetch(`${BASE_URL}/workflow/production?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取创作列表失败');
  return response.json();
}

export async function getProductionCreateStatus(clientRequestId: string): Promise<
  | { status: 'missing' }
  | { status: 'deleted' }
  | { status: 'created'; productionId: number }
> {
  const response = await fetch(`${BASE_URL}/workflow/production/create-request/${encodeURIComponent(clientRequestId)}`, {
    headers: getAuthHeader(),
  });
  if (response.status === 404) return { status: 'missing' };
  if (response.status === 410) return { status: 'deleted' };
  if (!response.ok) throw new Error('核实创作记录创建状态失败');
  const payload: unknown = await response.json();
  const productionId = Number((payload as { productionId?: unknown } | null)?.productionId);
  if (!Number.isSafeInteger(productionId) || productionId <= 0) throw new Error('创作记录状态与请求编号不一致');
  return { status: 'created', productionId };
}

export async function createProduction(
  data: { topic_id: number; version?: string; content?: string; contentMarkdown?: string; contentJson?: string; status?: string; origin_type?: 'topic_outline' },
  clientRequestId?: string,
): Promise<{ message: string; productionId: number; idempotent_replay?: boolean }> {
  const response = await fetch(`${BASE_URL}/workflow/production`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(clientRequestId ? { ...data, client_request_id: clientRequestId } : data)
  });
  if (!response.ok) {
    const error = new Error(await getErrorMessage(response, '添加创作记录失败')) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function getProductionById(id: number, options?: { cache?: RequestCache }): Promise<Production> {
  const response = await fetch(`${BASE_URL}/workflow/production/${id}`, {
    headers: getAuthHeader(),
    ...(options?.cache ? { cache: options.cache } : {}),
  });
  if (!response.ok) {
    const error = new Error(await getErrorMessage(response, '获取创作详情失败')) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export interface ProductionSourceSnapshot {
  production_id: number;
  source_topic_id: number;
  source_topic_title: string;
  version: string;
  content: string;
  content_markdown: string | null;
  status: string;
  created_at: string | null;
  version_timestamp: string | null;
  operator_name: string | null;
}

export async function getProductionSourceSnapshot(
  productionId: number,
  version: string,
): Promise<ProductionSourceSnapshot> {
  const params = new URLSearchParams({ version });
  const response = await fetch(`${BASE_URL}/workflow/production/${productionId}/source-snapshot?${params}`, {
    headers: getAuthHeader(),
    cache: 'no-store',
  });
  if (!response.ok) {
    const error = new Error(await getErrorMessage(response, '读取创作来源快照失败')) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function updateProduction(id: number, data: { topic_id: number; version?: string; content?: string; expected_content?: string; contentMarkdown?: string; contentJson?: string; status?: string; change_type?: string; version_action?: 'minor' | 'major' | 'none' }): Promise<{ message: string; version?: string }> {
  const response = await fetch(`${BASE_URL}/workflow/production/${id}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const error = new Error(await getErrorMessage(response, '更新创作记录失败')) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function deleteProduction(id: number): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/workflow/production/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader()
  });
  if (!response.ok) {
    const error = new Error(await getErrorMessage(response, '删除创作记录失败')) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function getProductionHistory(productionId: number, page = 1, limit = 20, includeContent = true, version?: string): Promise<{ data: ProductionHistory[]; total: number; page: number; limit: number }> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit), include_content: includeContent ? '1' : '0' });
  if (version) params.set('version', version);
  const response = await fetch(`${BASE_URL}/workflow/production/${productionId}/history?${params}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取版本历史失败');
  return response.json();
}

export interface ProductionReviewAnchor {
  quote: string;
  context: string;
  from: number;
  to: number;
}

export interface ProductionReviewReply {
  id: number;
  thread_id: number;
  content: string;
  author_id: number;
  author_name: string | null;
  created_at: string;
}

export interface ProductionReviewThread {
  id: number;
  production_id: number;
  version: string;
  kind: 'comment' | 'suggestion';
  anchor_quote: string;
  anchor_context: string;
  anchor_from: number;
  anchor_to: number;
  summary: string;
  proposed_text: string | null;
  status: 'open' | 'resolved' | 'accepted' | 'rejected';
  author_id: number;
  author_name: string | null;
  reviewed_by: number | null;
  reviewer_name: string | null;
  created_at: string;
  updated_at: string;
  replies: ProductionReviewReply[];
}

export async function getProductionReviewThreads(productionId: number, version: string): Promise<ProductionReviewThread[]> {
  const query = new URLSearchParams({ version });
  const response = await fetch(`${BASE_URL}/workflow/production/${productionId}/review-threads?${query}`, {
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '获取批注与建议失败'));
  const payload = await response.json() as { data?: ProductionReviewThread[] };
  return Array.isArray(payload.data) ? payload.data : [];
}

export interface ProductionReviewThreadCreateInput {
  version: string;
  kind: 'comment' | 'suggestion';
  anchor: ProductionReviewAnchor;
  summary: string;
  proposed_text?: string;
}

function normalizeProductionReviewThreadInput(input: ProductionReviewThreadCreateInput) {
  return {
    version: input.version,
    kind: input.kind,
    anchor: {
      quote: input.anchor.quote.trim(),
      context: input.anchor.context.trim(),
      from: input.anchor.from,
      to: input.anchor.to,
    },
    summary: input.summary.trim(),
    proposed_text: input.kind === 'suggestion' ? input.proposed_text ?? '' : null,
  };
}

async function productionReviewThreadFingerprint(input: ProductionReviewThreadCreateInput) {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(normalizeProductionReviewThreadInput(input))),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createProductionReviewThread(
  productionId: number,
  input: ProductionReviewThreadCreateInput,
  clientRequestId?: string,
): Promise<{ id: number; replayed?: boolean }> {
  const normalizedInput = normalizeProductionReviewThreadInput(input);
  const response = await fetch(`${BASE_URL}/workflow/production/${productionId}/review-threads`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...normalizedInput, ...(clientRequestId ? { client_request_id: clientRequestId } : {}) }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '添加批注或建议失败'));
  return response.json();
}

export async function getProductionReviewThreadRequestStatus(
  productionId: number,
  clientRequestId: string,
  input: ProductionReviewThreadCreateInput,
): Promise<{ status: 'applied'; threadId: number } | { status: 'not_found' | 'conflict' }> {
  const query = new URLSearchParams({ fingerprint: await productionReviewThreadFingerprint(input) });
  const response = await fetch(`${BASE_URL}/workflow/production/${productionId}/review-threads/requests/${encodeURIComponent(clientRequestId)}?${query}`, {
    headers: getAuthHeader(),
    cache: 'no-store',
  });
  if (response.status === 409) return { status: 'conflict' };
  if (!response.ok) throw new Error(await getErrorMessage(response, '核实批注或建议创建状态失败'));
  return response.json();
}

async function productionReviewReplyFingerprint(content: string) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function replyToProductionReviewThread(productionId: number, threadId: number, content: string, clientRequestId: string): Promise<{ id: number; replayed?: boolean }> {
  const response = await fetch(`${BASE_URL}/workflow/production/${productionId}/review-threads/${threadId}/replies`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, client_request_id: clientRequestId }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '添加回复失败'));
  return response.json();
}

export async function getProductionReviewReplyRequestStatus(
  productionId: number,
  threadId: number,
  clientRequestId: string,
  content: string,
): Promise<{ status: 'applied'; replyId: number } | { status: 'not_found' | 'conflict' }> {
  const query = new URLSearchParams({ fingerprint: await productionReviewReplyFingerprint(content) });
  const response = await fetch(`${BASE_URL}/workflow/production/${productionId}/review-threads/${threadId}/replies/requests/${encodeURIComponent(clientRequestId)}?${query}`, {
    headers: getAuthHeader(),
    cache: 'no-store',
  });
  if (response.status === 409) return { status: 'conflict' };
  if (!response.ok) throw new Error(await getErrorMessage(response, '核实回复状态失败'));
  return response.json();
}

export async function updateProductionReviewThreadStatus(
  productionId: number,
  threadId: number,
  status: 'resolved' | 'accepted' | 'rejected',
  clientRequestId: string,
): Promise<{ message: string; replayed?: boolean } | { conflict: true } | { forbidden: true } | { missing: true }> {
  const response = await fetch(`${BASE_URL}/workflow/production/${productionId}/review-threads/${threadId}/status`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, client_request_id: clientRequestId }),
  });
  if (response.status === 403) return { forbidden: true };
  if (response.status === 404) return { missing: true };
  if (response.status === 409) return { conflict: true };
  if (!response.ok) throw new Error(await getErrorMessage(response, '更新批注或建议状态失败'));
  return response.json();
}

export async function getProductionReviewStatusRequestStatus(
  productionId: number,
  threadId: number,
  clientRequestId: string,
  status: 'resolved' | 'accepted' | 'rejected',
): Promise<{ status: 'applied'; appliedStatus: 'resolved' | 'accepted' | 'rejected' } | { status: 'not_found' | 'conflict' }> {
  const query = new URLSearchParams({ status });
  const response = await fetch(`${BASE_URL}/workflow/production/${productionId}/review-threads/${threadId}/status-requests/${encodeURIComponent(clientRequestId)}?${query}`, {
    headers: getAuthHeader(),
    cache: 'no-store',
  });
  if (response.status === 409) return { status: 'conflict' };
  if (!response.ok) throw new Error(await getErrorMessage(response, '核实批注或建议状态失败'));
  return response.json();
}

export interface ProductionMaterialDraft {
  production_id: number;
  content_html: string;
  revision: number;
  created_by: number | null;
  updated_by: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export async function getProductionMaterialDraft(productionId: number): Promise<ProductionMaterialDraft> {
  const response = await fetch(`${BASE_URL}/productions/${productionId}/material-draft`, { headers: getAuthHeader(), cache: 'no-store' });
  if (!response.ok) throw Object.assign(new Error(await getErrorMessage(response, '获取创作资料草稿失败')), { status: response.status });
  return (await response.json()).data;
}

export async function updateProductionMaterialDraft(productionId: number, input: { content_html: string; revision: number }): Promise<ProductionMaterialDraft> {
  const response = await fetch(`${BASE_URL}/productions/${productionId}/material-draft`, {
    method: 'PUT', headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!response.ok) throw Object.assign(new Error(await getErrorMessage(response, '保存创作资料草稿失败')), { status: response.status });
  return (await response.json()).data;
}

export async function getProductionResourceInsertions(productionId: number, resourceIds: number[]): Promise<{
  data: Array<{ resource_id: number; title: string; content_html: string }>;
  empty_resource_ids: number[];
  message?: string;
}> {
  const response = await fetch(`${BASE_URL}/productions/${productionId}/material-draft/resources`, {
    method: 'POST', headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify({ resource_ids: resourceIds }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '读取资料正文失败'));
  return response.json();
}

// Comments
export async function getComments(targetType: string, targetId: number): Promise<Comment[]> {
  const response = await fetch(`${BASE_URL}/workflow/comments?target_type=${targetType}&target_id=${targetId}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取评论失败');
  return response.json();
}

export async function addComment(targetType: string, targetId: number, content: string): Promise<{ message: string; commentId: number }> {
  const response = await fetch(`${BASE_URL}/workflow/comments`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_type: targetType, target_id: targetId, content })
  });
  if (!response.ok) throw new Error('添加评论失败');
  return response.json();
}

export async function deleteComment(id: number): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/workflow/comments/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('删除评论失败');
  return response.json();
}

export type PaginatedWorkflowResult<T> = { data: T[]; total: number; page: number; limit: number };
export type PublishingSummary = { today: number; pending: number; published: number; failed: number };

// Shooting
export async function getShooting(params?: { topic_id?: number; page?: number; limit?: number }): Promise<PaginatedWorkflowResult<Shooting>> {
  const query = new URLSearchParams(params as Record<string, string>);
  const response = await fetch(`${BASE_URL}/workflow/shooting?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取成片制作列表失败');
  return response.json();
}

// Existing detail pages refine this legacy envelope locally.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getShootingById(id: number): Promise<any> {
  const response = await fetch(`${BASE_URL}/workflow/shooting/${id}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取成片制作记录失败');
  return response.json();
}

export async function getShootingDeleteStatus(id: number): Promise<'deleted' | 'exists'> {
  const response = await fetch(`${BASE_URL}/workflow/shooting/${id}`, {
    headers: getAuthHeader(),
  });
  if (response.status === 404) return 'deleted';
  if (response.ok) return 'exists';
  const error = new Error(await getErrorMessage(response, '读取成片制作记录失败')) as Error & { status?: number };
  error.status = response.status;
  throw error;
}

export async function getShootingCompletionStatus(id: number): Promise<{ state: 'completed' } | { state: 'other'; status: string } | { state: 'missing' }> {
  const response = await fetch(`${BASE_URL}/workflow/shooting/${id}`, {
    headers: getAuthHeader(),
  });
  if (response.status === 404) return { state: 'missing' };
  if (!response.ok) {
    const error = new Error(await getErrorMessage(response, '读取成片制作状态失败')) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  const record: unknown = await response.json();
  if (!record || typeof record !== 'object' || !('status' in record)
    || typeof record.status !== 'string' || record.status.length === 0) {
    throw new Error('服务器返回的成片制作状态无效');
  }
  return record.status === 'completed'
    ? { state: 'completed' }
    : { state: 'other', status: record.status };
}

export async function deleteShooting(id: number): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/workflow/shooting/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  });
  if (!response.ok) {
    const error = new Error(await getErrorMessage(response, '删除成片制作记录失败')) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function updateShooting(id: number, data: { topic_id?: number; plan_date?: string; location?: string; equipment?: string; status?: string; script_content?: string; script_source_production_id?: number; script_source_version?: string; version_action?: 'minor' | 'major' | 'none'; expected_content?: string }): Promise<{ message: string; archiveSync?: PublishedArchiveSyncState }> {
  const response = await fetch(`${BASE_URL}/workflow/shooting/${id}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const error = new Error(await getErrorMessage(response, '更新成片制作记录失败')) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function getShootingScriptVersions(id: number) {
  return getWorkflowDocumentVersions(`/workflow/shooting/${id}/versions`);
}

export async function syncShootingPublishedArchive(id: number): Promise<{ message: string; archiveSync: Exclude<PublishedArchiveSyncState, 'pending' | 'not_required'> }> {
  const response = await fetch(`${BASE_URL}/workflow/shooting/${id}/archive-sync`, {
    method: 'POST',
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '同步发布归档失败'));
  return response.json();
}

export async function getShootingCreateStatus(clientRequestId: string): Promise<
  | { status: 'missing' }
  | { status: 'deleted' }
  | { status: 'created'; shootingId: number }
> {
  const response = await fetch(`${BASE_URL}/workflow/shooting/create-request/${encodeURIComponent(clientRequestId)}`, {
    headers: getAuthHeader(),
  });
  if (response.status === 404) return { status: 'missing' };
  if (response.status === 410) return { status: 'deleted' };
  if (!response.ok) throw new Error('核实成片制作计划创建状态失败');
  const payload: unknown = await response.json();
  const shootingId = Number((payload as { shootingId?: unknown } | null)?.shootingId);
  if (!Number.isSafeInteger(shootingId) || shootingId <= 0) throw new Error('制作计划创建状态与请求编号不一致');
  return { status: 'created', shootingId };
}

export async function createShooting(
  data: { topic_id: number; plan_date?: string; location?: string; equipment?: string; status?: string },
  clientRequestId?: string,
): Promise<{ message: string; shootingId: number; idempotent_replay?: boolean }> {
  const response = await fetch(`${BASE_URL}/workflow/shooting`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(clientRequestId ? { ...data, client_request_id: clientRequestId } : data),
  });
  if (!response.ok) {
    const error = new Error(await getErrorMessage(response, '添加拍摄计划失败')) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
}

// Publishing
export async function getPublishing(params?: { topic_id?: number; page?: number; limit?: number }): Promise<PaginatedWorkflowResult<Publishing> & { summary: PublishingSummary }> {
  const query = new URLSearchParams(params as Record<string, string>);
  const response = await fetch(`${BASE_URL}/workflow/publishing?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取发布列表失败');
  return response.json();
}

// Existing detail pages refine this legacy envelope locally.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getPublishingById(id: number): Promise<any> {
  const response = await fetch(`${BASE_URL}/workflow/publishing/${id}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) {
    const error = new Error(await getErrorMessage(response, '获取发布详情失败')) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function getPublishingDeleteStatus(id: number): Promise<'exists' | 'deleted'> {
  const response = await fetch(`${BASE_URL}/workflow/publishing/${id}`, {
    headers: getAuthHeader(),
  });
  if (response.status === 404) return 'deleted';
  if (!response.ok) throw new Error('获取发布记录状态失败');
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || Number((payload as { id?: unknown }).id) !== id) {
    throw new Error('发布详情与待核实记录不一致');
  }
  return 'exists';
}

export async function getPublishingCreateStatus(clientRequestId: string): Promise<
  | { status: 'missing' }
  | { status: 'deleted' }
  | { status: 'created'; publishingId: number }
> {
  const response = await fetch(`${BASE_URL}/workflow/publishing/create-request/${encodeURIComponent(clientRequestId)}`, {
    headers: getAuthHeader(),
  });
  if (response.status === 404) return { status: 'missing' };
  if (response.status === 410) return { status: 'deleted' };
  if (!response.ok) throw new Error('核实发布记录创建状态失败');
  const payload: unknown = await response.json();
  const publishingId = Number((payload as { publishingId?: unknown } | null)?.publishingId);
  if (!Number.isInteger(publishingId) || publishingId <= 0) throw new Error('发布创建状态与请求编号不一致');
  return { status: 'created', publishingId };
}

export interface PublishingUpdatePayload {
  platform?: string;
  url?: string;
  status?: string;
  publish_time?: string;
  views?: number | null;
  likes?: number | null;
  shares?: number | null;
  comments?: number | null;
}

export interface PublishingUpdateSnapshot extends PublishingUpdatePayload {
  id: number;
  topic_id: number;
}

export type PublishingUpdateVerification =
  | { status: 'missing' }
  | { status: 'applied' | 'unchanged' | 'changed'; current: PublishingUpdateSnapshot };

function normalizePublishingUpdateValue(field: keyof PublishingUpdatePayload, value: unknown) {
  if (field === 'views' || field === 'likes' || field === 'shares' || field === 'comments') {
    return value == null || value === '' ? null : Number(value);
  }
  if (field === 'publish_time') return String(value ?? '').replace('T', ' ').slice(0, 10);
  return String(value ?? '');
}

export async function getPublishingUpdateStatus(
  id: number,
  expected: PublishingUpdatePayload,
  original: PublishingUpdatePayload,
): Promise<PublishingUpdateVerification> {
  const response = await fetch(`${BASE_URL}/workflow/publishing/${id}`, {
    headers: getAuthHeader(),
  });
  if (response.status === 404) return { status: 'missing' };
  if (!response.ok) throw new Error('获取发布记录更新状态失败');
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || Number((payload as { id?: unknown }).id) !== id) {
    throw new Error('发布详情与待核实记录不一致');
  }
  const row = payload as Record<string, unknown>;
  const current: PublishingUpdateSnapshot = {
    id,
    topic_id: Number(row.topic_id),
    platform: String(row.publishing_platform ?? row.platform ?? ''),
    url: String(row.url ?? ''),
    status: String(row.publishing_status ?? row.status ?? ''),
    publish_time: String(row.publishing_publish_time ?? row.publish_time ?? ''),
    views: row.manual_views == null ? null : Number(row.manual_views),
    likes: row.manual_likes == null ? null : Number(row.manual_likes),
    shares: row.manual_shares == null ? null : Number(row.manual_shares),
    comments: row.manual_comments == null ? null : Number(row.manual_comments),
  };
  if (!Number.isInteger(current.topic_id) || current.topic_id <= 0) {
    throw new Error('发布详情缺少有效选题编号');
  }
  const fields = Object.keys(expected).filter((field) => expected[field as keyof PublishingUpdatePayload] !== undefined) as Array<keyof PublishingUpdatePayload>;
  const matches = (values: PublishingUpdatePayload) => fields.every((field) => (
    normalizePublishingUpdateValue(field, current[field]) === normalizePublishingUpdateValue(field, values[field])
  ));
  const matchesExpected = matches(expected);
  const matchesOriginal = matches(original);
  if (matchesExpected && !matchesOriginal) return { status: 'applied', current };
  if (matchesOriginal) return { status: 'unchanged', current };
  if (matchesExpected) return { status: 'applied', current };
  return { status: 'changed', current };
}

export async function createPublishing(data: { 
  topic_id: number; 
  platform?: string; 
  url?: string; 
  status?: string; 
  publish_time?: string;
  views?: number | null;
  likes?: number | null;
  shares?: number | null;
  comments?: number | null;
}, clientRequestId?: string): Promise<{ message: string; publishingId: number; idempotent_replay?: boolean }> {
  const response = await fetch(`${BASE_URL}/workflow/publishing`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(clientRequestId ? { ...data, client_request_id: clientRequestId } : data)
  });
  if (!response.ok) {
    const error = new Error(await getErrorMessage(response, '添加发布记录失败')) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function updatePublishing(id: number, data: PublishingUpdatePayload & {
  script_content?: string;
  script_source_production_id?: number;
  script_source_version?: string;
  version_action?: 'minor' | 'major' | 'none';
  expected_content?: string;
}): Promise<{ message: string; archiveSync?: PublishedArchiveSyncState }> {
  const response = await fetch(`${BASE_URL}/workflow/publishing/${id}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const error = new Error(await getErrorMessage(response, '更新发布记录失败')) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function getPublishingScriptVersions(id: number) {
  return getWorkflowDocumentVersions(`/workflow/publishing/${id}/versions`);
}

export async function syncPublishingPublishedArchive(id: number): Promise<{ message: string; archiveSync: Exclude<PublishedArchiveSyncState, 'pending' | 'not_required'> }> {
  const response = await fetch(`${BASE_URL}/workflow/publishing/${id}/archive-sync`, {
    method: 'POST',
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '同步发布归档失败'));
  return response.json();
}

export async function deletePublishing(id: number): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/workflow/publishing/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader()
  });
  if (!response.ok) {
    const error = new Error(await getErrorMessage(response, '删除发布记录失败')) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export type PublishingDouyinCandidate = {
  id: number;
  account_id: number;
  title: string;
  publish_time?: string | null;
  play_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  linked_publishing_id?: number | null;
  match_method: 'exact' | 'containment' | 'fuzzy';
  match_score: number;
};

export async function reconcilePublishingDouyin(): Promise<{
  message: string;
  linked: number;
  reviewed: number;
  ambiguous: number;
  unmatched: number;
  archiveSyncPending: number;
}> {
  const response = await fetch(`${BASE_URL}/workflow/publishing/douyin/reconcile`, {
    method: 'POST',
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || '刷新抖音作品关联失败');
  return response.json();
}

export async function getPublishingDouyinCandidates(id: number, query?: string): Promise<{
  publishing: { id: number; title: string };
  candidates: PublishingDouyinCandidate[];
}> {
  const search = new URLSearchParams();
  if (query?.trim()) search.set('query', query.trim());
  const response = await fetch(`${BASE_URL}/workflow/publishing/${id}/douyin-candidates?${search}`, {
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || '获取抖音作品候选失败');
  return response.json();
}

export async function updatePublishingDouyinLink(id: number, douyinWorkId: number | null): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/workflow/publishing/${id}/douyin-link`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ douyin_work_id: douyinWorkId }),
  });
  if (!response.ok) {
    const error = new Error((await response.json().catch(() => null))?.message || '更新抖音作品关联失败') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export type PublishingDouyinLinkState =
  | { status: 'missing' }
  | { status: 'exists'; publishingId: number; douyinWorkId: number | null };

export async function getPublishingDouyinLinkState(id: number): Promise<PublishingDouyinLinkState> {
  const response = await fetch(`${BASE_URL}/workflow/publishing/${id}`, {
    headers: getAuthHeader(),
  });
  if (response.status === 404) return { status: 'missing' };
  if (!response.ok) throw new Error('获取发布记录抖音关联状态失败');
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object') throw new Error('发布记录抖音关联状态无效');
  const row = payload as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(row, 'douyin_work_id')) {
    throw new Error('发布记录缺少抖音关联状态');
  }
  const publishingId = Number(row.id);
  const rawDouyinWorkId = row.douyin_work_id;
  const douyinWorkId = rawDouyinWorkId == null ? null : Number(rawDouyinWorkId);
  if (publishingId !== id || (douyinWorkId !== null && (!Number.isSafeInteger(douyinWorkId) || douyinWorkId <= 0))) {
    throw new Error('发布记录抖音关联状态与待核实记录不一致');
  }
  return { status: 'exists', publishingId, douyinWorkId };
}
