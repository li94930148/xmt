import type { ContentAssetDimensionType } from '@/api/resourceCenter';

export type PendingTopicDimensionMutation =
  | { kind: 'add'; type: ContentAssetDimensionType; value: string }
  | { kind: 'remove'; dimensionId: number; type: ContentAssetDimensionType; value: string };

type StoredPendingTopicDimensionMutation = {
  userId: number;
  topicId: number;
  mutation: PendingTopicDimensionMutation;
};

const pendingDimensionStoragePrefix = 'xmt:content-topic-dimension-pending:v1:user:';
const dimensionTypes = new Set<ContentAssetDimensionType>(['city', 'person', 'project']);

export function pendingTopicDimensionStorageKey(userId: number, topicId: number) {
  return `${pendingDimensionStoragePrefix}${userId}:topic:${topicId}`;
}

export function parsePendingTopicDimensionMutation(value: unknown): PendingTopicDimensionMutation | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (!dimensionTypes.has(candidate.type as ContentAssetDimensionType)
    || typeof candidate.value !== 'string' || !candidate.value.trim() || candidate.value.length > 80) return null;

  if (candidate.kind === 'add') {
    return { kind: 'add', type: candidate.type as ContentAssetDimensionType, value: candidate.value };
  }
  if (candidate.kind === 'remove' && Number.isSafeInteger(candidate.dimensionId) && Number(candidate.dimensionId) > 0) {
    return {
      kind: 'remove',
      dimensionId: Number(candidate.dimensionId),
      type: candidate.type as ContentAssetDimensionType,
      value: candidate.value,
    };
  }
  return null;
}

function readStoredMutation(userId: number | undefined, topicId: number): PendingTopicDimensionMutation | null {
  if (!Number.isSafeInteger(userId) || Number(userId) <= 0 || !Number.isSafeInteger(topicId) || topicId <= 0 || typeof window === 'undefined') return null;
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(pendingTopicDimensionStorageKey(Number(userId), topicId)) || 'null') as Partial<StoredPendingTopicDimensionMutation> | null;
    if (!stored || stored.userId !== userId || stored.topicId !== topicId) return null;
    return parsePendingTopicDimensionMutation(stored.mutation);
  } catch {
    return null;
  }
}

export function readPendingTopicDimensionMutation(userId: number | undefined, topicId: number) {
  return readStoredMutation(userId, topicId);
}

export function loadPendingTopicDimensionMutations(userId: number | undefined): Record<string, PendingTopicDimensionMutation> {
  if (!Number.isSafeInteger(userId) || Number(userId) <= 0 || typeof window === 'undefined') return {};
  const prefix = `${pendingDimensionStoragePrefix}${userId}:topic:`;
  const pending: Record<string, PendingTopicDimensionMutation> = {};
  try {
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const topicId = Number(key.slice(prefix.length));
      const mutation = readStoredMutation(userId, topicId);
      if (mutation) pending[key] = mutation;
    }
  } catch {
    return pending;
  }
  return pending;
}

export function persistPendingTopicDimensionMutation(userId: number | undefined, topicId: number, mutation: PendingTopicDimensionMutation) {
  if (typeof userId !== 'number' || !Number.isSafeInteger(userId) || userId <= 0
    || !Number.isSafeInteger(topicId) || topicId <= 0 || typeof window === 'undefined') {
    throw new Error('当前账号尚未确认，无法安全保存恢复状态；本次没有发送维度操作。');
  }
  if (!parsePendingTopicDimensionMutation(mutation)) {
    throw new Error('维度恢复信息无法确认；本次没有发送维度操作。');
  }
  const key = pendingTopicDimensionStorageKey(userId, topicId);
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ userId, topicId, mutation } satisfies StoredPendingTopicDimensionMutation));
    const stored = JSON.parse(window.sessionStorage.getItem(key) || 'null') as Partial<StoredPendingTopicDimensionMutation> | null;
    if (stored?.userId !== userId || stored.topicId !== topicId || !parsePendingTopicDimensionMutation(stored.mutation)) {
      throw new Error('维度恢复信息未能保存；本次没有发送维度操作。');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('本次没有发送维度操作')) throw error;
    throw new Error('维度恢复信息无法保存；本次没有发送维度操作。');
  }
}

export function clearPendingTopicDimensionMutation(userId: number | undefined, topicId: number) {
  if (!Number.isSafeInteger(userId) || Number(userId) <= 0 || !Number.isSafeInteger(topicId) || topicId <= 0 || typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(pendingTopicDimensionStorageKey(Number(userId), topicId));
  } catch {
    // A stale marker is safe: the next page load will only reconcile it with a read.
  }
}
