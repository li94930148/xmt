import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-resource-categories-'));
process.env.XMT_DB_PATH = path.join(directory, 'resource-categories.db');
process.env.JWT_SECRET = 'resource-categories-isolated-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: routes } = await import('../../api/routes/resource-center.js');

await initDatabase();
const adminId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['category-test-admin', 'unused', 'category-admin@example.invalid', 'admin', '隔离分类管理员'],
);
const memberId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['category-test-member', 'unused', 'category-member@example.invalid', 'member', '隔离普通成员'],
);
await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [adminId, 'admin']);
await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [memberId, 'member']);

const app = express();
app.use(express.json());
app.use('/api/resource-center', routes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/resource-center`;
const adminHeaders = { Authorization: `Bearer ${signToken({ userId: adminId })}`, 'Content-Type': 'application/json' };
const memberHeaders = { Authorization: `Bearer ${signToken({ userId: memberId })}`, 'Content-Type': 'application/json' };

async function createCategory(name: string, parentId: number | null = null) {
  const response = await fetch(`${base}/categories`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ library_type: 'knowledge', name, parent_id: parentId }),
  });
  assert.equal(response.status, 201, `category ${name} is created in the isolated database`);
  return Number((await response.json()).id);
}

try {
  const rootId = await createCategory('原始根分类');
  const childId = await createCategory('子分类', rootId);
  const leafId = await createCategory('叶子分类', childId);
  const destinationId = await createCategory('目标分类');
  await execute('UPDATE resource_categories SET path=? WHERE id=?', ['/旧路径缓存', destinationId]);
  const destinationChildId = await createCategory('基于父级创建', destinationId);
  assert.equal((await queryOne<{ path: string }>('SELECT path FROM resource_categories WHERE id=?', [destinationChildId]))?.path, '/目标分类/基于父级创建', 'new child paths derive from parent relationships, not a stale denormalized path');

  const forbidden = await fetch(`${base}/categories/${rootId}`, {
    method: 'PUT', headers: memberHeaders,
    body: JSON.stringify({ name: '不应保存', parent_id: null }),
  });
  assert.equal(forbidden.status, 403, 'category writes remain behind resource:category_manage permission');

  const moved = await fetch(`${base}/categories/${rootId}`, {
    method: 'PUT', headers: adminHeaders,
    body: JSON.stringify({ name: '改名后的根分类', parent_id: destinationId }),
  });
  assert.equal(moved.status, 200);
  assert.equal((await queryOne<{ path: string }>('SELECT path FROM resource_categories WHERE id=?', [rootId]))?.path, '/目标分类/改名后的根分类');
  assert.equal((await queryOne<{ path: string }>('SELECT path FROM resource_categories WHERE id=?', [childId]))?.path, '/目标分类/改名后的根分类/子分类', 'moving or renaming a parent rebuilds descendant paths');
  assert.equal((await queryOne<{ path: string }>('SELECT path FROM resource_categories WHERE id=?', [leafId]))?.path, '/目标分类/改名后的根分类/子分类/叶子分类', 'nested descendant paths are rebuilt recursively');

  const cycle = await fetch(`${base}/categories/${rootId}`, {
    method: 'PUT', headers: adminHeaders,
    body: JSON.stringify({ name: '不应保存', parent_id: leafId }),
  });
  assert.equal(cycle.status, 409, 'relationship-based validation rejects moving a root under its descendant');
  assert.equal((await queryOne<{ name: string }>('SELECT name FROM resource_categories WHERE id=?', [rootId]))?.name, '改名后的根分类', 'rejected cycle leaves the current category unchanged');

  const blockedDelete = await fetch(`${base}/categories/${rootId}`, { method: 'DELETE', headers: adminHeaders });
  assert.equal(blockedDelete.status, 409, 'a category with descendants cannot be deleted');
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resource_categories WHERE id=?', [rootId]))?.count, 1);

  for (const categoryId of [leafId, childId, rootId, destinationChildId, destinationId]) {
    const deleted = await fetch(`${base}/categories/${categoryId}`, { method: 'DELETE', headers: adminHeaders });
    assert.equal(deleted.status, 200, `empty category ${categoryId} can be deleted after its children`);
  }
  assert.equal((await queryOne<{ quick_check: string }>('PRAGMA quick_check'))?.quick_check, 'ok');
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM pragma_foreign_key_check'))?.count, 0);
  console.log('resource category hierarchy and permission tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
