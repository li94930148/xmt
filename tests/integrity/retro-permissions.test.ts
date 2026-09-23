import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-retro-permissions-'));
process.env.XMT_DB_PATH = path.join(directory, 'retro.db');

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { executeInsert, queryOne } = await import('../../api/database/utils.js');
const {
  RetrospectiveServiceError,
  archiveRetrospective,
  createRetroTemplate,
  createRetrospective,
  getRetrospectiveDetail,
  updateRetrospective,
} = await import('../../api/services/retrospectives.js');

await initDatabase();
const directorRow = await queryOne<Record<string, unknown>>("SELECT * FROM users WHERE username = 'director'");
assert(directorRow);
const memberId = await executeInsert(
  `INSERT INTO users (username,password,email,role,name,enabled,force_change_password) VALUES (?,?,?,?,?,?,?)`,
  ['retro-member', 'unused', 'retro-member@example.invalid', 'member', 'Retro Member', 1, 0],
);
const outsiderId = await executeInsert(
  `INSERT INTO users (username,password,email,role,name,enabled,force_change_password) VALUES (?,?,?,?,?,?,?)`,
  ['retro-outsider', 'unused', 'retro-outsider@example.invalid', 'member', 'Retro Outsider', 1, 0],
);
const member = { id: memberId, role: 'member', enabled: true } as never;
const outsider = { id: outsiderId, role: 'member', enabled: true } as never;
const director = { id: Number(directorRow.id), role: 'director', enabled: true } as never;

async function expectForbidden(action: () => Promise<unknown>) {
  await assert.rejects(action, (error: unknown) => error instanceof RetrospectiveServiceError && error.statusCode === 403);
}

try {
  await expectForbidden(() => createRetroTemplate(member, { name: '越权模板', category: 'custom' } as never));
  await expectForbidden(() => createRetrospective(member, { title: '越权复盘', periodStart: '2026-09-01', periodEnd: '2026-09-07', scopeType: 'team' } as never));

  const created = await createRetrospective(director, {
    title: '权限复盘',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-07',
    scopeType: 'team',
    ownerId: Number(directorRow.id),
  } as never);
  const retroId = Number(created.retrospective.id);
  await expectForbidden(() => getRetrospectiveDetail(outsider, retroId));
  await expectForbidden(() => updateRetrospective(member, retroId, { summaryMd: '越权修改' }));
  await expectForbidden(() => archiveRetrospective(member, retroId));
} finally {
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log('Retrospective permission tests passed');
