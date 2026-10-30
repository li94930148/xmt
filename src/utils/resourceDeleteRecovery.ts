import type { LibraryType } from '@/api/resourceCenter';

export const RESOURCE_DELETE_RECOVERY_VERSION = 1;

export type ResourceDeleteRecovery = {
  version: 1;
  actorId: number;
  resourceId: number;
  libraryType: LibraryType;
  requestId: string;
};

export type ResourceDeleteRecoveryRead =
  | { state: 'none' }
  | { state: 'valid'; recovery: ResourceDeleteRecovery }
  | { state: 'invalid' }
  | { state: 'unavailable' };

const libraryTypes = new Set<LibraryType>(['project', 'content_archive', 'knowledge', 'media']);
const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resourceDeleteRecoveryStorageKey(actorId: number) {
  return `xmt:resource-delete-pending:v${RESOURCE_DELETE_RECOVERY_VERSION}:user:${actorId}`;
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function normalizeResourceDeleteRecovery(value: unknown, expectedActorId: number): ResourceDeleteRecovery | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.version !== RESOURCE_DELETE_RECOVERY_VERSION
    || item.actorId !== expectedActorId
    || !Number.isSafeInteger(expectedActorId)
    || expectedActorId <= 0
    || !Number.isSafeInteger(item.resourceId)
    || Number(item.resourceId) <= 0
    || typeof item.libraryType !== 'string'
    || !libraryTypes.has(item.libraryType as LibraryType)
    || typeof item.requestId !== 'string'
    || !requestIdPattern.test(item.requestId)) return null;
  return {
    version: 1,
    actorId: expectedActorId,
    resourceId: Number(item.resourceId),
    libraryType: item.libraryType as LibraryType,
    requestId: item.requestId.toLowerCase(),
  };
}

export function readResourceDeleteRecovery(
  actorId: number,
  storage: Storage | null = browserStorage(),
): ResourceDeleteRecoveryRead {
  if (!storage) return { state: 'unavailable' };
  try {
    const raw = storage.getItem(resourceDeleteRecoveryStorageKey(actorId));
    if (!raw) return { state: 'none' };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { state: 'invalid' };
    }
    const recovery = normalizeResourceDeleteRecovery(parsed, actorId);
    return recovery ? { state: 'valid', recovery } : { state: 'invalid' };
  } catch {
    return { state: 'unavailable' };
  }
}

export function persistResourceDeleteRecovery(
  recovery: ResourceDeleteRecovery,
  storage: Storage | null = browserStorage(),
) {
  if (!storage) throw new Error('当前浏览器无法保存资料删除恢复信息；本次未发送删除请求。');
  const normalized = normalizeResourceDeleteRecovery(recovery, recovery.actorId);
  if (!normalized) throw new Error('资料删除恢复信息无效；本次未发送删除请求。');
  const existing = readResourceDeleteRecovery(recovery.actorId, storage);
  if (existing.state === 'unavailable' || existing.state === 'invalid') {
    throw new Error('已有资料删除恢复信息无法安全读取；本次未发送删除请求。');
  }
  if (existing.state === 'valid' && existing.recovery.requestId !== recovery.requestId) {
    throw new Error('已有资料删除结果待核实；请先完成只读核实。');
  }
  const key = resourceDeleteRecoveryStorageKey(recovery.actorId);
  const serialized = JSON.stringify(normalized);
  try {
    storage.setItem(key, serialized);
    if (storage.getItem(key) !== serialized) throw new Error('read-back mismatch');
  } catch {
    throw new Error('资料删除恢复信息未能可靠保存；本次未发送删除请求。');
  }
}

export function clearResourceDeleteRecovery(
  recovery: ResourceDeleteRecovery,
  storage: Storage | null = browserStorage(),
) {
  if (!storage) return false;
  try {
    const key = resourceDeleteRecoveryStorageKey(recovery.actorId);
    const raw = storage.getItem(key);
    if (raw) {
      const current = normalizeResourceDeleteRecovery(JSON.parse(raw), recovery.actorId);
      if (current?.requestId !== recovery.requestId || current.resourceId !== recovery.resourceId) return false;
      storage.removeItem(key);
    }
    return storage.getItem(key) === null;
  } catch {
    return false;
  }
}

export function createResourceDeleteRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues !== 'function') throw new Error('当前浏览器不支持安全的资料删除恢复编号；本次未发送删除请求。');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
