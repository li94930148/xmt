import { useAuthStore } from '../store';
import type { User } from '../types';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function login(username: string, password: string): Promise<{ user: User; token: string; forceChangePassword?: boolean }> {
  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) throw new Error('登录失败');
  return response.json();
}

export async function getMe(): Promise<User> {
  const response = await fetch(`${BASE_URL}/auth/me`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取用户信息失败');
  return response.json();
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/auth/change-password`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPassword, newPassword })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || '修改密码失败');
  }
  return response.json();
}
