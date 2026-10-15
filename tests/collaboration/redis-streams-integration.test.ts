import assert from 'node:assert/strict';
import { fork, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io as createSocketClient, type Socket } from 'socket.io-client';
import { createClient } from 'redis';
import * as Y from 'yjs';
import { COLLABORATION_EVENTS } from '../../src/collaboration/core/events.js';

const redisServer = process.env.REDIS_SERVER_PATH || 'redis-server';
const redisCheck = spawnSync(redisServer, ['--version'], { encoding: 'utf8' });
assert.equal(redisCheck.status, 0, `Redis server is required for this integration test: ${redisCheck.stderr || redisCheck.error?.message || 'not found'}`);

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-redis-streams-integration-'));
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workerPath = path.join(projectRoot, 'tests/collaboration/multi-instance-api-worker.ts');
const databasePath = path.join(temporaryDirectory, 'multi-instance-api.test.db');
const jwtSecret = 'isolated-multi-instance-collaboration-test-secret';
process.env.NODE_ENV = 'test';
process.env.XMT_DB_PATH = databasePath;
process.env.JWT_SECRET = jwtSecret;
let roomId = '';
let ownerAId = 0;
let ownerBId = 0;
let ownerAToken = '';
let ownerBToken = '';
const expectedContent = ['跨实例 A', '跨实例 B', '恢复后增量'];
const channelPrefix = `xmt:test-${process.pid}-${Date.now()}`;

function availablePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not reserve a local TCP port'));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForRedis(port: number) {
  const deadline = Date.now() + 10_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection({ host: '127.0.0.1', port });
        const timer = setTimeout(() => socket.destroy(new Error('Redis ping timed out')), 500);
        socket.once('connect', () => socket.write('*1\r\n$4\r\nPING\r\n'));
        socket.once('data', (data) => {
          clearTimeout(timer);
          socket.end();
          if (data.toString().includes('+PONG')) resolve();
          else reject(new Error(`Unexpected Redis ping response: ${data.toString()}`));
        });
        socket.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
      });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`Temporary Redis did not become ready: ${lastError instanceof Error ? lastError.message : 'unknown error'}`);
}

function startRedis(port: number) {
  const child = spawn(redisServer, [
    '--bind', '127.0.0.1',
    '--protected-mode', 'yes',
    '--port', String(port),
    '--save', '',
    '--appendonly', 'yes',
    '--appendfsync', 'always',
    '--dir', temporaryDirectory,
    '--daemonize', 'no',
    '--loglevel', 'warning',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => { stderr += chunk; });
  child.once('exit', (code, signal) => {
    if (code !== null && code !== 0) process.stderr.write(`Temporary Redis exited (${code}): ${stderr}`);
    if (signal && signal !== 'SIGTERM' && signal !== 'SIGKILL') process.stderr.write(`Temporary Redis stopped by ${signal}: ${stderr}`);
  });
  return child;
}

async function redisStreamLength(redisUrl: string, streamName: string) {
  const client = createClient({ url: redisUrl });
  await client.connect();
  try {
    return await client.xLen(streamName);
  } finally {
    await client.close();
  }
}

async function stopProcess(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  let gracefulTimer: NodeJS.Timeout | undefined;
  await Promise.race([once(child, 'exit'), new Promise((resolve) => { gracefulTimer = setTimeout(resolve, 3_000); })]);
  if (gracefulTimer) clearTimeout(gracefulTimer);
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    let forceTimer: NodeJS.Timeout | undefined;
    await Promise.race([exited, new Promise((resolve) => { forceTimer = setTimeout(resolve, 1_000); })]);
    if (forceTimer) clearTimeout(forceTimer);
  }
}

