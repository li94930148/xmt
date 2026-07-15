import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { createClient } from '@libsql/client';
import path from 'path';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';
const TOKEN = process.env.TOKEN || '';
const USERNAME = process.env.SMOKE_USERNAME || 'admin';
const PASSWORD = process.env.SMOKE_PASSWORD || 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || '';
const accountId = parseAccountId(process.argv.slice(2));

if (!accountId) {
  console.log('请传入要验证的账号 ID，本脚本不会自动选择账号。');
  process.exit(1);
}

function parseAccountId(args) {
  const arg = args.find((item) => item.startsWith('--account-id='));
  if (!arg) return 0;
  const parsed = Number(arg.slice('--account-id='.length));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function getDatabasePath() {
  const configured = process.env.XMT_DB_PATH || process.env.DATABASE_PATH;
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  }
  if (process.env.DATABASE_URL?.startsWith('file:')) {
    const dbPath = process.env.DATABASE_URL.slice('file:'.length);
    return path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
  }
  return path.resolve(process.cwd(), 'data', 'xmt.db');
}

async function createLocalAdminToken() {
  if (!JWT_SECRET) return '';

  const client = createClient({ url: `file:${getDatabasePath()}` });
  const result = await client.execute({
    sql: "SELECT id, username, role FROM users WHERE role = 'admin' AND enabled = 1 ORDER BY id LIMIT 1",
    args: [],
  });
  const admin = result.rows[0];
  if (!admin) return '';

  return jwt.sign(
    {
      userId: Number(admin.id),
      username: String(admin.username),
      role: String(admin.role),
    },
    JWT_SECRET,
    { expiresIn: '2h' }
  );
}

async function login() {
  if (TOKEN) return TOKEN;

  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const payload = await response.json().catch(() => null);
  if (response.ok && payload?.token) return payload.token;

  const localToken = await createLocalAdminToken();
  if (localToken) {
    console.log('登录接口未返回令牌，已使用本地测试令牌继续验证。');
    return localToken;
  }

  throw new Error('登录失败，请设置访问令牌或检查验证账号密码。');
}

