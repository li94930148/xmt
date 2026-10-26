import type { LibraryType } from '../api/resourceCenter';

export const RESOURCE_CREATE_RECOVERY_VERSION = 1;
export const RESOURCE_CREATE_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ResourceCreateRecoveryPayload = {
  title: string;
  summary?: string;
  content_text?: string;
  library_type: LibraryType;
  category_id?: number;
  visibility: 'team' | 'company' | 'private';
};

export type ResourceCreateRecovery = {
  version: 1;
  actorId: number;
  requestId: string;
  payload: ResourceCreateRecoveryPayload;
  rejectionStatus?: number;
  rejectionCode?: string;
};

export type ResourceCreateRecoveryRead =
  | { state: 'none' }
  | { state: 'valid'; recovery: ResourceCreateRecovery }
  | { state: 'invalid' }
  | { state: 'unavailable' };

const libraryTypes = new Set<LibraryType>(['project', 'content_archive', 'knowledge', 'media']);
const visibilityValues = new Set(['team', 'company', 'private']);

export function resourceCreateRecoveryStorageKey(actorId: number) {
  return `xmt:resource-create-pending:v${RESOURCE_CREATE_RECOVERY_VERSION}:actor:${actorId}`;
}

function browserSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function browserLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizePayload(value: unknown): ResourceCreateRecoveryPayload | null {
  if (!isRecord(value)
    || typeof value.title !== 'string'
    || !value.title.trim()
    || typeof value.library_type !== 'string'
    || !libraryTypes.has(value.library_type as LibraryType)
    || typeof value.visibility !== 'string'
    || !visibilityValues.has(value.visibility)) return null;

  const payload: ResourceCreateRecoveryPayload = {
    title: value.title,
    library_type: value.library_type as LibraryType,
    visibility: value.visibility as ResourceCreateRecoveryPayload['visibility'],
  };
  if (value.summary !== undefined) {
    if (typeof value.summary !== 'string') return null;
    payload.summary = value.summary;
  }
  if (value.content_text !== undefined) {
    if (typeof value.content_text !== 'string') return null;
    payload.content_text = value.content_text;
  }
  if (value.category_id !== undefined) {
    if (!Number.isSafeInteger(value.category_id) || Number(value.category_id) <= 0) return null;
    payload.category_id = Number(value.category_id);
  }
  return payload;
}

export function normalizeResourceCreateRecovery(value: unknown, expectedActorId: number): ResourceCreateRecovery | null {
  if (!isRecord(value)
    || value.version !== RESOURCE_CREATE_RECOVERY_VERSION
    || value.actorId !== expectedActorId
    || !Number.isSafeInteger(expectedActorId)
    || expectedActorId <= 0
    || typeof value.requestId !== 'string'
    || !RESOURCE_CREATE_REQUEST_ID_PATTERN.test(value.requestId)) return null;
  const payload = normalizePayload(value.payload);
  if (!payload) return null;
  const recovery: ResourceCreateRecovery = {
    version: 1,
    actorId: expectedActorId,
    requestId: value.requestId.toLowerCase(),
    payload,
  };
  if (value.rejectionStatus !== undefined) {
    const status = Number(value.rejectionStatus);
    if (!Number.isInteger(status) || status < 400 || status >= 500 || status === 408 || status === 425 || status === 429) return null;
    recovery.rejectionStatus = status;
  }
  if (value.rejectionCode !== undefined) {
    if (typeof value.rejectionCode !== 'string' || !/^[A-Z0-9_]{1,80}$/.test(value.rejectionCode)) return null;
    recovery.rejectionCode = value.rejectionCode;
  }
  return recovery;
}

function readFromStorage(actorId: number, storage: Storage | null): ResourceCreateRecoveryRead {
  if (!storage) return { state: 'unavailable' };
  try {
    const raw = storage.getItem(resourceCreateRecoveryStorageKey(actorId));
    if (!raw) return { state: 'none' };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { state: 'invalid' };
    }
    const recovery = normalizeResourceCreateRecovery(parsed, actorId);
    return recovery ? { state: 'valid', recovery } : { state: 'invalid' };
  } catch {
    return { state: 'unavailable' };
  }
}

function readRejectionFallback(actorId: number, storage: Storage | null): ResourceCreateRecoveryRead {
  if (!storage) return { state: 'unavailable' };
  try {
    const raw = storage.getItem(`${resourceCreateRecoveryStorageKey(actorId)}:rejection-fallback`);
    if (!raw) return { state: 'none' };
    const recovery = normalizeResourceCreateRecovery(JSON.parse(raw), actorId);
    return recovery?.rejectionStatus !== undefined ? { state: 'valid', recovery } : { state: 'invalid' };
  } catch {
    return { state: 'unavailable' };
  }
}

