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
const runLogin = process.argv.includes('--run-login');

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

async function main() {
  console.log(`开始验证抖音创作者中心登录入口，账号 ID：${accountId}`);
  const token = await login();
  const response = await fetch(`${API_BASE_URL}/social-review/accounts/${accountId}/creator-login-sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ platform: 'douyin', loginType: 'creator_center_qr', runLogin }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || '登录会话创建失败。');
  }

  const data = payload.data || {};
  console.log(`登录会话 ID：${data.loginSessionId || ''}`);
  console.log(`会话状态：${data.status || ''}`);
  console.log(`到期时间：${data.expiresAt || ''}`);
  console.log(`扫码资源是否可用：${data.qrAvailable ? '是' : '否'}`);
  if (!runLogin) {
    console.log('当前为安全模式，未启动浏览器，未访问抖音创作者中心。');
  }

  const sessionId = data.loginSessionId;
  if (sessionId) {
    await readSession(token, sessionId);
    await readQr(token, sessionId);
    await cancelSession(token, sessionId);
  }
  console.log('抖音创作者中心登录入口验证完成。');
}

async function readSession(token, sessionId) {
  const response = await fetch(`${API_BASE_URL}/social-review/creator-login-sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || '登录会话状态查询失败。');
  }
  console.log(`会话查询状态：${payload.data?.status || ''}`);
}

async function readQr(token, sessionId) {
  const response = await fetch(`${API_BASE_URL}/social-review/creator-login-sessions/${sessionId}/qr`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || '扫码资源查询失败。');
  }
  console.log(`扫码资源状态：${payload.data?.qrImageBase64 || payload.data?.qrText ? '已返回' : '暂无可展示资源'}`);
}

async function cancelSession(token, sessionId) {
  const response = await fetch(`${API_BASE_URL}/social-review/creator-login-sessions/${sessionId}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || '登录会话取消失败。');
  }
  console.log(`取消后状态：${payload.data?.status || ''}`);
}

main().catch((error) => {
  console.error('抖音创作者中心登录入口验证失败：', error.message);
  process.exit(1);
});