async function killProcess(child: ChildProcess | undefined) {
  assert.ok(child, 'fault injection requires the isolated Redis child process');
  assert.equal(child.exitCode, null, 'the isolated Redis process must still be running before fault injection');
  assert.equal(child.signalCode, null, 'the isolated Redis process must not already be stopped');
  const exited = once(child, 'exit');
  assert.equal(child.kill('SIGKILL'), true, 'SIGKILL must be delivered to the isolated Redis child process');
  const [, signal] = await exited;
  assert.equal(signal, 'SIGKILL', 'fault injection must terminate only the isolated Redis child process');
}

async function stopWorker(worker: WorkerHandle) {
  const child = worker.child;
  if (!child.connected || child.exitCode !== null || child.signalCode !== null) {
    await stopProcess(child);
    return;
  }
  const stopped = new Promise<void>((resolve) => {
    const listener = (message: WorkerMessage) => {
      if (message.type !== 'stopping') return;
      child.off('message', listener);
      resolve();
    };
    child.on('message', listener);
  });
  child.send({ type: 'stop' });
  let gracefulTimer: NodeJS.Timeout | undefined;
  await Promise.race([stopped, new Promise((resolve) => { gracefulTimer = setTimeout(resolve, 3_000); })]);
  if (gracefulTimer) clearTimeout(gracefulTimer);
  await stopProcess(child);
}

type WorkerMessage = { type?: string; port?: number; ready?: boolean; message?: string; requestId?: string; messageId?: number | null };
type WorkerHandle = {
  child: ChildProcess;
  port: number;
  requestStatus: () => Promise<boolean>;
  createMessage: (userId: number, title: string, content: string) => Promise<number>;
};

async function startWorker(instance: string, redisUrl: string): Promise<WorkerHandle> {
  const port = await availablePort();
  const child = fork(workerPath, [], {
    cwd: projectRoot,
    execArgv: ['--import', 'tsx'],
    env: {
      PATH: process.env.PATH || '',
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: String(port),
      XMT_DB_PATH: databasePath,
      JWT_SECRET: jwtSecret,
      XMT_WEB_INSTANCE_COUNT: '2',
      XMT_SOCKET_ADAPTER: 'redis-streams',
      XMT_REDIS_URL: redisUrl,
      XMT_SOCKET_ADAPTER_CHANNEL_PREFIX: channelPrefix,
    },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });

  return new Promise<WorkerHandle>((resolve, reject) => {
    let stderr = '';
    let settled = false;
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => { stderr += chunk; });
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error(`Production API worker ${instance} startup timed out: ${stderr}`)), 20_000);
    child.on('message', (message: WorkerMessage) => {
      if (message.type === 'startup-error') {
        fail(new Error(`Production API worker ${instance} failed to start: ${message.message || stderr}`));
      }
      if (!settled && message.type === 'ready' && typeof message.port === 'number') {
        settled = true;
        clearTimeout(timer);
        resolve({
          child,
          port: message.port,
          requestStatus: () => new Promise<boolean>((statusResolve, statusReject) => {
            const statusTimer = setTimeout(() => statusReject(new Error(`Redis adapter worker ${instance} status timed out`)), 3_000);
            const listener = (status: WorkerMessage) => {
              if (status.type !== 'status') return;
              clearTimeout(statusTimer);
              child.off('message', listener);
              statusResolve(Boolean(status.ready));
            };
            child.on('message', listener);
            child.send({ type: 'status' });
          }),
          createMessage: (userId, title, content) => new Promise<number>((messageResolve, messageReject) => {
            const requestId = `${instance}-${Date.now()}-${Math.random()}`;
            const messageTimer = setTimeout(() => {
              child.off('message', listener);
              messageReject(new Error(`API worker ${instance} message creation timed out`));
            }, 5_000);
            const listener = (result: WorkerMessage) => {
              if (result.type !== 'message-created' || result.requestId !== requestId) return;
              clearTimeout(messageTimer);
              child.off('message', listener);
              if (typeof result.messageId !== 'number') messageReject(new Error(`API worker ${instance} failed to persist message`));
              else messageResolve(result.messageId);
            };
            child.on('message', listener);
            child.send({ type: 'create-message', requestId, userId, title, content });
          }),
        });
      }
    });
    child.once('error', (error) => fail(error));
    child.once('exit', (code) => {
      if (!settled) fail(new Error(`Production API worker ${instance} exited with ${code}: ${stderr}`));
    });
  });
}

