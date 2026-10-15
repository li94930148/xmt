import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { buildCreatorTopicSuggestions } from '../../api/services/creatorTopicSuggestions.js';
import { canonicalizeDouyinWorks } from '../../api/services/canonicalWorks.js';

const now = new Date('2026-09-28T10:00:00Z');
const works = Array.from({ length: 6 }, (_, index) => ({
  id: index + 1, account_id: 1, aweme_id: `fixture-${index}`, title: index < 3 ? `故事 ${index} #老街` : `普通故事 ${index}`,
  publish_time: '2026-09-15T08:00:00Z', updated_at: '2026-09-28 09:00:00',
  play_count: index < 3 ? 2000 + index * 1000 : 1000, like_count: 0, comment_count: 0, share_count: 0, collect_count: 0, completion_rate: 0,
}));
const build = (rows = works) => buildCreatorTopicSuggestions(rows, 'fixture-account', now);
const ready = build();
assert.equal(ready.status, 'ready');
assert.equal(ready.items[0].median_plays, 3000);
assert.equal(ready.items[0].baseline_median_plays, 1000);
assert.equal(ready.items[0].play_ratio, 3);
assert.equal(ready.items[0].sample_count, 3);
assert.equal(ready.items[0].baseline_samples.length, 3);
assert.notEqual(
  build([...works, { ...works[3], id: 99, aweme_id: 'extra-lower-baseline', play_count: 900 }]).items[0].evidence_id,
  ready.items[0].evidence_id,
  'evidence fingerprints include eligible records beyond the three displayed examples',
);
assert.equal(build(works.slice(1)).status, 'insufficient_data');
assert.equal(build(works.map(work => ({ ...work, play_count: 1000 }))).status, 'no_signal');
assert.equal(build(works.map(work => ({ ...work, updated_at: '2026-09-01T00:00:00Z' }))).eligible_count, 0);
assert.equal(build(works.map(work => ({ ...work, updated_at: 'invalid' }))).items.length, 0);
assert.equal(build(works.map(work => ({ ...work, updated_at: '2027-01-01T00:00:00Z' }))).items.length, 0);
for (const play_count of [NaN, Infinity, -1, 0]) assert.equal(build(works.map(work => ({ ...work, play_count }))).eligible_count, 0);
assert.equal(build(works.map(work => ({ ...work, publish_time: '2026-09-28T00:00:00Z' }))).items.length, 0);
assert.equal(build(works.map(work => ({ ...work, publish_time: work.id <= 3 ? '2026-08-01T00:00:00Z' : work.publish_time }))).items.length, 0, 'different exposure bands cannot be compared');
assert.equal(build(works.map(work => ({ ...work, title: work.title.replace('#老街', '老街') }))).items.length, 0, 'plain words are not inferred tags');
assert.equal(build(works.map(work => ({ ...work, title: work.title.replace('#老街', '为什么？') }))).items[0].label, '问句标题');
assert.equal(build(works.map(work => ({ ...work, title: `${work.title} ${work.id <= 3 ? '#老街 #老街' : ''}` }))).items[0].sample_count, 3, 'one work contributes once per feature');
assert.equal(buildCreatorTopicSuggestions(canonicalizeDouyinWorks([...works, { ...works[0], id: 99 }]), 'fixture-account', now).items[0].sample_count, 3, 'canonical duplicate does not inflate sample size');
assert.deepEqual(build([...works].reverse()), ready, 'deterministic evidence and ranking');
assert(build(works.map(work => ({ ...work, title: work.id <= 3 ? `${work.title} #文化 #生活 #故事 为什么？` : work.title }))).items.length <= 3);

