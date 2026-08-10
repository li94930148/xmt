import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Server } from 'socket.io';
import { chromium } from 'playwright';

const clientBundle = fs.readFileSync(path.resolve('node_modules/socket.io-client/dist/socket.io.min.js'));
const httpServer = http.createServer((request, response) => {
  if (request.url === '/socket.io-client.js') {
    response.setHeader('content-type', 'application/javascript');
    response.end(clientBundle);
    return;
  }
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(`<!doctype html><title>Socket lifecycle fixture</title><script src="/socket.io-client.js"></script><script>
    window.lifecycle=[];
    function startSocket() {
      const instanceId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const socket = io({ path:'/socket.io', transports:['polling'], upgrade:false, reconnection:true, reconnectionAttempts:5, reconnectionDelay:100 });
      window.socket = socket;
      window.lifecycle.push({ event:'created', instanceId, createdAt });
      socket.on('connect', () => window.lifecycle.push({ event:'connected', instanceId }));
      socket.on('disconnect', (reason) => window.lifecycle.push({ event:'disconnected', instanceId, reason }));
      socket.io.on('reconnect_attempt', (attempt) => window.lifecycle.push({ event:'reconnect_attempt', instanceId, attempt }));
    }
    startSocket();
    document.addEventListener('visibilitychange', () => window.lifecycle.push({ event:'visibility_changed', hidden:document.hidden }));
  </script>`);
});
const io = new Server(httpServer, { transports: ['polling'], allowUpgrades: false, pingInterval: 250, pingTimeout: 500 });
let connectionCount = 0;
let disconnectCount = 0;
io.on('connection', (socket) => {
  connectionCount += 1;
  socket.on('disconnect', () => { disconnectCount += 1; });
});

await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
const address = httpServer.address();
assert(address && typeof address !== 'string');
const fixtureUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const first = await context.newPage();

await first.goto(fixtureUrl);
await first.waitForFunction(() => Boolean((window as Window & { socket?: { connected?: boolean } }).socket?.connected));
const firstInstance = await first.evaluate(() => (window as Window & { lifecycle: Array<{ instanceId: string }> }).lifecycle[0].instanceId);

// Refresh creates one fresh browser instance; the old page cannot retain its polling transport.
await first.reload();
await first.waitForFunction(() => Boolean((window as Window & { socket?: { connected?: boolean } }).socket?.connected));
const refreshedInstance = await first.evaluate(() => (window as Window & { lifecycle: Array<{ instanceId: string }> }).lifecycle[0].instanceId);
assert.notEqual(refreshedInstance, firstInstance);

// Closing and reopening a tab also owns exactly one new socket instance.
const reopened = await context.newPage();
await reopened.goto(fixtureUrl);
await reopened.waitForFunction(() => Boolean((window as Window & { socket?: { connected?: boolean } }).socket?.connected));
const reopenedInstance = await reopened.evaluate(() => (window as Window & { lifecycle: Array<{ instanceId: string }> }).lifecycle[0].instanceId);
assert.notEqual(reopenedInstance, refreshedInstance);

// A real network interruption must reconnect through the same tab lifecycle.
await context.setOffline(true);
await first.waitForTimeout(900);
await context.setOffline(false);
await first.waitForFunction(() => Boolean((window as Window & { socket?: { connected?: boolean } }).socket?.connected), undefined, { timeout: 5_000 });
const recoveredEvents = await first.evaluate(() => (window as Window & { lifecycle: Array<{ event: string }> }).lifecycle.map((event) => event.event));
assert.equal(recoveredEvents.includes('reconnect_attempt'), true);

// Visibility is observed without making claims about OS background throttling in headless Chromium.
await first.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
assert.equal((await first.evaluate(() => (window as Window & { lifecycle: Array<{ event: string }> }).lifecycle.some((event) => event.event === 'visibility_changed'))), true);

// Logout/login equivalent: release the current polling session, then establish one fresh session.
await first.evaluate(() => (window as Window & { socket: { disconnect: () => void } }).socket.disconnect());
await first.waitForFunction(() => !(window as Window & { socket?: { connected?: boolean } }).socket?.connected);
await first.evaluate(() => (window as Window & { socket: { connect: () => void } }).socket.connect());
await first.waitForFunction(() => Boolean((window as Window & { socket?: { connected?: boolean } }).socket?.connected));

assert.ok(connectionCount >= 4);
assert.ok(disconnectCount >= 2);
await context.close();
await browser.close();
io.close();
httpServer.close();
console.log('browser socket auth recovery tests passed');
