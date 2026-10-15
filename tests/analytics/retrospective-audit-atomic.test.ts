import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-retro-audit-atomic-'));
process.env.XMT_DB_PATH = path.join(directory, 'retro-audit-atomic.db');

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const {
  archiveRetrospective,
  createRetroAction,
  createRetrospective,
  generateRetrospectiveSnapshot,
  publishRetrospective,
  updateRetroAction,
  updateRetrospective,
} = await import('../../api/services/retrospectives.js');

await initDatabase();
const userId = await executeInsert(
  'INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)',
  ['retro-audit-admin', 'unused', 'retro-audit@example.invalid', 'admin', '隔离复盘管理员'],
);
const admin = { id: userId, role: 'admin', enabled: true } as never;

async function rejectAudit(action: string) {
  await execute(`
    CREATE TRIGGER reject_retro_${action}_audit
    BEFORE INSERT ON retro_audit_logs
    WHEN NEW.action = '${action}'
    BEGIN SELECT RAISE(ABORT, 'simulated retrospective audit failure'); END
  `);
}

async function removeAuditRejection(action: string) {
  await execute(`DROP TRIGGER reject_retro_${action}_audit`);
}

async function auditCount(retroId: number, action: string) {
  return Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM retro_audit_logs WHERE retro_id = ? AND action = ?', [retroId, action],
  ))?.count || 0);
}

try {
  await rejectAudit('create');
  await assert.rejects(createRetrospective(admin, {
    title: '原子性创建失败', periodStart: '2026-09-01', periodEnd: '2026-09-07', scopeType: 'team',
  } as never));
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM retrospectives'))?.count || 0), 0, 'failed create leaves no retrospective row');
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM retro_audit_logs WHERE action='create'") )?.count || 0), 0);
  await removeAuditRejection('create');

  const created = await createRetrospective(admin, {
    title: '复盘操作日志原子性测试', periodStart: '2026-09-01', periodEnd: '2026-09-07', scopeType: 'team',
  } as never);
  const retroId = Number(created.retrospective.id);
  assert.equal(await auditCount(retroId, 'create'), 1);

  await rejectAudit('update');
  await assert.rejects(updateRetrospective(admin, retroId, { version: 1, title: '不应保存', summaryMd: '回滚验证' }));
  assert.deepEqual(
    await queryOne<{ title: string; summary_md: string; version: number }>('SELECT title,summary_md,version FROM retrospectives WHERE id=?', [retroId]),
    { title: '复盘操作日志原子性测试', summary_md: '', version: 1 },
    'failed edit rolls back its fields and version',
  );
  assert.equal(await auditCount(retroId, 'update'), 0);
  await removeAuditRejection('update');
  const updated = await updateRetrospective(admin, retroId, { version: 1, title: '复盘操作日志原子性测试', summaryMd: '复盘结论' });
  assert.equal(Number(updated.retrospective.version), 2);
  assert.equal(await auditCount(retroId, 'update'), 1);

  await execute(
    `INSERT INTO retro_metric_snapshots (retro_id,metric_key,metric_name,value_num,captured_at) VALUES(?,?,?,?,?)`,
    [retroId, 'sentinel', '保留原快照', 1, '2026-09-12T00:00:00.000Z'],
  );
  await rejectAudit('snapshot_replace');
  await assert.rejects(generateRetrospectiveSnapshot(admin, retroId, { mode: 'replace' } as never));
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM retro_metric_snapshots WHERE retro_id=?', [retroId]))?.count || 0), 1, 'failed replacement preserves the previous snapshot set');
  assert.equal(await auditCount(retroId, 'snapshot_replace'), 0);
  await removeAuditRejection('snapshot_replace');
  await generateRetrospectiveSnapshot(admin, retroId, { mode: 'replace' } as never);
  assert.equal(await auditCount(retroId, 'snapshot_replace'), 1);

  await rejectAudit('action_create');
  await assert.rejects(createRetroAction(admin, retroId, { title: '不应出现的行动项' } as never));
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM retro_actions WHERE retro_id=?', [retroId]))?.count || 0), 0, 'failed action create leaves no action row');
  assert.equal(await auditCount(retroId, 'action_create'), 0);
  await removeAuditRejection('action_create');
  await createRetroAction(admin, retroId, { title: '待跟进事项', descriptionMd: '初始描述' } as never);
  const action = await queryOne<{ id: number; status: string; result_md: string }>('SELECT id,status,result_md FROM retro_actions WHERE retro_id=?', [retroId]);
  assert(action);

  await rejectAudit('action_update');
  await assert.rejects(updateRetroAction(admin, Number(action.id), { status: 'done', resultMd: '不应保存' } as never));
  assert.deepEqual(
    await queryOne<{ status: string; result_md: string }>('SELECT status,result_md FROM retro_actions WHERE id=?', [action.id]),
    { status: 'todo', result_md: '' },
    'failed action edit rolls back its data',
  );
  assert.equal(await auditCount(retroId, 'action_update'), 0);
  await removeAuditRejection('action_update');
  await updateRetroAction(admin, Number(action.id), { status: 'done', resultMd: '已验证' } as never);
  assert.deepEqual(
    await queryOne<{ status: string; result_md: string }>('SELECT status,result_md FROM retro_actions WHERE id=?', [action.id]),
    { status: 'done', result_md: '已验证' },
  );
  assert.equal(await auditCount(retroId, 'action_update'), 1);

  await rejectAudit('publish');
  await assert.rejects(publishRetrospective(admin, retroId));
  assert.equal((await queryOne<{ status: string; version: number }>('SELECT status,version FROM retrospectives WHERE id=?', [retroId]))?.status, 'draft', 'failed publish keeps the retrospective draft');
  assert.equal(await auditCount(retroId, 'publish'), 0);
  await removeAuditRejection('publish');
  await publishRetrospective(admin, retroId);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM retrospectives WHERE id=?', [retroId]))?.status, 'published');
  assert.equal(await auditCount(retroId, 'publish'), 1);

  await rejectAudit('archive');
  await assert.rejects(archiveRetrospective(admin, retroId));
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM retrospectives WHERE id=?', [retroId]))?.status, 'published', 'failed archive keeps the retrospective published');
  assert.equal(await auditCount(retroId, 'archive'), 0);
  await removeAuditRejection('archive');
  await archiveRetrospective(admin, retroId);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM retrospectives WHERE id=?', [retroId]))?.status, 'archived');
  assert.equal(await auditCount(retroId, 'archive'), 1);

  assert.equal((await queryOne<{ quick_check: string }>('PRAGMA quick_check'))?.quick_check, 'ok');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM pragma_foreign_key_check'))?.count || 0), 0);
  console.log('retrospective mutation and audit transaction tests passed');
} finally {
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