export function readResourceCreateRecovery(
  actorId: number,
  storage: Storage | null = browserSessionStorage(),
  rejectionStorage: Storage | null = browserLocalStorage(),
): ResourceCreateRecoveryRead {
  const primary = readFromStorage(actorId, storage);
  if (!rejectionStorage) return primary;
  const fallback = readRejectionFallback(actorId, rejectionStorage);
  if (primary.state === 'invalid' || fallback.state === 'invalid') return { state: 'invalid' };
  if (primary.state === 'unavailable' || fallback.state === 'unavailable') return { state: 'unavailable' };
  if (fallback.state === 'none') return primary;
  if (primary.state === 'none') return fallback;
  if (primary.recovery.requestId !== fallback.recovery.requestId
    || JSON.stringify(primary.recovery.payload) !== JSON.stringify(fallback.recovery.payload)) return { state: 'invalid' };
  return { state: 'valid', recovery: fallback.recovery };
}

export function persistResourceCreateRecovery(recovery: ResourceCreateRecovery, storage: Storage | null = browserSessionStorage()) {
  if (!storage) throw new Error('当前浏览器无法保存创建请求编号；本次未提交资料。');
  const normalized = normalizeResourceCreateRecovery(recovery, recovery.actorId);
  if (!normalized) throw new Error('资料恢复信息无效；本次未提交资料。');
  const key = resourceCreateRecoveryStorageKey(recovery.actorId);
  const existing = readResourceCreateRecovery(recovery.actorId, storage);
  if (existing.state === 'unavailable' || existing.state === 'invalid') {
    throw new Error('已有资料创建恢复信息无法安全读取；本次未提交资料。');
  }
  if (existing.state === 'valid' && existing.recovery.requestId !== recovery.requestId) {
    throw new Error('已有资料创建请求尚未核实；请先完成只读核实。');
  }
  const serialized = JSON.stringify(normalized);
  storage.setItem(key, serialized);
  if (storage.getItem(key) !== serialized) throw new Error('资料创建恢复信息未能可靠保存；本次未提交资料。');
}

export function persistResourceCreateRejection(
  recovery: ResourceCreateRecovery,
  storage: Storage | null = browserSessionStorage(),
  rejectionStorage: Storage | null = browserLocalStorage(),
) {
  if (recovery.rejectionStatus === undefined) return false;
  try {
    persistResourceCreateRecovery(recovery, storage);
    return true;
  } catch {
    if (!rejectionStorage) return false;
    try {
      const existing = readRejectionFallback(recovery.actorId, rejectionStorage);
      if (existing.state === 'unavailable' || existing.state === 'invalid'
        || (existing.state === 'valid' && existing.recovery.requestId !== recovery.requestId)) return false;
      const key = `${resourceCreateRecoveryStorageKey(recovery.actorId)}:rejection-fallback`;
      const serialized = JSON.stringify(normalizeResourceCreateRecovery(recovery, recovery.actorId));
      rejectionStorage.setItem(key, serialized);
      return rejectionStorage.getItem(key) === serialized;
    } catch {
      return false;
    }
  }
}

export function clearResourceCreateRecovery(
  actorId: number,
  requestId: string,
  storage: Storage | null = browserSessionStorage(),
  rejectionStorage: Storage | null = browserLocalStorage(),
) {
  if (!storage || (!rejectionStorage && typeof window !== 'undefined')) return false;
  try {
    const key = resourceCreateRecoveryStorageKey(actorId);
    const raw = storage.getItem(key);
    if (raw) {
      const current = normalizeResourceCreateRecovery(JSON.parse(raw), actorId);
      if (current?.requestId !== requestId) return false;
      storage.removeItem(key);
    }
    const fallbackKey = `${key}:rejection-fallback`;
    const fallbackRaw = rejectionStorage?.getItem(fallbackKey) ?? null;
    if (fallbackRaw) {
      const fallback = normalizeResourceCreateRecovery(JSON.parse(fallbackRaw), actorId);
      if (fallback?.requestId !== requestId || fallback.rejectionStatus === undefined) return false;
      rejectionStorage?.removeItem(fallbackKey);
    }
    return storage.getItem(key) === null && (rejectionStorage?.getItem(fallbackKey) ?? null) === null;
  } catch {
    return false;
  }
}

export function createResourceCreateRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues !== 'function') throw new Error('当前浏览器不支持安全的创建请求编号；本次未提交资料。');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
