import { useAuthStore } from '../store';
import type { Production, Shooting, Publishing, Comment } from '../types';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
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
  if (!response.ok) throw new Error('更新创作记录失败');
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

export async function getProductionHistory(productionId: number): Promise<any[]> {
  const response = await fetch(`${BASE_URL}/workflow/production/${productionId}/history`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取版本历史失败');
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

// Shooting
export async function getShooting(params?: { topic_id?: number }): Promise<Shooting[]> {
  const query = new URLSearchParams(params as Record<string, string>);
  const response = await fetch(`${BASE_URL}/workflow/shooting?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取成片制作列表失败');
  return response.json();
}

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
export async function getPublishing(params?: { topic_id?: number }): Promise<Publishing[]> {
  const query = new URLSearchParams(params as Record<string, string>);
  const response = await fetch(`${BASE_URL}/workflow/publishing?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取发布列表失败');
  return response.json();
}

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
