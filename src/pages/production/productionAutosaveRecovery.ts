export type ProductionAutosaveRecovery = {
  version: 1;
  userId: number;
  productionId: number;
  topicId: number;
  productionVersion: string;
  status: string;
  baselineFingerprint: string;
  targetFingerprint: string;
  requestId: string;
  phase: 'uncertain' | 'ready' | 'checking';
};

export type ProductionAutosaveRecoveryRead =
  | { state: 'none' }
  | { state: 'valid'; recovery: ProductionAutosaveRecovery }
  | { state: 'invalid' }
  | { state: 'unavailable' };

const VERSION = 1;

function storageKey(userId: number, productionId: number) {
  return `xmt:production-autosave-recovery:v${VERSION}:user:${userId}:production:${productionId}`;
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try { return window.sessionStorage; } catch { return null; }
}

export function normalizeProductionAutosaveRecovery(value: unknown, userId: number, productionId: number): ProductionAutosaveRecovery | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.version !== VERSION || item.userId !== userId || item.productionId !== productionId
    || !Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(productionId) || productionId <= 0
    || !Number.isSafeInteger(item.topicId) || Number(item.topicId) <= 0
    || typeof item.productionVersion !== 'string' || item.productionVersion.length === 0
    || typeof item.status !== 'string' || item.status.length === 0
    || typeof item.baselineFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(item.baselineFingerprint)
    || typeof item.targetFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(item.targetFingerprint)
    || typeof item.requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(item.requestId)) return null;
  return {
    version: 1,
    userId,
    productionId,
    topicId: Number(item.topicId),
    productionVersion: item.productionVersion,
    status: item.status,
    baselineFingerprint: item.baselineFingerprint,
    targetFingerprint: item.targetFingerprint,
    requestId: item.requestId.toLowerCase(),
    phase: item.phase === 'ready' ? 'ready' : 'uncertain',
  };
}

export function readProductionAutosaveRecovery(
  userId: number,
  productionId: number,
  storage: Storage | null = browserStorage(),
): ProductionAutosaveRecoveryRead {
  if (!storage) return { state: 'unavailable' };
  try {
    const raw = storage.getItem(storageKey(userId, productionId));
    if (!raw) return { state: 'none' };
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return { state: 'invalid' }; }
    const recovery = normalizeProductionAutosaveRecovery(parsed, userId, productionId);
    return recovery ? { state: 'valid', recovery } : { state: 'invalid' };
  } catch {
    return { state: 'unavailable' };
  }
}

export function persistProductionAutosaveRecovery(
  recovery: ProductionAutosaveRecovery,
  storage: Storage | null = browserStorage(),
) {
  if (!storage) throw new Error('当前浏览器无法保存稿件恢复信息；本次自动保存未发送。');
  const normalized = normalizeProductionAutosaveRecovery(recovery, recovery.userId, recovery.productionId);
  if (!normalized) throw new Error('稿件恢复信息无效；本次自动保存未发送。');
  const current = readProductionAutosaveRecovery(recovery.userId, recovery.productionId, storage);
  if (current.state === 'invalid' || current.state === 'unavailable') {
    throw new Error('已有稿件恢复信息无法安全读取；本次自动保存未发送。');
  }
  if (current.state === 'valid' && current.recovery.requestId !== recovery.requestId) {
    throw new Error('已有稿件保存结果待核实；本次自动保存未发送。');
  }
  const key = storageKey(recovery.userId, recovery.productionId);
  const serialized = JSON.stringify(normalized);
  try {
    storage.setItem(key, serialized);
    if (storage.getItem(key) !== serialized) throw new Error('recovery read-back mismatch');
  } catch {
    throw new Error('稿件恢复信息未能可靠保存；本次自动保存未发送。');
  }
}

export function clearProductionAutosaveRecovery(
  recovery: ProductionAutosaveRecovery,
  storage: Storage | null = browserStorage(),
) {
  if (!storage) return false;
  try {
    const key = storageKey(recovery.userId, recovery.productionId);
    const current = readProductionAutosaveRecovery(recovery.userId, recovery.productionId, storage);
    if (current.state === 'valid' && current.recovery.requestId !== recovery.requestId) return false;
    storage.removeItem(key);
    return storage.getItem(key) === null;
  } catch {
    return false;
  }
}

export function createProductionAutosaveRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues !== 'function') throw new Error('当前浏览器不支持安全的稿件恢复编号；本次自动保存未发送。');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function writeAndVerifyProductionAutosaveDraft(
  key: string | null,
  content: string,
  write: (draftKey: string, draft: string) => boolean,
  read: (draftKey: string) => string | null,
) {
  if (!key || !write(key, content)) return false;
  return read(key) === content;
}