async function waitForWorkerReadiness(workers: WorkerHandle[], expected: boolean) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const statuses = await Promise.all(workers.map((worker) => worker.requestStatus()));
    if (statuses.every((ready) => ready === expected)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Redis adapter workers did not reach readiness=${expected}`);
}

function createStickyProxy(ports: number[]) {
  let nextBackend = 0;
  const routedRequests = ports.map(() => 0);
  const routedUpgrades = ports.map(() => 0);
  const proxySockets = new Set<net.Socket>();
  const chooseBackend = (request: http.IncomingMessage) => {
    const cookie = request.headers.cookie || '';
    const stickyNode = cookie.match(/(?:^|;\s*)xmt-node=(a|b)(?:;|$)/)?.[1];
    if (stickyNode) return stickyNode === 'a' ? 0 : 1;
    const backend = nextBackend % ports.length;
    nextBackend += 1;
    return backend;
  };
  const server = http.createServer((request, response) => {
    const backend = chooseBackend(request);
    routedRequests[backend] += 1;
    const backendPort = ports[backend];
    const proxyRequest = http.request({
      host: '127.0.0.1',
      port: backendPort,
      path: request.url,
      method: request.method,
      headers: { ...request.headers, host: `127.0.0.1:${backendPort}` },
    }, (proxyResponse) => {
      response.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
      proxyResponse.pipe(response);
    });
    proxyRequest.once('error', () => {
      if (!response.headersSent) response.writeHead(502);
      response.end();
    });
    request.pipe(proxyRequest);
  });
  server.on('connection', (socket) => {
    proxySockets.add(socket);
    socket.once('close', () => proxySockets.delete(socket));
  });
  server.on('upgrade', (request, clientSocket, head) => {
    const backend = chooseBackend(request);
    routedUpgrades[backend] += 1;
    const backendPort = ports[backend];
    const backendSocket = net.createConnection({ host: '127.0.0.1', port: backendPort }, () => {
      const headers = { ...request.headers, host: `127.0.0.1:${backendPort}`, connection: 'Upgrade' };
      const headerLines = Object.entries(headers)
        .flatMap(([name, value]) => (Array.isArray(value) ? value.map((item) => `${name}: ${item}`) : value ? [`${name}: ${value}`] : []));
      backendSocket.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${headerLines.join('\r\n')}\r\n\r\n`);
      if (head.length > 0) backendSocket.write(head);
      clientSocket.pipe(backendSocket).pipe(clientSocket);
    });
    backendSocket.once('error', () => clientSocket.destroy());
    clientSocket.once('error', () => backendSocket.destroy());
  });
  return new Promise<{ port: number; routedRequests: number[]; routedUpgrades: number[]; close: () => Promise<void> }>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Sticky-session test proxy did not bind a TCP port'));
        return;
      }
      resolve({
        port: address.port,
        routedRequests,
        routedUpgrades,
        close: () => new Promise<void>((closeResolve, closeReject) => {
          server.close((error) => error ? closeReject(error) : closeResolve());
          server.closeAllConnections();
          for (const socket of proxySockets) socket.destroy();
        }),
      });
    });
  });
}

