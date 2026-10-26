export type TopicTemplateMutationOperation = 'create' | 'update' | 'delete';

export interface TopicTemplateDraft {
  name: string;
  platform: string;
  description: string;
  template_data: string;
}

export interface TopicTemplateCreatePayload {
  name: string;
  platform: string;
  description: string;
  template_data: string | null;
  is_default: boolean;
}

export type TopicTemplateUpdatePayload = Partial<Omit<TopicTemplateCreatePayload, 'template_data'>> & { template_data?: string };
export type TopicTemplateMutationPayload = TopicTemplateCreatePayload | TopicTemplateUpdatePayload | null;

export interface TopicTemplateMutationRecovery {
  schemaVersion: 1;
  actorId: number;
  operation: TopicTemplateMutationOperation;
  requestId: string;
  requestFingerprint: string;
  targetId: number | null;
  baseFingerprint: string | null;
  payload: TopicTemplateMutationPayload;
  baseline: { id: number; base_fingerprint: string } | null;
  formSnapshot: TopicTemplateDraft | null;
  rejected: boolean;
}

export interface TopicTemplateRecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type TopicTemplateRecoveryRead =
  | { kind: 'none' }
  | { kind: 'ready'; recovery: TopicTemplateMutationRecovery }
  | { kind: 'blocked'; recovery: TopicTemplateMutationRecovery | null; reason: 'unavailable' | 'invalid' | 'conflict' };

export type TopicTemplateMutationStatus = 'processed' | 'not_found' | 'target_missing' | 'conflict';

const KEY_PREFIX = 'xmt:topic-template-mutation:pending:actor:';
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const TEMPLATE_FIELDS = ['name', 'platform', 'description', 'template_data', 'is_default'] as const;

export function topicTemplateMutationRecoveryKey(actorId: number) {
  return `${KEY_PREFIX}${actorId}`;
}

function rejectedFallbackKey(actorId: number) {
  return `${topicTemplateMutationRecoveryKey(actorId)}:rejected`;
}

function normalizeText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function normalizeTopicTemplateData(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return JSON.stringify(value);
  return null;
}

export function normalizeTopicTemplateCreatePayload(draft: TopicTemplateDraft & { is_default?: unknown }): TopicTemplateCreatePayload {
  return {
    name: normalizeText(draft.name, 120),
    platform: normalizeText(draft.platform, 50),
    description: normalizeText(draft.description, 1000),
    template_data: normalizeTopicTemplateData(draft.template_data),
    is_default: Boolean(draft.is_default),
  };
}

export function normalizeTopicTemplateUpdatePayload(draft: Partial<TopicTemplateDraft>): TopicTemplateUpdatePayload {
  const payload: TopicTemplateUpdatePayload = {};
  if (Object.prototype.hasOwnProperty.call(draft, 'name')) payload.name = normalizeText(draft.name, 120);
  if (Object.prototype.hasOwnProperty.call(draft, 'platform')) payload.platform = normalizeText(draft.platform, 50);
  if (Object.prototype.hasOwnProperty.call(draft, 'description')) payload.description = normalizeText(draft.description, 1000);
  if (Object.prototype.hasOwnProperty.call(draft, 'template_data')) payload.template_data = typeof draft.template_data === 'string' ? draft.template_data : '';
  return payload;
}

export async function topicTemplateMutationFingerprint(
  operation: TopicTemplateMutationOperation,
  targetId: number | null,
  baseFingerprint: string | null,
  payload: TopicTemplateMutationPayload,
) {
  const tuple = operation === 'create'
    ? ['create', payload]
    : operation === 'update'
      ? ['update', targetId, baseFingerprint, payload]
      : ['delete', targetId, baseFingerprint];
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(tuple)));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

function isDraft(value: unknown): value is TopicTemplateDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const draft = value as Partial<TopicTemplateDraft>;
  return typeof draft.name === 'string' && typeof draft.platform === 'string'
    && typeof draft.description === 'string' && typeof draft.template_data === 'string';
}

