import {
  defaultSystemSettings,
  ManagedSystemSettings,
  normalizeSystemSettings,
} from '@/lib/systemSettings';
import { useAuthStore } from '@/store';

async function parseSettingsResponse(response: Response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? String((payload as { message: unknown }).message)
        : '系统设置请求失败';
    throw new Error(message);
  }

  return normalizeSystemSettings(payload ?? defaultSystemSettings);
}

export async function getPublicSystemSettings(): Promise<ManagedSystemSettings> {
  const response = await fetch('/api/system-settings/public');
  return parseSettingsResponse(response);
}

export async function getSystemSettings(): Promise<ManagedSystemSettings> {
  const token = useAuthStore.getState().token;
  const response = await fetch('/api/system-settings', {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return parseSettingsResponse(response);
}

export async function updateSystemSettings(
  patch: Partial<ManagedSystemSettings>,
): Promise<ManagedSystemSettings> {
  const token = useAuthStore.getState().token;
  const response = await fetch('/api/system-settings', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  });
  return parseSettingsResponse(response);
}