function connectViaProxy(port: number, token: string, stickyNode?: 'a' | 'b', transports: Array<'polling' | 'websocket'> = ['polling', 'websocket']) {
  const client = createSocketClient(`http://127.0.0.1:${port}`, {
    transports,
    reconnection: false,
    timeout: 5_000,
    forceNew: true,
    auth: { token },
    ...(stickyNode ? { extraHeaders: { Cookie: `xmt-node=${stickyNode}` } } : {}),
  });
  return new Promise<Socket>((resolve, reject) => {
    const timer = setTimeout(() => {
      client.close();
      reject(new Error('Socket.IO client connection through test proxy timed out'));
    }, 7_000);
    client.once('connect', () => {
      clearTimeout(timer);
      resolve(client);
    });
    client.once('connect_error', (error) => {
      clearTimeout(timer);
      client.close();
      reject(error);
    });
  });
}

function emitAck<T>(socket: Socket, event: string, payload: unknown) {
  return new Promise<T>((resolve, reject) => {
    socket.timeout(5_000).emit(event, payload, (error: Error | null, response: T) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

function waitForSocketEvent<T>(socket: Socket, event: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Timed out waiting for Socket.IO event ${event}`));
    }, 5_000);
    const listener = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, listener);
  });
}

function assertSocketEventNotReceived(socket: Socket, event: string, waitMs = 500) {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      resolve(false);
    }, waitMs);
    const onEvent = () => {
      clearTimeout(timer);
      resolve(true);
    };
    socket.once(event, onEvent);
  });
}

const redisPort = await availablePort();
let redisProcess: ChildProcess | undefined;
const workers: WorkerHandle[] = [];
const clients: Socket[] = [];
let proxy: Awaited<ReturnType<typeof createStickyProxy>> | undefined;
const clientDocuments: Y.Doc[] = [];
let databaseOpen = false;

try {
  const [{ initDatabase, closeDatabase }, { executeInsert, queryAll }, { signToken }] = await Promise.all([
    import('../../api/database/db.js'),
    import('../../api/database/utils.js'),
    import('../../api/utils/jwt.js'),
  ]);
  await initDatabase();
  databaseOpen = true;
  ownerAId = await executeInsert(
    'INSERT INTO users (username,password,email,role,name,enabled,force_change_password) VALUES (?,?,?,?,?,?,?)',
    ['redis-integration-a', 'unused', 'redis-integration-a@example.invalid', 'admin', 'Redis 管理员 A', 1, 0],
  );
  ownerBId = await executeInsert(
    'INSERT INTO users (username,password,email,role,name,enabled,force_change_password) VALUES (?,?,?,?,?,?,?)',
    ['redis-integration-b', 'unused', 'redis-integration-b@example.invalid', 'admin', 'Redis 管理员 B', 1, 0],
  );
  const topicId = await executeInsert(
    'INSERT INTO topics (title,description,platform,creator_id,status) VALUES (?,?,?,?,?)',
    ['真实 API 多实例协作验收', '', 'douyin', ownerAId, 'production'],
  );
  const productionId = await executeInsert(
    'INSERT INTO production (topic_id,version,content,status,operator_id) VALUES (?,?,?,?,?)',
    [topicId, 'v1.0', '', 'draft', ownerAId],
  );
  roomId = `production:${productionId}`;
  ownerAToken = signToken({ userId: ownerAId });
  ownerBToken = signToken({ userId: ownerBId });
  await closeDatabase();
  databaseOpen = false;

  redisProcess = startRedis(redisPort);
  await waitForRedis(redisPort);
  const redisUrl = `redis://127.0.0.1:${redisPort}`;
  const redisStreamName = `${channelPrefix}:socketio:stream`;
  workers.push(await startWorker('a', redisUrl));
  workers.push(await startWorker('b', redisUrl));
  await waitForWorkerReadiness(workers, true);

  proxy = await createStickyProxy(workers.map((worker) => worker.port));
  await assert.rejects(
    connectViaProxy(proxy.port, ownerAToken, undefined, ['polling']),
    undefined,
    'round-robin polling without affinity fails because the next request may reach an instance without the Engine.IO session',
  );

  let clientA = await connectViaProxy(proxy.port, ownerAToken, 'a');
  clients.push(clientA);
  const clientB = await connectViaProxy(proxy.port, ownerBToken, 'b');
  clients.push(clientB);

  const pushedMessagePromise = waitForSocketEvent<{ id: number; title: string; content: string }>(clientA, 'new_message');
  const noCrossUserLeakPromise = assertSocketEventNotReceived(clientB, 'new_message');
  const unreadEventPromise = waitForSocketEvent<Record<string, never>>(clientA, 'unread_count');
  const messageId = await workers[1]!.createMessage(ownerAId, '跨实例站内消息', '由 API 实例 B 创建');
  const pushedMessage = await pushedMessagePromise;
  assert.equal(pushedMessage.id, messageId, 'the remote socket receives the database-generated message ID');
  assert.equal(pushedMessage.title, '跨实例站内消息');
  await unreadEventPromise;
  assert.equal(await noCrossUserLeakPromise, false, 'another user must not receive this notification');
  const messageListResponse = await fetch(`http://127.0.0.1:${workers[0]!.port}/api/messages?limit=20`, {
    headers: { authorization: `Bearer ${ownerAToken}` },
  });
  assert.equal(messageListResponse.status, 200, 'the message owner can reload persisted notifications through the other API instance');
  const messageList = await messageListResponse.json() as { data: Array<{ id: number; read: boolean }> };
  assert.equal(Number(messageList.data.find((message) => message.id === messageId)?.read), 0, 'the realtime payload matches an unread persisted row');
  const markReadResponse = await fetch(`http://127.0.0.1:${workers[0]!.port}/api/messages/${messageId}`, {
    method: 'PUT', headers: { authorization: `Bearer ${ownerAToken}` },
  });
  assert.equal(markReadResponse.status, 200, 'the pushed database ID can be marked read through the authenticated API');

  clientA.disconnect();
  const offlineMessageId = await workers[1]!.createMessage(ownerAId, '离线期间的站内消息', '重新连接后从消息中心恢复');
  clientA = await connectViaProxy(proxy.port, ownerAToken, 'a');
  clients.push(clientA);
  const recoveredMessagesResponse = await fetch(`http://127.0.0.1:${workers[0]!.port}/api/messages?limit=20`, {
    headers: { authorization: `Bearer ${ownerAToken}` },
  });
  assert.equal(recoveredMessagesResponse.status, 200);
  const recoveredMessages = await recoveredMessagesResponse.json() as { data: Array<{ id: number }> };
  assert.ok(recoveredMessages.data.some((message) => message.id === offlineMessageId), 'a notification sent while disconnected remains available after reconnect');
  const recoveredUnreadResponse = await fetch(`http://127.0.0.1:${workers[0]!.port}/api/messages/unread`, {
    headers: { authorization: `Bearer ${ownerAToken}` },
  });
  assert.equal(recoveredUnreadResponse.status, 200);
  assert.equal(Number((await recoveredUnreadResponse.json() as { unreadCount: number }).unreadCount), 1, 'the unread counter can be restored from persisted messages after reconnect');

  const syncAEvent = waitForSocketEvent<{ roomId?: string; update?: number[] }>(clientA, COLLABORATION_EVENTS.SYNC);
  clientA.emit(COLLABORATION_EVENTS.JOIN, {
    roomId,
    user: { id: ownerBId, name: '伪造身份', role: 'member', color: '#123456' },
  });
  assert.equal((await syncAEvent).roomId, roomId, 'the production API authenticates and joins the first instance');

  const syncBEvent = waitForSocketEvent<{ roomId?: string; update?: number[] }>(clientB, COLLABORATION_EVENTS.SYNC);
  const presenceEvent = waitForSocketEvent<{ roomId: string; users: Array<{ id: number; name: string }> }>(clientA, COLLABORATION_EVENTS.USERS);
  clientB.emit(COLLABORATION_EVENTS.JOIN, {
    roomId,
    user: { id: ownerAId, name: '伪造身份', role: 'member', color: '#654321' },
  });
  assert.equal((await syncBEvent).roomId, roomId, 'the production API authenticates and joins the second instance');
  const presence = await presenceEvent;
  assert.deepEqual(presence.users.map(({ id, name }) => ({ id, name })).sort((left, right) => left.id - right.id), [
    { id: ownerAId, name: 'Redis 管理员 A' },
    { id: ownerBId, name: 'Redis 管理员 B' },
  ], 'the production room presence includes authenticated sockets on both API processes');

  const lockEvent = waitForSocketEvent<{ docId: string; reason: string }>(clientB, COLLABORATION_EVENTS.DOC_LOCKED);
  clientA.emit(COLLABORATION_EVENTS.DOC_LOCKED, { roomId, reason: '隔离集成测试锁' });
  assert.equal((await lockEvent).reason, '隔离集成测试锁', 'the production lock event crosses API instances');

  const lockedDocument = new Y.Doc();
  clientDocuments.push(lockedDocument);
  lockedDocument.getText('content').insert(0, '锁定时不可保存');
  const lockedAck = await emitAck<{ ok: boolean; code?: string }>(clientB, COLLABORATION_EVENTS.UPDATE, {
    roomId,
    update: Array.from(Y.encodeStateAsUpdate(lockedDocument)),
  });
  assert.deepEqual(lockedAck, { ok: false, code: 'DOCUMENT_LOCKED', reason: '隔离集成测试锁' }, 'the other process enforces the shared document lock');

  const unlockEvent = waitForSocketEvent<{ roomId: string }>(clientB, COLLABORATION_EVENTS.DOC_UNLOCKED);
  clientA.emit(COLLABORATION_EVENTS.DOC_UNLOCKED, { roomId });
  assert.equal((await unlockEvent).roomId, roomId, 'unlock propagates to the remote room');

  const documentA = new Y.Doc();
  const documentB = new Y.Doc();
  clientDocuments.push(documentA, documentB);
  documentA.getText('content').insert(0, expectedContent[0]);
  documentB.getText('content').insert(0, expectedContent[1]);
  const updateOnA = waitForSocketEvent<{ roomId: string }>(clientA, COLLABORATION_EVENTS.UPDATE);
  const updateOnB = waitForSocketEvent<{ roomId: string }>(clientB, COLLABORATION_EVENTS.UPDATE);
  const concurrentAcks = await Promise.all([
    emitAck<{ ok: boolean; version?: number; code?: string }>(clientA, COLLABORATION_EVENTS.UPDATE, { roomId, update: Array.from(Y.encodeStateAsUpdate(documentA)) }),
    emitAck<{ ok: boolean; version?: number; code?: string }>(clientB, COLLABORATION_EVENTS.UPDATE, { roomId, update: Array.from(Y.encodeStateAsUpdate(documentB)) }),
  ]);
  assert.ok(concurrentAcks.every((ack) => ack.ok), `both real API updates persist: ${JSON.stringify(concurrentAcks)}`);
  assert.deepEqual(concurrentAcks.map((ack) => ack.version).sort(), [1, 2], 'independent API workers serialize concurrent shared-SQLite update versions');
  assert.equal((await updateOnA).roomId, roomId);
  assert.equal((await updateOnB).roomId, roomId);

  assert.ok(proxy.routedRequests[0] > 0 && proxy.routedRequests[1] > 0, 'sticky cookie routes polling requests to both intended instances');
  assert.ok(proxy.routedUpgrades[0] > 0 && proxy.routedUpgrades[1] > 0, 'sticky cookie also routes websocket upgrades to their owning instances');

  const streamLengthBeforeRestart = await redisStreamLength(redisUrl, redisStreamName);
  assert.ok(streamLengthBeforeRestart > 0, 'the Socket.IO adapter must have written inter-process packets to its Redis stream');
  await killProcess(redisProcess);
  redisProcess = undefined;
  await waitForWorkerReadiness(workers, false);

  const offlineDocument = new Y.Doc();
  clientDocuments.push(offlineDocument);
  offlineDocument.getText('content').insert(0, 'Redis 不可用期间不落库');
  const offlineAck = await emitAck<{ ok: boolean; code?: string }>(clientA, COLLABORATION_EVENTS.UPDATE, {
    roomId,
    update: Array.from(Y.encodeStateAsUpdate(offlineDocument)),
  });
  assert.equal(offlineAck.ok, false);
  assert.equal(offlineAck.code, 'COORDINATION_UNAVAILABLE', 'the production API refuses collaboration writes while Redis is unavailable');

  redisProcess = startRedis(redisPort);
  await waitForRedis(redisPort);
  assert.equal(await redisStreamLength(redisUrl, redisStreamName), streamLengthBeforeRestart, 'Redis AOF must restore the Socket.IO stream entries after a Redis process restart');
  await waitForWorkerReadiness(workers, true);

  const recoveryDocument = new Y.Doc();
  clientDocuments.push(recoveryDocument);
  recoveryDocument.getText('content').insert(0, expectedContent[2]);
  const recoveredUpdate = waitForSocketEvent<{ roomId: string }>(clientB, COLLABORATION_EVENTS.UPDATE);
  const recoveryAck = await emitAck<{ ok: boolean; version?: number }>(clientA, COLLABORATION_EVENTS.UPDATE, {
    roomId,
    update: Array.from(Y.encodeStateAsUpdate(recoveryDocument)),
  });
  assert.deepEqual(recoveryAck, { ok: true, version: 3 }, 'the production API accepts updates again after Redis recovers');
  assert.equal((await recoveredUpdate).roomId, roomId, 'the recovered update broadcasts to the other API instance');

  for (const client of clients) client.disconnect();
  clients.length = 0;
  if (proxy) {
    await proxy.close();
    proxy = undefined;
  }
  for (const worker of workers) await stopWorker(worker);
  workers.length = 0;

  await initDatabase();
  databaseOpen = true;
  const persistedUpdates = await queryAll<{ version: number; update_base64: string }>(
    'SELECT version, update_base64 FROM collaboration_document_updates WHERE doc_id = ? ORDER BY version',
    [roomId],
  );
  assert.deepEqual(persistedUpdates.map((item) => Number(item.version)), [1, 2, 3], 'the shared production database stores a gap-free version sequence');
  const restoredDocument = new Y.Doc();
  for (const item of persistedUpdates) {
    Y.applyUpdate(restoredDocument, Uint8Array.from(Buffer.from(item.update_base64, 'base64')));
  }
  const restoredText = restoredDocument.getText('content').toString();
  assert.ok(expectedContent.every((text) => restoredText.includes(text)), `shared database restores both concurrent edits and the post-recovery edit: ${restoredText}`);
  restoredDocument.destroy();
  assert.equal(
    Number((await queryAll<{ count: number }>('SELECT COUNT(*) AS count FROM collaboration_document_locks WHERE doc_id = ?', [roomId]))[0]?.count),
    0,
    'the shared lock was released after the lock refusal test',
  );

  await closeDatabase();
  databaseOpen = false;
  console.log('Redis Streams integration passed: full API dual-process auth/presence/Yjs/locks, shared SQLite concurrency, sticky-session proxy, outage recovery, and AOF stream restoration after forced Redis process termination');
} finally {
  for (const client of clients) client.close();
  if (proxy) await proxy.close();
  for (const worker of workers) await stopWorker(worker);
  await stopProcess(redisProcess);
  for (const document of clientDocuments) document.destroy();
  if (databaseOpen) {
    const { closeDatabase } = await import('../../api/database/db.js');
    await closeDatabase();
  }
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
