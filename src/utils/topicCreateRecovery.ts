import type { CreatorTopicSuggestionSource } from './creatorTopicSuggestionSource';
import type { TopicDraft } from './topicDraft';

export const TOPIC_CREATE_RECOVERY_VERSION = 1;
export const TOPIC_CREATE_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TopicCreatePayload = {
  title: string;
  description: string;
  outline?: string;
  platform: string;
  deadline: string;
  assignee_id?: number | null;
  creator_suggestion_source?: CreatorTopicSuggestionSource;
};

export type TopicCreateRecovery = {
  version: 1;
  actorId: number;
  requestId: string;
  payload: TopicCreatePayload;
  draftId?: string | null;
  draftSnapshot?: TopicDraft;
  rejectionStatus?: number;
};

export type TopicCreateRecoveryRead =
  | { state: 'none' }
  | { state: 'valid'; recovery: TopicCreateRecovery }
  | { state: 'invalid' }
  | { state: 'unavailable' };

export function topicCreateRecoveryStorageKey(actorId: number) {
  return `xmt:topic-create-pending:v${TOPIC_CREATE_RECOVERY_VERSION}:actor:${actorId}`;
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

function normalizePayload(value: unknown): TopicCreatePayload | null {
  if (!isRecord(value)
    || typeof value.title !== 'string'
    || typeof value.description !== 'string'
    || typeof value.platform !== 'string'
    || typeof value.deadline !== 'string') return null;

  const payload: TopicCreatePayload = {
    title: value.title,
    description: value.description,
    platform: value.platform,
    deadline: value.deadline,
  };
  if (value.outline !== undefined) {
    if (typeof value.outline !== 'string') return null;
    payload.outline = value.outline;
  }
  if (value.assignee_id !== undefined) {
    if (value.assignee_id !== null && (!Number.isSafeInteger(value.assignee_id) || Number(value.assignee_id) <= 0)) return null;
    payload.assignee_id = value.assignee_id as number | null;
  }
  if (value.creator_suggestion_source !== undefined) {
    const source = value.creator_suggestion_source;
    if (!isRecord(source)
      || typeof source.account_uid !== 'string'
      || typeof source.suggestion_id !== 'string'
      || typeof source.evidence_id !== 'string') return null;
    payload.creator_suggestion_source = {
      account_uid: source.account_uid,
      suggestion_id: source.suggestion_id,
      evidence_id: source.evidence_id,
    };
  }
  return payload;
}

function normalizeDraft(value: unknown): TopicDraft | null {
  if (!isRecord(value)) return null;
  const fields: Array<keyof TopicDraft> = [
    'title', 'platform', 'deadline', 'assignee_id', 'projectBackground',
    'targetAudience', 'expectedGoal', 'budget', 'outline',
  ];
  if (!fields.every((field) => typeof value[field] === 'string')) return null;
  return Object.fromEntries(fields.map((field) => [field, value[field]])) as TopicDraft;
}

export function normalizeTopicCreateRecovery(value: unknown, expectedActorId: number): TopicCreateRecovery | null {
  if (!isRecord(value)
    || value.version !== TOPIC_CREATE_RECOVERY_VERSION
    || value.actorId !== expectedActorId
    || typeof value.requestId !== 'string'
    || !TOPIC_CREATE_REQUEST_ID_PATTERN.test(value.requestId)) return null;
  const payload = normalizePayload(value.payload);
  if (!payload) return null;

  const recovery: TopicCreateRecovery = {
    version: TOPIC_CREATE_RECOVERY_VERSION,
    actorId: expectedActorId,
    requestId: value.requestId.toLowerCase(),
    payload,
  };
  if (value.draftId !== undefined) {
    if (value.draftId !== null && typeof value.draftId !== 'string') return null;
    recovery.draftId = value.draftId as string | null;
  }
  if (value.draftSnapshot !== undefined) {
    const draft = normalizeDraft(value.draftSnapshot);
    if (!draft) return null;
    recovery.draftSnapshot = draft;
  }
  if (value.rejectionStatus !== undefined) {
    const status = Number(value.rejectionStatus);
    if (![400, 401, 403, 422].includes(status)) return null;
    recovery.rejectionStatus = status;
  }
  return recovery;
}

function readFromStorage(actorId: number, storage: Storage | null): TopicCreateRecoveryRead {
  if (!Number.isSafeInteger(actorId) || actorId <= 0 || !storage) return { state: 'unavailable' };
  try {
    const raw = storage.getItem(topicCreateRecoveryStorageKey(actorId));
    if (raw === null) return { state: 'none' };
    if (raw.length > 512_000) return { state: 'invalid' };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { state: 'invalid' };
    }
    const recovery = normalizeTopicCreateRecovery(parsed, actorId);
    return recovery ? { state: 'valid', recovery } : { state: 'invalid' };
  } catch {
    return { state: 'unavailable' };
  }
}

