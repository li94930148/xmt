import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';

const tempRoot = mkdtempSync(path.join(tmpdir(), 'xmt-creator-access-'));
process.env.XMT_DB_PATH = path.join(tempRoot, 'creator-access.db');
process.env.JWT_SECRET = 'creator-access-platform-contract-test-secret';
process.env.NODE_ENV = 'test';

const { db, initDatabase } = await import('../api/database/db.js');
const { execute } = await import('../api/database/utils.js');
const { signToken } = await import('../api/utils/jwt.js');
const { default: creatorAgentRoutes } = await import('../api/routes/creator-agent.js');

await initDatabase();

await execute(`UPDATE users SET username='admin-scope-test',role='admin',name='Scope Test Admin',enabled=1 WHERE id=1`);

const tiedUpdatedAt = '2026-07-24 09:00:00';
await execute(`INSERT INTO creator_platform_accounts(id,user_id,platform,platform_uid,account_name,updated_at) VALUES(1,1,'douyin','douyin-old','old douyin',?)`, [tiedUpdatedAt]);
await execute(`INSERT INTO creator_platform_accounts(id,user_id,platform,platform_uid,account_name,updated_at) VALUES(2,1,'xiaohongshu','xiaohongshu-current','xiaohongshu',?)`, [tiedUpdatedAt]);
await execute(`INSERT INTO creator_platform_accounts(id,user_id,platform,platform_uid,account_name,updated_at) VALUES(3,1,'douyin','douyin-current','current douyin',?)`, [tiedUpdatedAt]);

await execute(`INSERT INTO douyin_accounts(id,name,profile_url,douyin_id,user_id,nickname,douyin_uid,fans_count,works_count,last_sync_time,creator_account_id)
  VALUES(3,'current douyin','https://www.douyin.com/user/douyin-current','douyin-current',1,'current douyin','douyin-current',1000,12,?,3)`, [tiedUpdatedAt]);

for (let index = 1; index <= 12; index += 1) {
  await execute(`INSERT INTO douyin_works(account_id,aweme_id,title,play_count,like_count,comment_count,share_count,collect_count)
    VALUES(3,?,?,?,?,?,?,?)`, [`aweme-${index}`, `work-${index}`, 1000 + index, 100 + index, 10 + index, 5 + index, 2 + index]);
}

const app = express();
app.use(express.json());
app.use('/api/creator-agent', creatorAgentRoutes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));

try {
  const address = server.address();
  assert(address && typeof address !== 'string');
  const token = signToken({ userId: 1, username: 'admin-scope-test', role: 'admin' });
  const response = await fetch(`http://127.0.0.1:${address.port}/api/creator-agent/douyin/dashboard`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await response.json() as { account?: { id?: number }; metrics?: { works_count?: number }; message?: string };

  assert.equal(response.status, 200, body.message);
  assert.equal(Number(body.account?.id), 3);
  assert.equal(Number(body.metrics?.works_count), 12);
  console.log('Creator Agent platform scope test passed: douyin dashboard account.id=3, works_count=12');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  db.close();
  try {
    rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    // libsql can retain a Windows file handle briefly; the isolated OS temp directory is safe to leave for cleanup.
  }
}
