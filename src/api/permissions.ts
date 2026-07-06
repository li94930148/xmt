import { useAuthStore } from '../store';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  if (body && typeof body === 'object' && 'message' in body) {
    return String((body as { message?: unknown }).message || fallback);
  }
  return fallback;
}

export async function getRoles() {
  const response = await fetch(`${BASE_URL}/roles`, { headers: getAuthHeader() });
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to load roles'));
  return response.json();
}

export async function getRole(id: number) {
  const response = await fetch(`${BASE_URL}/roles/${id}`, { headers: getAuthHeader() });
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to load role'));
  return response.json();
}

export async function createRole(data: { code: string; name: string; description?: string; permission_ids?: number[] }) {
  const response = await fetch(`${BASE_URL}/roles`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to create role'));
  return response.json();
}

export async function updateRole(id: number, data: { name?: string; description?: string; permission_ids?: number[] }) {
  const response = await fetch(`${BASE_URL}/roles/${id}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to update role'));
  return response.json();
}

export async function deleteRole(id: number) {
  const response = await fetch(`${BASE_URL}/roles/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to delete role'));
  return response.json();
}

export async function getUserRoles(userId: number) {
  const response = await fetch(`${BASE_URL}/roles/user/${userId}`, { headers: getAuthHeader() });
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to load user roles'));
  return response.json();
}

export async function assignUserRoles(userId: number, roleIds: number[]) {
  const response = await fetch(`${BASE_URL}/roles/user/${userId}`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ role_ids: roleIds })
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to assign user roles'));
  return response.json();
}

export async function getPermissions() {
  const response = await fetch(`${BASE_URL}/permissions`, { headers: getAuthHeader() });
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to load permissions'));
  return response.json();
}

export async function getMyPermissions() {
  const response = await fetch(`${BASE_URL}/permissions/my`, { headers: getAuthHeader() });
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to load current permissions'));
  return response.json();
}

export async function createPermission(data: { code: string; name: string; module: string }) {
  const response = await fetch(`${BASE_URL}/permissions`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to create permission'));
  return response.json();
}

export async function deletePermission(id: number) {
  const response = await fetch(`${BASE_URL}/permissions/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to delete permission'));
  return response.json();
}
