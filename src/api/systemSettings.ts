import {
  defaultSystemSettings,
  ManagedSystemSettings,
  normalizeSystemSettings,
} from '@/lib/systemSettings';
import { useAuthStore } from '@/store';

export type SystemSettingsSaveResult =
  | { kind: 'saved'; settings: ManagedSystemSettings; recovered: boolean }
  | { kind: 'conflict'; currentSettings: ManagedSystemSettings }
  | { kind: 'unknown'; message: string }
  | { kind: 'rejected'; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isManagedSystemSettingsPayload(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.system) || !isRecord(value.branding) || !isRecord(value.login)) return false;
  const system = value.system;
  const branding = value.branding;
  const login = value.login;
  return typeof system.name === 'string'
    && typeof system.browserTitle === 'string'
    && typeof system.description === 'string'
    && typeof system.icon === 'string'
    && (system.defaultTheme === 'light' || system.defaultTheme === 'dark')
    && typeof branding.brandName === 'string'
    && typeof branding.logo === 'string'
    && typeof branding.brandDescription === 'string'
    && (login.layout === 'style1' || login.layout === 'style2' || login.layout === 'style3')
    && typeof login.welcomeTitle === 'string'
    && typeof login.welcomeMessage === 'string';
}

function settingsPatchMatches(current: ManagedSystemSettings, patch: Partial<ManagedSystemSettings>): boolean {
  const normalized = normalizeSystemSettings({
    system: { ...defaultSystemSettings.system, ...(patch.system ?? {}) },
    branding: { ...defaultSystemSettings.branding, ...(patch.branding ?? {}) },
    login: { ...defaultSystemSettings.login, ...(patch.login ?? {}) },
  });
  const matchesSection = <T extends object>(actual: T, expected: T, submitted: Partial<T>) =>
    (Object.keys(submitted) as Array<keyof T>).every((key) => actual[key] === expected[key]);
  return (!patch.system || matchesSection(current.system, normalized.system, patch.system))
    && (!patch.branding || matchesSection(current.branding, normalized.branding, patch.branding))
    && (!patch.login || matchesSection(current.login, normalized.login, patch.login));
}

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

async function getSystemSettingsForVerification(): Promise<ManagedSystemSettings> {
  const token = useAuthStore.getState().token;
  const response = await fetch('/api/system-settings', {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: 'no-store',
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload && typeof payload === 'object' && 'message' in payload
      ? String((payload as { message: unknown }).message)
      : `读取系统设置失败（HTTP ${response.status}）`;
    throw new Error(message);
  }
  const payload = await response.json().catch(() => null) as unknown;
  if (!isManagedSystemSettingsPayload(payload)) {
    throw new Error('系统设置核实响应格式异常');
  }
  return normalizeSystemSettings(payload);
}

export async function verifySystemSettingsUpdate(
  patch: Partial<ManagedSystemSettings>,
): Promise<SystemSettingsSaveResult> {
  try {
    const currentSettings = await getSystemSettingsForVerification();
    if (settingsPatchMatches(currentSettings, patch)) {
      return { kind: 'saved', settings: currentSettings, recovered: true };
    }
    return { kind: 'conflict', currentSettings };
  } catch {
    return {
      kind: 'unknown',
      message: '系统设置保存结果尚未核实。当前设置已保留；请只读重新核实，确认前不要重复保存。',
    };
  }
}

export async function updateSystemSettings(
  patch: Partial<ManagedSystemSettings>,
): Promise<SystemSettingsSaveResult> {
  const token = useAuthStore.getState().token;
  let response: Response;
  try {
    response = await fetch('/api/system-settings', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patch),
    });
  } catch {
    return verifySystemSettingsUpdate(patch);
  }

  if (response.ok) {
    const payload = await response.json().catch(() => null) as unknown;
    if (!isManagedSystemSettingsPayload(payload)) return verifySystemSettingsUpdate(patch);
    return { kind: 'saved', settings: normalizeSystemSettings(payload), recovered: false };
  }

  if (response.status === 408 || response.status === 429 || response.status >= 500) {
    return verifySystemSettingsUpdate(patch);
  }

  const payload = await response.json().catch(() => null) as unknown;
  const message = payload && typeof payload === 'object' && 'message' in payload
    ? String((payload as { message: unknown }).message)
    : `系统设置保存失败（HTTP ${response.status}）`;
  return { kind: 'rejected', message };
}
