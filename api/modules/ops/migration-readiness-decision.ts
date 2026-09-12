export type MigrationPolicy = 'SAFE_EXPAND' | 'REVIEW_REQUIRED' | 'BLOCKED_FOR_ROLLBACK';
export type MigrationRecord = { version: string; name: string; checksum: string; status: string };
export type MigrationDefinition = { version: string; name: string; checksum: string };

export function assessMigrationReadiness(migrations: readonly MigrationDefinition[], policies: Readonly<Record<string, MigrationPolicy>>, records: readonly MigrationRecord[]): { decision: 'GO' | 'REVIEW_REQUIRED' | 'NO-GO'; checks: Record<string, { status: 'PASS' | 'FAIL' | 'UNKNOWN'; reason?: string }> } {
  const checks: Record<string, { status: 'PASS' | 'FAIL' | 'UNKNOWN'; reason?: string }> = {};
  const applied = new Map(records.map((record) => [record.version, record]));
  let review = false; let failed = false;
  for (const migration of migrations) {
    const policy = policies[migration.version]; const existing = applied.get(migration.version); const key = `migration_${migration.version}`;
    if (!policy) { failed = true; checks[key] = { status: 'FAIL', reason: '缺少兼容性分类' }; continue; }
    if (existing && (existing.name !== migration.name || existing.checksum !== migration.checksum)) { failed = true; checks[key] = { status: 'FAIL', reason: '已应用迁移状态或校验和不一致' }; continue; }
    if (existing?.status === 'running') { failed = true; checks[key] = { status: 'FAIL', reason: '迁移仍处于运行状态，需先核查上次执行' }; continue; }
    if (existing && existing.status !== 'applied' && existing.status !== 'failed') { failed = true; checks[key] = { status: 'FAIL', reason: '未知迁移状态' }; continue; }
    const pending = !existing || existing.status === 'failed';
    if (pending && policy === 'BLOCKED_FOR_ROLLBACK') { failed = true; checks[key] = { status: 'FAIL', reason: '迁移阻止应用代码回滚' }; continue; }
    if (pending && policy === 'REVIEW_REQUIRED') { review = true; checks[key] = { status: 'UNKNOWN', reason: '迁移需要人工兼容性审查' }; continue; }
    checks[key] = { status: 'PASS' };
  }
  return { decision: failed ? 'NO-GO' : review ? 'REVIEW_REQUIRED' : 'GO', checks };
}