function readRejectionFallback(actorId: number, storage: Storage | null): TopicCreateRecoveryRead {
  if (!Number.isSafeInteger(actorId) || actorId <= 0 || !storage) return { state: 'unavailable' };
  try {
    const raw = storage.getItem(`${topicCreateRecoveryStorageKey(actorId)}:rejection-fallback`);
    if (raw === null) return { state: 'none' };
    if (raw.length > 512_000) return { state: 'invalid' };
    const recovery = normalizeTopicCreateRecovery(JSON.parse(raw), actorId);
    return recovery?.rejectionStatus !== undefined ? { state: 'valid', recovery } : { state: 'invalid' };
  } catch {
    return { state: 'unavailable' };
  }
}

export function readTopicCreateRecovery(
  actorId: number,
  storage: Storage | null = browserSessionStorage(),
  rejectionStorage: Storage | null = browserLocalStorage(),
): TopicCreateRecoveryRead {
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

export function persistTopicCreateRecovery(recovery: TopicCreateRecovery, storage: Storage | null = browserSessionStorage()) {
  if (!storage) throw new Error('当前浏览器无法保存创建请求编号；本次未提交选题。');
  const normalized = normalizeTopicCreateRecovery(recovery, recovery.actorId);
  if (!normalized) throw new Error('选题恢复信息无效；本次未提交选题。');

  const key = topicCreateRecoveryStorageKey(recovery.actorId);
  const existing = readTopicCreateRecovery(recovery.actorId, storage);
  if (existing.state === 'unavailable' || existing.state === 'invalid') {
    throw new Error('已有选题创建恢复信息无法安全读取；本次未提交选题。');
  }
  if (existing.state === 'valid' && existing.recovery.requestId !== recovery.requestId) {
    throw new Error('已有选题创建请求尚未核实；请先完成只读核实。');
  }

  const serialized = JSON.stringify(normalized);
  storage.setItem(key, serialized);
  const saved = storage.getItem(key);
  if (saved !== serialized) throw new Error('选题创建恢复信息未能可靠保存；本次未提交选题。');
}

export function persistTopicCreateRejection(
  recovery: TopicCreateRecovery,
  storage: Storage | null = browserSessionStorage(),
  rejectionStorage: Storage | null = browserLocalStorage(),
) {
  if (recovery.rejectionStatus === undefined) return false;
  try {
    persistTopicCreateRecovery(recovery, storage);
    return true;
  } catch {
    if (!rejectionStorage) return false;
    try {
      const existing = readRejectionFallback(recovery.actorId, rejectionStorage);
      if (existing.state === 'unavailable' || existing.state === 'invalid'
        || (existing.state === 'valid' && existing.recovery.requestId !== recovery.requestId)) return false;
      const key = `${topicCreateRecoveryStorageKey(recovery.actorId)}:rejection-fallback`;
      const serialized = JSON.stringify(normalizeTopicCreateRecovery(recovery, recovery.actorId));
      rejectionStorage.setItem(key, serialized);
      return rejectionStorage.getItem(key) === serialized;
    } catch {
      return false;
    }
  }
}

export function clearTopicCreateRecovery(
  actorId: number,
  requestId: string,
  storage: Storage | null = browserSessionStorage(),
  rejectionStorage: Storage | null = browserLocalStorage(),
) {
  if (!storage || (!rejectionStorage && typeof window !== 'undefined')) return false;
  try {
    const key = topicCreateRecoveryStorageKey(actorId);
    const raw = storage.getItem(key);
    if (raw) {
      const current = normalizeTopicCreateRecovery(JSON.parse(raw), actorId);
      if (current?.requestId !== requestId) return false;
      storage.removeItem(key);
    }
    const fallbackKey = `${key}:rejection-fallback`;
    const fallbackRaw = rejectionStorage?.getItem(fallbackKey) ?? null;
    if (fallbackRaw) {
      const fallback = normalizeTopicCreateRecovery(JSON.parse(fallbackRaw), actorId);
      if (fallback?.requestId !== requestId || fallback.rejectionStatus === undefined) return false;
      rejectionStorage?.removeItem(fallbackKey);
    }
    return storage.getItem(key) === null && (rejectionStorage?.getItem(fallbackKey) ?? null) === null;
  } catch {
    return false;
  }
}

export function createTopicCreateRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues !== 'function') throw new Error('当前浏览器不支持安全的创建请求编号；本次未提交选题。');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
