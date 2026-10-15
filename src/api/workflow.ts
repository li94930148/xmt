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
  if (!response.ok) throw new Error(await getErrorMessage(response, '获取剧本版本历史失败'));
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

export async function createProduction(data: { topic_id: number; version?: string; content?: string; contentMarkdown?: string; contentJson?: string; status?: string; origin_type?: 'topic_outline' }): Promise<{ message: string; productionId: number }> {
  const response = await fetch(`${BASE_URL}/workflow/production`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '添加创作记录失败'));
  return response.json();
}

export async function getProductionById(id: number): Promise<Production> {
  const response = await fetch(`${BASE_URL}/workflow/production/${id}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取创作详情失败');
  return response.json();
}

export async function updateProduction(id: number, data: { topic_id: number; version?: string; content?: string; expected_content?: string; contentMarkdown?: string; contentJson?: string; status?: string; change_type?: string; version_action?: 'minor' | 'major' | 'none' }): Promise<{ message: string; version?: string }> {
  const response = await fetch(`${BASE_URL}/workflow/production/${id}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '更新创作记录失败'));
  return response.json();
}

export async function deleteProduction(id: number): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/workflow/production/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('删除创作记录失败');
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

export async function createProductionReviewThread(productionId: number, input: {
  version: string;
  kind: 'comment' | 'suggestion';
  anchor: ProductionReviewAnchor;
  summary: string;
  proposed_text?: string;
}): Promise<{ id: number }> {
  const response = await fetch(`${BASE_URL}/workflow/production/${productionId}/review-threads`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '添加批注或建议失败'));
  return response.json();
}

export async function replyToProductionReviewThread(productionId: number, threadId: number, content: string): Promise<{ id: number }> {
  const response = await fetch(`${BASE_URL}/workflow/production/${productionId}/review-threads/${threadId}/replies`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '添加回复失败'));
  return response.json();
}

export async function updateProductionReviewThreadStatus(
  productionId: number,
  threadId: number,
  status: 'resolved' | 'accepted' | 'rejected',
): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/workflow/production/${productionId}/review-threads/${threadId}/status`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '更新批注或建议状态失败'));
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
  const response = await fetch(`${BASE_URL}/productions/${productionId}/material-draft`, { headers: getAuthHeader() });
  if (!response.ok) throw new Error(await getErrorMessage(response, '获取创作资料草稿失败'));
  return (await response.json()).data;
}

export async function updateProductionMaterialDraft(productionId: number, input: { content_html: string; revision: number }): Promise<ProductionMaterialDraft> {
  const response = await fetch(`${BASE_URL}/productions/${productionId}/material-draft`, {
    method: 'PUT', headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '保存创作资料草稿失败'));
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

export async function updateShooting(id: number, data: { topic_id?: number; plan_date?: string; location?: string; equipment?: string; status?: string; script_content?: string; script_source_production_id?: number; script_source_version?: string; version_action?: 'minor' | 'major' | 'none'; expected_content?: string }): Promise<{ message: string; archiveSync?: PublishedArchiveSyncState }> {
  const response = await fetch(`${BASE_URL}/workflow/shooting/${id}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '更新成片制作记录失败'));
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

export async function createShooting(data: { topic_id: number; plan_date?: string; location?: string; equipment?: string; status?: string }): Promise<{ message: string; shootingId: number }> {
  const response = await fetch(`${BASE_URL}/workflow/shooting`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '添加拍摄计划失败'));
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
  if (!response.ok) throw new Error('获取发布详情失败');
  return response.json();
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
}): Promise<{ message: string; publishingId: number }> {
  const response = await fetch(`${BASE_URL}/workflow/publishing`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '添加发布记录失败'));
  return response.json();
}

export async function updatePublishing(id: number, data: { 
  platform?: string; 
  url?: string; 
  status?: string; 
  publish_time?: string;
  views?: number | null;
  likes?: number | null;
  shares?: number | null;
  comments?: number | null;
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
  if (!response.ok) throw new Error(await getErrorMessage(response, '更新发布记录失败'));
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
  if (!response.ok) throw new Error('删除发布记录失败');
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
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || '更新抖音作品关联失败');
  return response.json();
}
