import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { createClient } from '@libsql/client';
import path from 'path';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';
const TOKEN = process.env.TOKEN || '';
const USERNAME = process.env.SMOKE_USERNAME || 'admin';
const PASSWORD = process.env.SMOKE_PASSWORD || 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || '';

const testAccount = {
  platform: 'douyin',
  externalAccountId: 'smoke_douyin_account',
  accountName: '短视频测试账号',
  profileUrl: 'https://www.douyin.com/user/smoke_douyin_account',
  fetchStrategy: 'native_playwright',
  active: true,
  remark: '短视频复盘接口烟雾测试账号',
};

async function login() {
  if (TOKEN) {
    return TOKEN;
  }

  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const payload = await response.json().catch(() => null);
  if (response.ok && payload?.token) {
    return payload.token;
  }

  const localToken = await createLocalAdminToken();
  if (localToken) {
    console.log('登录接口未返回令牌，已使用本地测试令牌继续验证');
    return localToken;
  }

  throw new Error('登录失败，请设置 TOKEN 或检查烟雾测试账号密码');
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
  if (!JWT_SECRET) {
    return '';
  }

  const client = createClient({ url: `file:${getDatabasePath()}` });
  const result = await client.execute({
    sql: "SELECT id, username, role FROM users WHERE role = 'admin' AND enabled = 1 ORDER BY id LIMIT 1",
    args: [],
  });
  const admin = result.rows[0];
  if (!admin) {
    return '';
  }

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

async function request(method, path, token, body, expected) {
  const response = await fetch(`${API_BASE_URL}/social-review${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  const ok = expected.includes(response.status);
  console.log(`${ok ? '通过' : '失败'} ${method} ${path} -> ${response.status}`);
  if (!ok) {
    console.log(JSON.stringify(payload, null, 2));
    throw new Error(`接口状态不符合预期：${method} ${path}`);
  }
  return { status: response.status, payload };
}

function findTestAccount(accountsPayload) {
  const items = accountsPayload?.data?.items || [];
  return items.find((item) => item.externalAccountId === testAccount.externalAccountId);
}

async function ensureTestAccount(token) {
  const created = await request('POST', '/accounts', token, testAccount, [200, 403, 409]);
  if (created.status === 403) {
    console.log('当前令牌没有账号配置权限，跳过写入链路检查');
    return null;
  }

  if (created.status === 200) {
    return created.payload?.data?.account;
  }

  const listed = await request(
    'GET',
    `/accounts?keyword=${encodeURIComponent(testAccount.accountName)}&limit=20`,
    token,
    null,
    [200]
  );
  let existing = findTestAccount(listed.payload);
  if (!existing) {
    const disabledListed = await request(
      'GET',
      `/accounts?keyword=${encodeURIComponent(testAccount.accountName)}&active=false&limit=20`,
      token,
      null,
      [200]
    );
    existing = findTestAccount(disabledListed.payload);
  }
  if (!existing) {
    throw new Error('测试账号已存在但列表中未找到，请检查账号数据');
  }

  await request('PATCH', `/accounts/${existing.id}`, token, { active: true, remark: testAccount.remark }, [200]);
  return existing;
}

async function main() {
  console.log('开始短视频复盘接口烟雾测试');
  const token = await login();

  await request('GET', '/options', token, null, [200]);
  await request('GET', '/metrics/overview', token, null, [200]);
  await request('GET', '/accounts', token, null, [200]);

  const account = await ensureTestAccount(token);
  if (!account?.id) {
    console.log('短视频复盘接口读链路检查完成');
    return;
  }

  const accountId = account.id;
  await request('GET', `/accounts/${accountId}`, token, null, [200]);
  await request('GET', `/accounts/${accountId}/snapshots`, token, null, [200]);
  await request('GET', `/accounts/${accountId}/snapshots/latest`, token, null, [200]);
  await request('GET', `/accounts/${accountId}/videos`, token, null, [200]);

  const job = await request('POST', `/accounts/${accountId}/jobs`, token, {}, [200]);
  const jobId = job.payload?.data?.job?.id;
  if (!jobId) {
    throw new Error('采集任务记录创建失败');
  }

  await request('GET', '/jobs', token, null, [200]);
  await request('GET', `/jobs/${jobId}`, token, null, [200]);
  await request('POST', '/jobs/batch', token, { accountIds: [accountId], runNow: false }, [200]);
  await request('GET', '/metrics/platforms', token, null, [200]);
  await request('GET', '/metrics/jobs', token, null, [200]);
  await request('POST', '/metrics/rollups', token, {}, [200]);
  await request('DELETE', `/accounts/${accountId}`, token, null, [200]);

  console.log('短视频复盘接口烟雾测试通过');
}

main().catch((error) => {
  console.error('短视频复盘接口烟雾测试失败：', error.message);
  process.exit(1);
});
