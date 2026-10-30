import { useAuthStore } from '@/store';

export type LibraryType = 'project' | 'content_archive' | 'knowledge' | 'media';
export type ResourceSearchSort = 'relevance' | 'updated_desc' | 'title_asc';

export interface ResourceCategory {
  id: number;
  library_type: LibraryType;
  parent_id: number | null;
  name: string;
  code: string | null;
  path: string | null;
  sort_order: number;
  enabled: number;
  resource_count?: number;
}

export type ResourceCategoryMutationStatus =
  | { state: 'created' | 'updated' | 'deleted'; categoryId: number }
  | { state: 'not_found' };

export interface ResourceListItem {
  id: number;
  title: string;
  summary: string | null;
  library_type: LibraryType;
  visibility: string;
  status: string;
  category: ResourceCategory | null;
  tags: Array<{ id: number; name: string }>;
  file_count: number;
  owner: { id: number; username?: string; real_name?: string } | null;
  created_at: string;
  updated_at: string;
}

export interface ResourceDetailData extends ResourceListItem {
  /** Legacy resource columns returned by the resource-center detail API. */
  file_path?: string | null;
  content?: string | null;
  content_text: string | null;
  source_type: string | null;
  source_uri: string | null;
  parent_id: number | null;
  files: Array<{ id: number; original_name: string; mime_type: string | null; extension: string | null; size_bytes: number; is_primary: number; status: string }>;
  relations: Array<{ id: number; target_type: string; target_id: number; relation_type: string; created_at: string }>;
  versions: unknown[];
  audit_summary: { total: number; last_at: string | null; last_action: string | null } | null;
}

export interface UpdateResourceCenterResourceInput {
  title: string;
  summary: string | null;
  category_id: number | null;
  visibility: 'private' | 'project' | 'team' | 'company';
  content_text: string | null;
}

export interface ResourceQuery {
  library_type?: LibraryType;
  category_id?: number;
  parent_id?: number;
  keyword?: string;
  tag?: string;
  status?: string;
  visibility?: string;
  owner_id?: number;
  page?: number;
  page_size?: number;
}

export interface ContentTopicAsset {
  id: number;
  title: string;
  status: string;
  platform: string | null;
  created_at: string;
  updated_at: string;
  production_count: number;
  latest_production_id: number | null;
  latest_production_version: string | null;
  latest_production_updated_at: string | null;
  shooting_count: number;
  publishing_count: number;
  resource_count: number;
  linked_resources: Array<{
    id: number;
    title: string;
    library_type: LibraryType;
    updated_at: string;
  }>;
  referenced_resources: Array<{
    id: number;
    title: string;
    library_type: LibraryType;
    updated_at: string;
  }>;
  dimensions: Array<{ id: number; type: ContentAssetDimensionType; value: string }>;
  can_manage_dimensions: boolean;
  latest_analytics: {
    publishing_id: number;
    platform: string | null;
    data_date: string | null;
    views: number;
    likes: number;
    shares: number;
    comments: number;
    sources: Record<'views' | 'likes' | 'shares' | 'comments', string>;
  } | null;
}

export type ContentAssetDimensionType = 'city' | 'person' | 'project';
export type ContentTopicDimensionCoverage = {
  visible_topics_total: number;
  registered_topic_counts: Record<ContentAssetDimensionType, number>;
};
export type ContentTopicDimension = {
  id: number;
  type: ContentAssetDimensionType;
  value: string;
  created_by?: number;
  created_at?: string;
};

export const CONTENT_ASSET_DIMENSION_LABELS: Record<ContentAssetDimensionType, string> = {
  city: '城市',
  person: '人物',
  project: '项目',
};

function authHeaders(json = false): HeadersInit {
  const token = useAuthStore.getState().token;
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}) };
}

export class ResourceCenterApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'ResourceCenterApiError';
  }
}

export type ResourceCreateRequestStatus =
  | { state: 'created'; resourceId: number }
  | { state: 'not_found' };

