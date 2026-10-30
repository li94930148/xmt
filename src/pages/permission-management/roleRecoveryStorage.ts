type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Save a role recovery snapshot and verify the exact value before the role API write. */
export function persistVerifiedRoleRecovery(storage: RecoveryStorage, key: string, recovery: unknown) {
  const serialized = JSON.stringify(recovery);
  if (typeof serialized !== 'string') throw new Error('角色恢复记录无法序列化');

  storage.setItem(key, serialized);
  if (storage.getItem(key) !== serialized) throw new Error('角色恢复记录未能完整保存');
}