function isPayload(value: unknown, operation: TopicTemplateMutationOperation): value is TopicTemplateMutationPayload {
  if (operation === 'delete') return value === null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  if (Object.keys(payload).some((field) => !TEMPLATE_FIELDS.includes(field as (typeof TEMPLATE_FIELDS)[number]))) return false;
  if (operation === 'create') {
    return typeof payload.name === 'string' && typeof payload.platform === 'string'
      && typeof payload.description === 'string'
      && (typeof payload.template_data === 'string' || payload.template_data === null)
      && typeof payload.is_default === 'boolean'
      && Object.keys(payload).length === TEMPLATE_FIELDS.length;
  }
  return Object.keys(payload).length > 0
    && Object.entries(payload).every(([field, fieldValue]) => {
      if (field === 'name' || field === 'platform' || field === 'description') return typeof fieldValue === 'string';
      if (field === 'template_data') return typeof fieldValue === 'string';
      return field === 'is_default' && typeof fieldValue === 'boolean';
    });
}

function isBaseline(value: unknown): value is { id: number; base_fingerprint: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const baseline = value as Partial<{ id: number; base_fingerprint: string }>;
  return Number.isSafeInteger(baseline.id) && Number(baseline.id) > 0
    && typeof baseline.base_fingerprint === 'string' && SHA256_PATTERN.test(baseline.base_fingerprint);
}

function parseRecovery(raw: string | null, actorId: number): TopicTemplateMutationRecovery | null | 'invalid' {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<TopicTemplateMutationRecovery>;
    const operation = value.operation;
    if (value.schemaVersion !== 1 || value.actorId !== actorId
      || (operation !== 'create' && operation !== 'update' && operation !== 'delete')
      || typeof value.requestId !== 'string' || !REQUEST_ID_PATTERN.test(value.requestId)
      || typeof value.requestFingerprint !== 'string' || !SHA256_PATTERN.test(value.requestFingerprint)
      || typeof value.rejected !== 'boolean'
      || !isPayload(value.payload, operation)) return 'invalid';
    if (operation === 'create') {
      if (value.targetId !== null || value.baseFingerprint !== null || value.baseline !== null || !isDraft(value.formSnapshot)) return 'invalid';
    } else if (!Number.isSafeInteger(value.targetId) || Number(value.targetId) <= 0
      || typeof value.baseFingerprint !== 'string' || !SHA256_PATTERN.test(value.baseFingerprint)
      || !isBaseline(value.baseline) || value.baseline.id !== value.targetId
      || value.baseline.base_fingerprint !== value.baseFingerprint
      || (operation === 'update' && !isDraft(value.formSnapshot))
      || (operation === 'delete' && value.formSnapshot !== null)) return 'invalid';
    return {
      schemaVersion: 1,
      actorId,
      operation,
      requestId: value.requestId.toLowerCase(),
      requestFingerprint: value.requestFingerprint,
      targetId: value.targetId ?? null,
      baseFingerprint: value.baseFingerprint ?? null,
      payload: value.payload,
      baseline: value.baseline ? { id: value.baseline.id, base_fingerprint: value.baseline.base_fingerprint } : null,
      formSnapshot: value.formSnapshot ? { ...value.formSnapshot } : null,
      rejected: value.rejected,
    };
  } catch {
    return 'invalid';
  }
}

export function sameTopicTemplateMutationRecovery(
  left: TopicTemplateMutationRecovery | null,
  right: TopicTemplateMutationRecovery | null,
) {
  if (!left || !right) return left === right;
  return left.actorId === right.actorId
    && left.operation === right.operation
    && left.requestId === right.requestId
    && left.requestFingerprint === right.requestFingerprint
    && left.targetId === right.targetId
    && left.baseFingerprint === right.baseFingerprint
    && JSON.stringify(left.payload) === JSON.stringify(right.payload)
    && JSON.stringify(left.baseline) === JSON.stringify(right.baseline)
    && JSON.stringify(left.formSnapshot) === JSON.stringify(right.formSnapshot);
}

