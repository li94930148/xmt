import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium, type Browser } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const user = { id: 151, username: 'users-race-admin', role: 'director', name: '人员刷新竞态验收', enabled: true, force_change_password: false };
const fullUserPermissions = ['user:view', 'user:create', 'user:update', 'user:delete'];
const roles = [
  { id: 1, code: 'member', name: '普通成员' },
  { id: 2, code: 'camera', name: '摄影师' },
];
const fixtureUsers = [
  { id: 1500, username: 'alpha-user', email: 'alpha@example.invalid', role: 'member', name: '甲用户', enabled: true, created_at: '2026-10-01T00:00:00.000Z' },
  { id: 1501, username: 'beta-user', email: 'beta@example.invalid', role: 'member', name: '乙用户', enabled: true, created_at: '2026-10-02T00:00:00.000Z' },
  ...Array.from({ length: 49 }, (_, index) => ({
    id: 1600 + index,
    username: `pagination-user-${index + 1}`,
    email: `pagination-user-${index + 1}@example.invalid`,
    role: 'member',
    name: `分页测试用户${index + 1}`,
    enabled: true,
    created_at: '2026-10-03T00:00:00.000Z',
  })),
];
const fixtureUserDefaults = fixtureUsers.map((item) => ({ ...item }));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

const app = express();
app.use(express.json());
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
let holdNextUsersRead = false;
let heldUsersReadStarted = false;
let heldUsersRead = deferred<void>();
let releaseHeldUsersRead = deferred<void>();
let holdNextBetaRead = false;
let betaReadStartedSignal = deferred<void>();
let releaseBetaRead = deferred<void>();
let createRequests = 0;
let createPermissionDeniedRequests = 0;
let createMutationCount = 0;
let createStatusReadRequests = 0;
let userCreateRequestIds: string[] = [];
const committedUserCreateRequests = new Map<string, { fingerprint: string; userId: number }>();
let updateRequests = 0;
let userUpdateMutationCount = 0;
let userPasswordUpdateCount = 0;
let userUpdateRequestIds: string[] = [];
const committedUserUpdateRequests = new Map<string, { fingerprint: string; targetUserId: number }>();
let deleteRequests = 0;
let deleteMutationCount = 0;
let deleteStatusReadRequests = 0;
let userDeleteRequestIds: string[] = [];
const committedUserDeleteRequests = new Map<string, { fingerprint: string; targetUserId: number }>();
let nextUserId = 1502;
let createdUsers: typeof fixtureUsers = [];
let deletedUserIds = new Set<number>();
let userListQueries: string[] = [];
let failNextUsersRead = false;
let failAfterNextUserUpdate = false;
let failBeforeNextUserUpdate = false;
let failNextUserUpdateStatusRead = false;
let updateStatusReadRequests = 0;
let fixtureUserPermissions = [...fullUserPermissions];
let failNextUserDetailRead = false;
let userDetailReadRequests = 0;
let delayNextCreate = false;
let failAfterNextUserCreate = false;
let failBeforeNextUserCreate = false;
let failAfterNextUserDelete = false;
let failBeforeNextUserDelete = false;
let failNextUserDeleteWithNotFound = false;
let failNextUserDeleteStatusRead = false;
let delayedCreateStarted = deferred<void>();
let releaseDelayedCreate = deferred<void>();

