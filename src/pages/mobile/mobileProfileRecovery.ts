export type MobileProfileFields = { name: string; email: string };

export type PendingMobileProfileRecovery = {
  version: 1;
  actorId: number;
  authMode: 'legacy' | 'v1-web';
  requestId: string;
  before: MobileProfileFields;
  draft: MobileProfileFields;
};

export type MobileProfileRecoveryRead =
  | { state: 'none' }
  | { state: 'valid'; recovery: PendingMobileProfileRecovery }
  | { state: 'invalid' }
  | { state: 'unavailable' };

export interface MobileProfileRecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const VERSION = 1;
const STORAGE_KEY_PREFIX = `xmt:mobile-profile-recovery:v${VERSION}:actor:`;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getStorageKey(actorId: number): string | null {
  return Number.isSafeInteger(actorId) && actorId > 0
    ? `${STORAGE_KEY_PREFIX}${actorId}`
    : null;
}

function browserStorage(): MobileProfileRecoveryStorage | null {
  if (typeof window === 'undefined') return null;
  try { return window.sessionStorage; } catch { return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeProfileFields(value: unknown): MobileProfileFields | null {
  if (!isRecord(value)
    || Object.keys(value).sort().join(',') !== 'email,name'
    || typeof value.name !== 'string'
    || typeof value.email !== 'string') return null;
  return { name: value.name, email: value.email };
}

export function normalizePendingMobileProfileRecovery(
  value: unknown,
  actorId: number,
): PendingMobileProfileRecovery | null {
  if (!isRecord(value) || !Number.isSafeInteger(actorId) || actorId <= 0
    || Object.keys(value).sort().join(',') !== 'actorId,authMode,before,draft,requestId,version'
    || value.version !== VERSION || value.actorId !== actorId
    || (value.authMode !== 'legacy' && value.authMode !== 'v1-web')
    || typeof value.requestId !== 'string' || !REQUEST_ID_PATTERN.test(value.requestId)) return null;
  const before = normalizeProfileFields(value.before);
  const draft = normalizeProfileFields(value.draft);
  if (!before || !draft) return null;
  return {
    version: VERSION,
    actorId,
    authMode: value.authMode,
    requestId: value.requestId.toLowerCase(),
    before,
    draft,
  };
}

export function readMobileProfileRecovery(
  actorId: number,
  storage: MobileProfileRecoveryStorage | null = browserStorage(),
): MobileProfileRecoveryRead {
  const key = getStorageKey(actorId);
  if (!key) return { state: 'invalid' };
  if (!storage) return { state: 'unavailable' };
  try {
    const raw = storage.getItem(key);
    if (raw === null) return { state: 'none' };
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return { state: 'invalid' }; }
    const recovery = normalizePendingMobileProfileRecovery(value, actorId);
    return recovery ? { state: 'valid', recovery } : { state: 'invalid' };
  } catch {
    return { state: 'unavailable' };
  }
}

export function persistMobileProfileRecovery(
  recovery: PendingMobileProfileRecovery,
  expectedPreviousRequestId?: string,
  storage: MobileProfileRecoveryStorage | null = browserStorage(),
): boolean {
  const key = getStorageKey(recovery.actorId);
  if (!key || !storage) return false;
  const normalized = normalizePendingMobileProfileRecovery(recovery, recovery.actorId);
  if (!normalized) return false;
  const current = readMobileProfileRecovery(recovery.actorId, storage);
  if (current.state === 'invalid' || current.state === 'unavailable') return false;
  const serialized = JSON.stringify(normalized);
  if (current.state === 'valid') {
    if (JSON.stringify(current.recovery) === serialized) return true;
    if (!expectedPreviousRequestId || current.recovery.requestId !== expectedPreviousRequestId) return false;
  } else if (expectedPreviousRequestId) {
    return false;
  }

  try {
    storage.setItem(key, serialized);
    if (storage.getItem(key) !== serialized) return false;
    const verified = readMobileProfileRecovery(recovery.actorId, storage);
    return verified.state === 'valid' && JSON.stringify(verified.recovery) === serialized;
  } catch {
    return false;
  }
}

export function clearMobileProfileRecovery(
  recovery: PendingMobileProfileRecovery,
  storage: MobileProfileRecoveryStorage | null = browserStorage(),
): boolean {
  const key = getStorageKey(recovery.actorId);
  if (!key || !storage) return false;
  const current = readMobileProfileRecovery(recovery.actorId, storage);
  if (current.state === 'none') return true;
  if (current.state !== 'valid' || current.recovery.requestId !== recovery.requestId) return false;
  try {
    storage.removeItem(key);
    return storage.getItem(key) === null && readMobileProfileRecovery(recovery.actorId, storage).state === 'none';
  } catch {
    return false;
  }
}

export function createMobileProfileRecoveryRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues !== 'function') throw new Error('当前浏览器不支持安全的个人资料核验编号。');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
