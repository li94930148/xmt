export type PendingDesktopPasswordChangeRecovery = {
  version: 1;
  actorId: number;
  requestId: string;
};

export type DesktopPasswordChangeRecoveryRead =
  | { state: 'none' }
  | { state: 'valid'; recovery: PendingDesktopPasswordChangeRecovery }
  | { state: 'invalid' }
  | { state: 'unavailable' };

export interface DesktopPasswordChangeRecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const VERSION = 1;
const KEY_PREFIX = `xmt:desktop-password-change-recovery:v${VERSION}:actor:`;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storageKey(actorId: number) {
  return `${KEY_PREFIX}${actorId}`;
}

function browserStorage(): DesktopPasswordChangeRecoveryStorage | null {
  if (typeof window === 'undefined') return null;
  try { return window.sessionStorage; } catch { return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizePendingDesktopPasswordChangeRecovery(
  value: unknown,
  actorId: number,
): PendingDesktopPasswordChangeRecovery | null {
  if (!isRecord(value) || !Number.isSafeInteger(actorId) || actorId <= 0
    || Object.keys(value).sort().join(',') !== 'actorId,requestId,version'
    || value.version !== VERSION || value.actorId !== actorId
    || typeof value.requestId !== 'string' || !REQUEST_ID_PATTERN.test(value.requestId)) return null;
  return { version: VERSION, actorId, requestId: value.requestId.toLowerCase() };
}

export function readDesktopPasswordChangeRecovery(
  actorId: number,
  storage: DesktopPasswordChangeRecoveryStorage | null = browserStorage(),
): DesktopPasswordChangeRecoveryRead {
  if (!Number.isSafeInteger(actorId) || actorId <= 0) return { state: 'invalid' };
  if (!storage) return { state: 'unavailable' };
  try {
    const raw = storage.getItem(storageKey(actorId));
    if (raw === null) return { state: 'none' };
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return { state: 'invalid' }; }
    const recovery = normalizePendingDesktopPasswordChangeRecovery(parsed, actorId);
    return recovery ? { state: 'valid', recovery } : { state: 'invalid' };
  } catch {
    return { state: 'unavailable' };
  }
}

export function persistDesktopPasswordChangeRecovery(
  recovery: PendingDesktopPasswordChangeRecovery,
  storage: DesktopPasswordChangeRecoveryStorage | null = browserStorage(),
) {
  if (!storage) return false;
  const normalized = normalizePendingDesktopPasswordChangeRecovery(recovery, recovery.actorId);
  if (!normalized) return false;
  const current = readDesktopPasswordChangeRecovery(recovery.actorId, storage);
  if (current.state === 'invalid' || current.state === 'unavailable') return false;
  const serialized = JSON.stringify(normalized);
  if (current.state === 'valid') return JSON.stringify(current.recovery) === serialized;
  try {
    storage.setItem(storageKey(recovery.actorId), serialized);
    if (storage.getItem(storageKey(recovery.actorId)) !== serialized) return false;
    const stored = readDesktopPasswordChangeRecovery(recovery.actorId, storage);
    return stored.state === 'valid' && JSON.stringify(stored.recovery) === serialized;
  } catch {
    return false;
  }
}

export function clearDesktopPasswordChangeRecovery(
  recovery: PendingDesktopPasswordChangeRecovery,
  storage: DesktopPasswordChangeRecoveryStorage | null = browserStorage(),
) {
  if (!storage) return false;
  const current = readDesktopPasswordChangeRecovery(recovery.actorId, storage);
  if (current.state === 'invalid' || current.state === 'unavailable') return false;
  if (current.state === 'valid' && current.recovery.requestId !== recovery.requestId) return false;
  try {
    storage.removeItem(storageKey(recovery.actorId));
    return storage.getItem(storageKey(recovery.actorId)) === null
      && readDesktopPasswordChangeRecovery(recovery.actorId, storage).state === 'none';
  } catch {
    return false;
  }
}

export function clearDesktopPasswordChangeRecoveryAfterSuccessfulLogin(
  actorId: number,
  storage: DesktopPasswordChangeRecoveryStorage | null = browserStorage(),
) {
  if (!Number.isSafeInteger(actorId) || actorId <= 0 || !storage) return false;
  const current = readDesktopPasswordChangeRecovery(actorId, storage);
  if (current.state === 'none') return true;
  if (current.state === 'valid') return clearDesktopPasswordChangeRecovery(current.recovery, storage);
  if (current.state !== 'invalid') return false;
  try {
    storage.removeItem(storageKey(actorId));
    return storage.getItem(storageKey(actorId)) === null
      && readDesktopPasswordChangeRecovery(actorId, storage).state === 'none';
  } catch {
    return false;
  }
}

export function createDesktopPasswordChangeRecoveryRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues !== 'function') throw new Error('当前浏览器不支持安全的密码恢复编号。');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
