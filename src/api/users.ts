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

export async function getUsers(params?: { page?: number; limit?: number; search?: string }): Promise<{ data: User[]; total: number; page: number; limit: number }> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const response = await fetch(`${BASE_URL}/users?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '成员列表加载失败'));
  return response.json();
}

export async function getUser(id: number): Promise<User | null> {
  const response = await fetch(`${BASE_URL}/users/${id}`, {
    headers: getAuthHeader(),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await getErrorMessage(response, '成员信息加载失败'));
  return response.json();
}

export type UserCreateRequestStatus =
  | { state: 'created'; userId: number }
  | { state: 'not_found' };

export async function getUserCreateRequestStatus(requestId: string): Promise<UserCreateRequestStatus> {
  const response = await fetch(`${BASE_URL}/users/create-requests/${encodeURIComponent(requestId)}`, {
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '无法确认成员是否已创建，请重新核实'));
  return response.json();
}

export type UserUpdateRequestStatus =
  | { state: 'updated' }
  | { state: 'not_found' };

export async function getUserUpdateRequestStatus(requestId: string, targetUserId: number): Promise<UserUpdateRequestStatus> {
  const response = await fetch(
    `${BASE_URL}/users/update-requests/${encodeURIComponent(requestId)}/${encodeURIComponent(String(targetUserId))}`,
    { headers: getAuthHeader() },
  );
  if (!response.ok) throw new Error(await getErrorMessage(response, '无法确认成员信息是否已更新，请重新核实'));
  return response.json();
}

export type UserDeleteRequestStatus =
  | { state: 'deleted' }
  | { state: 'not_found' };

export async function getUserDeleteRequestStatus(requestId: string, targetUserId: number): Promise<UserDeleteRequestStatus> {
  const response = await fetch(
    `${BASE_URL}/users/delete-requests/${encodeURIComponent(requestId)}/${encodeURIComponent(String(targetUserId))}`,
    { headers: getAuthHeader() },
  );
  if (!response.ok) throw new Error(await getErrorMessage(response, '无法确认成员是否已删除，请重新核实'));
  return response.json();
}

export async function getAssignableRoles(): Promise<AssignableRole[]> {
  const response = await fetch(`${BASE_URL}/users/assignable-roles`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '可分配角色列表加载失败'));
  return response.json();
}

export async function createUser(data: { username: string; password: string; email?: string; role?: string; name?: string; client_request_id?: string }): Promise<{ message: string; userId: number; idempotent_replay?: boolean }> {
  const response = await fetch(`${BASE_URL}/users`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const error = new Error(await getErrorMessage(response, '成员创建失败')) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function updateUser(
  id: number,
  data: Partial<User> & { password?: string; client_request_id?: string },
): Promise<{ message: string; idempotent_replay?: boolean }> {
  const response = await fetch(`${BASE_URL}/users/${id}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const error = new Error(await getErrorMessage(response, '成员信息更新失败')) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function deleteUser(id: number, clientRequestId?: string): Promise<{ message: string; idempotent_replay?: boolean }> {
  const response = await fetch(`${BASE_URL}/users/${id}`, {
    method: 'DELETE',
    headers: clientRequestId
      ? { ...getAuthHeader(), 'Content-Type': 'application/json' }
      : getAuthHeader(),
    ...(clientRequestId ? { body: JSON.stringify({ client_request_id: clientRequestId }) } : {}),
  });
  if (!response.ok) {
    const error = new Error(await getErrorMessage(response, '成员删除失败')) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function getLogs(params?: { page?: number; limit?: number }): Promise<{ data: ActivityLog[]; total: number; page: number; limit: number }> {
  const query = new URLSearchParams(params as Record<string, string>);
  const response = await fetch(`${BASE_URL}/users/logs?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '成员操作记录加载失败'));
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
  if (!response.ok) throw new Error(await getErrorMessage(response, '成员活动记录加载失败'));
  return response.json();
}
