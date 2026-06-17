import { useAuthStore } from '../store';
import type { Resource } from '../types';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getResources(params?: { category?: string; page?: number; limit?: number }): Promise<{ data: Resource[]; total: number; page: number; limit: number }> {
  const query = new URLSearchParams(params as Record<string, string>);
  const response = await fetch(`${BASE_URL}/resources?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取资源列表失败');
  return response.json();
}

export async function createResource(data: { name: string; type?: string; file_path?: string; category?: string }): Promise<{ message: string; resourceId: number }> {
  const response = await fetch(`${BASE_URL}/resources`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('上传资源失败');
  return response.json();
}

export async function updateResource(id: number, data: { name?: string; type?: string; file_path?: string; category?: string }): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/resources/${id}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('更新资源失败');
  return response.json();
}

export async function deleteResource(id: number): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/resources/${id}`, {
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
