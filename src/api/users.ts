import { useAuthStore } from '../store';
import type { ActivityLog, User } from '../types';

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

export type AssignableRole = {
  id: number;
  code: string;
  name: string;
};

export async function getUsers(params?: { page?: number; limit?: number }): Promise<{ data: User[]; total: number; page: number; limit: number }> {
  const query = new URLSearchParams(params as Record<string, string>);
  const response = await fetch(`${BASE_URL}/users?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to load users'));
  return response.json();
}

export async function getAssignableRoles(): Promise<AssignableRole[]> {
  const response = await fetch(`${BASE_URL}/users/assignable-roles`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to load assignable roles'));
  return response.json();
}

export async function createUser(data: { username: string; password: string; email?: string; role?: string; name?: string }): Promise<{ message: string; userId: number }> {
  const response = await fetch(`${BASE_URL}/users`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to create user'));
  return response.json();
}

export async function updateUser(id: number, data: Partial<User>): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/users/${id}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to update user'));
  return response.json();
}

export async function deleteUser(id: number): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/users/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to delete user'));
  return response.json();
}

export async function getLogs(params?: { page?: number; limit?: number }): Promise<{ data: ActivityLog[]; total: number; page: number; limit: number }> {
  const query = new URLSearchParams(params as Record<string, string>);
  const response = await fetch(`${BASE_URL}/users/logs?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to load user logs'));
  return response.json();
}

export async function getActivityLogs(params?: { page?: number; limit?: number; user_id?: number }): Promise<{ data: ActivityLog[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.user_id) query.set('user_id', String(params.user_id));
  const response = await fetch(`${BASE_URL}/users/activity-logs?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to load activity logs'));
  return response.json();
}

