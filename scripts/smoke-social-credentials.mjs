import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { createClient } from '@libsql/client';
import path from 'path';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';
const TOKEN = process.env.TOKEN || '';
const USERNAME = process.env.SMOKE_USERNAME || 'admin';
const PASSWORD = process.env.SMOKE_PASSWORD || 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || '';
const ACCOUNT_ID = Number(process.env.SOCIAL_CREDENTIAL_SMOKE_ACCOUNT_ID || 2);

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

function assertNoSensitiveFields(payload) {
  const text = JSON.stringify(payload || {});
  const blocked = /(encrypted_payload|encryptedPayload|cookie|authorization|headers|session|storageState|<html)/i;
  if (blocked.test(text)) {
    throw new Error('接口返回包含不应展示的敏感字段。');
  }
}

async function main() {
  console.log('开始验证短视频采集凭据安全接口。');
  if (!process.env.SOCIAL_CREDENTIAL_SECRET?.trim()) {
    console.log('采集凭据密钥未配置，本次只验证查询接口与脱敏返回。');
  }

  const token = await login();
  const response = await fetch(`${API_BASE_URL}/social-review/accounts/${ACCOUNT_ID}/credentials`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || '采集凭据状态查询失败。');
  }
  assertNoSensitiveFields(payload);
  const data = payload.data || {};
  console.log(`账号 ID：${data.accountId ?? ACCOUNT_ID}`);
  console.log(`平台：${data.platform ?? 'douyin'}`);
  console.log(`凭据状态：${data.status || '暂无凭据'}`);
  console.log(`是否已有可用凭据：${data.hasCredential ? '是' : '否'}`);
  console.log('短视频采集凭据安全接口验证通过。');
}

main().catch((error) => {
  console.error('短视频采集凭据安全接口验证失败：', error.message);
  process.exit(1);
});
