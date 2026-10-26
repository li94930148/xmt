export type MobileTopicEditValues = {
  title: string;
  description: string;
};

export type MobileTopicEditRecovery = {
  version: 1;
  userId: number;
  topicId: number;
  baseline: MobileTopicEditValues;
  target: MobileTopicEditValues;
  phase: 'sending' | 'uncertain';
};

function recoveryKey(userId: number | null | undefined, topicId: number) {
  if (!Number.isSafeInteger(userId) || Number(userId) <= 0 || !Number.isSafeInteger(topicId) || topicId <= 0) return null;
  return `xmt:mobile-topic-edit-recovery:v1:user:${userId}:topic:${topicId}`;
}

function isTopicEditValues(value: unknown): value is MobileTopicEditValues {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<MobileTopicEditValues>;
  return typeof record.title === 'string' && typeof record.description === 'string';
}

export function sameMobileTopicEditValues(left: MobileTopicEditValues, right: MobileTopicEditValues) {
  return left.title === right.title && left.description === right.description;
}

export function readMobileTopicEditRecovery(
  userId: number | null | undefined,
  topicId: number,
): MobileTopicEditRecovery | 'invalid' | null {
  const key = recoveryKey(userId, topicId);
  if (!key || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<MobileTopicEditRecovery>;
    if (value.version !== 1 || value.userId !== userId || value.topicId !== topicId
      || !isTopicEditValues(value.baseline) || !isTopicEditValues(value.target)
      || (value.phase !== 'sending' && value.phase !== 'uncertain')) return 'invalid';
    return {
      version: 1,
      userId: Number(value.userId),
      topicId: Number(value.topicId),
      baseline: value.baseline,
      target: value.target,
      phase: value.phase,
    };
  } catch {
    return 'invalid';
  }
}

export function persistMobileTopicEditRecovery(recovery: MobileTopicEditRecovery) {
  const key = recoveryKey(recovery.userId, recovery.topicId);
  if (!key || typeof window === 'undefined') throw new Error('当前账号或选题尚未确认，无法安全保存恢复状态。');
  try {
    window.localStorage.setItem(key, JSON.stringify(recovery));
    const stored = readMobileTopicEditRecovery(recovery.userId, recovery.topicId);
    if (!stored || stored === 'invalid' || stored.userId !== recovery.userId || stored.topicId !== recovery.topicId
      || !sameMobileTopicEditValues(stored.target, recovery.target)
      || !sameMobileTopicEditValues(stored.baseline, recovery.baseline)) {
      throw new Error('选题恢复状态未能完整保存。');
    }
  } catch (error) {
    throw new Error(`本次选题修改未发送：${error instanceof Error ? error.message : '浏览器无法保存恢复状态'}`);
  }
}

export function markMobileTopicEditRecoveryUncertain(recovery: MobileTopicEditRecovery) {
  try {
    persistMobileTopicEditRecovery({ ...recovery, phase: 'uncertain' });
  } catch {
    // The original "sending" marker remains conservative and is still checked read-only on the next visit.
  }
}

export function removeMobileTopicEditRecovery(recovery: Pick<MobileTopicEditRecovery, 'userId' | 'topicId' | 'target'>) {
  const key = recoveryKey(recovery.userId, recovery.topicId);
  if (!key || typeof window === 'undefined') return;
  try {
    const stored = readMobileTopicEditRecovery(recovery.userId, recovery.topicId);
    if (stored && stored !== 'invalid' && sameMobileTopicEditValues(stored.target, recovery.target)) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // A stale marker is safe: reopening the editor only performs a read-only verification.
  }
}

export function clearInvalidMobileTopicEditRecovery(userId: number | null | undefined, topicId: number) {
  const key = recoveryKey(userId, topicId);
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Leave the marker in place if storage is temporarily unavailable.
  }
}
