export type TopicResourceRecoveryMutation = 'link' | 'unlink';

export type PendingTopicResourceRecovery = {
  version: 1;
  actorId: number;
  topicId: number;
  requestId: string;
  resource: { id: number; title: string };
  mutation: TopicResourceRecoveryMutation;
};

export type TopicResourceRecoveryRead =
  | { state: 'none' }
  | { state: 'valid'; recoveries: PendingTopicResourceRecovery[] }
  | { state: 'invalid' }
  | { state: 'unavailable' };

export interface TopicResourceRecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const VERSION = 1;
const KEY_PREFIX = `xmt:topic-resource-recovery:v${VERSION}:actor:`;
const MAX_RECOVERIES = 50;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storageKey(actorId: number, topicId: number) {
  return `${KEY_PREFIX}${actorId}:topic:${topicId}`;
}

function browserSessionStorage(): TopicResourceRecoveryStorage | null {
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

function normalizeEntry(value: unknown, actorId: number, topicId: number): PendingTopicResourceRecovery | null {
  if (!isRecord(value) || !hasExactKeys(value, ['version', 'actorId', 'topicId', 'requestId', 'resource', 'mutation'])
    || value.version !== VERSION || value.actorId !== actorId || value.topicId !== topicId
    || typeof value.requestId !== 'string' || !REQUEST_ID_PATTERN.test(value.requestId)
    || (value.mutation !== 'link' && value.mutation !== 'unlink')
    || !isRecord(value.resource) || !hasExactKeys(value.resource, ['id', 'title'])
    || !Number.isSafeInteger(value.resource.id) || Number(value.resource.id) <= 0
    || typeof value.resource.title !== 'string' || !value.resource.title.trim() || value.resource.title.length > 512) return null;

  return {
    version: VERSION,
    actorId,
    topicId,
    requestId: value.requestId.toLowerCase(),
    resource: { id: Number(value.resource.id), title: value.resource.title },
    mutation: value.mutation,
  };
}

function sameRecovery(left: PendingTopicResourceRecovery, right: PendingTopicResourceRecovery) {
  return left.version === right.version
    && left.actorId === right.actorId
    && left.topicId === right.topicId
    && left.requestId === right.requestId
    && left.resource.id === right.resource.id
    && left.resource.title === right.resource.title
    && left.mutation === right.mutation;
}

function sameRecoveries(left: PendingTopicResourceRecovery[], right: PendingTopicResourceRecovery[]) {
  return left.length === right.length && left.every((entry, index) => sameRecovery(entry, right[index]));
}

function normalizeRecoveryList(value: unknown, actorId: number, topicId: number): PendingTopicResourceRecovery[] | null {
  if (!isRecord(value) || !hasExactKeys(value, ['version', 'actorId', 'topicId', 'recoveries'])
    || value.version !== VERSION || value.actorId !== actorId || value.topicId !== topicId
    || !Array.isArray(value.recoveries) || value.recoveries.length < 1 || value.recoveries.length > MAX_RECOVERIES) return null;
  const recoveries: PendingTopicResourceRecovery[] = [];
  const resourceIds = new Set<number>();
  for (const entry of value.recoveries) {
    const normalized = normalizeEntry(entry, actorId, topicId);
    if (!normalized || resourceIds.has(normalized.resource.id)) return null;
    recoveries.push(normalized);
    resourceIds.add(normalized.resource.id);
  }
  return recoveries;
}

export function normalizePendingTopicResourceRecovery(value: unknown, actorId: number, topicId: number) {
  return normalizeEntry(value, actorId, topicId);
}

export function readTopicResourceRecoveries(
  actorId: number,
  topicId: number,
  storage: TopicResourceRecoveryStorage | null = browserSessionStorage(),
): TopicResourceRecoveryRead {
  if (!Number.isSafeInteger(actorId) || actorId <= 0 || !Number.isSafeInteger(topicId) || topicId <= 0) return { state: 'invalid' };
  if (!storage) return { state: 'unavailable' };
  try {
    const raw = storage.getItem(storageKey(actorId, topicId));
    if (raw === null) return { state: 'none' };
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return { state: 'invalid' }; }
    const recoveries = normalizeRecoveryList(parsed, actorId, topicId);
    return recoveries ? { state: 'valid', recoveries } : { state: 'invalid' };
  } catch {
    return { state: 'unavailable' };
  }
}

export function persistTopicResourceRecovery(
  recovery: PendingTopicResourceRecovery,
  storage: TopicResourceRecoveryStorage | null = browserSessionStorage(),
) {
  if (!storage) return false;
  const normalized = normalizeEntry(recovery, recovery.actorId, recovery.topicId);
  if (!normalized) return false;
  const current = readTopicResourceRecoveries(normalized.actorId, normalized.topicId, storage);
  if (current.state === 'invalid' || current.state === 'unavailable') return false;
  const existing = current.state === 'valid' ? current.recoveries : [];
  if (existing.some((entry) => entry.resource.id === normalized.resource.id) || existing.length >= MAX_RECOVERIES) return false;
  const expected = [...existing, normalized];
  const payload = JSON.stringify({ version: VERSION, actorId: normalized.actorId, topicId: normalized.topicId, recoveries: expected });
  try {
    const key = storageKey(normalized.actorId, normalized.topicId);
    storage.setItem(key, payload);
    if (storage.getItem(key) !== payload) return false;
    const stored = readTopicResourceRecoveries(normalized.actorId, normalized.topicId, storage);
    return stored.state === 'valid' && sameRecoveries(stored.recoveries, expected);
  } catch {
    return false;
  }
}

export function clearTopicResourceRecovery(
  recovery: PendingTopicResourceRecovery,
  storage: TopicResourceRecoveryStorage | null = browserSessionStorage(),
) {
  if (!storage) return false;
  const normalized = normalizeEntry(recovery, recovery.actorId, recovery.topicId);
  if (!normalized) return false;
  const current = readTopicResourceRecoveries(normalized.actorId, normalized.topicId, storage);
  if (current.state === 'invalid' || current.state === 'unavailable') return false;
  if (current.state === 'none') return true;
  const ownedEntry = current.recoveries.find((entry) => entry.resource.id === normalized.resource.id);
  if (!ownedEntry || !sameRecovery(ownedEntry, normalized)) return false;
  const remaining = current.recoveries.filter((entry) => entry.resource.id !== normalized.resource.id);
  const key = storageKey(normalized.actorId, normalized.topicId);
  try {
    if (remaining.length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify({ version: VERSION, actorId: normalized.actorId, topicId: normalized.topicId, recoveries: remaining }));

    const verified = readTopicResourceRecoveries(normalized.actorId, normalized.topicId, storage);
    if (remaining.length === 0) return verified.state === 'none';
    return verified.state === 'valid' && sameRecoveries(verified.recoveries, remaining);
  } catch {
    return false;
  }
}

export function createTopicResourceRecoveryRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues !== 'function') throw new Error('当前浏览器不支持安全的资料关联恢复编号。');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
