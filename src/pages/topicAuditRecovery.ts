import type { Topic } from '../types';

export type TopicAuditTarget = 'approved' | 'rejected';

export type PendingTopicAuditWrite = {
  kind: 'write';
  version: 1;
  requestId: string;
  userId: number;
  topicId: number;
  beforeStatus: 'pending';
  beforeAssigneeId: number;
  baselineHistoryId: number;
  target: TopicAuditTarget;
  comment: string;
  assigneeId: number;
  createdAt: number;
};

export type InvalidTopicAuditRecovery = {
  kind: 'invalid';
  userId: number;
  topicId: number;
  reason: 'corrupt' | 'unavailable';
};

export type TopicAuditRecovery = PendingTopicAuditWrite | InvalidTopicAuditRecovery;
export type TopicAuditRecoveryResult = 'applied' | 'unchanged' | 'changed';

export interface TopicAuditRecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const TOPIC_AUDIT_RECOVERY_PREFIX = 'xmt:topic-audit-pending:v1';

export function topicAuditRecoveryKey(userId: number, topicId: number) {
  return `${TOPIC_AUDIT_RECOVERY_PREFIX}:user:${userId}:topic:${topicId}`;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function parseWrite(value: unknown, userId: number, topicId: number): PendingTopicAuditWrite | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<PendingTopicAuditWrite>;
  if (candidate.kind !== 'write' || candidate.version !== 1
    || candidate.userId !== userId || candidate.topicId !== topicId
    || typeof candidate.requestId !== 'string' || candidate.requestId.length === 0 || candidate.requestId.length > 160
    || candidate.beforeStatus !== 'pending'
    || !isNonNegativeInteger(candidate.beforeAssigneeId)
    || !isNonNegativeInteger(candidate.baselineHistoryId)
    || (candidate.target !== 'approved' && candidate.target !== 'rejected')
    || typeof candidate.comment !== 'string' || candidate.comment.length > 2_000
    || !isNonNegativeInteger(candidate.assigneeId)
    || !isPositiveInteger(candidate.createdAt)) return null;
  return {
    kind: 'write',
    version: 1,
    requestId: candidate.requestId,
    userId,
    topicId,
    beforeStatus: 'pending',
    beforeAssigneeId: candidate.beforeAssigneeId,
    baselineHistoryId: candidate.baselineHistoryId,
    target: candidate.target,
    comment: candidate.comment,
    assigneeId: candidate.assigneeId,
    createdAt: candidate.createdAt,
  };
}

export function readTopicAuditRecovery(
  storage: TopicAuditRecoveryStorage,
  userId: number | undefined,
  topicId: number | undefined,
): TopicAuditRecovery | null {
  if (!isPositiveInteger(userId) || !isPositiveInteger(topicId)) return null;
  const key = topicAuditRecoveryKey(userId, topicId);
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return { kind: 'invalid', userId, topicId, reason: 'unavailable' };
  }
  if (raw === null) return null;
  try {
    const write = parseWrite(JSON.parse(raw), userId, topicId);
    return write ?? { kind: 'invalid', userId, topicId, reason: 'corrupt' };
  } catch {
    return { kind: 'invalid', userId, topicId, reason: 'corrupt' };
  }
}

export function persistTopicAuditRecovery(storage: TopicAuditRecoveryStorage, pending: PendingTopicAuditWrite) {
  const key = topicAuditRecoveryKey(pending.userId, pending.topicId);
  storage.setItem(key, JSON.stringify(pending));
  const stored = readTopicAuditRecovery(storage, pending.userId, pending.topicId);
  if (!stored || stored.kind !== 'write' || !isSameTopicAuditRecovery(stored, pending)) {
    throw new Error('审核恢复记录未能完整保存，本次未提交审核。');
  }
}

export function isSameTopicAuditRecovery(left: TopicAuditRecovery | null, right: TopicAuditRecovery) {
  if (!left || left.kind !== right.kind || left.userId !== right.userId || left.topicId !== right.topicId) return false;
  if (left.kind === 'invalid' && right.kind === 'invalid') return left.reason === right.reason;
  if (left.kind !== 'write' || right.kind !== 'write') return false;
  return left.version === right.version
    && left.requestId === right.requestId
    && left.beforeStatus === right.beforeStatus
    && left.beforeAssigneeId === right.beforeAssigneeId
    && left.baselineHistoryId === right.baselineHistoryId
    && left.target === right.target
    && left.comment === right.comment
    && left.assigneeId === right.assigneeId
    && left.createdAt === right.createdAt;
}

export function removeTopicAuditRecovery(storage: TopicAuditRecoveryStorage, pending: PendingTopicAuditWrite) {
  const key = topicAuditRecoveryKey(pending.userId, pending.topicId);
  try {
    const current = readTopicAuditRecovery(storage, pending.userId, pending.topicId);
    if (!isSameTopicAuditRecovery(current, pending)) return false;
    storage.removeItem(key);
    return storage.getItem(key) === null;
  } catch {
    return false;
  }
}

export function topicHistoryHighWatermark(topic: Topic) {
  if (!Array.isArray(topic.history)) return null;
  return topic.history.reduce((max, entry) => (
    Number.isSafeInteger(entry.id) && entry.id > max ? entry.id : max
  ), 0);
}

export function resolveTopicAuditRecovery(
  pending: PendingTopicAuditWrite,
  latest: Topic,
): TopicAuditRecoveryResult {
  const committedAuditExists = Array.isArray(latest.history) && latest.history.some((entry) => (
    Number.isSafeInteger(entry.id)
    && entry.id > pending.baselineHistoryId
    && entry.action === pending.target
    && entry.comment === pending.comment
    && Number(entry.operator_id) === pending.userId
  ));
  if (committedAuditExists) return 'applied';

  const latestHistoryId = topicHistoryHighWatermark(latest);
  if (latest.status === pending.beforeStatus
    && Number(latest.assignee_id) === pending.beforeAssigneeId
    && latestHistoryId === pending.baselineHistoryId) return 'unchanged';

  return 'changed';
}
