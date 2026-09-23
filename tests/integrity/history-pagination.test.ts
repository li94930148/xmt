import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-history-pages-'));
process.env.XMT_DB_PATH = path.join(directory, 'history.db');
process.env.JWT_SECRET = 'history-pages-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: workflowRouter } = await import('../../api/routes/workflow.js');
await initDatabase();
const userId = await executeInsert("INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES('history-owner','unused','history-owner@example.invalid','member','Owner',1,0)");
const topicId = await executeInsert('INSERT INTO topics(title,creator_id,status) VALUES(?,?,?)', ['History', userId, 'pending']);
const productionId = await executeInsert('INSERT INTO production(topic_id,version,content,status,operator_id) VALUES(?,?,?,?,?)', [topicId, 'v4.0', 'current', 'draft', userId]);
for (let major = 1; major <= 3; major++) {
  await execute('INSERT INTO production_history(production_id,version,content,content_markdown,status,change_type,operator_id) VALUES(?,?,?,?,?,?,?)', [productionId, `v${major}.0`, `old-${major}`, `markdown-${major}`, 'draft', 'major', userId]);
}

const app = express();
app.use('/api/workflow', workflowRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/workflow/production/${productionId}/history`;
const headers = { authorization: `Bearer ${signToken({ userId })}` };
try {
  const first = await fetch(`${base}?page=1&limit=1`, { headers });
  assert.equal(first.status, 200);
  const firstPayload = await first.json() as { data: Array<{ version: string; content: string }>; total: number };
  assert.equal(firstPayload.total, 3);
  assert.deepEqual(firstPayload.data.map((row) => row.version), ['v3.0']);
  assert.equal(firstPayload.data[0].content, 'old-3');
  const second = await fetch(`${base}?page=2&limit=1&include_content=0`, { headers });
  const secondPayload = await second.json() as { data: Array<Record<string, unknown>> };
  assert.equal(secondPayload.data[0].version, 'v2.0');
  assert.equal('content' in secondPayload.data[0], false);
  assert.equal((await fetch(`${base}?limit=101`, { headers })).status, 400);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDatabase();
}