export function readTopicTemplateMutationRecovery(
  actorId: number,
  sessionStorage: TopicTemplateRecoveryStorage,
  localStorage: TopicTemplateRecoveryStorage,
): TopicTemplateRecoveryRead {
  let sessionRaw: string | null;
  let localRaw: string | null;
  let fallbackRaw: string | null;
  try {
    const key = topicTemplateMutationRecoveryKey(actorId);
    sessionRaw = sessionStorage.getItem(key);
    localRaw = localStorage.getItem(key);
    fallbackRaw = localStorage.getItem(rejectedFallbackKey(actorId));
  } catch {
    return { kind: 'blocked', recovery: null, reason: 'unavailable' };
  }
  const session = parseRecovery(sessionRaw, actorId);
  const local = parseRecovery(localRaw, actorId);
  const fallback = parseRecovery(fallbackRaw, actorId);
  if (session === 'invalid' || local === 'invalid' || fallback === 'invalid') return { kind: 'blocked', recovery: null, reason: 'invalid' };
  if (!session && !local && !fallback) return { kind: 'none' };
  if ((session && local && !sameTopicTemplateMutationRecovery(session, local))
    || (fallback && !fallback.rejected)
    || (fallback && session && !sameTopicTemplateMutationRecovery(fallback, session))
    || (fallback && local && !sameTopicTemplateMutationRecovery(fallback, local))) {
    return { kind: 'blocked', recovery: session || local || fallback, reason: 'conflict' };
  }
  const recovery = session || local || fallback;
  if (!recovery) return { kind: 'none' };
  return { kind: 'ready', recovery: { ...recovery, rejected: Boolean(session?.rejected || local?.rejected || fallback?.rejected) } };
}

export function persistTopicTemplateMutationRecovery(
  recovery: TopicTemplateMutationRecovery,
  sessionStorage: TopicTemplateRecoveryStorage,
  localStorage: TopicTemplateRecoveryStorage,
) {
  const key = topicTemplateMutationRecoveryKey(recovery.actorId);
  const serialized = JSON.stringify(recovery);
  try { sessionStorage.setItem(key, serialized); } catch { /* verify below */ }
  try { localStorage.setItem(key, serialized); } catch { /* verify below */ }
  const read = readTopicTemplateMutationRecovery(recovery.actorId, sessionStorage, localStorage);
  return read.kind === 'ready' && !read.recovery.rejected && sameTopicTemplateMutationRecovery(read.recovery, recovery);
}

export function markTopicTemplateMutationRecoveryRejected(
  recovery: TopicTemplateMutationRecovery,
  sessionStorage: TopicTemplateRecoveryStorage,
  localStorage: TopicTemplateRecoveryStorage,
) {
  const rejected = { ...recovery, rejected: true };
  const key = topicTemplateMutationRecoveryKey(recovery.actorId);
  const serialized = JSON.stringify(rejected);
  try { sessionStorage.setItem(key, serialized); } catch { /* local fallback below */ }
  try { localStorage.setItem(key, serialized); } catch { /* verify below */ }
  try { localStorage.setItem(rejectedFallbackKey(recovery.actorId), serialized); } catch { /* verify below */ }
  const read = readTopicTemplateMutationRecovery(recovery.actorId, sessionStorage, localStorage);
  let fallbackStored = false;
  try {
    const fallback = parseRecovery(localStorage.getItem(rejectedFallbackKey(recovery.actorId)), recovery.actorId);
    fallbackStored = Boolean(fallback && fallback !== 'invalid' && fallback.rejected && sameTopicTemplateMutationRecovery(fallback, recovery));
  } catch { fallbackStored = false; }
  return fallbackStored && read.kind === 'ready' && read.recovery.rejected && sameTopicTemplateMutationRecovery(read.recovery, recovery);
}

export function removeTopicTemplateMutationRecovery(
  recovery: TopicTemplateMutationRecovery,
  sessionStorage: TopicTemplateRecoveryStorage,
  localStorage: TopicTemplateRecoveryStorage,
) {
  const before = readTopicTemplateMutationRecovery(recovery.actorId, sessionStorage, localStorage);
  if (before.kind === 'blocked' || (before.kind === 'ready' && !sameTopicTemplateMutationRecovery(before.recovery, recovery))) return false;
  const key = topicTemplateMutationRecoveryKey(recovery.actorId);
  try { sessionStorage.removeItem(key); } catch { /* verify below */ }
  try { localStorage.removeItem(key); } catch { /* verify below */ }
  try {
    if (sessionStorage.getItem(key) !== null || localStorage.getItem(key) !== null) return false;
  } catch { return false; }
  try { localStorage.removeItem(rejectedFallbackKey(recovery.actorId)); } catch { /* verify below */ }
  return readTopicTemplateMutationRecovery(recovery.actorId, sessionStorage, localStorage).kind === 'none';
}
