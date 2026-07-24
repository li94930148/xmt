import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import bcrypt from 'bcrypt';

const tempRoot = mkdtempSync(path.join(tmpdir(), 'xmt-sync-v2102-'));
process.env.XMT_DB_PATH = path.join(tempRoot, 'contract.db');
process.env.NODE_ENV = 'test';

const { db, initDatabase } = await import('../api/database/db.js');
const { execute, queryAll, queryOne } = await import('../api/database/utils.js');
const { acceptCreatorDataSync } = await import('../api/services/creatorSyncV291.js');

await initDatabase();
const token = 'v2.10.2-contract-test-token';
const tokenHash = await bcrypt.hash(token, 4);
await execute(`INSERT INTO creator_agents(id,user_id,platform,account_id,device_id,token_hash,encryption_key_hash)
  VALUES(101,1,'douyin','contract-account','contract-test',?,?)`, [tokenHash, crypto.createHash('sha256').update(token).digest('hex')]);

const account = { platform_uid: 'contract-account', nickname: '契约测试账号', fans_count: 1234 };
const collectedAt = '2026-07-24T08:00:00.000Z';
let taskSequence = 0;

function envelope(payload: Record<string, unknown>) {
  const key = crypto.createHash('sha256').update(token).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const body: Record<string, unknown> = {
    agent_id: 101,
    platform: 'douyin',
    account_id: 'contract-account',
    collected_at: collectedAt,
    data: { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') },
  };
  const canonical = [body.agent_id, body.platform, body.account_id, body.collected_at, JSON.stringify(body.data)].join('\n');
  body.signature = crypto.createHmac('sha256', token).update(canonical).digest('hex');
  return body;
}

async function sync(payload: Record<string, unknown>) {
  taskSequence += 1;
  const syncTask = payload.sync_task && typeof payload.sync_task === 'object' ? payload.sync_task as Record<string, unknown> : {};
  return acceptCreatorDataSync(envelope({ ...payload, sync_task: { task_id: `contract-task-${taskSequence}`, ...syncTask } }), `Bearer ${token}`);
}

const legacy = await sync({
  platform: 'douyin',
  account,
  contents: [{ platform_item_id: 'legacy-aweme', aweme_id: 'legacy-aweme', title: '旧契约作品', statistics: { play_count: 10, digg_count: 1 } }],
  metrics: [{ platform_item_id: 'legacy-aweme', play_count: 10, like_count: 1 }],
});
assert.equal(legacy.success, true, 'v2.10.1 payload should remain compatible');

const works = Array.from({ length: 12 }, (_, index) => ({
  aweme_id: `73900000000000000${String(index).padStart(2, '0')}`,
  title: `标准作品 ${index + 1}`,
  cover_url: `https://example.invalid/${index}.jpg`,
  publish_time: `2026-07-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
  video_url: '',
  metrics: { play_count: 1000 + index, like_count: 100 + index, comment_count: 10, share_count: 5, collect_count: 2, completion_rate: 50 },
}));
const currentPayload = {
  contract_version: '2.10.2',
  snapshot_id: 'snapshot-12-works',
  collection_mode: 'full_snapshot',
  platform: 'douyin',
  account,
  contents: works,
  sync_task: { collection_stats: { raw_response_count: 3, aweme_candidate_count: 12, normalized_success_count: 12, rejected_count: 0, rejected_reasons: {} } },
};
for (let attempt = 0; attempt < 10; attempt += 1) {
  const result = await sync(currentPayload);
  assert.equal(result.works, 12);
  assert.equal(result.duplicate, attempt > 0);
}

const douyinAccount = await queryOne<{ id: number }>('SELECT id FROM douyin_accounts WHERE douyin_uid=?', ['contract-account']);
assert(douyinAccount);
const currentCount = await queryOne<{ count: number }>('SELECT COUNT(*) count FROM douyin_works WHERE account_id=? AND aweme_id LIKE ?', [douyinAccount.id, '739%']);
assert.equal(Number(currentCount?.count), 12, '12 works must remain 12 after ten identical snapshots');
const snapshotLogCount = await queryOne<{ count: number }>('SELECT COUNT(*) count FROM douyin_sync_logs WHERE account_id=? AND snapshot_id=?', [douyinAccount.id, 'snapshot-12-works']);
assert.equal(Number(snapshotLogCount?.count), 1, 'snapshot_id must be idempotent');

await sync({ ...currentPayload, snapshot_id: 'snapshot-invalid-number', contents: [{ ...works[0], aweme_id: 739000000000000001 }] });
const invalidLog = await queryOne<{ summary_json: string }>('SELECT summary_json FROM douyin_sync_logs WHERE account_id=? AND snapshot_id=?', [douyinAccount.id, 'snapshot-invalid-number']);
assert.equal(JSON.parse(String(invalidLog?.summary_json)).rejected_reasons.invalid_id_type, 1);

await sync({
  ...currentPayload,
  snapshot_id: 'snapshot-mixed-nonworks',
  contents: [works[0], { music_id: 'music-1', title: 'music', metrics: {} }, { module: 'manifest', title: 'module', metrics: {} }],
  raw_records: [{ response_json: { aweme_list: [{ ...works[1], aweme_id: 'raw-recursive-work' }] } }],
});
const mixedLog = await queryOne<{ summary_json: string }>('SELECT summary_json FROM douyin_sync_logs WHERE account_id=? AND snapshot_id=?', [douyinAccount.id, 'snapshot-mixed-nonworks']);
const mixedSummary = JSON.parse(String(mixedLog?.summary_json));
assert.equal(mixedSummary.normalized_success_count, 1);
assert.equal(mixedSummary.rejected_reasons.missing_aweme_id, 2);

const creatorIds = await queryAll<{ platform_item_id: string }>(`SELECT platform_item_id FROM creator_content_items WHERE account_id=(SELECT creator_account_id FROM douyin_accounts WHERE id=?) ORDER BY platform_item_id`, [douyinAccount.id]);
const douyinIds = await queryAll<{ aweme_id: string; content_id: number | null }>('SELECT aweme_id,content_id FROM douyin_works WHERE account_id=? ORDER BY aweme_id', [douyinAccount.id]);
assert.deepEqual(creatorIds.map(row => String(row.platform_item_id)), douyinIds.map(row => String(row.aweme_id)), 'creator_content_items and douyin_works ID sets must match');
assert(douyinIds.filter(row => String(row.aweme_id).startsWith('739')).every(row => Number(row.content_id) > 0), 'v2.10.2 works must link content_id');
assert(!douyinIds.some(row => ['music-1', 'manifest'].includes(String(row.aweme_id))));
assert(!douyinIds.some(row => String(row.aweme_id) === 'raw-recursive-work'), 'v2.10.2 must not recurse raw_records');

console.log('v2.10.2 server contract tests passed: legacy compatible; 12/12 normalized; snapshot idempotent x10; numeric IDs and non-work objects rejected; dual-table IDs consistent.');

db.close();
try { rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