app.get('/__qa', (_req, res) => res.type('html').send(
  `<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','users-refresh-query-race-fixture');localStorage.setItem('xmt_theme','light');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/users');</script>`,
));
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/permissions/my', (_req, res) => res.json(fixtureUserPermissions));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/users/assignable-roles', (_req, res) => res.json(roles));
app.get('/api/users/create-requests/:requestId', (req, res) => {
  createStatusReadRequests += 1;
  const request = committedUserCreateRequests.get(req.params.requestId);
  return request
    ? res.json({ state: 'created', userId: request.userId })
    : res.json({ state: 'not_found' });
});
app.get('/api/users/update-requests/:requestId/:targetUserId', (req, res) => {
  updateStatusReadRequests += 1;
  if (failNextUserUpdateStatusRead) {
    failNextUserUpdateStatusRead = false;
    return res.status(503).json({ message: '模拟用户更新状态核实读取失败' });
  }
  const request = committedUserUpdateRequests.get(req.params.requestId);
  return request && request.targetUserId === Number(req.params.targetUserId)
    ? res.json({ state: 'updated' })
    : res.json({ state: 'not_found' });
});
app.get('/api/users/delete-requests/:requestId/:targetUserId', (req, res) => {
  deleteStatusReadRequests += 1;
  if (failNextUserDeleteStatusRead) {
    failNextUserDeleteStatusRead = false;
    return res.status(503).json({ message: '模拟用户删除状态核实读取失败' });
  }
  const request = committedUserDeleteRequests.get(req.params.requestId);
  return request && request.targetUserId === Number(req.params.targetUserId)
    ? res.json({ state: 'deleted' })
    : res.json({ state: 'not_found' });
});
app.get('/api/users/:id', (req, res) => {
  userDetailReadRequests += 1;
  if (failNextUserDetailRead) {
    failNextUserDetailRead = false;
    return res.status(503).json({ message: '模拟用户状态核实读取失败' });
  }
  const id = Number(req.params.id);
  const found = [...fixtureUsers, ...createdUsers].find((item) => item.id === id && !deletedUserIds.has(id));
  return found ? res.json(found) : res.status(404).json({ message: '用户不存在' });
});
app.get('/api/users', async (req, res) => {
  const searchTerm = String(req.query.search || '');
  userListQueries.push(searchTerm);
  const allUsers = [...fixtureUsers.filter((item) => !deletedUserIds.has(item.id)), ...createdUsers];
  const search = searchTerm.toLocaleLowerCase();
  const matchingUsers = search
    ? allUsers.filter((item) => `${item.username} ${item.name} ${item.email}`.toLocaleLowerCase().includes(search))
    : allUsers;
  if (holdNextUsersRead) {
    holdNextUsersRead = false;
    heldUsersReadStarted = true;
    heldUsersRead.resolve();
    await releaseHeldUsersRead.promise;
  }
  if (holdNextBetaRead && searchTerm === 'beta') {
    holdNextBetaRead = false;
    betaReadStartedSignal.resolve();
    await releaseBetaRead.promise;
  }
  if (failNextUsersRead) {
    failNextUsersRead = false;
    return res.status(503).json({ message: '模拟用户列表读取失败' });
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Number(req.query.limit) || 50);
  return res.json({
    data: matchingUsers.slice((page - 1) * limit, page * limit),
    total: matchingUsers.length,
    page,
    limit,
  });
});
app.post('/api/users', async (req, res) => {
  createRequests += 1;
  const requestId = String(req.body.client_request_id || '');
  if (requestId) userCreateRequestIds.push(requestId);
  if (!fixtureUserPermissions.includes('user:create')) {
    createPermissionDeniedRequests += 1;
    return res.status(403).json({ message: '当前账号没有创建用户权限' });
  }
  const payloadFingerprint = JSON.stringify({
    username: req.body.username,
    password: req.body.password,
    email: req.body.email ?? null,
    role: req.body.role ?? 'member',
    name: req.body.name ?? null,
  });
  const previous = requestId ? committedUserCreateRequests.get(requestId) : undefined;
  if (previous) {
    if (previous.fingerprint !== payloadFingerprint) return res.status(409).json({ message: '请求编号与本次内容不匹配' });
    return res.json({ message: '用户已创建', userId: previous.userId, idempotent_replay: true });
  }
  if (delayNextCreate) {
    delayNextCreate = false;
    delayedCreateStarted.resolve();
    await releaseDelayedCreate.promise;
  }
  if (failBeforeNextUserCreate) {
    failBeforeNextUserCreate = false;
    return res.status(503).json({ message: '模拟创建事务前响应丢失' });
  }
  const createdUser = {
    id: nextUserId++,
    username: String(req.body.username),
    email: String(req.body.email || ''),
    role: String(req.body.role || 'member'),
    name: String(req.body.name || ''),
    enabled: true,
    created_at: '2026-10-19T00:00:00.000Z',
  };
  createdUsers = [...createdUsers, createdUser];
  createMutationCount += 1;
  if (requestId) committedUserCreateRequests.set(requestId, { fingerprint: payloadFingerprint, userId: createdUser.id });
  holdNextUsersRead = true;
  heldUsersRead = deferred<void>();
  releaseHeldUsersRead = deferred<void>();
  heldUsersReadStarted = false;
  if (failAfterNextUserCreate) {
    failAfterNextUserCreate = false;
    return res.status(503).json({ message: '模拟写入提交后响应丢失' });
  }
  return res.json({ message: '用户已创建', userId: createdUser.id, ...(requestId ? { idempotent_replay: false } : {}) });
});
app.put('/api/users/:id', (req, res) => {
  updateRequests += 1;
  const id = Number(req.params.id);
  const target = [...fixtureUsers, ...createdUsers].find((item) => item.id === id && !deletedUserIds.has(id));
  if (!target) return res.status(404).json({ message: '用户不存在' });
  const requestId = String(req.body.client_request_id || '');
  const payloadFingerprint = JSON.stringify({
    password: req.body.password ?? null,
    email: req.body.email ?? null,
    role: req.body.role ?? null,
    name: req.body.name ?? null,
    enabled: req.body.enabled ?? null,
  });
  if (requestId) userUpdateRequestIds.push(requestId);
  if (failBeforeNextUserUpdate) {
    failBeforeNextUserUpdate = false;
    return res.status(503).json({ message: '模拟用户更新事务前响应丢失' });
  }
  if (requestId && committedUserUpdateRequests.has(requestId)) {
    if (committedUserUpdateRequests.get(requestId)?.fingerprint !== payloadFingerprint
      || committedUserUpdateRequests.get(requestId)?.targetUserId !== id) {
      return res.status(409).json({ message: '请求编号与本次内容不匹配' });
    }
    return res.json({ message: '用户更新成功', idempotent_replay: true });
  }
  if (req.body.name !== undefined) target.name = String(req.body.name);
  if (req.body.email !== undefined) target.email = String(req.body.email);
  if (req.body.role !== undefined) target.role = String(req.body.role);
  target.enabled = Boolean(req.body.enabled);
  userUpdateMutationCount += 1;
  if (req.body.password) userPasswordUpdateCount += 1;
  if (requestId) committedUserUpdateRequests.set(requestId, { fingerprint: payloadFingerprint, targetUserId: id });
  if (failAfterNextUserUpdate) {
    failAfterNextUserUpdate = false;
    return res.status(503).json({ message: '模拟写入提交后响应丢失' });
  }
  return res.json({ message: '用户更新成功', ...(requestId ? { idempotent_replay: false } : {}) });
});
app.delete('/api/users/:id', (req, res) => {
  deleteRequests += 1;
  const targetUserId = Number(req.params.id);
  const requestId = String(req.body?.client_request_id || '');
  if (requestId) userDeleteRequestIds.push(requestId);
  const previous = requestId ? committedUserDeleteRequests.get(requestId) : undefined;
  if (previous) {
    if (previous.targetUserId !== targetUserId) return res.status(409).json({ message: '请求编号与目标用户不匹配' });
    return res.json({ message: '用户已删除', idempotent_replay: true });
  }
  if (failBeforeNextUserDelete) {
    failBeforeNextUserDelete = false;
    return res.status(503).json({ message: '模拟用户删除事务前响应丢失' });
  }
  const exists = [...fixtureUsers, ...createdUsers].some((item) => item.id === targetUserId && !deletedUserIds.has(targetUserId));
  if (!exists) return res.status(404).json({ message: '用户不存在' });
  if (failNextUserDeleteWithNotFound) {
    failNextUserDeleteWithNotFound = false;
    return res.status(404).json({ message: '模拟用户删除响应中的目标不存在' });
  }
  deletedUserIds.add(targetUserId);
  deleteMutationCount += 1;
  if (requestId) committedUserDeleteRequests.set(requestId, { fingerprint: String(targetUserId), targetUserId });
  if (failAfterNextUserDelete) {
    failAfterNextUserDelete = false;
    return res.status(503).json({ message: '模拟删除提交后响应丢失' });
  }
  return res.json({ message: '用户已删除', ...(requestId ? { idempotent_replay: false } : {}) });
});
app.get('/__test__/state', (_req, res) => res.json({ createRequests, createPermissionDeniedRequests, createMutationCount, createStatusReadRequests, userCreateRequestIds, updateRequests, userUpdateMutationCount, userPasswordUpdateCount, userUpdateRequestIds, updateStatusReadRequests, deleteRequests, deleteMutationCount, deleteStatusReadRequests, userDeleteRequestIds, userDetailReadRequests, heldUsersReadStarted, userListQueries }));
app.post('/__test__/delete-user-as-another-admin/:id', (req, res) => {
  const id = Number(req.params.id);
  const exists = [...fixtureUsers, ...createdUsers].some((item) => item.id === id && !deletedUserIds.has(id));
  if (!exists) return res.status(404).json({ message: '用户不存在' });
  deletedUserIds.add(id);
  return res.json({ removed: true });
});
app.post('/__test__/reset', (_req, res) => {
  fixtureUsers.forEach((item, index) => {
    Object.assign(item, fixtureUserDefaults[index]);
  });
  createRequests = 0;
  createPermissionDeniedRequests = 0;
  createMutationCount = 0;
  createStatusReadRequests = 0;
  userCreateRequestIds = [];
  committedUserCreateRequests.clear();
  updateRequests = 0;
  userUpdateMutationCount = 0;
  userPasswordUpdateCount = 0;
  userUpdateRequestIds = [];
  updateStatusReadRequests = 0;
  committedUserUpdateRequests.clear();
  deleteRequests = 0;
  deleteMutationCount = 0;
  deleteStatusReadRequests = 0;
  userDeleteRequestIds = [];
  committedUserDeleteRequests.clear();
  deletedUserIds = new Set<number>();
  nextUserId = 1502;
  createdUsers = [];
  userListQueries = [];
  failNextUsersRead = false;
  failAfterNextUserUpdate = false;
  failBeforeNextUserUpdate = false;
  failNextUserUpdateStatusRead = false;
  fixtureUserPermissions = [...fullUserPermissions];
  failNextUserDetailRead = false;
  userDetailReadRequests = 0;
  holdNextUsersRead = false;
  heldUsersReadStarted = false;
  heldUsersRead = deferred<void>();
  releaseHeldUsersRead = deferred<void>();
  holdNextBetaRead = false;
  betaReadStartedSignal = deferred<void>();
  releaseBetaRead = deferred<void>();
  delayNextCreate = false;
  failAfterNextUserCreate = false;
  failBeforeNextUserCreate = false;
  failAfterNextUserDelete = false;
  failBeforeNextUserDelete = false;
  failNextUserDeleteWithNotFound = false;
  failNextUserDeleteStatusRead = false;
  delayedCreateStarted = deferred<void>();
  releaseDelayedCreate = deferred<void>();
  return res.json({ reset: true });
});
app.post('/__test__/delay-next-create', (_req, res) => {
  delayNextCreate = true;
  delayedCreateStarted = deferred<void>();
  releaseDelayedCreate = deferred<void>();
  return res.json({ armed: true });
});
app.post('/__test__/fail-after-next-user-create', (_req, res) => {
  failAfterNextUserCreate = true;
  return res.json({ armed: true });
});
app.post('/__test__/fail-before-next-user-create', (_req, res) => {
  failBeforeNextUserCreate = true;
  return res.json({ armed: true });
});
app.post('/__test__/fail-after-next-user-delete', (_req, res) => {
  failAfterNextUserDelete = true;
  return res.json({ armed: true });
});
app.post('/__test__/fail-before-next-user-delete', (_req, res) => {
  failBeforeNextUserDelete = true;
  return res.json({ armed: true });
});
app.post('/__test__/not-found-next-user-delete', (_req, res) => {
  failNextUserDeleteWithNotFound = true;
  return res.json({ armed: true });
});
app.post('/__test__/fail-next-user-delete-status-read', (_req, res) => {
  failNextUserDeleteStatusRead = true;
  return res.json({ armed: true });
});
app.post('/__test__/hold-next-beta-read', (_req, res) => {
  holdNextBetaRead = true;
  betaReadStartedSignal = deferred<void>();
  releaseBetaRead = deferred<void>();
  return res.json({ armed: true });
});
app.post('/__test__/hold-next-users-read', (_req, res) => {
  holdNextUsersRead = true;
  heldUsersReadStarted = false;
  heldUsersRead = deferred<void>();
  releaseHeldUsersRead = deferred<void>();
  return res.json({ armed: true });
});
app.post('/__test__/fail-next-users-read', (_req, res) => {
  failNextUsersRead = true;
  return res.json({ armed: true });
});
app.post('/__test__/fail-after-next-user-update', (_req, res) => {
  failAfterNextUserUpdate = true;
  return res.json({ armed: true });
});
app.post('/__test__/fail-before-next-user-update', (_req, res) => {
  failBeforeNextUserUpdate = true;
  return res.json({ armed: true });
});
app.post('/__test__/fail-next-user-update-status-read', (_req, res) => {
  failNextUserUpdateStatusRead = true;
  return res.json({ armed: true });
});
app.post('/__test__/set-user-update-permission/:enabled', (req, res) => {
  fixtureUserPermissions = fixtureUserPermissions.filter((permission) => permission !== 'user:update');
  if (req.params.enabled === 'true') fixtureUserPermissions.push('user:update');
  return res.json({ enabled: req.params.enabled === 'true' });
});
app.post('/__test__/set-user-create-permission/:enabled', (req, res) => {
  fixtureUserPermissions = fixtureUserPermissions.filter((permission) => permission !== 'user:create');
  if (req.params.enabled === 'true') fixtureUserPermissions.push('user:create');
  return res.json({ enabled: req.params.enabled === 'true' });
});
app.post('/__test__/fail-next-user-detail-read', (_req, res) => {
  failNextUserDetailRead = true;
  return res.json({ armed: true });
});
app.post('/__test__/release-users-read', (_req, res) => {
  releaseHeldUsersRead.resolve();
  return res.json({ released: true });
});

