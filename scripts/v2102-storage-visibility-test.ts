import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';

const tempRoot = mkdtempSync(path.join(tmpdir(), 'xmt-storage-visibility-'));
process.env.XMT_DB_PATH = path.join(tempRoot, 'visibility.db');
process.env.JWT_SECRET = 'v2102-storage-visibility-contract-test-secret';
process.env.NODE_ENV = 'test';

const { db, initDatabase } = await import('../api/database/db.js');
const { execute, queryOne } = await import('../api/database/utils.js');
const { signToken } = await import('../api/utils/jwt.js');
const { default: creatorAgentRoutes } = await import('../api/routes/creator-agent.js');
const { default: douyinRoutes } = await import('../api/routes/douyin.js');

await initDatabase();

for (const user of [
  { id: 101, username: 'storage-admin', role: 'admin' },
  { id: 102, username: 'storage-member', role: 'member' },
  { id: 103, username: 'storage-director', role: 'director' },
]) {
  await execute(`INSERT INTO users(id,username,password,email,role,name,enabled) VALUES(?,?,'test-only','',?,?,1)`, [user.id, user.username, user.role, user.username]);
  await execute(`INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?`, [user.id, user.role]);
}

const syncedAt = '2026-07-24T10:00:00.000Z';
await execute(`INSERT INTO creator_platform_accounts(id,user_id,platform,platform_uid,nickname,account_name,status,updated_at)
  VALUES(301,101,'douyin','storage-public-account','岱下纪事','岱下纪事','active',?)`, [syncedAt]);
await execute(`INSERT INTO creator_account_access(account_id,user_id,access_level) VALUES(301,101,'manage')`);
await execute(`INSERT INTO douyin_accounts(id,name,profile_url,douyin_id,user_id,nickname,douyin_uid,fans_count,works_count,last_sync_time,creator_account_id)
  VALUES(301,'岱下纪事','https://www.douyin.com/user/storage-public-account','storage-public-account',101,'岱下纪事','storage-public-account',5000,45,?,301)`, [syncedAt]);

for (let index = 1; index <= 45; index += 1) {
  const awemeId = `7500000000000000${String(index).padStart(3, '0')}`;
  const publishTime = new Date(Date.UTC(2026, 6, 24, 10, 0, 0) - index * 60_000).toISOString();
  const creatorCover = index === 2 ? 'https://cdn.example.test/creator-cover.jpg' : '';
  const raw = index === 3 ? { video: { origin_cover: { url_list: ['https://cdn.example.test/raw-cover.jpg'] } } } : {};
  await execute(`INSERT INTO creator_content_items(account_id,platform,platform_item_id,title,cover_url,publish_time,duration,status,raw_json)
    VALUES(301,'douyin',?,?,?,?,10,'published',?)`, [awemeId, `真实作品 ${index}`, creatorCover, publishTime, JSON.stringify(raw)]);
  const content = await queryOne<{ id: number }>('SELECT id FROM creator_content_items WHERE account_id=301 AND platform_item_id=?', [awemeId]);
  assert(content);
  const directCover = index === 1 ? 'https://cdn.example.test/douyin-cover.jpg' : '';
  await execute(`INSERT INTO douyin_works(content_id,account_id,aweme_id,title,cover_url,publish_time,play_count,like_count,comment_count,share_count,collect_count,duration,completion_rate,interaction_rate)
    VALUES(?,301,?,?,?,?,?,?,?,?,?,10,.5,.1)`, [content.id, awemeId, `真实作品 ${index}`, directCover, publishTime, 1000 + index, 100 + index, 10 + index, 5 + index, 2 + index]);
}

const app = express();
app.use(express.json());
app.use('/api/creator-agent', creatorAgentRoutes);
app.use('/api/douyin', douyinRoutes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));

try {
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const tokens = {
    admin: signToken({ userId: 101, username: 'storage-admin', role: 'admin' }),
    member: signToken({ userId: 102, username: 'storage-member', role: 'member' }),
    director: signToken({ userId: 103, username: 'storage-director', role: 'director' }),
  };
  const request = (url: string, token: string, init: RequestInit = {}) => fetch(`${base}${url}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) },
  });

  const adminPageResponse = await request('/api/creator-agent/douyin/works?sort=latest&limit=20', tokens.admin);
  const adminPage = await adminPageResponse.json() as { items: Array<{ id: number; cover_url: string }>; next_cursor: string | null; has_more: boolean; page_size: number };
  assert.equal(adminPageResponse.status, 200);
  assert.equal(adminPage.items.length, 20);
  assert.equal(adminPage.page_size, 20);
  assert.equal(adminPage.has_more, true);
  assert(adminPage.next_cursor);
  assert.equal(adminPage.items[0].cover_url, 'https://cdn.example.test/douyin-cover.jpg');
  assert.equal(adminPage.items[1].cover_url, 'https://cdn.example.test/creator-cover.jpg');
  assert.equal(adminPage.items[2].cover_url, 'https://cdn.example.test/raw-cover.jpg');
  assert.equal(adminPage.items[3].cover_url, '', 'empty cover stays empty so ImageFallback can render the placeholder');

  const memberPageResponse = await request('/api/creator-agent/douyin/works?sort=latest&limit=20', tokens.member);
  const memberPage = await memberPageResponse.json() as typeof adminPage;
  assert.equal(memberPageResponse.status, 200, 'member should view the admin-synced public account');
  assert.deepEqual(memberPage.items.map(item => item.id), adminPage.items.map(item => item.id));
  assert.equal(await queryOne('SELECT 1 FROM creator_account_access WHERE account_id=301 AND user_id=102'), null, 'view must not depend on creator_account_access');

  const secondResponse = await request(`/api/creator-agent/douyin/works?sort=latest&limit=20&cursor=${encodeURIComponent(String(memberPage.next_cursor))}`, tokens.member);
  const secondPage = await secondResponse.json() as typeof adminPage;
  assert.equal(secondResponse.status, 200);
  assert.equal(secondPage.items.length, 20);
  assert.equal(new Set([...memberPage.items, ...secondPage.items].map(item => item.id)).size, 40, 'cursor pages must not overlap');
  const thirdResponse = await request(`/api/creator-agent/douyin/works?sort=latest&limit=20&cursor=${encodeURIComponent(String(secondPage.next_cursor))}`, tokens.member);
  const thirdPage = await thirdResponse.json() as typeof adminPage;
  assert.equal(thirdPage.items.length, 5);
  assert.equal(thirdPage.has_more, false);
  assert.equal(thirdPage.next_cursor, null);

  const memberSync = await request('/api/douyin/sync', tokens.member, { method: 'POST', body: JSON.stringify({ account_id: 301 }) });
  assert.equal(memberSync.status, 403, 'member must not sync');
  const memberManage = await request('/api/creator-agent/register', tokens.member, { method: 'POST', body: JSON.stringify({ platform: 'douyin', account_id: 'member-denied', device_id: 'test' }) });
  assert.equal(memberManage.status, 403, 'member must not bind an Agent');

  const directorView = await request('/api/creator-agent/douyin/dashboard', tokens.director);
  assert.equal(directorView.status, 200, 'director should view public standardized data');
  const directorManage = await request('/api/creator-agent/register', tokens.director, { method: 'POST', body: JSON.stringify({ platform: 'douyin', account_id: 'director-manage', device_id: 'visibility-test' }) });
  assert.equal(directorManage.status, 201, 'director should retain management capability');

  console.log('v2.10.2-storage visibility tests passed: shared view scopes; member sync/manage 403; director view/manage; cursor pages 20/20/5; cover priority and empty fallback contract.');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  db.close();
  try { rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
}
