import type { LibraryType, UpdateResourceCenterResourceInput } from '../api/resourceCenter';

export const RESOURCE_UPDATE_RECOVERY_VERSION = 1;
export const RESOURCE_UPDATE_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ResourceUpdateRecovery = {
  version: 1;
  actorId: number;
  resourceId: number;
  libraryType: LibraryType;
  requestId: string;
  payload: UpdateResourceCenterResourceInput;
  rejectionStatus?: number;
  rejectionCode?: string;
};

export type ResourceUpdateRecoveryRead =
  | { state: 'none' }
  | { state: 'valid'; recovery: ResourceUpdateRecovery }
  | { state: 'invalid' }
  | { state: 'unavailable' };

const libraryTypes = new Set<LibraryType>(['project', 'content_archive', 'knowledge', 'media']);
const visibilityValues = new Set(['private', 'project', 'team', 'company']);
const stableRejectionStatuses = new Set([400, 401, 403, 422]);

export function resourceUpdateRecoveryStorageKey(actorId: number) {
  return `xmt:resource-update-pending:v${RESOURCE_UPDATE_RECOVERY_VERSION}:actor:${actorId}`;
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

function normalizePayload(value: unknown): UpdateResourceCenterResourceInput | null {
  if (!isRecord(value)
    || typeof value.title !== 'string'
    || !value.title.trim()
    || value.title.length > 200
    || !(value.summary === null || (typeof value.summary === 'string' && value.summary.length <= 1000))
    || !(value.category_id === null || (Number.isSafeInteger(value.category_id) && Number(value.category_id) > 0))
    || typeof value.visibility !== 'string'
    || !visibilityValues.has(value.visibility)
    || !(value.content_text === null || typeof value.content_text === 'string')) return null;
  return {
    title: value.title,
    summary: value.summary as string | null,
    category_id: value.category_id as number | null,
    visibility: value.visibility as UpdateResourceCenterResourceInput['visibility'],
    content_text: value.content_text as string | null,
  };
}

export function normalizeResourceUpdateRecovery(value: unknown, expectedActorId: number): ResourceUpdateRecovery | null {
  if (!isRecord(value)
    || value.version !== RESOURCE_UPDATE_RECOVERY_VERSION
    || value.actorId !== expectedActorId
    || !Number.isSafeInteger(expectedActorId)
    || expectedActorId <= 0
    || !Number.isSafeInteger(value.resourceId)
    || Number(value.resourceId) <= 0
    || typeof value.libraryType !== 'string'
    || !libraryTypes.has(value.libraryType as LibraryType)
    || typeof value.requestId !== 'string'
    || !RESOURCE_UPDATE_REQUEST_ID_PATTERN.test(value.requestId)) return null;
  const payload = normalizePayload(value.payload);
  if (!payload) return null;
  const recovery: ResourceUpdateRecovery = {
    version: 1,
    actorId: expectedActorId,
    resourceId: Number(value.resourceId),
    libraryType: value.libraryType as LibraryType,
    requestId: value.requestId.toLowerCase(),
    payload,
  };
  if (value.rejectionStatus !== undefined) {
    const status = Number(value.rejectionStatus);
    if (!stableRejectionStatuses.has(status)) return null;
    recovery.rejectionStatus = status;
  }
  if (value.rejectionCode !== undefined) {
    if (typeof value.rejectionCode !== 'string' || !/^[A-Z0-9_]{1,80}$/.test(value.rejectionCode)) return null;
    recovery.rejectionCode = value.rejectionCode;
  }
  return recovery;
}

function readFromStorage(actorId: number, storage: Storage | null): ResourceUpdateRecoveryRead {
  if (!storage) return { state: 'unavailable' };
  try {
    const raw = storage.getItem(resourceUpdateRecoveryStorageKey(actorId));
    if (!raw) return { state: 'none' };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { state: 'invalid' };
    }
    const recovery = normalizeResourceUpdateRecovery(parsed, actorId);
    return recovery ? { state: 'valid', recovery } : { state: 'invalid' };
  } catch {
    return { state: 'unavailable' };
  }
}

function readRejectionFallback(actorId: number, storage: Storage | null): ResourceUpdateRecoveryRead {
  if (!storage) return { state: 'unavailable' };
  try {
    const raw = storage.getItem(`${resourceUpdateRecoveryStorageKey(actorId)}:rejection-fallback`);
    if (!raw) return { state: 'none' };
    const recovery = normalizeResourceUpdateRecovery(JSON.parse(raw), actorId);
    return recovery?.rejectionStatus !== undefined ? { state: 'valid', recovery } : { state: 'invalid' };
  } catch {
    return { state: 'unavailable' };
  }
}

