import { apiFetch } from './transport';
import { useAuthStore } from '../store';

const deviceKey = 'xmt_mobile_device_id';

export function getMobileDeviceId() {
  const existing = localStorage.getItem(deviceKey);
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem(deviceKey, next);
  return next;
}

export async function registerMobileDevice() {
  const token = useAuthStore.getState().token;
  const response = await apiFetch('/notifications/mobile-devices', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform: 'android', deviceId: getMobileDeviceId(), appVersion: __APP_VERSION__ }),
  });
  if (!response.ok && response.status !== 204) throw new Error('移动设备登记失败');
}

export async function revokeMobileDevice() {
  const deviceId = localStorage.getItem(deviceKey);
  if (!deviceId) return;
  const token = useAuthStore.getState().token;
  await apiFetch(`/notifications/mobile-devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : undefined });
}
