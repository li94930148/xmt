export type MobileProductionWriteOperation = 'editor-autosave' | 'draft-save' | 'review-submit' | 'review-approve';

export type MobileProductionWriteRecovery = {
  version: 1;
  userId: number;
  productionId: number;
  operation: MobileProductionWriteOperation;
  topicId: number;
  previousVersion: string;
  previousStatus: string;
  targetStatus: string;
  previousContentFingerprint: string;
  targetContentFingerprint: string;
  phase: 'uncertain' | 'ready' | 'checking';
  readError: string | null;
};

function recoveryKey(userId: number | null | undefined, productionId: number) {
  if (!Number.isSafeInteger(userId) || Number(userId) <= 0 || !Number.isSafeInteger(productionId) || productionId <= 0) return null;
  return `xmt:mobile-production-write-recovery:v1:user:${userId}:production:${productionId}`;
}

function isFingerprint(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function readMobileProductionWriteRecovery(
  userId: number | null | undefined,
  productionId: number,
): MobileProductionWriteRecovery | 'invalid' | null {
  const key = recoveryKey(userId, productionId);
  if (!key || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<MobileProductionWriteRecovery>;
    const validOperation = value.operation === 'editor-autosave' || value.operation === 'draft-save'
      ? value.previousStatus === value.targetStatus
      : value.operation === 'review-submit'
        ? value.previousStatus === 'draft' && value.targetStatus === 'review'
        : value.operation === 'review-approve'
          && value.previousStatus === 'review' && value.targetStatus === 'approved';
    if (value.version !== 1 || value.userId !== userId || value.productionId !== productionId
      || !Number.isSafeInteger(value.topicId) || Number(value.topicId) <= 0
      || typeof value.previousVersion !== 'string' || !value.previousVersion
      || typeof value.previousStatus !== 'string' || typeof value.targetStatus !== 'string'
      || !validOperation
      || !isFingerprint(value.previousContentFingerprint) || !isFingerprint(value.targetContentFingerprint)) return 'invalid';
    return {
      version: 1,
      userId: Number(value.userId),
      productionId: Number(value.productionId),
      operation: value.operation as MobileProductionWriteOperation,
      topicId: Number(value.topicId),
      previousVersion: value.previousVersion,
      previousStatus: value.previousStatus,
      targetStatus: value.targetStatus,
      previousContentFingerprint: value.previousContentFingerprint,
      targetContentFingerprint: value.targetContentFingerprint,
      // A reload always starts with a read-only server check.
      phase: value.phase === 'ready' ? 'ready' : 'uncertain',
      readError: typeof value.readError === 'string' ? value.readError : null,
    };
  } catch {
    return 'invalid';
  }
}

export function persistMobileProductionWriteRecovery(recovery: MobileProductionWriteRecovery) {
  const key = recoveryKey(recovery.userId, recovery.productionId);
  if (!key || typeof window === 'undefined') throw new Error('当前账号或稿件尚未确认，无法安全保存稿件恢复状态。');
  try {
    window.sessionStorage.setItem(key, JSON.stringify(recovery));
    const stored = readMobileProductionWriteRecovery(recovery.userId, recovery.productionId);
    if (!stored || stored === 'invalid' || stored.productionId !== recovery.productionId
      || stored.operation !== recovery.operation || stored.previousContentFingerprint !== recovery.previousContentFingerprint
      || stored.targetContentFingerprint !== recovery.targetContentFingerprint || stored.targetStatus !== recovery.targetStatus) {
      throw new Error('稿件恢复状态未能完整保存。');
    }
  } catch (error) {
    throw new Error(`本次稿件更新未发送：${error instanceof Error ? error.message : '浏览器无法保存恢复状态'}`);
  }
}

export function removeMobileProductionWriteRecovery(recovery: MobileProductionWriteRecovery) {
  const key = recoveryKey(recovery.userId, recovery.productionId);
  if (!key || typeof window === 'undefined') return;
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(key) || 'null') as Partial<MobileProductionWriteRecovery> | null;
    if (stored?.productionId === recovery.productionId && stored.targetContentFingerprint === recovery.targetContentFingerprint) {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // A stale marker is safe: reopening the editor only performs a read-only verification.
  }
}
