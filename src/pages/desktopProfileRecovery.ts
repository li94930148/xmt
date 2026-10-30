export type DesktopProfileFields = { name: string; email: string };
export type DesktopProfileAuthMode = 'legacy' | 'v1-web';

export type PendingDesktopProfileRecovery = {
  version: 1;
  actorId: number;
  authMode: DesktopProfileAuthMode;
  requestId: string;
  before: DesktopProfileFields;
  draft: DesktopProfileFields;
};

export type DesktopProfileRecoveryRead =
  | { state: 'none' }
  | { state: 'valid'; recovery: PendingDesktopProfileRecovery }
  | { state: 'invalid' }
  | { state: 'unavailable' };

export interface DesktopProfileRecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const VERSION = 1;
const KEY_PREFIX = `xmt:desktop-profile-recovery:v${VERSION}:actor:`;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storageKey(actorId: number) {
  return `${KEY_PREFIX}${actorId}`;
}

function browserStorage(): DesktopProfileRecoveryStorage | null {
  if (typeof window === 'undefined') return null;
  try { return window.sessionStorage; } catch { return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function normalizeFields(value: unknown): DesktopProfileFields | null {
  if (!isRecord(value) || !hasExactKeys(value, ['name', 'email'])
    || typeof value.name !== 'string' || value.name.length > 4096
    || typeof value.email !== 'string' || value.email.length > 4096) return null;
  return { name: value.name, email: value.email };
}

function sameFields(left: DesktopProfileFields, right: DesktopProfileFields) {
  return left.name === right.name && left.email === right.email;
}

function sameRecovery(left: PendingDesktopProfileRecovery, right: PendingDesktopProfileRecovery) {
  return left.version === right.version
    && left.actorId === right.actorId
    && left.authMode === right.authMode
    && left.requestId === right.requestId
    && sameFields(left.before, right.before)
    && sameFields(left.draft, right.draft);
}

export function normalizePendingDesktopProfileRecovery(
  value: unknown,
  actorId: number,
): PendingDesktopProfileRecovery | null {
  if (!isRecord(value) || !Number.isSafeInteger(actorId) || actorId <= 0
    || !hasExactKeys(value, ['version', 'actorId', 'authMode', 'requestId', 'before', 'draft'])
    || value.version !== VERSION || value.actorId !== actorId
    || (value.authMode !== 'legacy' && value.authMode !== 'v1-web')
    || typeof value.requestId !== 'string' || !REQUEST_ID_PATTERN.test(value.requestId)) return null;
  const before = normalizeFields(value.before);
  const draft = normalizeFields(value.draft);
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

export function readDesktopProfileRecovery(
  actorId: number,
  storage: DesktopProfileRecoveryStorage | null = browserStorage(),
): DesktopProfileRecoveryRead {
  if (!Number.isSafeInteger(actorId) || actorId <= 0) return { state: 'invalid' };
  if (!storage) return { state: 'unavailable' };
  try {
    const raw = storage.getItem(storageKey(actorId));
    if (raw === null) return { state: 'none' };
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return { state: 'invalid' }; }
    const recovery = normalizePendingDesktopProfileRecovery(parsed, actorId);
    return recovery ? { state: 'valid', recovery } : { state: 'invalid' };
  } catch {
    return { state: 'unavailable' };
  }
}

export function persistDesktopProfileRecovery(
  recovery: PendingDesktopProfileRecovery,
  storage: DesktopProfileRecoveryStorage | null = browserStorage(),
  replaceRequestId?: string,
) {
  if (!storage) return false;
  const normalized = normalizePendingDesktopProfileRecovery(recovery, recovery.actorId);
  if (!normalized) return false;
  const current = readDesktopProfileRecovery(recovery.actorId, storage);
  if (current.state === 'invalid' || current.state === 'unavailable') return false;
  if (current.state === 'valid') {
    if (sameRecovery(current.recovery, normalized)) return true;
    if (!replaceRequestId || current.recovery.requestId !== replaceRequestId) return false;
  } else if (replaceRequestId) {
    return false;
  }

  const serialized = JSON.stringify(normalized);
  try {
    storage.setItem(storageKey(recovery.actorId), serialized);
    if (storage.getItem(storageKey(recovery.actorId)) !== serialized) return false;
    const stored = readDesktopProfileRecovery(recovery.actorId, storage);
    return stored.state === 'valid' && sameRecovery(stored.recovery, normalized);
  } catch {
    return false;
  }
}

export function clearDesktopProfileRecovery(
  recovery: PendingDesktopProfileRecovery,
  storage: DesktopProfileRecoveryStorage | null = browserStorage(),
) {
  if (!storage) return false;
  const current = readDesktopProfileRecovery(recovery.actorId, storage);
  if (current.state === 'invalid' || current.state === 'unavailable') return false;
  if (current.state === 'none') return true;
  if (!sameRecovery(current.recovery, recovery)) return false;
  try {
    storage.removeItem(storageKey(recovery.actorId));
    return storage.getItem(storageKey(recovery.actorId)) === null
      && readDesktopProfileRecovery(recovery.actorId, storage).state === 'none';
  } catch {
    return false;
  }
}

export function createDesktopProfileRecoveryRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues !== 'function') throw new Error('当前浏览器不支持安全的资料恢复编号。');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
