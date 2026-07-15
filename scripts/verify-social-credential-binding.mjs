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
  if (configured) return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
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
    { userId: Number(admin.id), username: String(admin.username), role: String(admin.role) },
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
  if (/(cookie|authorization|headers|sessionStorage|localStorage|storageState|encrypted_payload|encryptedPayload|<html)/i.test(text)) {
    throw new Error('接口返回包含不应展示的敏感字段。');
  }
}

async function main() {
  console.log('开始验证短视频采集凭据绑定状态。');
  const db = createClient({ url: `file:${getDatabasePath()}` });
  const accountResult = await db.execute({
    sql: 'SELECT id, platform, credential_ref FROM social_accounts WHERE id = ?',
    args: [accountId],
  });
  const account = accountResult.rows[0];
  if (!account) throw new Error('账号不存在，无法验证凭据绑定。');

  console.log(`账号 ID：${account.id}`);
  console.log(`平台：${account.platform}`);
  console.log(`账号凭据引用：${account.credential_ref ? '已绑定' : '未绑定'}`);

  const credentialResult = await db.execute({
    sql: `SELECT credential_ref, credential_type, status, encrypted_payload, last_verified_at
          FROM social_credentials
          WHERE account_id = ?
          ORDER BY updated_at DESC
          LIMIT 1`,
    args: [accountId],
  });
  const credential = credentialResult.rows[0] || null;
  if (!credential) {
    console.log('该账号暂无采集凭据记录。');
  } else {
    console.log(`凭据引用：${credential.credential_ref || ''}`);
    console.log(`凭据类型：${credential.credential_type || ''}`);
    console.log(`凭据状态：${credential.status || ''}`);
    console.log(`是否存在加密载荷：${credential.encrypted_payload ? '是' : '否'}`);
    console.log(`最近验证时间：${credential.last_verified_at || '暂无'}`);
  }

  const token = await login();
  const response = await fetch(`${API_BASE_URL}/social-review/accounts/${accountId}/credentials`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => null);
  assertNoSensitiveFields(payload);
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || '凭据状态接口验证失败。');
  }
  console.log(`接口凭据状态：${payload.data?.status || '暂无凭据'}`);
  console.log(`接口是否显示可用凭据：${payload.data?.hasCredential ? '是' : '否'}`);
  console.log('短视频采集凭据绑定状态验证通过。');
}

main().catch((error) => {
  console.error('短视频采集凭据绑定状态验证失败：', error.message);
  process.exit(1);
});
