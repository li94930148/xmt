import { useAuthStore } from '@/store';

export type LibraryType = 'project' | 'content_archive' | 'knowledge' | 'media';

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
  content_text: string | null;
  source_type: string | null;
  source_uri: string | null;
  parent_id: number | null;
  files: Array<{ id: number; original_name: string; mime_type: string | null; extension: string | null; size_bytes: number; is_primary: number; status: string }>;
  relations: Array<{ id: number; target_type: string; target_id: number; relation_type: string; created_at: string }>;
  versions: unknown[];
  audit_summary: { total: number; last_at: string | null; last_action: string | null } | null;
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

function authHeaders(json = false): HeadersInit {
  const token = useAuthStore.getState().token;
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}) };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/resource-center${path}`, init);
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(data?.error || '请求失败');
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
  return request<ResourceDetailData>(`/resources/${id}`, { headers: authHeaders() });
}

export function createResourceCenterResource(input: {
  title: string;
  summary?: string;
  library_type: LibraryType;
  category_id?: number;
  visibility: 'team' | 'company' | 'private';
  content_text?: string;
}) {
  return request<{ message: string; id: number }>('/resources', {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify(input),
  });
}

export function getResourceCategories(libraryType?: LibraryType) {
  return request<{ data: ResourceCategory[] }>(`/categories?${queryString({ library_type: libraryType })}`, { headers: authHeaders() });
}

export function searchResourceCenter(params: { keyword: string; library_type?: LibraryType; category_id?: number }) {
  return request<{ data: Array<{ resource_id: number; title: string; summary: string | null; snippet: string; library_type: LibraryType; category: ResourceCategory | null }>; total: number }>(`/search?${queryString(params)}`, { headers: authHeaders() });
}

export function deleteResourceCenterResource(id: number) {
  return request<{ message: string }>(`/resources/${id}`, { method: 'DELETE', headers: authHeaders() });
}

export function getResourceAudit(id: number) {
  return request<{ data: Array<{ id: number; user_id: number; action: string; detail_json: string | null; created_at: string }> }>(`/resources/${id}/audit`, { headers: authHeaders() });
}