export function readResourceUpdateRecovery(
  actorId: number,
  storage: Storage | null = browserSessionStorage(),
  rejectionStorage: Storage | null = browserLocalStorage(),
): ResourceUpdateRecoveryRead {
  const primary = readFromStorage(actorId, storage);
  if (!rejectionStorage) return primary;
  const fallback = readRejectionFallback(actorId, rejectionStorage);
  if (primary.state === 'invalid' || fallback.state === 'invalid') return { state: 'invalid' };
  if (primary.state === 'unavailable' || fallback.state === 'unavailable') return { state: 'unavailable' };
  if (fallback.state === 'none') return primary;
  if (primary.state === 'none') return fallback;
  if (primary.recovery.requestId !== fallback.recovery.requestId
    || primary.recovery.resourceId !== fallback.recovery.resourceId
    || JSON.stringify(primary.recovery.payload) !== JSON.stringify(fallback.recovery.payload)) return { state: 'invalid' };
  return { state: 'valid', recovery: fallback.recovery };
}

export function persistResourceUpdateRecovery(recovery: ResourceUpdateRecovery, storage: Storage | null = browserSessionStorage()) {
  if (!storage) throw new Error('当前浏览器无法保存资料更新恢复信息；本次未提交修改。');
  const normalized = normalizeResourceUpdateRecovery(recovery, recovery.actorId);
  if (!normalized) throw new Error('资料更新恢复信息无效；本次未提交修改。');
  const existing = readResourceUpdateRecovery(recovery.actorId, storage, browserLocalStorage());
  if (existing.state === 'unavailable' || existing.state === 'invalid') {
    throw new Error('已有资料更新恢复信息无法安全读取；本次未提交修改。');
  }
  if (existing.state === 'valid'
    && (existing.recovery.requestId !== recovery.requestId || existing.recovery.resourceId !== recovery.resourceId)) {
    throw new Error('已有资料更新请求尚未核实；请先完成只读核实。');
  }
  const key = resourceUpdateRecoveryStorageKey(recovery.actorId);
  const serialized = JSON.stringify(normalized);
  storage.setItem(key, serialized);
  if (storage.getItem(key) !== serialized) throw new Error('资料更新恢复信息未能可靠保存；本次未提交修改。');
}

export function persistResourceUpdateRejection(
  recovery: ResourceUpdateRecovery,
  storage: Storage | null = browserSessionStorage(),
  rejectionStorage: Storage | null = browserLocalStorage(),
) {
  if (recovery.rejectionStatus === undefined) return false;
  try {
    persistResourceUpdateRecovery(recovery, storage);
    return true;
  } catch {
    if (!rejectionStorage) return false;
    try {
      const existing = readRejectionFallback(recovery.actorId, rejectionStorage);
      if (existing.state === 'unavailable' || existing.state === 'invalid'
        || (existing.state === 'valid' && existing.recovery.requestId !== recovery.requestId)) return false;
      const key = `${resourceUpdateRecoveryStorageKey(recovery.actorId)}:rejection-fallback`;
      const serialized = JSON.stringify(normalizeResourceUpdateRecovery(recovery, recovery.actorId));
      rejectionStorage.setItem(key, serialized);
      return rejectionStorage.getItem(key) === serialized;
    } catch {
      return false;
    }
  }
}

export function clearResourceUpdateRecovery(
  actorId: number,
  requestId: string,
  storage: Storage | null = browserSessionStorage(),
  rejectionStorage: Storage | null = browserLocalStorage(),
) {
  if (!storage || (!rejectionStorage && typeof window !== 'undefined')) return false;
  try {
    const key = resourceUpdateRecoveryStorageKey(actorId);
    const raw = storage.getItem(key);
    if (raw) {
      const current = normalizeResourceUpdateRecovery(JSON.parse(raw), actorId);
      if (current?.requestId !== requestId) return false;
      storage.removeItem(key);
    }
    const fallbackKey = `${key}:rejection-fallback`;
    const fallbackRaw = rejectionStorage?.getItem(fallbackKey) ?? null;
    if (fallbackRaw) {
      const fallback = normalizeResourceUpdateRecovery(JSON.parse(fallbackRaw), actorId);
      if (fallback?.requestId !== requestId || fallback.rejectionStatus === undefined) return false;
      rejectionStorage?.removeItem(fallbackKey);
    }
    return storage.getItem(key) === null && (rejectionStorage?.getItem(fallbackKey) ?? null) === null;
  } catch {
    return false;
  }
}

export function createResourceUpdateRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues !== 'function') throw new Error('当前浏览器不支持安全的更新请求编号；本次未提交修改。');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
