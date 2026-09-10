import { useAuthStore } from '../store';
import type { Production, ProductionHistory, Shooting, Publishing, Comment } from '../types';

const BASE_URL = '/api';

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
export async function getProduction(params?: { topic_id?: number }): Promise<Production[]> {
  const query = new URLSearchParams(params as Record<string, string>);
  const response = await fetch(`${BASE_URL}/workflow/production?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取创作列表失败');
  return response.json();
}

export async function createProduction(data: { topic_id: number; version?: string; content?: string; contentMarkdown?: string; contentJson?: string; status?: string }): Promise<{ message: string; productionId: number }> {
  const response = await fetch(`${BASE_URL}/workflow/production`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('添加创作记录失败');
  return response.json();
}

export async function getProductionById(id: number): Promise<Production> {
  const response = await fetch(`${BASE_URL}/workflow/production/${id}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取创作详情失败');
  return response.json();
}

export async function updateProduction(id: number, data: { topic_id: number; version?: string; content?: string; contentMarkdown?: string; contentJson?: string; status?: string; change_type?: string; version_action?: 'minor' | 'major' | 'none' }): Promise<{ message: string; version?: string }> {
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

export async function getProductionHistory(productionId: number): Promise<ProductionHistory[]> {
  const response = await fetch(`${BASE_URL}/workflow/production/${productionId}/history`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取版本历史失败');
  return response.json();
}

export interface ProductionResource {
  id: number;
  production_id: number;
  source_resource_id: number | null;
  material_type: 'library' | 'manual';
  title: string;
  content_html: string;
  content_format: string;
  source_name: string;
  source_url: string | null;
  sort_order: number;
  revision: number;
  created_by: number | null;
  updated_by: number | null;
  creator_name: string | null;
  updater_name: string | null;
  created_at: string;
  updated_at: string;
}

export async function getProductionResources(productionId: number): Promise<ProductionResource[]> {
  const response = await fetch(`${BASE_URL}/productions/${productionId}/materials`, { headers: getAuthHeader() });
  if (!response.ok) throw new Error(await getErrorMessage(response, '获取参考资料失败'));
  return (await response.json()).data;
}

export async function addProductionResources(productionId: number, resourceIds: number[]): Promise<{ data: ProductionResource[]; skipped_resource_ids: number[] }> {
  const response = await fetch(`${BASE_URL}/productions/${productionId}/resources`, {
    method: 'POST', headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify({ resource_ids: resourceIds }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '添加参考资料失败'));
  return response.json();
}

export async function createManualProductionMaterial(productionId: number, input: { title?: string; content_html: string }): Promise<ProductionResource> {
  const response = await fetch(`${BASE_URL}/productions/${productionId}/materials/manual`, {
    method: 'POST', headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '新建创作资料失败'));
  return (await response.json()).data;
}

export async function updateProductionMaterial(productionId: number, materialId: number, input: { title: string; content_html: string; revision: number }): Promise<ProductionResource> {
  const response = await fetch(`${BASE_URL}/productions/${productionId}/materials/${materialId}`, {
    method: 'PUT', headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '保存创作资料失败'));
  return (await response.json()).data;
}

export async function removeProductionMaterial(productionId: number, materialId: number): Promise<void> {
  const response = await fetch(`${BASE_URL}/productions/${productionId}/materials/${materialId}`, { method: 'DELETE', headers: getAuthHeader() });
  if (!response.ok) throw new Error(await getErrorMessage(response, '移除创作资料失败'));
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

export async function updateShooting(id: number, data: { topic_id?: number; plan_date?: string; location?: string; equipment?: string; status?: string; script_content?: string }): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/workflow/shooting/${id}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('更新成片制作记录失败');
  return response.json();
}

export async function createShooting(data: { topic_id: number; plan_date?: string; location?: string; equipment?: string; status?: string }): Promise<{ message: string; shootingId: number }> {
  const response = await fetch(`${BASE_URL}/workflow/shooting`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('添加拍摄计划失败');
  return response.json();
}

// Publishing
export async function getPublishing(params?: { topic_id?: number; page?: number; limit?: number }): Promise<PaginatedWorkflowResult<Publishing>> {
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
  views?: number;
  likes?: number;
  shares?: number;
  comments?: number;
}): Promise<{ message: string; publishingId: number }> {
  const response = await fetch(`${BASE_URL}/workflow/publishing`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('添加发布记录失败');
  return response.json();
}

export async function updatePublishing(id: number, data: { 
  platform?: string; 
  url?: string; 
  status?: string; 
  publish_time?: string;
  views?: number;
  likes?: number;
  shares?: number;
  comments?: number;
  script_content?: string;
}): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/workflow/publishing/${id}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('更新发布记录失败');
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
