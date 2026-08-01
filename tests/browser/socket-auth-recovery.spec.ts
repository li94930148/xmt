import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { chromium } from 'playwright';

const systemChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cachedBrowser = fs.readdirSync(`${process.env.HOME}/Library/Caches/ms-playwright`, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('chromium-'))
  .map((entry) => `${process.env.HOME}/Library/Caches/ms-playwright/${entry.name}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`)
  .find((candidate) => fs.existsSync(candidate));
const browser = await chromium.launch({
  headless: true,
  executablePath: cachedBrowser || (fs.existsSync(chromium.executablePath()) ? chromium.executablePath() : systemChromePath),
});
const httpServer = http.createServer((_req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end('<title>Socket recovery fixture</title><p id="status">idle</p>');
});
await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
const address = httpServer.address();
assert(address && typeof address !== 'string');
const fixtureUrl = `http://127.0.0.1:${address.port}`;
const context = await browser.newContext();
const first = await context.newPage();
const second = await context.newPage();

await first.goto(fixtureUrl);
await second.goto(fixtureUrl);
await first.evaluate(() => {
  const channel = new BroadcastChannel('xmt-auth-browser-test');
  (window as Window & { received?: string[] }).received = [];
  channel.onmessage = (event) => (window as Window & { received: string[] }).received.push(event.data.type);
});
await second.evaluate(() => {
  const channel = new BroadcastChannel('xmt-auth-browser-test');
  (window as Window & { received?: string[] }).received = [];
  channel.onmessage = (event) => (window as Window & { received: string[] }).received.push(event.data.type);
});

await second.evaluate(() => {
  const channel = new BroadcastChannel('xmt-auth-browser-test');
  channel.postMessage({ type: 'token_refreshed' });
  channel.close();
});
await first.waitForFunction(() => (window as Window & { received?: string[] }).received?.includes('token_refreshed'));
assert.deepEqual(await first.evaluate(() => (window as Window & { received?: string[] }).received), ['token_refreshed']);

const recovery = await first.evaluate(() => {
  const state = { status: 'authenticated', frozen: false, synced: true, socketConnected: true };
  const stateVector = [1, 2, 3];
  state.socketConnected = false;
  state.frozen = true;
  state.synced = false;
  state.socketConnected = true;
  state.synced = true;
  state.frozen = false;
  return { state, stateVector, resumed: state.socketConnected && state.synced && !state.frozen };
});
assert.equal(recovery.resumed, true);
assert.deepEqual(recovery.stateVector, [1, 2, 3]);

await first.evaluate(() => {
  const channel = new BroadcastChannel('xmt-auth-browser-test');
  channel.postMessage({ type: 'logout' });
  channel.close();
});
await second.waitForFunction(() => (window as Window & { received?: string[] }).received?.includes('logout'));
assert.deepEqual(await second.evaluate(() => (window as Window & { received?: string[] }).received), ['token_refreshed', 'logout']);

await context.close();
await browser.close();
httpServer.close();
console.log('browser socket auth recovery tests passed');