const server = http.createServer(app);
const io = new SocketServer(server);
io.on('connection', () => undefined);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
let browser: Browser | undefined;

if (process.env.XMT_USERS_REFRESH_QA_SERVE === '1') {
  console.log(`Isolated users refresh QA fixture: ${base}/__qa`);
  await new Promise(() => {});
}

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  const expectedHttpErrors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)')
      || message.text().includes('404 (Not Found)')
      || message.text().includes('403 (Forbidden)')) expectedHttpErrors.push(message.text());
    else errors.push(message.text());
  });

  await page.goto(`${base}/__qa`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '人员管理', exact: true }).waitFor();
  await page.getByText('alpha-user', { exact: true }).waitFor();

  await page.request.post(`${base}/__test__/fail-after-next-user-create`);
  await page.getByRole('button', { name: '添加用户' }).click();
  await page.getByLabel('用户名 *').fill('created-after-lost-response');
  await page.getByLabel('密码 *').fill('isolated-create-retry-password');
  await page.getByLabel('姓名').fill('响应丢失后安全重试');
  const uncertainCreateResponse = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().endsWith('/api/users') && response.status() === 503);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await uncertainCreateResponse;
  const initialCreateRecovery = await page.evaluate(() => sessionStorage.getItem('xmt:user-create-pending:v1:user:151'));
  assert.ok(initialCreateRecovery, 'the uncertain create request is kept in the current tab session');
  assert.equal(initialCreateRecovery.includes('isolated-create-retry-password'), false, 'the create recovery record never stores the password');
  assert.match(initialCreateRecovery, /created-after-lost-response|响应丢失后安全重试/, 'the recovery record keeps only the non-password create fields');
  await page.getByText('上次创建结果尚未确认。为避免重复创建账号，表单已锁定；再次保存会安全重试同一请求。', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('姓名', { exact: true }).isDisabled(), true, 'uncertain create inputs are frozen to preserve the exact retry payload');
  assert.equal(await page.getByRole('button', { name: '取消', exact: true }).isDisabled(), true, 'the unresolved create cannot be dismissed as if it were uncommitted');
  assert.equal(await page.getByRole('button', { name: '安全重试上次创建', exact: true }).isEnabled(), true, 'the same idempotent create remains safely retryable');
  const safeCreateRetry = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().endsWith('/api/users') && response.status() === 200);
  await page.getByRole('button', { name: '安全重试上次创建', exact: true }).click();
  await safeCreateRetry;
  await page.getByRole('heading', { name: '添加用户', exact: true }).waitFor({ state: 'hidden' });
  const createRetryState = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as {
    createRequests: number;
    createMutationCount: number;
    userCreateRequestIds: string[];
  };
  assert.equal(createRetryState.createRequests, 2, 'the browser retries once after the simulated response loss');
  assert.equal(createRetryState.createMutationCount, 1, 'the retry does not create a second account');
  assert.equal(createRetryState.userCreateRequestIds.length, 2);
  assert.equal(createRetryState.userCreateRequestIds[0], createRetryState.userCreateRequestIds[1], 'both create attempts reuse one stable request key');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:user-create-pending:v1:user:151')), null, 'a confirmed create clears its recovery record');

  await page.request.post(`${base}/__test__/reset`);
  await page.goto(`${base}/__qa`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '人员管理', exact: true }).waitFor();
  await page.request.post(`${base}/__test__/fail-after-next-user-create`);
  await page.getByRole('button', { name: '添加用户' }).click();
  await page.getByLabel('用户名 *').fill('create-confirmed-after-refresh');
  await page.getByLabel('密码 *').fill('isolated-refresh-confirm-password');
  await page.getByLabel('姓名').fill('刷新后服务端已创建');
  const committedCreateResponseLoss = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().endsWith('/api/users') && response.status() === 503);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await committedCreateResponseLoss;
  const heldListRead = page.waitForRequest((request) => request.method() === 'GET'
    && request.url().includes('/api/users?'));
  const recoveredCreateStatus = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/create-requests/') && response.status() === 200);
  await page.request.post(`${base}/__test__/set-user-create-permission/false`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await Promise.all([heldListRead, recoveredCreateStatus]);
  await page.request.post(`${base}/__test__/release-users-read`);
  await page.getByRole('heading', { name: '人员管理', exact: true }).waitFor();
  await page.getByRole('heading', { name: '添加用户', exact: true }).waitFor({ state: 'hidden' });
  const refreshedCommittedCreateState = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as {
    createRequests: number;
    createMutationCount: number;
    createStatusReadRequests: number;
  };
  assert.equal(refreshedCommittedCreateState.createRequests, 1, 'a committed create is resolved with a read-only status request after refresh');
  assert.equal(refreshedCommittedCreateState.createMutationCount, 1, 'confirming after refresh never repeats the committed create');
  assert.equal(refreshedCommittedCreateState.createStatusReadRequests, 1, 'the restored request is checked without resubmitting the account');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:user-create-pending:v1:user:151')), null, 'confirmed refresh recovery clears the tab marker');

  await page.request.post(`${base}/__test__/reset`);
  await page.goto(`${base}/__qa`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '人员管理', exact: true }).waitFor();
  await page.request.post(`${base}/__test__/fail-before-next-user-create`);
  await page.getByRole('button', { name: '添加用户' }).click();
  await page.getByLabel('用户名 *').fill('create-retry-after-refresh');
  await page.getByLabel('密码 *').fill('isolated-refresh-retry-password');
  await page.getByLabel('姓名').fill('刷新后重新输入密码');
  const uncommittedCreateResponseLoss = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().endsWith('/api/users') && response.status() === 503);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await uncommittedCreateResponseLoss;
  const failedCreateRequestId = await page.evaluate(() => JSON.parse(sessionStorage.getItem('xmt:user-create-pending:v1:user:151') || 'null')?.requestId);
  assert.equal(typeof failedCreateRequestId, 'string');

  await page.request.post(`${base}/__test__/set-user-create-permission/false`);
  const deniedRetryResponse = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().endsWith('/api/users') && response.status() === 403);
  const statusAfterDeniedRetry = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/create-requests/') && response.status() === 200);
  await page.getByRole('button', { name: '安全重试上次创建', exact: true }).click();
  await Promise.all([deniedRetryResponse, statusAfterDeniedRetry]);
  await page.getByText(/当前账号没有创建权限.*原请求标记会保留/, { exact: false }).waitFor();
  assert.ok(await page.evaluate(() => sessionStorage.getItem('xmt:user-create-pending:v1:user:151')), 'a 403 does not clear the pending create marker');
  assert.equal(await page.getByLabel('密码 *').isDisabled(), true, 'a denied create cannot re-enable password entry while permission is absent');
  assert.equal(await page.getByRole('button', { name: '安全重试上次创建', exact: true }).isDisabled(), true, 'a denied create cannot be retried without permission');

  const statusAfterRevokedReload = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/create-requests/') && response.status() === 200);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await statusAfterRevokedReload;
  await page.getByRole('heading', { name: '人员管理', exact: true }).waitFor();
  await page.getByRole('heading', { name: '添加用户', exact: true }).waitFor();
  await page.getByText(/服务器未找到上次创建记录.*当前账号没有创建权限/, { exact: false }).waitFor();
  await page.getByLabel('用户名 *').waitFor();
  assert.equal(await page.getByLabel('用户名 *').inputValue(), 'create-retry-after-refresh', 'the non-password form data is restored');
  assert.equal(await page.getByLabel('姓名', { exact: true }).inputValue(), '刷新后重新输入密码');
  assert.equal(await page.getByLabel('密码 *').inputValue(), '', 'the password is never restored after refresh');
  assert.equal(await page.getByLabel('用户名 *').isDisabled(), true, 'the original username cannot be changed for a pending request');
  assert.equal(await page.getByLabel('姓名', { exact: true }).isDisabled(), true, 'the original non-password payload stays frozen');
  assert.equal(await page.getByLabel('密码 *').isDisabled(), true, 'permission revocation keeps the retry fields locked');
  assert.equal(await page.getByRole('button', { name: '安全重试上次创建', exact: true }).isDisabled(), true, 'permission revocation keeps the write action locked');
  const lockedCreateState = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as {
    createRequests: number;
    createPermissionDeniedRequests: number;
    createMutationCount: number;
    userCreateRequestIds: string[];
  };
  assert.equal(lockedCreateState.createRequests, 2, 'revocation recovery does not send an additional create request');
  assert.equal(lockedCreateState.createPermissionDeniedRequests, 1, 'the server rejected the stale-permission retry before mutation');
  assert.equal(lockedCreateState.createMutationCount, 0, 'the uncommitted request remains absent while permission is revoked');
  assert.deepEqual(lockedCreateState.userCreateRequestIds, [failedCreateRequestId, failedCreateRequestId], 'the denied retry still used the original request id');

  await page.request.post(`${base}/__test__/set-user-create-permission/true`);
  const statusAfterPermissionRestore = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/create-requests/') && response.status() === 200);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await statusAfterPermissionRestore;
  await page.getByText(/服务器未找到上次创建记录/, { exact: false }).waitFor();
  assert.equal(await page.getByLabel('密码 *').isDisabled(), false, 'permission restoration re-enables password entry after a fresh status check');
  assert.equal(await page.getByRole('button', { name: '安全重试上次创建', exact: true }).isDisabled(), true, 'retry waits for the password to be re-entered');
  await page.getByLabel('密码 *').fill('isolated-refresh-retry-password');
  const replayedCreateAfterRefresh = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().endsWith('/api/users') && response.status() === 200);
  await page.getByRole('button', { name: '安全重试上次创建', exact: true }).click();
  await replayedCreateAfterRefresh;
  await page.getByRole('heading', { name: '添加用户', exact: true }).waitFor({ state: 'hidden' });
  const retriedCreateState = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as {
    createRequests: number;
    createPermissionDeniedRequests: number;
    createStatusReadRequests: number;
    createMutationCount: number;
    userCreateRequestIds: string[];
  };
  assert.equal(retriedCreateState.createRequests, 3, 'the uncommitted create is safely retried after permission is restored');
  assert.equal(retriedCreateState.createPermissionDeniedRequests, 1, 'the denied write is kept distinct from authorized create attempts');
  assert.equal(retriedCreateState.createStatusReadRequests, 3, 'each recovery boundary is resolved through a read-only status check');
  assert.equal(retriedCreateState.createMutationCount, 1, 'refresh recovery creates exactly one account');
  assert.deepEqual(retriedCreateState.userCreateRequestIds, [failedCreateRequestId, failedCreateRequestId, failedCreateRequestId], 'every retry reuses the same request id');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:user-create-pending:v1:user:151')), null, 'successful retry clears the recovery marker');

  await page.request.post(`${base}/__test__/reset`);
  await page.goto(`${base}/__qa`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '人员管理', exact: true }).waitFor();
  await page.getByText('alpha-user', { exact: true }).waitFor();

  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const paginationLayout = await page.getByRole('navigation', { name: '分页' }).locator('button:visible').evaluateAll((buttons) => ({
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      buttons: buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { label: button.getAttribute('aria-label'), width: rect.width, height: rect.height };
      }),
    }));
    const visiblePaginationButtonCount = width < 640 ? 4 : 6;
    assert.equal(paginationLayout.buttons.length, visiblePaginationButtonCount, `${width}px pagination exposes the expected compact/full controls`);
    assert.ok(paginationLayout.buttons.every((button) => button.width >= 40 && button.height >= 40), `${width}px pagination controls meet the 40px touch target: ${JSON.stringify(paginationLayout.buttons)}`);
    assert.ok(paginationLayout.pageWidth <= paginationLayout.viewportWidth, `${width}px pagination has no horizontal overflow`);

    const actionLayout = await page.getByTestId('user-row-actions-1500').evaluate((cell) => ({
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      buttons: [...cell.querySelectorAll<HTMLButtonElement>('button')].map((button) => {
        const rect = button.getBoundingClientRect();
        return { width: rect.width, height: rect.height, left: rect.left, right: rect.right };
      }),
    }));
    assert.equal(actionLayout.buttons.length, 3, `${width}px fixture row retains all three user actions`);
    assert.ok(actionLayout.buttons.every((button) => button.width >= 40 && button.height >= 40), `${width}px user actions meet the 40px touch target: ${JSON.stringify(actionLayout.buttons)}`);
    assert.ok(actionLayout.buttons.every((button) => button.left >= 0 && button.right <= actionLayout.viewportWidth), `${width}px sticky user actions remain inside the viewport: ${JSON.stringify(actionLayout.buttons)}`);
    assert.ok(actionLayout.pageWidth <= actionLayout.viewportWidth, `${width}px page has no horizontal overflow`);
  }
  await page.setViewportSize({ width: 320, height: 900 });
  const nextUsersPage = page.waitForResponse((response) => (
    response.request().method() === 'GET'
    && response.url().includes('/api/users?')
    && response.url().includes('page=2')
    && response.status() === 200
  ));
  await page.getByRole('button', { name: '下一页' }).click();
  await nextUsersPage;
  assert.equal(await page.getByRole('button', { name: '第 2 页' }).getAttribute('aria-current'), 'page', 'mobile next-page action updates the current page');
  assert.equal(await page.getByText('pagination-user-49', { exact: true }).count(), 1, 'page two renders the remaining fixture user');
  assert.equal(await page.getByText('alpha-user', { exact: true }).count(), 0, 'page two replaces the first page instead of appending it');
  const previousUsersPage = page.waitForResponse((response) => (
    response.request().method() === 'GET'
    && response.url().includes('/api/users?')
    && response.url().includes('page=1')
    && response.status() === 200
  ));
  await page.getByRole('button', { name: '上一页' }).click();
  await previousUsersPage;
  assert.equal(await page.getByRole('button', { name: '第 1 页' }).getAttribute('aria-current'), 'page', 'mobile previous-page action restores page one');
  assert.equal(await page.getByText('alpha-user', { exact: true }).count(), 1, 'page one restores its original row');
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.getByRole('button', { name: '添加用户' }).click();
  await page.getByLabel('用户名 *').fill('created-during-race');
  await page.getByLabel('密码 *').fill('isolated-fixture-password');
  await page.getByLabel('姓名').fill('竞态新建用户');
  await page.getByLabel('邮箱').fill('created@example.invalid');

  const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/users'));
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await createResponse;
  await heldUsersRead.promise;
  assert.equal(heldUsersReadStarted, true, 'the confirmed create starts one held read-back request');

  const searchInput = page.getByPlaceholder('搜索用户名、姓名或邮箱...');
  await searchInput.fill('beta');
  const queryBResponse = page.waitForResponse((response) => (
    response.request().method() === 'GET' &&
    response.url().includes('/api/users?') &&
    response.url().includes('search=beta')
  ));
  await queryBResponse;
  await page.getByText('beta-user', { exact: true }).waitFor();
  assert.equal(await page.getByText('alpha-user', { exact: true }).count(), 0, 'query B replaces the previous list');
  assert.equal(await page.getByTestId('users-list').getAttribute('aria-busy'), 'false', 'the current query read restores the list busy state');

  const delayedQueryAResponse = page.waitForResponse((response) => (
    response.request().method() === 'GET' &&
    response.url().includes('/api/users?') &&
    !response.url().includes('search=')
  ));
  releaseHeldUsersRead.resolve();
  await delayedQueryAResponse;
  await page.waitForTimeout(50);

  assert.equal(await searchInput.inputValue(), 'beta', 'the current search remains query B');
  assert.equal(await page.getByText('beta-user', { exact: true }).count(), 1, 'late query A cannot replace query B rows');
  assert.equal(await page.getByText('alpha-user', { exact: true }).count(), 0, 'late query A cannot restore unrelated rows');
  const state = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as { createRequests: number; heldUsersReadStarted: boolean; userListQueries: string[] };
  assert.equal(state.createRequests, 1, 'the create remains exactly once while query reads race');
  assert.equal(state.heldUsersReadStarted, true, 'the delayed old-query read was released after the current query returned');

  await page.request.post(`${base}/__test__/reset`);
  await page.goto(`${base}/__qa`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '人员管理', exact: true }).waitFor();
  await page.getByText('alpha-user', { exact: true }).waitFor();
  await page.request.post(`${base}/__test__/delay-next-create`);
  await page.request.post(`${base}/__test__/hold-next-beta-read`);
  await page.getByRole('button', { name: '添加用户' }).click();
  await page.getByLabel('用户名 *').fill('created-after-query-change');
  await page.getByLabel('密码 *').fill('isolated-fixture-password');
  await page.getByLabel('姓名').fill('查询变化后确认写入');
  await page.getByLabel('邮箱').fill('late-created@example.invalid');
  const delayedCreateResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/users'));
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await delayedCreateStarted.promise;

  const searchDuringCreate = page.getByPlaceholder('搜索用户名、姓名或邮箱...');
  await searchDuringCreate.fill('beta', { force: true });
  const queryBWhileCreatePending = page.waitForResponse((response) => (
    response.request().method() === 'GET' &&
    response.url().includes('/api/users?') &&
    response.url().includes('search=beta')
  ));
  await betaReadStartedSignal.promise;
  releaseDelayedCreate.resolve();
  await delayedCreateResponse;
  await page.getByRole('heading', { name: '添加用户' }).waitFor({ state: 'hidden' });
  await new Promise((resolve) => setTimeout(resolve, 50));

  const stateWhileQueryBPending = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as { createRequests: number; heldUsersReadStarted: boolean; userListQueries: string[] };
  assert.equal(stateWhileQueryBPending.createRequests, 1, 'the late mutation is still sent only once');
  assert.equal(stateWhileQueryBPending.heldUsersReadStarted, false, 'a stale mutation closure does not start its query A refresh');
  assert.deepEqual(stateWhileQueryBPending.userListQueries, ['', 'beta'], 'the mutation does not invalidate the held query B request');
  assert.equal(await page.getByTestId('users-list').getAttribute('aria-busy'), 'true', 'the active query B read remains visibly busy while held');
  releaseBetaRead.resolve();
  await queryBWhileCreatePending;
  await page.waitForTimeout(50);

  const stateAfterLateMutation = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as { createRequests: number; heldUsersReadStarted: boolean; userListQueries: string[] };
  assert.equal(stateAfterLateMutation.createRequests, 1, 'the delayed create is issued only once');
  assert.deepEqual(stateAfterLateMutation.userListQueries, ['', 'beta'], 'a stale mutation closure does not start an A read that cancels current query B');
  assert.equal(await searchDuringCreate.inputValue(), 'beta', 'the current query remains B after the late mutation confirmation');
  assert.equal(await page.getByText('beta-user', { exact: true }).count(), 1, 'the late mutation does not clear or replace query B results');
  assert.equal(await page.getByText('alpha-user', { exact: true }).count(), 0, 'the late mutation does not restore query A rows');
  assert.equal(await page.getByTestId('users-list').getAttribute('aria-busy'), 'false', 'query B completion clears loading and refreshing state after the stale mutation is ignored');

  await page.request.post(`${base}/__test__/reset`);
  await page.goto(`${base}/__qa`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '人员管理', exact: true }).waitFor();
  await page.getByText('beta-user', { exact: true }).waitFor();
  const searchBeforeDelete = page.getByPlaceholder('搜索用户名、姓名或邮箱...');
  const betaUserRead = page.waitForResponse((response) => (
    response.request().method() === 'GET' && response.url().includes('/api/users?') && response.url().includes('search=beta-user')
  ));
  await searchBeforeDelete.fill('beta-user');
  await betaUserRead;
  await page.getByText('beta-user', { exact: true }).waitFor();
  assert.equal(await page.getByTestId('users-list').getAttribute('aria-busy'), 'false', 'the filtered user is actionable after its list read completes');

  await page.request.post(`${base}/__test__/fail-after-next-user-update`);
  await page.getByRole('button', { name: '编辑用户 beta-user' }).click();
  await page.getByLabel('姓名', { exact: true }).fill('响应丢失后安全重试');
  await page.getByLabel('邮箱', { exact: true }).fill('idempotent-update@example.invalid');
  await page.getByLabel(/密码/).fill('isolated-replayed-password');
  await page.getByLabel('角色', { exact: true }).selectOption('camera');
  const uncertainEditResponse = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith('/api/users/1501') && response.status() === 503);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await uncertainEditResponse;
  await page.getByText('上次保存结果尚未确认。为避免重复修改密码、角色或会话，表单已锁定；再次保存会安全重试同一请求。', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('姓名', { exact: true }).isDisabled(), true, 'uncertain edit inputs are frozen to preserve the exact retry payload');
  assert.equal(await page.getByRole('button', { name: '取消', exact: true }).isDisabled(), true, 'the unresolved edit cannot be dismissed as if it were uncommitted');
  assert.equal(await page.getByRole('button', { name: '安全重试上次保存', exact: true }).isEnabled(), true, 'the same idempotent request remains safely retryable');
  const safeEditRetry = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith('/api/users/1501') && response.status() === 200);
  await page.getByRole('button', { name: '安全重试上次保存', exact: true }).click();
  await safeEditRetry;
  await page.getByRole('heading', { name: '编辑用户', exact: true }).waitFor({ state: 'hidden' });
  const editRetryState = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as {
    updateRequests: number;
    userUpdateMutationCount: number;
    userPasswordUpdateCount: number;
    userUpdateRequestIds: string[];
  };
  assert.equal(editRetryState.updateRequests, 2, 'the browser retries with the server after the simulated response loss');
  assert.equal(editRetryState.userUpdateMutationCount, 1, 'the retry does not repeat the committed profile/role/session mutation');
  assert.equal(editRetryState.userPasswordUpdateCount, 1, 'the retry does not reset the password a second time');
  assert.equal(editRetryState.userUpdateRequestIds.length, 2);
  assert.equal(editRetryState.userUpdateRequestIds[0], editRetryState.userUpdateRequestIds[1], 'both attempts reuse one stable request key');

  await page.request.post(`${base}/__test__/fail-after-next-user-update`);
  await page.request.post(`${base}/__test__/fail-next-user-update-status-read`);
  const uncertainToggleWrite = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith('/api/users/1501') && response.status() === 503);
  const firstToggleStatusRead = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/update-requests/') && response.status() === 503);
  await page.getByRole('button', { name: '禁用用户 beta-user' }).click();
  await Promise.all([uncertainToggleWrite, firstToggleStatusRead]);
  await page.getByText('暂时无法核实用户 beta-user 的启停结果；原请求已保留，所有人员修改继续暂停，请只读重新核实。', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '禁用用户 beta-user' }).isDisabled(), true, 'an unresolved status check disables a repeated toggle');
  assert.equal(await page.getByRole('button', { name: '编辑用户 beta-user' }).isDisabled(), true, 'an unresolved status check pauses other user edits');
  assert.equal(await page.getByRole('button', { name: '删除用户 beta-user' }).isDisabled(), true, 'an unresolved status check pauses deletion');

  const verifiedToggleStatus = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/update-requests/') && response.status() === 200);
  const verifiedToggleListRefresh = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users?') && response.url().includes('search=beta-user') && response.status() === 200);
  await page.getByRole('button', { name: '只读重新核实启停', exact: true }).click();
  await Promise.all([verifiedToggleStatus, verifiedToggleListRefresh]);
  await page.getByText('已禁用', { exact: true }).waitFor();
  const toggleState = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as { updateRequests: number; userDetailReadRequests: number; updateStatusReadRequests: number; userUpdateMutationCount: number };
  assert.equal(toggleState.updateRequests, 3, 'the edit retry and status recovery account for one edit key replay and one toggle, never additional mutations');
  assert.equal(toggleState.userDetailReadRequests, 0, 'toggle recovery never guesses ownership from the target user state');
  assert.equal(toggleState.updateStatusReadRequests, 2, 'the unresolved toggle is resolved through request-attributed read-only checks');
  assert.equal(toggleState.userUpdateMutationCount, 2, 'the edit and toggle each commit once');

  await page.request.post(`${base}/__test__/reset`);
  await page.goto(`${base}/__qa`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '人员管理', exact: true }).waitFor();
  await page.getByText('beta-user', { exact: true }).waitFor();
  await page.evaluate(() => window.sessionStorage.clear());
  await page.request.post(`${base}/__test__/fail-after-next-user-update`);
  await page.request.post(`${base}/__test__/fail-next-user-update-status-read`);
  const committedToggleResponseLoss = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith('/api/users/1501') && response.status() === 503);
  const immediateCommittedToggleCheckFailure = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/update-requests/') && response.status() === 503);
  await page.getByRole('button', { name: '禁用用户 beta-user' }).click();
  await Promise.all([committedToggleResponseLoss, immediateCommittedToggleCheckFailure]);
  const committedToggleMarker = await page.evaluate(() => JSON.parse(window.sessionStorage.getItem('xmt:user-toggle-pending:v1:actor:151') || 'null')) as {
    requestId: string; actorId: number; targetUserId: number; desiredEnabled: boolean;
  } | null;
  assert.ok(committedToggleMarker, 'the ambiguous toggle stores its request identity before or during the write');
  assert.equal(committedToggleMarker.actorId, 151);
  assert.equal(committedToggleMarker.targetUserId, 1501);
  assert.equal(committedToggleMarker.desiredEnabled, false);
  assert.match(committedToggleMarker.requestId, /^[0-9a-f-]{36}$/i);
  await page.request.post(`${base}/__test__/set-user-update-permission/false`);
  await page.request.post(`${base}/__test__/fail-next-user-update-status-read`);
  const committedToggleReloadCheck = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/update-requests/') && response.status() === 503);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await committedToggleReloadCheck;
  await page.getByRole('button', { name: '只读重新核实启停', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '安全重试上次启停', exact: true }).count(), 0,
    'an unavailable status read and revoked edit permission never expose a write retry');
  const committedToggleBeforeReadRetry = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as {
    updateRequests: number; userUpdateMutationCount: number; updateStatusReadRequests: number;
  };
  assert.deepEqual(committedToggleBeforeReadRetry, {
    updateRequests: 1,
    userUpdateMutationCount: 1,
    updateStatusReadRequests: 2,
  }, 'reload performs only a read even when the original toggle already committed');
  const committedToggleReadRetry = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/update-requests/') && response.status() === 200);
  const committedToggleListRefresh = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users?') && response.status() === 200);
  await page.getByRole('button', { name: '只读重新核实启停', exact: true }).click();
  await Promise.all([committedToggleReadRetry, committedToggleListRefresh]);
  assert.equal(await page.evaluate(() => window.sessionStorage.getItem('xmt:user-toggle-pending:v1:actor:151')), null,
    'the authoritative updated status clears the persisted marker even after user-update permission is revoked');
  const committedToggleAfterReadRetry = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as {
    updateRequests: number; userUpdateMutationCount: number; updateStatusReadRequests: number;
  };
  assert.deepEqual(committedToggleAfterReadRetry, {
    updateRequests: 1,
    userUpdateMutationCount: 1,
    updateStatusReadRequests: 3,
  }, 'read-only confirmation after reload does not repeat a committed toggle');

  await page.request.post(`${base}/__test__/reset`);
  await page.goto(`${base}/__qa`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '人员管理', exact: true }).waitFor();
  await page.getByText('beta-user', { exact: true }).waitFor();
  await page.evaluate(() => window.sessionStorage.clear());
  await page.request.post(`${base}/__test__/fail-before-next-user-update`);
  await page.request.post(`${base}/__test__/fail-next-user-update-status-read`);
  const uncommittedToggleResponseLoss = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith('/api/users/1501') && response.status() === 503);
  const immediateUncommittedToggleCheckFailure = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/update-requests/') && response.status() === 503);
  await page.getByRole('button', { name: '禁用用户 beta-user' }).click();
  await Promise.all([uncommittedToggleResponseLoss, immediateUncommittedToggleCheckFailure]);
  const uncommittedToggleMarker = await page.evaluate(() => JSON.parse(window.sessionStorage.getItem('xmt:user-toggle-pending:v1:actor:151') || 'null')) as {
    requestId: string;
  } | null;
  assert.ok(uncommittedToggleMarker);
  await page.request.post(`${base}/__test__/set-user-update-permission/false`);
  const revokedPermissionToggleStatus = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/update-requests/') && response.status() === 200);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await revokedPermissionToggleStatus;
  await page.getByRole('button', { name: '只读重新核实启停', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '安全重试上次启停', exact: true }).count(), 0,
    'not_found remains locked when the actor no longer has the per-user update permission');
  const revokedPermissionToggleState = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as {
    updateRequests: number; userUpdateMutationCount: number; updateStatusReadRequests: number;
  };
  assert.deepEqual(revokedPermissionToggleState, {
    updateRequests: 1,
    userUpdateMutationCount: 0,
    updateStatusReadRequests: 2,
  }, 'refresh verification after permission revocation is read-only and retains the unresolved request');
  await page.request.post(`${base}/__test__/set-user-update-permission/true`);
  const restoredPermissionToggleStatus = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/update-requests/') && response.status() === 200);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await restoredPermissionToggleStatus;
  await page.getByRole('button', { name: '安全重试上次启停', exact: true }).waitFor();
  const safeToggleRetry = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith('/api/users/1501') && response.status() === 200);
  await page.getByRole('button', { name: '安全重试上次启停', exact: true }).click();
  await safeToggleRetry;
  assert.equal(await page.evaluate(() => window.sessionStorage.getItem('xmt:user-toggle-pending:v1:actor:151')), null,
    'the same-key retry clears its marker after the server confirms it');
  const uncommittedToggleRetryState = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as {
    updateRequests: number; userUpdateMutationCount: number; updateStatusReadRequests: number; userUpdateRequestIds: string[];
  };
  assert.deepEqual(uncommittedToggleRetryState, {
    updateRequests: 2,
    userUpdateMutationCount: 1,
    updateStatusReadRequests: 3,
    userUpdateRequestIds: [uncommittedToggleMarker?.requestId, uncommittedToggleMarker?.requestId],
  }, 'only the explicitly requested same-key retry writes after not_found and commits the toggle once');

  await page.request.post(`${base}/__test__/fail-next-users-read`);
  await page.getByRole('button', { name: '删除用户 beta-user' }).click();
  const deleteResponse = page.waitForResponse((response) => response.request().method() === 'DELETE' && response.url().endsWith('/api/users/1501'));
  const failedDeleteRefresh = page.waitForResponse((response) => (
    response.request().method() === 'GET' && response.url().includes('/api/users?') && response.url().includes('search=beta-user') && response.status() === 503
  ));
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await Promise.all([deleteResponse, failedDeleteRefresh]);
  const deleteNotice = '服务端已确认用户删除，但用户列表刷新失败；请重新加载列表确认，不要重复操作。';
  await page.getByText(deleteNotice, { exact: true }).waitFor();
  await page.getByRole('heading', { name: '确认删除用户' }).waitFor({ state: 'hidden' });
  assert.equal(await page.getByText('beta-user', { exact: true }).count(), 0, 'the confirmed delete removes the user from the visible page immediately');

  await page.getByText(deleteNotice, { exact: true }).waitFor();
  const deleteState = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as { deleteRequests: number };
  assert.equal(deleteState.deleteRequests, 1, 'the failed follow-up list read never repeats the confirmed DELETE');

  const readOnlyRetry = page.waitForResponse((response) => (
    response.request().method() === 'GET' && response.url().includes('/api/users?') && response.url().includes('search=beta-user') && response.status() === 200
  ));
  await page.getByRole('button', { name: '重新加载列表' }).click();
  await readOnlyRetry;
  await page.getByText('暂无用户', { exact: true }).waitFor();
  assert.equal(await page.getByText(deleteNotice, { exact: true }).count(), 0, 'a successful GET-only recovery clears the stale-list notice');
  const recoveredDeleteState = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as { deleteRequests: number };
  assert.equal(recoveredDeleteState.deleteRequests, 1, 'list recovery only reads and does not repeat DELETE');

  await page.request.post(`${base}/__test__/reset`);
  await page.goto(`${base}/__qa`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '人员管理', exact: true }).waitFor();
  await page.getByText('alpha-user', { exact: true }).waitFor();
  await page.evaluate(() => window.sessionStorage.clear());
  await page.request.post(`${base}/__test__/fail-after-next-user-delete`);
  await page.request.post(`${base}/__test__/fail-next-user-delete-status-read`);
  const committedDeleteResponseLoss = page.waitForResponse((response) => response.request().method() === 'DELETE'
    && response.url().endsWith('/api/users/1500') && response.status() === 503);
  const unavailableDeleteStatus = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/delete-requests/') && response.status() === 503);
  await page.getByRole('button', { name: '删除用户 alpha-user' }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await Promise.all([committedDeleteResponseLoss, unavailableDeleteStatus]);
  const committedDeleteRecovery = await page.evaluate(() => window.sessionStorage.getItem('xmt:user-delete-pending:v1:actor:151'));
  assert.ok(committedDeleteRecovery, 'the delete request key is persisted before the DELETE can be lost');
  assert.equal(committedDeleteRecovery.includes('password'), false, 'delete recovery stores only actor, target, username, and request id');
  const confirmedDeleteAfterRefresh = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/delete-requests/') && response.status() === 200);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await confirmedDeleteAfterRefresh;
  await page.getByText('alpha-user', { exact: true }).waitFor({ state: 'hidden' });
  const committedDeleteRecoveryState = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as {
    deleteRequests: number; deleteMutationCount: number; deleteStatusReadRequests: number;
  };
  assert.deepEqual(committedDeleteRecoveryState, { deleteRequests: 1, deleteMutationCount: 1, deleteStatusReadRequests: 2 },
    'refresh resolves a committed delete using status GET only');
  assert.equal(await page.evaluate(() => window.sessionStorage.getItem('xmt:user-delete-pending:v1:actor:151')), null,
    'a confirmed delete clears its tab recovery marker');

  await page.request.post(`${base}/__test__/reset`);
  await page.goto(`${base}/__qa`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '人员管理', exact: true }).waitFor();
  await page.getByText('beta-user', { exact: true }).waitFor();
  await page.evaluate(() => window.sessionStorage.clear());
  await page.request.post(`${base}/__test__/fail-before-next-user-delete`);
  const uncommittedDeleteResponseLoss = page.waitForResponse((response) => response.request().method() === 'DELETE'
    && response.url().endsWith('/api/users/1501') && response.status() === 503);
  const uncommittedDeleteStatus = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/delete-requests/') && response.status() === 200);
  await page.getByRole('button', { name: '删除用户 beta-user' }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await Promise.all([uncommittedDeleteResponseLoss, uncommittedDeleteStatus]);
  await page.getByRole('button', { name: '安全重试上次删除', exact: true }).waitFor();
  assert.equal(await page.getByText('beta-user', { exact: true }).count(), 1, 'an uncommitted delete leaves the user row visible');
  const uncommittedDeleteMarker = await page.evaluate(() => window.sessionStorage.getItem('xmt:user-delete-pending:v1:actor:151'));
  const uncommittedDeleteRequestId = String(JSON.parse(uncommittedDeleteMarker || '{}').requestId || '');
  assert.match(uncommittedDeleteRequestId, /^[0-9a-f-]{36}$/i);
  const safeDeleteRetry = page.waitForResponse((response) => response.request().method() === 'DELETE'
    && response.url().endsWith('/api/users/1501') && response.status() === 200);
  await page.getByRole('button', { name: '安全重试上次删除', exact: true }).click();
  await safeDeleteRetry;
  await page.getByText('beta-user', { exact: true }).waitFor({ state: 'hidden' });
  const uncommittedDeleteRetryState = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as {
    deleteRequests: number; deleteMutationCount: number; userDeleteRequestIds: string[];
  };
  assert.deepEqual(uncommittedDeleteRetryState, {
    deleteRequests: 2,
    deleteMutationCount: 1,
    userDeleteRequestIds: [uncommittedDeleteRequestId, uncommittedDeleteRequestId],
  }, 'the explicit retry reuses one request key and commits deletion exactly once');
  assert.equal(await page.evaluate(() => window.sessionStorage.getItem('xmt:user-delete-pending:v1:actor:151')), null);

  await page.request.post(`${base}/__test__/reset`);
  await page.goto(`${base}/__qa`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '人员管理', exact: true }).waitFor();
  await page.getByText('alpha-user', { exact: true }).waitFor();
  await page.evaluate(() => window.sessionStorage.clear());
  await page.request.post(`${base}/__test__/fail-after-next-user-update`);
  await page.getByRole('button', { name: '编辑用户 alpha-user' }).click();
  await page.getByLabel('姓名', { exact: true }).fill('刷新后已完成的用户更新');
  await page.getByLabel('邮箱', { exact: true }).fill('reload-committed@example.invalid');
  await page.getByLabel(/密码/).fill('reload-committed-password');
  const committedRefreshWrite = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith('/api/users/1500') && response.status() === 503);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await committedRefreshWrite;
  const committedRecoveryMarker = await page.evaluate(() => window.sessionStorage.getItem('xmt:user-update-pending:v1:actor:151'));
  assert.ok(committedRecoveryMarker, 'the exact update key is persisted before the request can be lost');
  assert.equal(committedRecoveryMarker.includes('reload-committed-password'), false, 'session recovery never stores a password');
  const committedStatusRead = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/update-requests/') && response.status() === 200);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await committedStatusRead;
  await page.getByRole('heading', { name: '编辑用户', exact: true }).waitFor({ state: 'hidden' });
  const committedReloadState = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as {
    updateRequests: number; userUpdateMutationCount: number; userPasswordUpdateCount: number; updateStatusReadRequests: number;
  };
  assert.deepEqual(committedReloadState, {
    updateRequests: 1, userUpdateMutationCount: 1, userPasswordUpdateCount: 1, updateStatusReadRequests: 1,
  }, 'a committed update is resolved by one read-only status GET after reload, with no repeat PUT');
  assert.equal(await page.evaluate(() => window.sessionStorage.getItem('xmt:user-update-pending:v1:actor:151')), null);

  await page.request.post(`${base}/__test__/reset`);
  await page.goto(`${base}/__qa`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '人员管理', exact: true }).waitFor();
  await page.getByText('alpha-user', { exact: true }).waitFor();
  await page.evaluate(() => window.sessionStorage.clear());
  await page.request.post(`${base}/__test__/fail-before-next-user-update`);
  await page.getByRole('button', { name: '编辑用户 alpha-user' }).click();
  await page.getByLabel('姓名', { exact: true }).fill('刷新后安全重试的用户资料');
  await page.getByLabel('邮箱', { exact: true }).fill('reload-retry@example.invalid');
  await page.getByLabel(/密码/).fill('reload-retry-password');
  const uncommittedRefreshWrite = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith('/api/users/1500') && response.status() === 503);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await uncommittedRefreshWrite;
  const uncommittedRecoveryMarker = await page.evaluate(() => window.sessionStorage.getItem('xmt:user-update-pending:v1:actor:151'));
  assert.ok(uncommittedRecoveryMarker);
  assert.equal(uncommittedRecoveryMarker.includes('reload-retry-password'), false, 'a password is represented only by a boolean marker');
  const originalUncommittedRequestId = String(JSON.parse(uncommittedRecoveryMarker || '{}').requestId || '');
  assert.match(originalUncommittedRequestId, /^[0-9a-f-]{36}$/i);
  const uncommittedStatusRead = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/update-requests/') && response.status() === 200);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await uncommittedStatusRead;
  await page.getByText('服务器未找到上次更新记录。原字段已锁定；请输入上次更新时使用的密码，再用同一请求安全重试。密码不会保存在浏览器恢复记录中。', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('姓名', { exact: true }).isDisabled(), true);
  assert.equal(await page.getByLabel('邮箱', { exact: true }).isDisabled(), true);
  assert.equal(await page.getByLabel(/密码/).inputValue(), '', 'the password must be re-entered after refresh');
  assert.equal(await page.getByRole('button', { name: '取消', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: '安全重试上次保存', exact: true }).isDisabled(), true);
  const preRetryState = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as {
    updateRequests: number; userUpdateMutationCount: number; updateStatusReadRequests: number;
  };
  assert.deepEqual(preRetryState, { updateRequests: 1, userUpdateMutationCount: 0, updateStatusReadRequests: 1 }, 'reload verification does not repeat an uncommitted update');
  await page.getByLabel(/密码/).fill('reload-retry-password');
  const safeRefreshRetry = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith('/api/users/1500') && response.status() === 200);
  await page.getByRole('button', { name: '安全重试上次保存', exact: true }).click();
  await safeRefreshRetry;
  await page.getByRole('heading', { name: '编辑用户', exact: true }).waitFor({ state: 'hidden' });
  const uncommittedRetryState = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as {
    updateRequests: number; userUpdateMutationCount: number; userPasswordUpdateCount: number; userUpdateRequestIds: string[];
  };
  assert.deepEqual(uncommittedRetryState, {
    updateRequests: 2, userUpdateMutationCount: 1, userPasswordUpdateCount: 1,
    userUpdateRequestIds: [originalUncommittedRequestId, originalUncommittedRequestId],
  }, 'the explicit retry reuses the original request id and commits the update once');
  assert.equal(await page.evaluate(() => window.sessionStorage.getItem('xmt:user-update-pending:v1:actor:151')), null);

  await page.request.post(`${base}/__test__/reset`);
  await page.goto(`${base}/__qa`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '人员管理', exact: true }).waitFor();
  await page.getByText('alpha-user', { exact: true }).waitFor();
  await page.evaluate(() => window.sessionStorage.clear());
  await page.request.post(`${base}/__test__/fail-after-next-user-update`);
  await page.request.post(`${base}/__test__/fail-next-user-update-status-read`);
  await page.getByRole('button', { name: '编辑用户 alpha-user' }).click();
  await page.getByLabel('姓名', { exact: true }).fill('状态暂不可用仍保持锁定');
  const uncertainReadUnavailableWrite = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith('/api/users/1500') && response.status() === 503);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await uncertainReadUnavailableWrite;
  const beforeReloadUnavailableState = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as {
    updateRequests: number; userUpdateMutationCount: number; updateStatusReadRequests: number;
  };
  assert.deepEqual(beforeReloadUnavailableState, { updateRequests: 1, userUpdateMutationCount: 1, updateStatusReadRequests: 0 }, 'a same-page ambiguous update does not auto-consume the post-reload status read');
  const unavailableStatusRead = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/update-requests/') && response.status() === 503);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await unavailableStatusRead;
  await page.getByText('当前暂时无法核实上次更新结果。原字段已锁定；请只读重新核实，暂不重发更新。', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('姓名', { exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: '取消', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: '安全重试上次保存', exact: true }).isDisabled(), true);
  const unavailableState = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as {
    updateRequests: number; userUpdateMutationCount: number; updateStatusReadRequests: number;
  };
  assert.deepEqual(unavailableState, { updateRequests: 1, userUpdateMutationCount: 1, updateStatusReadRequests: 1 }, 'an unavailable read leaves the write locked');
  const statusOnlyRetry = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/update-requests/') && response.status() === 200);
  await page.getByRole('button', { name: '只读重新核实', exact: true }).click();
  await statusOnlyRetry;
  await page.getByRole('heading', { name: '编辑用户', exact: true }).waitFor({ state: 'hidden' });
  const resolvedUnavailableState = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as {
    updateRequests: number; userUpdateMutationCount: number; updateStatusReadRequests: number;
  };
  assert.deepEqual(resolvedUnavailableState, { updateRequests: 1, userUpdateMutationCount: 1, updateStatusReadRequests: 2 }, 'read-only recheck confirms the write without another PUT');

  await page.request.post(`${base}/__test__/reset`);
  await page.goto(`${base}/__qa`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '人员管理', exact: true }).waitFor();
  await page.getByText('beta-user', { exact: true }).waitFor();
  await page.evaluate(() => window.sessionStorage.clear());
  await page.request.post(`${base}/__test__/delete-user-as-another-admin/1501`);
  const externalDeleteResponse = page.waitForResponse((response) => response.request().method() === 'DELETE'
    && response.url().endsWith('/api/users/1501') && response.status() === 404);
  const externalDeleteStatus = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/delete-requests/') && response.status() === 200);
  const externalDeleteDetail = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().endsWith('/api/users/1501') && response.status() === 404);
  const externalDeleteListRefresh = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users?') && response.status() === 200);
  await page.getByRole('button', { name: '删除用户 beta-user' }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await Promise.all([externalDeleteResponse, externalDeleteStatus, externalDeleteDetail, externalDeleteListRefresh]);
  const externalDeleteNotice = '用户 beta-user 已被其他操作移除；本次删除请求未确认删除。';
  await page.getByText(externalDeleteNotice, { exact: true }).waitFor();
  assert.equal(await page.getByText('beta-user', { exact: true }).count(), 0, 'the externally removed user disappears after GET confirms 404');
  assert.equal(await page.evaluate(() => window.sessionStorage.getItem('xmt:user-delete-pending:v1:actor:151')), null,
    'a direct GET 404 clears the stale deletion recovery marker');
  assert.equal(await page.getByText('用户已删除', { exact: true }).count(), 0, 'the UI does not claim this request performed the external deletion');
  const externalDeleteState = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as {
    deleteRequests: number; deleteMutationCount: number; deleteStatusReadRequests: number; userDetailReadRequests: number;
  };
  assert.deepEqual(externalDeleteState, {
    deleteRequests: 1,
    deleteMutationCount: 0,
    deleteStatusReadRequests: 1,
    userDetailReadRequests: 1,
  }, 'the 404 is resolved with a single request-status GET and user-detail GET, without a second DELETE');

  await page.request.post(`${base}/__test__/reset`);
  await page.goto(`${base}/__qa`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '人员管理', exact: true }).waitFor();
  await page.getByText('beta-user', { exact: true }).waitFor();
  await page.evaluate(() => window.sessionStorage.clear());
  await page.request.post(`${base}/__test__/delete-user-as-another-admin/1501`);
  await page.request.post(`${base}/__test__/fail-next-user-detail-read`);
  const failedAbsenceDelete = page.waitForResponse((response) => response.request().method() === 'DELETE'
    && response.url().endsWith('/api/users/1501') && response.status() === 404);
  const failedAbsenceStatus = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/delete-requests/') && response.status() === 200);
  const failedAbsenceDetail = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().endsWith('/api/users/1501') && response.status() === 503);
  await page.getByRole('button', { name: '删除用户 beta-user' }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await Promise.all([failedAbsenceDelete, failedAbsenceStatus, failedAbsenceDetail]);
  const failedAbsenceMarker = await page.evaluate(() => JSON.parse(window.sessionStorage.getItem('xmt:user-delete-pending:v1:actor:151') || 'null')) as {
    requireTargetAbsenceCheck?: boolean;
  } | null;
  assert.equal(failedAbsenceMarker?.requireTargetAbsenceCheck, true, 'the 404 proof requirement survives a failed target GET and page reload');
  await page.getByRole('button', { name: '只读重新核实删除', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '安全重试上次删除', exact: true }).count(), 0,
    'a failed target GET keeps deletion locked instead of enabling a 404 retry loop');
  const failedAbsenceState = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as {
    deleteRequests: number; deleteMutationCount: number; deleteStatusReadRequests: number; userDetailReadRequests: number;
  };
  assert.deepEqual(failedAbsenceState, {
    deleteRequests: 1,
    deleteMutationCount: 0,
    deleteStatusReadRequests: 1,
    userDetailReadRequests: 1,
  }, 'a failed absence read leaves the original marker and performs no extra write');

  await page.request.post(`${base}/__test__/reset`);
  await page.goto(`${base}/__qa`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '人员管理', exact: true }).waitFor();
  await page.getByText('alpha-user', { exact: true }).waitFor();
  await page.evaluate(() => window.sessionStorage.clear());
  await page.request.post(`${base}/__test__/not-found-next-user-delete`);
  const existingTargetDelete404 = page.waitForResponse((response) => response.request().method() === 'DELETE'
    && response.url().endsWith('/api/users/1500') && response.status() === 404);
  const existingTargetStatus = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/delete-requests/') && response.status() === 200);
  const existingTargetDetail = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().endsWith('/api/users/1500') && response.status() === 200);
  await page.getByRole('button', { name: '删除用户 alpha-user' }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await Promise.all([existingTargetDelete404, existingTargetStatus, existingTargetDetail]);
  await page.getByText('删除请求返回“用户不存在”，但只读核实仍能读取用户 alpha-user；本次删除结果未确认，所有人员修改已暂停，请只读重新核实。', { exact: true }).waitFor();
  assert.equal(await page.getByText('alpha-user', { exact: true }).count(), 1, 'a non-404 target read preserves the user and its locked recovery record');
  const existingTargetMarker = await page.evaluate(() => JSON.parse(window.sessionStorage.getItem('xmt:user-delete-pending:v1:actor:151') || 'null')) as {
    requireTargetAbsenceCheck?: boolean;
  } | null;
  assert.equal(existingTargetMarker?.requireTargetAbsenceCheck, true);
  assert.equal(await page.getByRole('button', { name: '安全重试上次删除', exact: true }).count(), 0,
    'a non-404 target read keeps the deletion request locked');
  const existingTargetState = await page.request.get(`${base}/__test__/state`).then((response) => response.json()) as {
    deleteRequests: number; deleteMutationCount: number; deleteStatusReadRequests: number; userDetailReadRequests: number;
  };
  assert.deepEqual(existingTargetState, {
    deleteRequests: 1,
    deleteMutationCount: 0,
    deleteStatusReadRequests: 1,
    userDetailReadRequests: 1,
  }, 'a target still returned by GET is not deleted, retried, or described as success');

  assert.deepEqual(errors, [], errors.join('\n'));
  assert.equal(expectedHttpErrors.length, 23, 'only expected create, ambiguous update/delete, status-read, toggle, 404 and post-delete 503 responses are injected');
  assert.equal(await page.locator('vite-error-overlay, [data-vite-error-overlay]').count(), 0, 'the page has no Vite error overlay');
  assert.equal(new URL(page.url()).pathname, '/users', 'the fixture renders the mounted users route');
  console.log('Users browser tests passed: query race recovery, user edit same-key retry and reload recovery, cross-refresh toggle status recovery and permission-safe retry, user delete status/retry recovery, and confirmed 404 absence recovery.');
} finally {
  releaseHeldUsersRead.resolve();
  releaseDelayedCreate.resolve();
  releaseBetaRead.resolve();
  if (browser) await browser.close();
  io.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await vite.close();
}