export type ResourceUpdateRequestStatus =
  | { state: 'updated'; resourceId: number }
  | { state: 'not_found' };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/resource-center${path}`, init);
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { message?: string; error?: string; code?: string } | null;
    throw new ResourceCenterApiError(data?.message || data?.error || '请求失败', response.status, data?.code);
  }
  return response.json() as Promise<T>;
}

function queryString(params: object) {
  const query = new URLSearchParams();
  Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  });
  return query.toString();
}

export function getResourceCenterResources(params: ResourceQuery = {}) {
  return request<{ data: ResourceListItem[]; pagination: { page: number; page_size: number; total: number; total_pages: number } }>(`/resources?${queryString(params)}`, { headers: authHeaders() });
}

export function getResourceCenterResource(id: number) {
  return request<ResourceDetailData>(`/resources/${id}`, { headers: authHeaders(), cache: 'no-store' });
}

export function updateResourceCenterResource(id: number, input: UpdateResourceCenterResourceInput, clientRequestId?: string) {
  return request<{ message: string }>(`/resources/${id}`, {
    method: 'PUT',
    headers: authHeaders(true),
    body: JSON.stringify({ ...input, ...(clientRequestId ? { client_request_id: clientRequestId } : {}) }),
  });
}

export function getResourceUpdateRequestStatus(id: number, requestId: string) {
  return request<ResourceUpdateRequestStatus>(`/resources/${id}/update-requests/${encodeURIComponent(requestId)}`, {
    headers: authHeaders(),
    cache: 'no-store',
  });
}

export function createResourceCenterResource(input: {
  title: string;
  summary?: string;
  library_type: LibraryType;
  category_id?: number;
  visibility: 'team' | 'company' | 'private';
  content_text?: string;
  client_request_id?: string;
}) {
  return request<{ message: string; id: number }>('/resources', {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify(input),
  });
}

export function getResourceCreateRequestStatus(requestId: string) {
  return request<ResourceCreateRequestStatus>(`/resources/create-requests/${encodeURIComponent(requestId)}`, {
    headers: authHeaders(),
    cache: 'no-store',
  });
}

export function getResourceCategories(libraryType?: LibraryType) {
  return request<{ data: ResourceCategory[] }>(`/categories?${queryString({ library_type: libraryType })}`, { headers: authHeaders() });
}

export function createResourceCategory(input: { library_type: LibraryType; name: string; parent_id?: number | null; client_request_id?: string }) {
  return request<{ message: string; id: number }>('/categories', {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify(input),
  });
}

export function updateResourceCategory(id: number, input: { name: string; parent_id: number | null; library_type?: LibraryType; client_request_id?: string }) {
  return request<{ message: string }>(`/categories/${id}`, {
    method: 'PUT',
    headers: authHeaders(true),
    body: JSON.stringify(input),
  });
}

export function deleteResourceCategory(id: number, input?: { library_type: LibraryType; client_request_id: string }) {
  return request<{ message: string }>(`/categories/${id}`, {
    method: 'DELETE',
    ...(input ? { headers: authHeaders(true), body: JSON.stringify(input) } : { headers: authHeaders() }),
  });
}

export function getResourceCategoryMutationRequestStatus(requestId: string, fingerprint: string) {
  const query = new URLSearchParams({ fingerprint });
  return request<ResourceCategoryMutationStatus>(`/categories/mutation-requests/${encodeURIComponent(requestId)}?${query.toString()}`, {
    headers: authHeaders(),
    cache: 'no-store',
  });
}

export function searchResourceCenter(params: { keyword: string; library_type?: LibraryType; category_id?: number; tag?: string; sort?: ResourceSearchSort }) {
  return request<{ data: Array<{ resource_id: number; title: string; summary: string | null; snippet: string; library_type: LibraryType; category: ResourceCategory | null }>; total: number }>(`/search?${queryString(params)}`, { headers: authHeaders() });
}

export function getContentTopicAssets(params: { keyword?: string; page?: number; page_size?: number; dimension_type?: ContentAssetDimensionType; dimension_value?: string } = {}) {
  return request<{
    data: ContentTopicAsset[];
    pagination: { page: number; page_size: number; total: number; total_pages: number };
    analytics_visible: boolean;
    available_dimensions: Array<{ dimension_type: ContentAssetDimensionType; value: string }>;
    dimension_summaries: Array<{ dimension_type: ContentAssetDimensionType; value: string; topic_count: number; production_count: number; resource_count: number; shooting_count: number; publishing_count: number }>;
    dimension_coverage: ContentTopicDimensionCoverage;
  }>(`/content-topics?${queryString(params)}`, { headers: authHeaders() });
}

export class TopicDimensionRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'TopicDimensionRequestError';
    this.status = status;
  }
}

export type TopicDimensionMutationIntent =
  | { kind: 'add'; type: ContentAssetDimensionType; value: string }
  | { kind: 'remove'; dimensionId: number };

export function isTopicDimensionWriteOutcomeUnknown(error: unknown) {
  if (!(error instanceof TopicDimensionRequestError)) return true;
  return error.status === 408 || error.status === 429 || error.status >= 500;
}

function normalizeTopicDimensionValue(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');
}

/** Reconcile a possibly committed dimension write using GET only; this never retries the mutation. */
export async function reconcileContentTopicDimensionMutation(topicId: number, intent: TopicDimensionMutationIntent) {
  const response = await getContentTopicDimensions(topicId);
  const targetPresent = intent.kind === 'add'
    ? response.data.some((dimension) => dimension.type === intent.type && normalizeTopicDimensionValue(dimension.value) === normalizeTopicDimensionValue(intent.value))
    : response.data.some((dimension) => dimension.id === intent.dimensionId);
  return { data: response.data, targetPresent };
}

async function requestTopicDimension<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/topics${path}`, init);
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { message?: string; error?: string } | null;
    throw new TopicDimensionRequestError(response.status, data?.message || data?.error || '请求失败');
  }
  return response.json() as Promise<T>;
}

export function getContentTopicDimensions(topicId: number) {
  return requestTopicDimension<{ data: ContentTopicDimension[] }>(`/${topicId}/asset-dimensions`, {
    headers: authHeaders(),
  });
}

export function addContentTopicDimension(topicId: number, type: ContentAssetDimensionType, value: string) {
  return requestTopicDimension<{ message: string; id: number; data?: ContentTopicDimension }>(`/${topicId}/asset-dimensions`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ type, value }),
  });
}

export function removeContentTopicDimension(topicId: number, dimensionId: number) {
  return requestTopicDimension<{ message: string }>(`/${topicId}/asset-dimensions/${dimensionId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export function deleteResourceCenterResource(id: number) {
  return request<{ message: string }>(`/resources/${id}`, { method: 'DELETE', headers: authHeaders() });
}

export function getResourceAudit(id: number) {
  return request<{ data: Array<{ id: number; user_id: number; action: string; detail_json: string | null; created_at: string }> }>(`/resources/${id}/audit`, { headers: authHeaders() });
}
