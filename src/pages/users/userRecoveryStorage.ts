type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Persist a recovery marker and verify that the exact payload can be read back before a write request. */
export function persistVerifiedUserRecovery(storage: RecoveryStorage, key: string, recovery: unknown) {
  const serialized = JSON.stringify(recovery);
  if (typeof serialized !== 'string') throw new Error('用户恢复标记无法序列化');

  storage.setItem(key, serialized);
  if (storage.getItem(key) !== serialized) {
    throw new Error('用户恢复标记未能完整保存');
  }
}
