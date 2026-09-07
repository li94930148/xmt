import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { queryAll, queryOne, runInTransaction } from '../database/utils.js';
import { resolveCoverUrl } from '../utils/coverResolver.js';

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
const text = (value: unknown, fallback = '') => value == null ? fallback : String(value);

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
    works: items.map((item) => {
      const cover = resolveCoverUrl({ creatorCoverUrl: item.cover_url, creatorRawJson: item.raw_json });
      return { ...item, item_id: item.platform_item_id, cover_url: cover, cover, published_at: item.publish_time, raw: parse(item.raw_json, {}), metric_raw: parse(text(item.metric_raw_json), {}) };
    }),
    dashboard: accountMetric ? { ...accountMetric, growth: parse(accountMetric.growth_json, {}), trends } : null,
    fans: fans ? { ...fans, gender: parse(fans.gender_json, {}), age: parse(fans.age_json, {}), city: parse(fans.city_json, {}), province: parse(fans.province_json, {}), interest: parse(fans.interest_json, {}), active_time: parse(fans.active_time_json, {}), raw: parse(fans.raw_json, {}) } : null,
    history: history.map((row) => ({ ...row, source: 'local_creator_center', growth: parse(row.growth_json, {}) })),
    trends,
    data_sources: ['local_creator_center'],
  };
}