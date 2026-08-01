import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import express from 'express';
import { chromium } from 'playwright';
import { Server } from 'socket.io';

type BrowserAuthSnapshot = {
  status: string;
  socket: string;
  room: boolean;
  yjsVector: string | null;
  awareness: boolean;
  lock: boolean;
  broadcasts: Array<{ type: string }>;
  refreshCount: number;
  accessTokenInMemory: boolean;
};

declare global {
  interface Window {
    e2eAuth: {
      login: () => Promise<BrowserAuthSnapshot>;
      boot: () => Promise<BrowserAuthSnapshot>;
      refreshAndReconnect: () => Promise<BrowserAuthSnapshot>;
      logout: () => Promise<BrowserAuthSnapshot>;
      snapshot: () => BrowserAuthSnapshot;
    };
  }
}

const app = express();
app.use(express.json());
let refreshGeneration = 0;
app.post('/api/v1/auth/login', (_req, res) => {
  refreshGeneration = 0;
  res.setHeader('Set-Cookie', 'xmt_refresh=refresh-0; HttpOnly; SameSite=Lax; Path=/');
  res.json({ accessToken: 'access-v1-0', user: { id: 101, name: 'Browser Test' }, session: { id: 'session-browser' } });
});
app.post('/api/v1/auth/refresh', (req, res) => {
  if (!String(req.headers.cookie || '').includes('xmt_refresh=refresh-')) return res.status(401).json({ error: 'expired' });
  refreshGeneration += 1;
  res.setHeader('Set-Cookie', `xmt_refresh=refresh-${refreshGeneration}; HttpOnly; SameSite=Lax; Path=/`);
  res.json({ accessToken: `access-v1-${refreshGeneration}`, user: { id: 101, name: 'Browser Test' }, session: { id: 'session-browser' } });
});
app.post('/api/v1/auth/logout', (_req, res) => {
  res.setHeader('Set-Cookie', 'xmt_refresh=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/');
  res.json({ success: true });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (typeof token !== 'string' || !token.startsWith('access-v1-')) return next(new Error('AUTH_EXPIRED'));
  next();
});
io.on('connection', (socket) => {
  socket.on('collaboration:join', ({ roomId }: { roomId?: string }) => {
    if (!roomId) return;
    socket.join(roomId);
    socket.emit('collaboration:sync', { roomId, update: [1, 2, 3], stateVector: [1, 2, 3], awareness: [4], locked: false });
  });
});

const html = `<!doctype html><title>Auth Socket Yjs E2E</title>
<script src="/socket.io/socket.io.js"></script>
<script>
let accessToken = null; let socket = null; let refreshCount = 0;
const state = { status:'anonymous', socket:'disconnected', room:false, yjsVector:null, awareness:false, lock:false, broadcasts:[] };
const channel = new BroadcastChannel('xmt-auth-e2e');
channel.onmessage = (event) => { state.broadcasts.push(event.data); if (event.data.type === 'logout') { accessToken=null; state.status='expired'; state.socket='disconnected'; socket?.disconnect(); } };
async function refresh() { const response = await fetch('/api/v1/auth/refresh', { method:'POST', credentials:'include' }); if (!response.ok) throw new Error('refresh failed'); const result=await response.json(); accessToken=result.accessToken; refreshCount+=1; return result; }
function connect() { return new Promise((resolve,reject)=> { socket=io({ auth:{ token:accessToken }, transports:['websocket'] }); socket.on('connect',()=>{ state.socket='connected'; state.status='authenticated'; socket.emit('collaboration:join',{roomId:'production:101'}); }); socket.on('connect_error',reject); socket.on('collaboration:sync',(p)=>{state.room=true; state.yjsVector=JSON.stringify(p.stateVector || p.update); state.awareness=Array.isArray(p.awareness); state.lock=typeof p.locked === 'boolean'; setTimeout(resolve,0);}); }); }
async function login() { const response=await fetch('/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:'{}',credentials:'include'}); const result=await response.json(); accessToken=result.accessToken; await connect(); return snapshot(); }
async function boot() { if (!accessToken) await refresh(); await connect(); return snapshot(); }
async function refreshAndReconnect() { await refresh(); socket.disconnect(); state.socket='disconnected'; await connect(); return snapshot(); }
async function logout() { await fetch('/api/v1/auth/logout',{method:'POST',credentials:'include'}); accessToken=null; socket?.disconnect(); state.status='expired'; state.socket='disconnected'; channel.postMessage({type:'logout'}); return snapshot(); }
function snapshot() { return {...state, refreshCount, accessTokenInMemory:Boolean(accessToken)}; }
window.e2eAuth={login,boot,refreshAndReconnect,logout,snapshot};
</script>`;
app.get('/', (_req, res) => res.type('html').send(html));

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const baseURL = `http://127.0.0.1:${address.port}`;
const home = `${process.env.HOME}/Library/Caches/ms-playwright`;
const cachedBrowser = fs.readdirSync(home, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('chromium-'))
  .map((entry) => `${home}/${entry.name}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`)
  .find((candidate) => fs.existsSync(candidate));
const browser = await chromium.launch({ headless: true, executablePath: cachedBrowser || chromium.executablePath() });
const context = await browser.newContext();
const first = await context.newPage();
const second = await context.newPage();

try {
  await first.goto(baseURL);
  await second.goto(baseURL);
  const loggedIn = await first.evaluate(() => window.e2eAuth.login());
  assert.equal(loggedIn.status, 'authenticated');
  assert.equal(loggedIn.socket, 'connected');
  assert.equal(loggedIn.room, true);
  assert.equal(loggedIn.yjsVector, '[1,2,3]');
  assert.equal(loggedIn.awareness, true);
  assert.equal(loggedIn.lock, true);
  assert.equal(loggedIn.accessTokenInMemory, true);

  const beforeRefresh = loggedIn.yjsVector;
  const afterRefresh = await first.evaluate(() => window.e2eAuth.refreshAndReconnect());
  assert.equal(afterRefresh.socket, 'connected');
  assert.equal(afterRefresh.room, true);
  assert.equal(afterRefresh.yjsVector, beforeRefresh);
  assert.equal(afterRefresh.refreshCount, 1);

  const afterReload = await (async () => { await first.reload(); return first.evaluate(() => window.e2eAuth.boot()); })();
  assert.equal(afterReload.status, 'authenticated');
  assert.equal(afterReload.room, true);
  assert.equal(afterReload.yjsVector, beforeRefresh);

  await second.evaluate(() => window.e2eAuth.login());
  await first.evaluate(() => window.e2eAuth.logout());
  await second.waitForFunction(() => window.e2eAuth.snapshot().status === 'expired');
  const afterLogout = await second.evaluate(() => window.e2eAuth.snapshot());
  assert.equal(afterLogout.socket, 'disconnected');
  assert.deepEqual(afterLogout.broadcasts, [{ type: 'logout' }]);
  console.log('auth socket yjs browser e2e passed');
} finally {
  await context.close();
  await browser.close();
  io.close();
  server.close();
}
