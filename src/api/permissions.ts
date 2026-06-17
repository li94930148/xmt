import { useAuthStore } from '../store';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// 角色管理
export async function getRoles() {
  const response = await fetch(`${BASE_URL}/roles`, { headers: getAuthHeader() });
  if (!response.ok) throw new Error('获取角色列表失败');
  return response.json();
}

export async function getRole(id: number) {
  const response = await fetch(`${BASE_URL}/roles/${id}`, { headers: getAuthHeader() });
  if (!response.ok) throw new Error('获取角色失败');
  return response.json();
}

export async function createRole(data: { code: string; name: string; description?: string; permission_ids?: number[] }) {
  const response = await fetch(`${BASE_URL}/roles`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || '创建角色失败');
  }
  return response.json();
}

export async function updateRole(id: number, data: { name?: string; description?: string; permission_ids?: number[] }) {
  const response = await fetch(`${BASE_URL}/roles/${id}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || '更新角色失败');
  }
  return response.json();
}

export async function deleteRole(id: number) {
  const response = await fetch(`${BASE_URL}/roles/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader()
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || '删除角色失败');
  }
  return response.json();
}

// 用户角色分配
export async function getUserRoles(userId: number) {
  const response = await fetch(`${BASE_URL}/roles/user/${userId}`, { headers: getAuthHeader() });
  if (!response.ok) throw new Error('获取用户角色失败');
  return response.json();
}

export async function assignUserRoles(userId: number, roleIds: number[]) {
  const response = await fetch(`${BASE_URL}/roles/user/${userId}`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ role_ids: roleIds })
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || '分配用户角色失败');
  }
  return response.json();
}

// 权限管理
export async function getPermissions() {
  const response = await fetch(`${BASE_URL}/permissions`, { headers: getAuthHeader() });
  if (!response.ok) throw new Error('获取权限列表失败');
  return response.json();
}

export async function getMyPermissions() {
  const response = await fetch(`${BASE_URL}/permissions/my`, { headers: getAuthHeader() });
  if (!response.ok) throw new Error('获取用户权限失败');
  return response.json();
}

export async function createPermission(data: { code: string; name: string; module: string }) {
  const response = await fetch(`${BASE_URL}/permissions`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || '创建权限失败');
  }
  return response.json();
}

export async function deletePermission(id: number) {
  const response = await fetch(`${BASE_URL}/permissions/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader()
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || '删除权限失败');
  }
  return response.json();
}
