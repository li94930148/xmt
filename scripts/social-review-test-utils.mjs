import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { createClient } from '@libsql/client';
import path from 'path';

export const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';

export function parseAccountId(args) {
  const arg = args.find((item) => item.startsWith('--account-id='));
  if (!arg) return 0;
  const parsed = Number(arg.slice('--account-id='.length));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

export function getDatabasePath() {
  const configured = process.env.XMT_DB_PATH || process.env.DATABASE_PATH;
  if (configured) return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  if (process.env.DATABASE_URL?.startsWith('file:')) {
    const dbPath = process.env.DATABASE_URL.slice('file:'.length);
    return path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
  }
  return path.resolve(process.cwd(), 'data', 'xmt.db');
}

export function createDb() {
  return createClient({ url: `file:${getDatabasePath()}` });
}

export async function createLocalAdminToken() {
  const secret = process.env.JWT_SECRET || '';
  if (!secret) return '';
  const client = createDb();
  const result = await client.execute({
    sql: "SELECT id, username, role FROM users WHERE role = 'admin' AND enabled = 1 ORDER BY id LIMIT 1",
    args: [],
  });
  await client.close?.();
  const admin = result.rows[0];
  if (!admin) return '';
  return jwt.sign(
    { userId: Number(admin.id), username: String(admin.username), role: String(admin.role) },
    secret,
    { expiresIn: '2h' },
  );
}

export async function login() {
  if (process.env.TOKEN) return process.env.TOKEN;
  const username = process.env.SMOKE_USERNAME || 'admin';
  const password = process.env.SMOKE_PASSWORD || 'admin123';
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const payload = await response.json().catch(() => null);
  if (response.ok && payload?.token) return payload.token;
  const localToken = await createLocalAdminToken();
  if (localToken) {
    console.log('登录接口未返回访问凭据，已使用本地测试凭据继续验证。');
    return localToken;
  }
  throw new Error('登录失败，请设置访问凭据或检查测试账号密码。');
}

export function assertNoSensitiveFields(payload) {
  const text = JSON.stringify(payload || {});
  if (/(cookie|authorization|headers|session|storageState|encrypted_payload|encryptedPayload|raw_json|rawJson|<html|token)/i.test(text)) {
    throw new Error('接口返回包含不应展示的敏感字段。');
  }
}

export function isSafeErrorText(text) {
  if (!text) return true;
  return !/(cookie|authorization|headers|session|storageState|encrypted_payload|encryptedPayload|raw_json|rawJson|<html|token)/i.test(String(text));
}

export async function apiRequest(method, pathname, token, body = null, expected = [200]) {
  const response = await fetch(`${API_BASE_URL}/social-review${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  assertNoSensitiveFields(payload);
  const ok = expected.includes(response.status);
  console.log(`${ok ? '通过' : '失败'} ${method} ${pathname} -> ${response.status}`);
  if (!ok) throw new Error(payload?.message || `接口状态不符合预期：${method} ${pathname}`);
  return { status: response.status, payload };
}
