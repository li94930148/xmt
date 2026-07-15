import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { createClient } from '@libsql/client';
import path from 'path';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';
const TOKEN = process.env.TOKEN || '';
const USERNAME = process.env.SMOKE_USERNAME || 'admin';
const PASSWORD = process.env.SMOKE_PASSWORD || 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || '';

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
  return payload;
}

function getItems(payload) {
  return Array.isArray(payload?.data?.items) ? payload.data.items : [];
}

async function main() {
  console.log('开始验证短视频复盘数据读取接口。');
  const token = await login();

  const accountsPayload = await request('/accounts?platform=douyin&active=true&limit=50', token);
  const accounts = getItems(accountsPayload);
  const account = accounts.find((item) => item.platform === 'douyin');
  if (!account?.id) {
    throw new Error('未读取到抖音统一账号，请先确认回填写入结果。');
  }
  console.log(`已读取到抖音统一账号，账号 ID：${account.id}`);

  await request(`/accounts/${account.id}`, token);

  const snapshotsPayload = await request(`/accounts/${account.id}/snapshots`, token);
  if (getItems(snapshotsPayload).length === 0) {
    console.log('该账号暂无快照数据。');
  }

  const videosPayload = await request(`/accounts/${account.id}/videos`, token);
  if (getItems(videosPayload).length === 0) {
    console.log('该账号暂无视频数据。');
  }

  await request('/metrics/overview', token);
  await request('/metrics/platforms', token);
  await request('/jobs', token);

  console.log('短视频复盘数据读取接口验证通过。');
}

main().catch((error) => {
  console.error('短视频复盘数据读取接口验证失败：', error.message);
  process.exit(1);
});
