export const PUBLISHED_ARCHIVE_DELETE_RECOVERY_VERSION = 1;

export type PublishedArchiveDeleteRecovery = {
  version: 1;
  actorId: number;
  archiveId: number;
  requestId: string;
};

export type PublishedArchiveDeleteRecoveryRead =
  | { state: 'none' }
  | { state: 'valid'; recovery: PublishedArchiveDeleteRecovery }
  | { state: 'invalid' }
  | { state: 'unavailable' };

export function publishedArchiveDeleteRecoveryStorageKey(actorId: number) {
  return `xmt:published-archive-delete-pending:v${PUBLISHED_ARCHIVE_DELETE_RECOVERY_VERSION}:user:${actorId}`;
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function normalizePublishedArchiveDeleteRecovery(value: unknown, expectedActorId: number): PublishedArchiveDeleteRecovery | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.version !== PUBLISHED_ARCHIVE_DELETE_RECOVERY_VERSION
    || item.actorId !== expectedActorId
    || !Number.isSafeInteger(expectedActorId)
    || expectedActorId <= 0
    || !Number.isSafeInteger(item.archiveId)
    || Number(item.archiveId) <= 0
    || typeof item.requestId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.requestId)) return null;
  return {
    version: 1,
    actorId: expectedActorId,
    archiveId: Number(item.archiveId),
    requestId: item.requestId.toLowerCase(),
  };
}

export function readPublishedArchiveDeleteRecovery(
  actorId: number,
  storage: Storage | null = browserStorage(),
): PublishedArchiveDeleteRecoveryRead {
  if (!storage) return { state: 'unavailable' };
  try {
    const raw = storage.getItem(publishedArchiveDeleteRecoveryStorageKey(actorId));
    if (!raw) return { state: 'none' };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { state: 'invalid' };
    }
    const recovery = normalizePublishedArchiveDeleteRecovery(parsed, actorId);
    return recovery ? { state: 'valid', recovery } : { state: 'invalid' };
  } catch {
    return { state: 'unavailable' };
  }
}

export function persistPublishedArchiveDeleteRecovery(
  recovery: PublishedArchiveDeleteRecovery,
  storage: Storage | null = browserStorage(),
) {
  if (!storage) throw new Error('当前浏览器无法保存归档删除恢复信息；本次未发送删除请求。');
  const normalized = normalizePublishedArchiveDeleteRecovery(recovery, recovery.actorId);
  if (!normalized) throw new Error('归档删除恢复信息无效；本次未发送删除请求。');
  const existing = readPublishedArchiveDeleteRecovery(recovery.actorId, storage);
  if (existing.state === 'unavailable' || existing.state === 'invalid') {
    throw new Error('已有归档删除恢复信息无法安全读取；本次未发送删除请求。');
  }
  if (existing.state === 'valid' && existing.recovery.requestId !== recovery.requestId) {
    throw new Error('已有归档删除结果待核实；请先完成只读核实。');
  }
  const key = publishedArchiveDeleteRecoveryStorageKey(recovery.actorId);
  const serialized = JSON.stringify(normalized);
  try {
    storage.setItem(key, serialized);
    if (storage.getItem(key) !== serialized) throw new Error('read-back mismatch');
  } catch {
    throw new Error('归档删除恢复信息未能可靠保存；本次未发送删除请求。');
  }
}

export function clearPublishedArchiveDeleteRecovery(
  recovery: PublishedArchiveDeleteRecovery,
  storage: Storage | null = browserStorage(),
) {
  if (!storage) return false;
  try {
    const key = publishedArchiveDeleteRecoveryStorageKey(recovery.actorId);
    const raw = storage.getItem(key);
    if (raw) {
      const current = normalizePublishedArchiveDeleteRecovery(JSON.parse(raw), recovery.actorId);
      if (current?.requestId !== recovery.requestId || current.archiveId !== recovery.archiveId) return false;
      storage.removeItem(key);
    }
    return storage.getItem(key) === null;
  } catch {
    return false;
  }
}

export function createPublishedArchiveDeleteRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues !== 'function') throw new Error('当前浏览器不支持安全的归档删除恢复编号；本次未发送删除请求。');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
