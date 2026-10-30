export type PendingInspirationPromotion = {
  schemaVersion: 1;
  userId: number;
  inspirationId: number;
  operationId: string;
};

export interface InspirationPromotionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export type InspirationPromotionRecoveryRead = {
  state: 'ready';
  pending: PendingInspirationPromotion[];
  invalidIds: number[];
} | {
  state: 'unavailable';
  pending: [];
  invalidIds: [];
};

const storagePrefix = 'xmt:inspiration-promotion-recovery:v1:';
const operationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function inspirationPromotionRecoveryKey(userId: number, inspirationId: number) {
  return `${storagePrefix}${userId}:${inspirationId}`;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function parsePromotion(raw: string | null, userId: number, inspirationId: number): PendingInspirationPromotion | 'invalid' | null {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingInspirationPromotion>;
    if (value.schemaVersion !== 1 || value.userId !== userId || value.inspirationId !== inspirationId
      || typeof value.operationId !== 'string' || !operationIdPattern.test(value.operationId)) return 'invalid';
    return {
      schemaVersion: 1,
      userId,
      inspirationId,
      operationId: value.operationId.toLowerCase(),
    };
  } catch {
    return 'invalid';
  }
}

export function readInspirationPromotionRecovery(
  storage: InspirationPromotionStorage,
  userId: number,
  inspirationId: number,
): PendingInspirationPromotion | 'invalid' | null {
  if (!isPositiveInteger(userId) || !isPositiveInteger(inspirationId)) return 'invalid';
  try {
    return parsePromotion(storage.getItem(inspirationPromotionRecoveryKey(userId, inspirationId)), userId, inspirationId);
  } catch {
    return 'invalid';
  }
}

export function readAllInspirationPromotionRecoveries(
  storage: InspirationPromotionStorage,
  userId: number,
): InspirationPromotionRecoveryRead {
  if (!isPositiveInteger(userId)) return { state: 'unavailable', pending: [], invalidIds: [] };
  const prefix = `${storagePrefix}${userId}:`;
  const pending: PendingInspirationPromotion[] = [];
  const invalidIds: number[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const inspirationId = Number(key.slice(prefix.length));
      if (!isPositiveInteger(inspirationId)) continue;
      const value = parsePromotion(storage.getItem(key), userId, inspirationId);
      if (value === 'invalid') invalidIds.push(inspirationId);
      else if (value) pending.push(value);
    }
  } catch {
    return { state: 'unavailable', pending: [], invalidIds: [] };
  }
  return { state: 'ready', pending, invalidIds };
}

export function persistInspirationPromotionRecovery(
  storage: InspirationPromotionStorage,
  pending: PendingInspirationPromotion,
): boolean {
  if (pending.schemaVersion !== 1 || !isPositiveInteger(pending.userId) || !isPositiveInteger(pending.inspirationId)
    || !operationIdPattern.test(pending.operationId)) return false;
  const normalized = { ...pending, operationId: pending.operationId.toLowerCase() };
  const key = inspirationPromotionRecoveryKey(normalized.userId, normalized.inspirationId);
  const serialized = JSON.stringify(normalized);
  try {
    storage.setItem(key, serialized);
    const stored = parsePromotion(storage.getItem(key), normalized.userId, normalized.inspirationId);
    return stored !== 'invalid' && stored !== null && stored.operationId === normalized.operationId;
  } catch {
    return false;
  }
}

export function removeInspirationPromotionRecovery(
  storage: InspirationPromotionStorage,
  pending: PendingInspirationPromotion,
): boolean {
  const key = inspirationPromotionRecoveryKey(pending.userId, pending.inspirationId);
  try {
    const current = parsePromotion(storage.getItem(key), pending.userId, pending.inspirationId);
    if (!current || current === 'invalid' || current.operationId !== pending.operationId.toLowerCase()) return false;
    storage.removeItem(key);
    return storage.getItem(key) === null;
  } catch {
    return false;
  }
}
