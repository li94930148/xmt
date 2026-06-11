import { useAuthStore } from '../store';
import type { CalendarEvent } from '@shared/types';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type { CalendarEvent };

export async function getCalendarEvents(params: { year: number; month: number }): Promise<{ data: CalendarEvent[] }> {
  const query = new URLSearchParams({ year: String(params.year), month: String(params.month) });
  const response = await fetch(`${BASE_URL}/calendar?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取日历事件失败');
  return response.json();
}

export async function createCalendarEvent(data: { title: string; description?: string; event_date: string; event_type?: string; topic_id?: number }): Promise<{ message: string; id: number }> {
  const response = await fetch(`${BASE_URL}/calendar`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('创建日历事件失败');
  return response.json();
}

export async function updateCalendarEvent(id: number, data: Partial<{ title: string; description: string; event_date: string; event_type: string; topic_id: number }>): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/calendar/${id}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('更新日历事件失败');
  return response.json();
}

export async function deleteCalendarEvent(id: number): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/calendar/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('删除日历事件失败');
  return response.json();
}
