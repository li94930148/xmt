import { useAuthStore } from '../store';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function deleteResource(id: number): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/resources/archives/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('删除资源失败');
  return response.json();
}

export async function getCategories(): Promise<string[]> {
  const response = await fetch(`${BASE_URL}/resources/categories`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取分类失败');
  return response.json();
}

export async function getArchives(params?: { search?: string; page?: number; limit?: number }): Promise<{ data: any[]; total: number; page: number; limit: number }> {
  const query = new URLSearchParams(params as Record<string, string>);
  const response = await fetch(`${BASE_URL}/resources/archives?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取归档列表失败');
  return response.json();
}

export async function getArchiveDetail(id: number): Promise<any> {
  const response = await fetch(`${BASE_URL}/resources/archives/${id}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取归档详情失败');
  return response.json();
}
