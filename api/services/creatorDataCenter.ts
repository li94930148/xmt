import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { queryAll, queryOne, runInTransaction } from '../database/utils.js';

type AgentRow = { id: number; user_id: number; platform: string; account_id: string; token_hash: string };
type JsonRecord = Record<string, unknown>;
type UnifiedPayload = {
  platform?: string;
  account?: JsonRecord;
  contents?: JsonRecord[];
  metrics?: JsonRecord[];
  trends?: JsonRecord[];
  account_metrics?: JsonRecord;
  fans?: JsonRecord;
  raw_records?: JsonRecord[];
};

const encryptionKey = (token: string) => crypto.createHash('sha256').update(token).digest();
const canonical = (body: JsonRecord) => [body.agent_id, body.platform, body.account_id, body.collected_at, JSON.stringify(body.data)].join('\n');
const json = (value: unknown) => JSON.stringify(value ?? {});
const text = (value: unknown, fallback = '') => value == null ? fallback : String(value);
const number = (value: unknown, fallback = 0) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const array = (value: unknown, max: number): JsonRecord[] => Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object').slice(0, max) : [];

async function authenticateAndDecrypt(body: JsonRecord, authorization?: string) {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const agent = await queryOne<AgentRow>('SELECT id,user_id,platform,account_id,token_hash FROM creator_agents WHERE id=?', [Number(body.agent_id)]);
  if (!token || !agent || !(await bcrypt.compare(token, agent.token_hash))) {
    throw Object.assign(new Error('Agent 身份认证失败'), { statusCode: 401 });
  }
  if (body.platform !== agent.platform || text(body.account_id) !== agent.account_id) {
    throw Object.assign(new Error('Agent 设备或平台账号绑定不匹配'), { statusCode: 403 });
  }
  const expected = crypto.createHmac('sha256', token).update(canonical(body)).digest('hex');
  const supplied = text(body.signature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) {
    throw Object.assign(new Error('上传签名验证失败'), { statusCode: 401 });
  }
  const envelope = body.data as { iv?: string; tag?: string; ciphertext?: string };
  try {
    if (!envelope?.iv || !envelope.tag || !envelope.ciphertext) throw new Error('invalid envelope');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(token), Buffer.from(envelope.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const plaintext = decipher.update(envelope.ciphertext, 'base64', 'utf8') + decipher.final('utf8');
    return { agent, payload: JSON.parse(plaintext) as UnifiedPayload };
  } catch {
    throw Object.assign(new Error('上传数据解密失败'), { statusCode: 400 });
  }
}

export async function acceptCreatorDataSync(body: JsonRecord, authorization?: string) {
  const { agent, payload } = await authenticateAndDecrypt(body, authorization);
  if (payload.platform !== agent.platform) throw Object.assign(new Error('同步数据平台与 Agent 绑定不匹配'), { statusCode: 403 });

  const account = payload.account && typeof payload.account === 'object' ? payload.account : {};
  const platformUid = text(account.platform_uid || account.uid || agent.account_id);
  if (!platformUid || platformUid !== agent.account_id) throw Object.assign(new Error('同步账号与 Agent 绑定不匹配'), { statusCode: 403 });
  const snapshotTime = text(body.collected_at, new Date().toISOString());
  const contents = array(payload.contents, 5000);
  const metrics = array(payload.metrics, 20000);
  const trends = array(payload.trends, 50000);
  const rawRecords = array(payload.raw_records, 10000);

  const result = await runInTransaction(async (tx) => {
    await tx.execute(`INSERT INTO creator_platform_accounts(user_id,platform,platform_uid,nickname,avatar,account_name,status,updated_at)
      VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id,platform,platform_uid) DO UPDATE SET nickname=excluded.nickname,avatar=excluded.avatar,account_name=excluded.account_name,status=excluded.status,updated_at=CURRENT_TIMESTAMP`, [
      agent.user_id, agent.platform, platformUid, text(account.nickname), text(account.avatar), text(account.account_name || account.nickname), text(account.status, 'active'),
    ]);
    const accountRow = await tx.queryOne<{ id: number }>('SELECT id FROM creator_platform_accounts WHERE user_id=? AND platform=? AND platform_uid=?', [agent.user_id, agent.platform, platformUid]);
    if (!accountRow) throw new Error('创作者账号写入失败');

    const contentIds = new Map<string, number>();
    for (const item of contents) {
      const platformItemId = text(item.platform_item_id || item.item_id);
      if (!platformItemId) continue;
      await tx.execute(`INSERT INTO creator_content_items(account_id,platform,platform_item_id,title,cover_url,publish_time,duration,status,raw_json)
        VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id,platform,platform_item_id) DO UPDATE SET title=excluded.title,cover_url=excluded.cover_url,publish_time=excluded.publish_time,duration=excluded.duration,status=excluded.status,raw_json=excluded.raw_json`, [
        accountRow.id, agent.platform, platformItemId, text(item.title), text(item.cover_url || item.cover), text(item.publish_time || item.published_at) || null, number(item.duration, 0), text(item.status), json(item.raw_json ?? item),
      ]);
      const row = await tx.queryOne<{ id: number }>('SELECT id FROM creator_content_items WHERE account_id=? AND platform=? AND platform_item_id=?', [accountRow.id, agent.platform, platformItemId]);
      if (row) contentIds.set(platformItemId, row.id);
    }

    for (const metric of metrics) {
      const platformItemId = text(metric.platform_item_id || metric.item_id);
      const contentId = contentIds.get(platformItemId) ?? (await tx.queryOne<{ id: number }>('SELECT id FROM creator_content_items WHERE account_id=? AND platform_item_id=?', [accountRow.id, platformItemId]))?.id;
      if (!contentId) continue;
      const time = text(metric.snapshot_time, snapshotTime);
      await tx.execute(`INSERT INTO creator_content_metrics(content_id,snapshot_time,play_count,like_count,comment_count,share_count,favorite_count,play_duration,completion_rate,cover_click_rate,raw_json)
        VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(content_id,snapshot_time) DO UPDATE SET play_count=excluded.play_count,like_count=excluded.like_count,comment_count=excluded.comment_count,share_count=excluded.share_count,favorite_count=excluded.favorite_count,play_duration=excluded.play_duration,completion_rate=excluded.completion_rate,cover_click_rate=excluded.cover_click_rate,raw_json=excluded.raw_json`, [
        contentId, time, number(metric.play_count), number(metric.like_count), number(metric.comment_count), number(metric.share_count), number(metric.favorite_count || metric.collect_count), number(metric.play_duration), number(metric.completion_rate), number(metric.cover_click_rate), json(metric.raw_json ?? metric),
      ]);
    }

    for (const trend of trends) {
      const platformItemId = text(trend.platform_item_id || trend.item_id);
      const contentId = contentIds.get(platformItemId) ?? (await tx.queryOne<{ id: number }>('SELECT id FROM creator_content_items WHERE account_id=? AND platform_item_id=?', [accountRow.id, platformItemId]))?.id;
      if (!contentId || !text(trend.metric_name)) continue;
      await tx.execute('INSERT OR IGNORE INTO creator_content_trends(content_id,metric_name,metric_value,record_time) VALUES(?,?,?,?)', [contentId, text(trend.metric_name), number(trend.metric_value), text(trend.record_time, snapshotTime)]);
    }

    const accountMetrics = payload.account_metrics && typeof payload.account_metrics === 'object' ? payload.account_metrics : (account.metrics && typeof account.metrics === 'object' ? account.metrics as JsonRecord : account);
    await tx.execute(`INSERT INTO creator_account_metrics(account_id,snapshot_time,fans_count,play_count,interaction_count,profile_visit_count,growth_json,raw_json)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(account_id,snapshot_time) DO UPDATE SET fans_count=excluded.fans_count,play_count=excluded.play_count,interaction_count=excluded.interaction_count,profile_visit_count=excluded.profile_visit_count,growth_json=excluded.growth_json,raw_json=excluded.raw_json`, [
      accountRow.id, text(accountMetrics.snapshot_time, snapshotTime), number(accountMetrics.fans_count), number(accountMetrics.play_count), number(accountMetrics.interaction_count), number(accountMetrics.profile_visit_count), json(accountMetrics.growth_json || accountMetrics.growth), json(accountMetrics.raw_json ?? accountMetrics),
    ]);

    const fans = payload.fans && typeof payload.fans === 'object' ? payload.fans : {};
    if (Object.keys(fans).length) await tx.execute(`INSERT INTO creator_fans_portraits(account_id,snapshot_time,gender_json,age_json,city_json,province_json,interest_json,active_time_json,raw_json)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id,snapshot_time) DO UPDATE SET gender_json=excluded.gender_json,age_json=excluded.age_json,city_json=excluded.city_json,province_json=excluded.province_json,interest_json=excluded.interest_json,active_time_json=excluded.active_time_json,raw_json=excluded.raw_json`, [
      accountRow.id, text(fans.snapshot_time, snapshotTime), json(fans.gender_json || fans.gender), json(fans.age_json || fans.age), json(fans.city_json || fans.city), json(fans.province_json || fans.province), json(fans.interest_json || fans.interest), json(fans.active_time_json || fans.active_time), json(fans.raw_json ?? fans),
    ]);

    for (const record of rawRecords) {
      await tx.execute(`INSERT OR IGNORE INTO creator_api_raw_records(user_id,agent_id,platform,page_type,api_url,method,response_json,created_at) VALUES(?,?,?,?,?,?,?,?)`, [
        agent.user_id, agent.id, agent.platform, text(record.page_type || record.page, 'unknown'), text(record.api_url || record.url), text(record.method, 'GET').toUpperCase(), json(record.response_json ?? record.response), text(record.created_at || record.captured_at, snapshotTime),
      ]);
    }
    await tx.execute('UPDATE creator_agents SET last_active_at=CURRENT_TIMESTAMP WHERE id=?', [agent.id]);
    return { account_id: accountRow.id, contents: contentIds.size, metrics: metrics.length, trends: trends.length, raw_records: rawRecords.length };
  });
  return { success: true, snapshot_time: snapshotTime, ...result };
}

const parse = <T>(value: string | null | undefined, fallback: T): T => { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };

export async function getUnifiedCreatorCenterData(userId: number, platformUid?: string) {
  const account = await queryOne<{ id: number; platform: string; platform_uid: string; nickname: string; avatar: string; account_name: string; status: string; updated_at: string }>(
    `SELECT id,platform,platform_uid,nickname,avatar,account_name,status,updated_at FROM creator_platform_accounts WHERE user_id=?${platformUid ? ' AND platform_uid=?' : ''} ORDER BY updated_at DESC LIMIT 1`, platformUid ? [userId, platformUid] : [userId],
  );
  if (!account) return null;
  const [accountMetric, items, fans, history] = await Promise.all([
    queryOne<Record<string, unknown> & { growth_json: string; raw_json: string }>('SELECT * FROM creator_account_metrics WHERE account_id=? ORDER BY snapshot_time DESC LIMIT 1', [account.id]),
    queryAll<Record<string, unknown> & { raw_json: string }>(`SELECT i.*,m.snapshot_time,m.play_count,m.like_count,m.comment_count,m.share_count,m.favorite_count,m.play_duration,m.completion_rate,m.cover_click_rate,m.raw_json AS metric_raw_json FROM creator_content_items i LEFT JOIN creator_content_metrics m ON m.id=(SELECT id FROM creator_content_metrics WHERE content_id=i.id ORDER BY snapshot_time DESC LIMIT 1) WHERE i.account_id=? ORDER BY COALESCE(i.publish_time,i.created_at) DESC`, [account.id]),
    queryOne<Record<string, unknown> & { gender_json: string; age_json: string; city_json: string; province_json: string; interest_json: string; active_time_json: string; raw_json: string }>('SELECT * FROM creator_fans_portraits WHERE account_id=? ORDER BY snapshot_time DESC LIMIT 1', [account.id]),
    queryAll<Record<string, unknown> & { growth_json: string }>('SELECT snapshot_time,fans_count,play_count,interaction_count,profile_visit_count,growth_json FROM creator_account_metrics WHERE account_id=? ORDER BY snapshot_time DESC LIMIT 90', [account.id]),
  ]);
  const trends = await queryAll<{ content_id: number; metric_name: string; metric_value: number; record_time: string }>('SELECT content_id,metric_name,metric_value,record_time FROM creator_content_trends WHERE content_id IN (SELECT id FROM creator_content_items WHERE account_id=?) ORDER BY record_time', [account.id]);
  return {
    account: { ...account, account_id: account.platform_uid, snapshot_time: text(accountMetric?.snapshot_time || account.updated_at), source: 'local_creator_center', metrics: accountMetric ? { ...accountMetric, growth: parse(accountMetric.growth_json, {}), raw: parse(accountMetric.raw_json, {}) } : null },
    works: items.map((item) => ({ ...item, item_id: item.platform_item_id, cover: item.cover_url, published_at: item.publish_time, raw: parse(item.raw_json, {}), metric_raw: parse(text(item.metric_raw_json), {}) })),
    dashboard: accountMetric ? { ...accountMetric, growth: parse(accountMetric.growth_json, {}), trends } : null,
    fans: fans ? { ...fans, gender: parse(fans.gender_json, {}), age: parse(fans.age_json, {}), city: parse(fans.city_json, {}), province: parse(fans.province_json, {}), interest: parse(fans.interest_json, {}), active_time: parse(fans.active_time_json, {}), raw: parse(fans.raw_json, {}) } : null,
    history: history.map((row) => ({ ...row, source: 'local_creator_center', growth: parse(row.growth_json, {}) })),
    trends,
    data_sources: ['local_creator_center'],
  };
}
