import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

const app = express();
const server = http.createServer(app);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.get('/__qa', async (_req, res, next) => {
  try {
    const html = '<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tests/browser/update-notification-touch-target-harness.tsx"></script></body></html>';
    res.type('html').send(await vite.transformIndexHtml('/__qa', html));
  } catch (error) {
    next(error);
  }
});
app.get('/favicon.ico', (_req, res) => res.status(204).end());
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

try {
  if (process.env.XMT_UPDATE_NOTIFICATION_QA_SERVE === '1') {
    console.log(`Isolated update notification touch QA fixture: ${base}/__qa`);
    await new Promise(() => {});
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${base}/__qa`);
    const notification = page.getByRole('status', { name: '版本更新提示' });
    await notification.waitFor();

    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      const closeButton = page.getByRole('button', { name: '关闭更新提示', exact: true });
      const bounds = await closeButton.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, right: rect.right, width: rect.width, height: rect.height };
      });
      assert.ok(bounds.width >= 40 && bounds.height >= 40, `close control meets the 40px touch target at ${width}px: ${JSON.stringify(bounds)}`);
      assert.ok(bounds.x >= 0 && bounds.right <= width, `close control stays inside the viewport at ${width}px: ${JSON.stringify(bounds)}`);
      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(documentWidth <= width, `notification does not overflow horizontally at ${width}px: document=${documentWidth}`);
    }

    await page.setViewportSize({ width: 320, height: 568 });
    await page.getByRole('button', { name: '关闭更新提示', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '版本提示已关闭' }).waitFor();
    assert.deepEqual(errors, [], 'update notification touch target renders without browser errors');
    await context.close();
    console.log('Update notification touch target browser test passed: 320/390/1440px, close behavior and no horizontal overflow.');
  } finally {
    await browser.close();
  }
} finally {
  await vite.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