const root = mkdtempSync(path.join(tmpdir(), 'xmt-topic-suggestions-'));
process.env.XMT_DB_PATH = path.join(root, 'fixture.db');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'isolated-creator-topic-suggestions-test';
const { db, initDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { getDouyinDashboard } = await import('../../api/services/douyinDataCenter.js');
const { default: router } = await import('../../api/routes/creator-agent.js');
const { legacyTopicsRouter } = await import('../../api/modules/topics/index.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { clearPermissionCache } = await import('../../api/middleware/permissions.js');
try {
  await initDatabase();
  const owner = (await queryOne<{ id: number }>('SELECT id FROM users ORDER BY id LIMIT 1'))!.id;
  await execute('UPDATE users SET force_change_password=0,enabled=1 WHERE id=?', [owner]);
  const account = await executeInsert("INSERT INTO creator_platform_accounts(user_id,platform,platform_uid,nickname) VALUES(?,'douyin','suggestion-fixture','测试账号')", [owner]);
  const other = await executeInsert("INSERT INTO creator_platform_accounts(user_id,platform,platform_uid,nickname) VALUES(?,'douyin','suggestion-other','其他账号')", [owner]);
  const douyin = await executeInsert("INSERT INTO douyin_accounts(name,profile_url,douyin_uid,creator_account_id,last_sync_time) VALUES('测试账号','','suggestion-fixture',?,CURRENT_TIMESTAMP)", [account]);
  await execute("INSERT INTO douyin_accounts(name,profile_url,douyin_uid,creator_account_id,last_sync_time) VALUES('其他账号','','suggestion-other',?,CURRENT_TIMESTAMP)", [other]);
  const published = new Date(Date.now() - 14 * 86400000).toISOString();
  for (const work of works) await execute('INSERT INTO douyin_works(account_id,aweme_id,title,publish_time,play_count) VALUES(?,?,?,?,?)', [douyin, work.aweme_id, work.title, published, work.play_count]);
  const dashboard = await getDouyinDashboard(account);
  assert.equal(dashboard?.topic_suggestions.status, 'ready');
  assert.equal(dashboard?.topic_suggestions.account_uid, 'suggestion-fixture');
  assert.equal(dashboard?.topic_suggestions.items[0].median_plays, 3000);
  assert.equal((await getDouyinDashboard(other))?.topic_suggestions.eligible_count, 0, 'another scope never borrows this account evidence');
  assert.equal(await getDouyinDashboard(999999), null);
  const app = express(); app.use(express.json()); app.use('/api/creator-agent', router); app.use('/api/topics', legacyTopicsRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const address = server.address(); assert(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/api/creator-agent/douyin/dashboard`;
    assert.equal((await fetch(url)).status, 401);
    const token = signToken({ userId: owner, username: 'admin', role: 'admin' });
    const headers = { authorization: `Bearer ${token}` };
  const response = await fetch(`${url}?account_id=suggestion-fixture`, { headers });
  assert.equal(response.status, 200);
    const dashboardBody = await response.json();
    const suggestionAccountUid = String(dashboardBody.topic_suggestions.account_uid);
    const suggestion = dashboardBody.topic_suggestions.items[0];
    assert.equal(suggestion.median_plays, 3000);
    assert.match(suggestion.evidence_id, /^[a-f0-9]{32}$/);
    assert.deepEqual(suggestion.feedback, { my_outcome: null, adopted_count: 0, not_adopted_count: 0 });
    assert.equal((await fetch(`${url}?account_id=missing-account`, { headers })).status, 404);
    const otherResponse = await fetch(`${url}?account_id=suggestion-other`, { headers });
    assert.equal((await otherResponse.json()).topic_suggestions.items.length, 0);
    const feedbackUrl = `${url.replace('/douyin/dashboard', `/douyin/suggestions/${suggestion.id}/feedback`)}`;
    const feedbackBody = { account_id: 'suggestion-fixture', evidence_id: suggestion.evidence_id, outcome: 'not_adopted' };
    assert.equal((await fetch(feedbackUrl, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(feedbackBody) })).status, 200);
    let feedbackDashboard = await fetch(`${url}?account_id=suggestion-fixture`, { headers }).then(response => response.json());
    assert.deepEqual(feedbackDashboard.topic_suggestions.items[0].feedback, { my_outcome: 'not_adopted', adopted_count: 0, not_adopted_count: 1 });
    assert.equal((await fetch(feedbackUrl, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ ...feedbackBody, outcome: 'adopted' }) })).status, 200);
    feedbackDashboard = await fetch(`${url}?account_id=suggestion-fixture`, { headers }).then(response => response.json());
    assert.deepEqual(feedbackDashboard.topic_suggestions.items[0].feedback, { my_outcome: 'adopted', adopted_count: 1, not_adopted_count: 0 }, 'feedback is idempotently updated for the same account/user/evidence');
    assert.equal((await fetch(feedbackUrl, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ ...feedbackBody, evidence_id: '0'.repeat(32) }) })).status, 409, 'stale or foreign evidence cannot be attributed');
    assert.equal((await fetch(feedbackUrl, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ ...feedbackBody, outcome: 'invented' }) })).status, 400);
    const suggestionTopicResponse = await fetch(`${url.replace('/creator-agent/douyin/dashboard', '/topics')}`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        title: '创作建议提交归因验证',
        description: `【项目背景】\n【创作数据参考 ${suggestionAccountUid}/${suggestion.id}】\n已由用户手动加入。`,
        platform: '抖音', deadline: '',
        creator_suggestion_source: { account_uid: suggestionAccountUid, suggestion_id: suggestion.id, evidence_id: suggestion.evidence_id },
      }),
    });
    const suggestionTopicBody = await suggestionTopicResponse.json();
    assert.equal(suggestionTopicResponse.status, 200, JSON.stringify(suggestionTopicBody));
    const suggestionTopicId = Number(suggestionTopicBody.data.topicId);
    const topicLink = await queryOne<{ topic_id: number; creator_account_id: number; user_id: number; suggestion_id: string; evidence_id: string }>(
      'SELECT topic_id,creator_account_id,user_id,suggestion_id,evidence_id FROM creator_topic_suggestion_topic_links WHERE topic_id=?',
      [suggestionTopicId],
    );
    assert.deepEqual(topicLink, { topic_id: suggestionTopicId, creator_account_id: account, user_id: owner, suggestion_id: suggestion.id, evidence_id: suggestion.evidence_id }, 'submitted topic links to the exact authorized evidence using its topic_id');
    const submittedFeedback = await queryOne<{ outcome: string; sample_count: number; baseline_count: number }>(
      'SELECT outcome,sample_count,baseline_count FROM creator_topic_suggestion_feedback WHERE creator_account_id=? AND user_id=? AND suggestion_id=? AND evidence_id=?',
      [account, owner, suggestion.id, suggestion.evidence_id],
    );
    assert.deepEqual(submittedFeedback, { outcome: 'adopted', sample_count: 3, baseline_count: 3 }, 'formal submission confirms adoption in the same transaction');
    const topicsBeforeStaleAttempt = Number((await queryOne<{ count: number }>('SELECT COUNT(*) count FROM topics'))?.count);
    const staleSourceResponse = await fetch(`${url.replace('/creator-agent/douyin/dashboard', '/topics')}`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        title: '不得关联过期建议', description: `【创作数据参考 ${suggestionAccountUid}/${suggestion.id}】`,
        creator_suggestion_source: { account_uid: suggestionAccountUid, suggestion_id: suggestion.id, evidence_id: '0'.repeat(32) },
      }),
    });
    assert.equal(staleSourceResponse.status, 409, 'stale attribution rejects before creating a topic');
    assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) count FROM topics'))?.count), topicsBeforeStaleAttempt);
    await execute(`CREATE TRIGGER reject_creator_suggestion_topic_link BEFORE INSERT ON creator_topic_suggestion_topic_links
      BEGIN SELECT RAISE(ABORT, 'injected attribution write failure'); END`);
    await fetch(feedbackUrl, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ ...feedbackBody, outcome: 'not_adopted' }) });
    const topicsBeforeInjectedFailure = Number((await queryOne<{ count: number }>('SELECT COUNT(*) count FROM topics'))?.count);
    const failedLinkResponse = await fetch(`${url.replace('/creator-agent/douyin/dashboard', '/topics')}`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        title: '关联失败时不保留半条选题', description: `【创作数据参考 ${suggestionAccountUid}/${suggestion.id}】`,
        creator_suggestion_source: { account_uid: suggestionAccountUid, suggestion_id: suggestion.id, evidence_id: suggestion.evidence_id },
      }),
    });
    assert.equal(failedLinkResponse.status, 500, 'an attribution persistence failure fails the whole submission transaction');
    await execute('DROP TRIGGER reject_creator_suggestion_topic_link');
    assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) count FROM topics'))?.count), topicsBeforeInjectedFailure, 'topic row rolls back with attribution failure');
    assert.equal((await queryOne<{ outcome: string }>(
      'SELECT outcome FROM creator_topic_suggestion_feedback WHERE creator_account_id=? AND user_id=? AND suggestion_id=? AND evidence_id=?',
      [account, owner, suggestion.id, suggestion.evidence_id],
    ))?.outcome, 'not_adopted', 'feedback update rolls back with attribution failure');
    await fetch(feedbackUrl, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ ...feedbackBody, outcome: 'adopted' }) });
    const ordinaryTopicResponse = await fetch(`${url.replace('/creator-agent/douyin/dashboard', '/topics')}`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ title: '普通选题仍可提交', description: '没有创作建议关联', platform: '', deadline: '' }),
    });
    assert.equal(ordinaryTopicResponse.status, 200, 'ordinary topic creation stays independent of creator-data permission');
    const ordinaryTopicId = Number((await ordinaryTopicResponse.json()).data.topicId);
    assert.equal(await queryOne('SELECT topic_id FROM creator_topic_suggestion_topic_links WHERE topic_id=?', [ordinaryTopicId]), null);
    await execute("DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code='creator:data:view')");
    clearPermissionCache();
    const denied = await fetch(`${url}?account_id=suggestion-fixture`, { headers });
    assert.equal(denied.status, 403, 'route permission gate is not bypassed by the suggestion');
    assert(!JSON.stringify(await denied.json()).includes('老街'));
    const deniedTopicSourceResponse = await fetch(`${url.replace('/creator-agent/douyin/dashboard', '/topics')}`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        title: '无创作数据权限不得建立来源归因', description: `【创作数据参考 ${suggestionAccountUid}/${suggestion.id}】`,
        creator_suggestion_source: { account_uid: suggestionAccountUid, suggestion_id: suggestion.id, evidence_id: suggestion.evidence_id },
      }),
    });
    assert.equal(deniedTopicSourceResponse.status, 403, 'source attribution checks creator-data permission independently of topic:create');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  console.log('Creator topic suggestions passed: sample gates, freshness, age bands, deterministic evidence fingerprints, scoped feedback, atomic topic attribution/rollback, stale evidence rejection and ordinary-topic compatibility.');
} finally {
  db.close();
  rmSync(root, { recursive: true, force: true });
}
