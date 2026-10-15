import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-inspiration-create-'));
process.env.XMT_DB_PATH = path.join(directory, 'inspiration-create.test.db');
process.env.JWT_SECRET = 'inspiration-create-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: inspirationRoutes } = await import('../../api/routes/inspirations.js');

await initDatabase();
const userId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['inspiration-create-qa', 'unused', 'inspiration-create-qa@example.invalid', 'admin', '灵感创建验收'],
);

const app = express();
app.use(express.json());
app.use('/api/inspirations', inspirationRoutes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const endpoint = `http://127.0.0.1:${address.port}/api/inspirations`;
const headers = {
  authorization: `Bearer ${signToken({ userId })}`,
  'content-type': 'application/json',
};

try {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: '已确认的灵感', description: '直接返回保存结果', category: '故事' }),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as {
    id: number;
    message: string;
    inspiration: { id: number; title: string; description: string; category: string; creator_id: number; creator_name: string; votes: number; voted: number; comment_count: number };
  };
  assert.equal(body.message, '灵感创建成功');
  assert.ok(body.id > 0);
  assert.equal(body.inspiration.id, body.id, 'the response identifies the persisted row');
  assert.equal(body.inspiration.title, '已确认的灵感');
  assert.equal(body.inspiration.description, '直接返回保存结果');
  assert.equal(body.inspiration.category, '故事');
  assert.equal(body.inspiration.creator_id, userId);
  assert.equal(body.inspiration.creator_name, '灵感创建验收');
  assert.equal(Number(body.inspiration.votes), 0);
  assert.equal(Number(body.inspiration.voted), 0);
  assert.equal(Number(body.inspiration.comment_count), 0);

  const persisted = await queryOne<{ id: number; title: string }>('SELECT id, title FROM inspirations WHERE id = ?', [body.id]);
  assert.deepEqual(persisted, { id: body.id, title: '已确认的灵感' }, 'the returned record is already persisted');
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log('inspiration-create response tests passed');
