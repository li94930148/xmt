import type { ManagedSystemSettings } from '../lib/systemSettings';

export type PendingSystemSettingsRecovery = {
  version: 1;
  actorId: number;
  requestId: string;
  patch: Partial<ManagedSystemSettings>;
  successMessage: string;
};

export type SystemSettingsRecoveryRead =
  | { state: 'none' }
  | { state: 'valid'; recovery: PendingSystemSettingsRecovery }
  | { state: 'invalid' }
  | { state: 'unavailable' };

export interface SystemSettingsRecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const VERSION = 1;
const KEY_PREFIX = `xmt:system-settings-recovery:v${VERSION}:actor:`;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storageKey(actorId: number) {
  return `${KEY_PREFIX}${actorId}`;
}

function browserStorage(): SystemSettingsRecoveryStorage | null {
  if (typeof window === 'undefined') return null;
  try { return window.sessionStorage; } catch { return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

function isSystemSection(value: unknown): value is ManagedSystemSettings['system'] {
  if (!isRecord(value) || !hasExactKeys(value, ['name', 'browserTitle', 'description', 'icon', 'defaultTheme'])) return false;
  return typeof value.name === 'string'
    && typeof value.browserTitle === 'string'
    && typeof value.description === 'string'
    && typeof value.icon === 'string'
    && (value.defaultTheme === 'light' || value.defaultTheme === 'dark');
}

function isBrandingSection(value: unknown): value is ManagedSystemSettings['branding'] {
  if (!isRecord(value) || !hasExactKeys(value, ['brandName', 'logo', 'brandDescription'])) return false;
  return typeof value.brandName === 'string'
    && typeof value.logo === 'string'
    && typeof value.brandDescription === 'string';
}

function isLoginSection(value: unknown): value is ManagedSystemSettings['login'] {
  if (!isRecord(value) || !hasExactKeys(value, ['layout', 'welcomeTitle', 'welcomeMessage'])) return false;
  return (value.layout === 'style1' || value.layout === 'style2' || value.layout === 'style3')
    && typeof value.welcomeTitle === 'string'
    && typeof value.welcomeMessage === 'string';
}

function isSettingsPatch(value: unknown): value is Partial<ManagedSystemSettings> {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => !['system', 'branding', 'login'].includes(key))) return false;
  return (!('system' in value) || isSystemSection(value.system))
    && (!('branding' in value) || isBrandingSection(value.branding))
    && (!('login' in value) || isLoginSection(value.login));
}

export function normalizePendingSystemSettingsRecovery(
  value: unknown,
  actorId: number,
): PendingSystemSettingsRecovery | null {
  if (!isRecord(value) || !Number.isSafeInteger(actorId) || actorId <= 0
    || value.version !== VERSION || value.actorId !== actorId
    || typeof value.requestId !== 'string' || !REQUEST_ID_PATTERN.test(value.requestId)
    || !isSettingsPatch(value.patch)
    || typeof value.successMessage !== 'string' || value.successMessage.length === 0 || value.successMessage.length > 200) return null;
  return {
    version: VERSION,
    actorId,
    requestId: value.requestId.toLowerCase(),
    patch: value.patch,
    successMessage: value.successMessage,
  };
}

export function readSystemSettingsRecovery(
  actorId: number,
  storage: SystemSettingsRecoveryStorage | null = browserStorage(),
): SystemSettingsRecoveryRead {
  if (!Number.isSafeInteger(actorId) || actorId <= 0) return { state: 'invalid' };
  if (!storage) return { state: 'unavailable' };
  try {
    const raw = storage.getItem(storageKey(actorId));
    if (raw === null) return { state: 'none' };
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return { state: 'invalid' }; }
    const recovery = normalizePendingSystemSettingsRecovery(parsed, actorId);
    return recovery ? { state: 'valid', recovery } : { state: 'invalid' };
  } catch {
    return { state: 'unavailable' };
  }
}

export function persistSystemSettingsRecovery(
  recovery: PendingSystemSettingsRecovery,
  storage: SystemSettingsRecoveryStorage | null = browserStorage(),
) {
  if (!storage) return false;
  const normalized = normalizePendingSystemSettingsRecovery(recovery, recovery.actorId);
  if (!normalized) return false;
  const current = readSystemSettingsRecovery(recovery.actorId, storage);
  if (current.state === 'invalid' || current.state === 'unavailable') return false;
  const serialized = JSON.stringify(normalized);
  if (current.state === 'valid') return JSON.stringify(current.recovery) === serialized;
  try {
    storage.setItem(storageKey(recovery.actorId), serialized);
    if (storage.getItem(storageKey(recovery.actorId)) !== serialized) return false;
    const stored = readSystemSettingsRecovery(recovery.actorId, storage);
    return stored.state === 'valid' && JSON.stringify(stored.recovery) === serialized;
  } catch {
    return false;
  }
}

export function clearSystemSettingsRecovery(
  recovery: PendingSystemSettingsRecovery,
  storage: SystemSettingsRecoveryStorage | null = browserStorage(),
) {
  if (!storage) return false;
  const current = readSystemSettingsRecovery(recovery.actorId, storage);
  if (current.state === 'invalid' || current.state === 'unavailable') return false;
  if (current.state === 'valid' && current.recovery.requestId !== recovery.requestId) return false;
  try {
    storage.removeItem(storageKey(recovery.actorId));
    return storage.getItem(storageKey(recovery.actorId)) === null
      && readSystemSettingsRecovery(recovery.actorId, storage).state === 'none';
  } catch {
    return false;
  }
}

export function createSystemSettingsRecoveryRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues !== 'function') throw new Error('当前浏览器不支持安全的设置恢复编号。');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
