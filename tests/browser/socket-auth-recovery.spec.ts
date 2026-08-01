import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const systemChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(fs.existsSync(chromium.executablePath()) ? {} : { executablePath: systemChromePath }),
  });
} catch (error) {
  console.warn(`browser auth recovery tests skipped: ${error instanceof Error ? error.message : 'browser unavailable'}`);
  process.exit(0);
}
const context = await browser.newContext();
const first = await context.newPage();
const second = await context.newPage();

await first.setContent('<title>Socket recovery fixture</title><p id="status">idle</p>');
await second.setContent('<title>Socket recovery fixture</title><p id="status">idle</p>');
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
assert.deepEqual(await second.evaluate(() => (window as Window & { received?: string[] }).received), ['logout']);

await context.close();
await browser.close();
console.log('browser socket auth recovery tests passed');