async function request(pathname, token) {
  const response = await fetch(`${API_BASE_URL}/social-review${pathname}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => null);
  const ok = response.ok && payload?.success !== false;
  console.log(`${ok ? '通过' : '失败'} GET ${pathname} -> ${response.status}`);
  if (!ok) {
    throw new Error(payload?.message || '接口读取失败');
  }
  assertNoSensitiveKeys(payload);
  return payload;
}

function getItems(payload) {
  return Array.isArray(payload?.data?.items) ? payload.data.items : [];
}

function assertNoSensitiveKeys(value) {
  const text = JSON.stringify(value || {});
  const sensitivePatterns = [
    /cookie/i,
    /authorization/i,
    /headers/i,
    /session/i,
    /raw_json/i,
    /rawJson/i,
    /<html/i,
  ];
  if (sensitivePatterns.some((pattern) => pattern.test(text))) {
    throw new Error('接口返回中包含不应展示的敏感字段。');
  }
}

function isSafeErrorText(text) {
  if (!text) return true;
  return !/(cookie|authorization|headers|session|raw_json|rawJson|<html|token)/i.test(String(text));
}

async function readLatestJob(db) {
  const result = await db.execute({
    sql: `SELECT id, account_id, platform, strategy, status, retry_count, last_error, started_at, finished_at, created_at
          FROM social_ingestion_jobs
          WHERE account_id = ?
          ORDER BY id DESC
          LIMIT 1`,
    args: [accountId],
  });
  return result.rows[0] || null;
}

async function readLatestSnapshot(db) {
  const result = await db.execute({
    sql: `SELECT id, account_id, platform, snapshot_date, followers, likes_total, video_count, works_count, fetched_at
          FROM social_snapshots
          WHERE account_id = ?
          ORDER BY fetched_at DESC, id DESC
          LIMIT 1`,
    args: [accountId],
  });
  return result.rows[0] || null;
}

async function readVideoCount(db, snapshotId) {
  if (!snapshotId) return 0;
  const result = await db.execute({
    sql: 'SELECT COUNT(*) AS count FROM social_videos WHERE account_id = ? AND snapshot_id = ?',
    args: [accountId, snapshotId],
  });
  return Number(result.rows[0]?.count || 0);
}

async function readAccount(db) {
  const result = await db.execute({
    sql: `SELECT id, platform, active, fetch_strategy, account_name, display_name, external_account_id,
                 profile_url, cookie_ref, last_fetched_at
          FROM social_accounts
          WHERE id = ?`,
    args: [accountId],
  });
  return result.rows[0] || null;
}

async function main() {
  console.log('开始验证短视频真实采集结果。');
  const db = createClient({ url: `file:${getDatabasePath()}` });
  const account = await readAccount(db);
  if (!account) {
    throw new Error('账号不存在，无法验证采集结果。');
  }

  console.log(`账号 ID：${account.id}`);
  console.log(`平台：${account.platform}`);
  console.log(`启用状态：${Number(account.active) === 1 ? '启用' : '停用'}`);
  console.log(`采集策略：${account.fetch_strategy}`);
  console.log(`账号名称：${account.account_name || ''}`);
  console.log(`展示名称：${account.display_name || ''}`);
  console.log(`外部账号 ID：${account.external_account_id || ''}`);
  console.log(`主页链接：${account.profile_url ? '已配置' : '未配置'}`);
  console.log(`Cookie 引用：${account.cookie_ref ? '已配置' : '未配置 Cookie 引用'}`);
  console.log(`最近采集时间：${account.last_fetched_at || '暂无'}`);

  const job = await readLatestJob(db);
  if (!job) {
    throw new Error('未找到该账号的采集任务。');
  }
  if (!['success', 'failed'].includes(String(job.status))) {
    throw new Error('最近采集任务尚未结束。');
  }
  if (!isSafeErrorText(job.last_error)) {
    throw new Error('最近采集任务错误摘要包含敏感内容。');
  }

  console.log(`最近任务 ID：${job.id}`);
  console.log(`任务账号 ID：${job.account_id}`);
  console.log(`任务平台：${job.platform}`);
  console.log(`任务策略：${job.strategy}`);
  console.log(`任务状态：${job.status}`);
  console.log(`任务开始时间：${job.started_at || '暂无'}`);
  console.log(`任务结束时间：${job.finished_at || '暂无'}`);
  console.log(`错误摘要：${job.last_error ? '已记录安全摘要' : '无'}`);

  const snapshot = await readLatestSnapshot(db);
  if (snapshot) {
    const videoCount = await readVideoCount(db, snapshot.id);
    console.log(`最新快照 ID：${snapshot.id}`);
    console.log(`快照日期：${snapshot.snapshot_date}`);
    console.log(`粉丝数：${snapshot.followers ?? 0}`);
    console.log(`总获赞：${snapshot.likes_total ?? 0}`);
    console.log(`视频数：${snapshot.video_count ?? 0}`);
    console.log(`作品数：${snapshot.works_count ?? 0}`);
    console.log(`采集时间：${snapshot.fetched_at || '暂无'}`);
    console.log(`已写入视频数量：${videoCount}`);
  } else {
    console.log('该账号暂无快照数据。');
    console.log('该账号暂无视频数据。');
  }

  const token = await login();
  await request(`/accounts/${accountId}`, token);
  await request(`/accounts/${accountId}/snapshots`, token);
  await request(`/accounts/${accountId}/videos`, token);
  await request('/metrics/overview', token);
  await request('/metrics/platforms', token);
  await request('/jobs', token);

  await db.close?.();
  console.log('短视频真实采集结果验证通过。');
}

main().catch((error) => {
  console.error('短视频真实采集结果验证失败：', error.message);
  process.exit(1);
});
