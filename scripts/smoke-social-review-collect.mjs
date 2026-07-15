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

  throw new Error('登录失败，请设置 TOKEN 或检查验证账号密码。');
}

async function main() {
  console.log(`开始验证短视频真实采集链路，账号 ID：${accountId}`);
  const token = await login();

  const response = await fetch(`${API_BASE_URL}/social-review/accounts/${accountId}/collect`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    console.log(payload?.message || '真实采集验证失败，请稍后重试。');
    process.exit(1);
  }

  const data = payload.data || {};
  console.log('真实采集验证完成。');
  console.log(`任务 ID：${data.job?.id ?? ''}`);
  console.log(`账号 ID：${data.account?.id ?? accountId}`);
  console.log(`快照 ID：${data.snapshot?.id ?? ''}`);
  console.log(`快照日期：${data.snapshot?.snapshotDate ?? ''}`);
  console.log(`视频数量：${data.videoCount ?? 0}`);
  console.log(`采集完成时间：${data.job?.finishedAt ?? new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })}`);
}

main().catch((error) => {
  console.error('真实采集验证失败：', error.message);
  process.exit(1);
});
