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

async function precheckAccount() {
  const client = createClient({ url: `file:${getDatabasePath()}` });
  const result = await client.execute({
    sql: `SELECT id, platform, active, external_account_id, account_name, credential_ref
          FROM social_accounts WHERE id = ?`,
    args: [accountId],
  });
  const account = result.rows[0];
  if (!account) throw new Error('账号不存在，无法执行登录验证。');
  if (String(account.platform) !== 'douyin') throw new Error('账号平台不是抖音，无法执行登录验证。');
  if (Number(account.active) !== 1) throw new Error('账号未启用，无法执行登录验证。');
  if (accountId === 2 && String(account.external_account_id || '') !== '40283171336') {
    throw new Error('账号抖音号不符合预期，无法执行登录验证。');
  }
  console.log(`账号预检通过：${account.account_name || '抖音账号'}`);
  console.log(`当前凭据绑定：${account.credential_ref ? '已绑定' : '未绑定'}`);
}

function precheckSecret() {
  const secret = process.env.SOCIAL_CREDENTIAL_SECRET?.trim();
  if (!secret) throw new Error('采集凭据密钥未配置，无法保存登录凭据。');
  if (secret.length < 32) throw new Error('采集凭据密钥强度不足，请更换后重试。');
  if (JWT_SECRET && secret === JWT_SECRET) throw new Error('采集凭据密钥不能复用登录密钥。');
}

function assertNoSensitiveFields(payload) {
  const text = JSON.stringify(payload || {});
  if (/(cookie|authorization|headers|sessionStorage|localStorage|storageState|encrypted_payload|encryptedPayload|<html)/i.test(text)) {
    throw new Error('接口返回包含不应展示的敏感字段。');
  }
}

async function requestJson(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  assertNoSensitiveFields(payload);
  if (!response.ok || payload?.success === false) throw new Error(payload?.message || '接口请求失败。');
  return payload;
}

async function createSession(token) {
  const payload = await requestJson(`${API_BASE_URL}/social-review/accounts/${accountId}/creator-login-sessions`, token, {
    method: 'POST',
    body: JSON.stringify({ platform: 'douyin', loginType: 'creator_center_qr', runLogin }),
  });
  const data = payload.data || {};
  console.log(`登录会话 ID：${data.loginSessionId || ''}`);
  console.log(`会话状态：${data.status || ''}`);
  console.log(`到期时间：${data.expiresAt || ''}`);
  console.log(`扫码资源是否可用：${data.qrAvailable ? '是' : '否'}`);
  return data.loginSessionId;
}

async function readSession(token, sessionId) {
  const payload = await requestJson(`${API_BASE_URL}/social-review/creator-login-sessions/${sessionId}`, token);
  return payload.data || {};
}

async function readQr(token, sessionId) {
  const payload = await requestJson(`${API_BASE_URL}/social-review/creator-login-sessions/${sessionId}/qr`, token);
  const data = payload.data || {};
  console.log(`扫码资源状态：${data.qrImageBase64 || data.qrText ? '已准备' : '暂无可展示资源'}`);
}

async function cancelSession(token, sessionId) {
  const payload = await requestJson(`${API_BASE_URL}/social-review/creator-login-sessions/${sessionId}/cancel`, token, {
    method: 'POST',
  });
  console.log(`取消后状态：${payload.data?.status || ''}`);
}

async function pollLogin(token, sessionId) {
  console.log('请在打开的抖音创作者中心页面完成扫码登录。');
  const deadline = Date.now() + 310_000;
  while (Date.now() < deadline) {
    const data = await readSession(token, sessionId);
    console.log(`当前登录状态：${data.status || ''}`);
    if (data.status === 'saved') return data;
    if (['failed', 'expired', 'cancelled'].includes(data.status)) {
      throw new Error(data.message || '登录会话未完成。');
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error('登录等待超时，请重新发起扫码登录。');
}

async function readCredentialSummary(token) {
  const payload = await requestJson(`${API_BASE_URL}/social-review/accounts/${accountId}/credentials`, token);
  const data = payload.data || {};
  console.log(`凭据引用：${data.credentialRef || ''}`);
  console.log(`凭据类型：${data.credentialType || ''}`);
  console.log(`凭据状态：${data.status || ''}`);
  console.log(`最近验证时间：${data.lastVerifiedAt || ''}`);
  console.log(`是否已有加密载荷：${data.hasCredential ? '是' : '否'}`);
}

async function main() {
  console.log(`开始验证抖音创作者中心登录入口，账号 ID：${accountId}`);
  await precheckAccount();
  if (runLogin) {
    if (accountId !== 2) throw new Error('真实扫码登录仅允许账号 ID 2。');
    precheckSecret();
  }

  const token = await login();
  const sessionId = await createSession(token);
  if (!sessionId) throw new Error('登录会话创建失败。');

  if (!runLogin) {
    console.log('当前为安全模式，未启动浏览器，未访问抖音创作者中心。');
    const data = await readSession(token, sessionId);
    console.log(`会话查询状态：${data.status || ''}`);
    await readQr(token, sessionId);
    await cancelSession(token, sessionId);
    console.log('抖音创作者中心登录入口验证完成。');
    return;
  }

  await pollLogin(token, sessionId);
  await readCredentialSummary(token);
  console.log('抖音创作者中心真实扫码登录验证完成。');
}

main().catch((error) => {
  console.error('抖音创作者中心登录入口验证失败：', error.message);
  process.exit(1);
});
