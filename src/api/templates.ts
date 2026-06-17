import { useAuthStore } from '../store';
import type { Template } from '@shared/types';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type { Template };

export async function getTemplates(): Promise<Template[]> {
  const response = await fetch(`${BASE_URL}/templates`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取模板列表失败');
  return response.json();
}

export async function createTemplate(data: { name: string; platform?: string; description?: string; template_data: string }): Promise<{ message: string; id: number }> {
  const response = await fetch(`${BASE_URL}/templates`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('创建模板失败');
  return response.json();
}

export async function updateTemplate(id: number, data: Partial<{ name: string; platform?: string; description?: string; template_data: string }>): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/templates/${id}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('更新模板失败');
  return response.json();
}

export async function deleteTemplate(id: number): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/templates/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('删除模板失败');
  return response.json();
}
