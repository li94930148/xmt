import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

function rgbChannels(color: string) {
  const channels = color.match(/[\d.]+/g)?.map(Number) || [];
  assert.equal(channels.length, 3, `expected an opaque RGB color, received ${color}`);
  return channels;
}

function luminance(color: number[]) {
  const linear = color.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(background: string, foreground: string) {
  const backgroundLuminance = luminance(rgbChannels(background));
  const foregroundLuminance = luminance(rgbChannels(foreground));
  return (Math.max(backgroundLuminance, foregroundLuminance) + 0.05) / (Math.min(backgroundLuminance, foregroundLuminance) + 0.05);
}

const app = express();
app.get('/__qa', (_req, res) => res.type('html').send(`
  <!doctype html>
  <html class="light">
    <head><meta charset="utf-8"><link rel="stylesheet" href="/src/index.css"></head>
    <body>
      <main>
        <p data-testid="body-text">普通正文选区对比度验收</p>
        <table><tbody><tr><td data-testid="table-text"><span>表格单元格选区对比度验收</span></td></tr></tbody></table>
        <div class="rich-text-editor"><p data-testid="editor-text">编辑器选区对比度验收</p></div>
      </main>
    </body>
  </html>
`));

const server = http.createServer(app);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${base}/__qa`);

  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((nextTheme) => {
      document.documentElement.className = nextTheme;
      window.getSelection()?.removeAllRanges();
    }, theme);

    for (const testId of ['body-text', 'table-text', 'editor-text']) {
      const selection = await page.getByTestId(testId).evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const activeSelection = window.getSelection();
        activeSelection?.removeAllRanges();
        activeSelection?.addRange(range);
        const style = getComputedStyle(element, '::selection');
        return { text: activeSelection?.toString() || '', background: style.backgroundColor, foreground: style.color };
      });
      assert.ok(selection.text.length > 0, `${theme}/${testId} should select visible text`);
      const ratio = contrastRatio(selection.background, selection.foreground);
      assert.ok(ratio >= 4.5, `${theme}/${testId} selection contrast is ${ratio.toFixed(2)}:1`);
      if (testId !== 'editor-text') {
        assert.match(selection.background, /^rgb\(/, `${theme}/${testId} should have an opaque selection background`);
      }
    }

    await page.screenshot({ path: `/tmp/xmt-global-selection-${theme}.png`, fullPage: true });
  }

  assert.deepEqual(errors, [], errors.join('\n'));
  console.log('全局文字、表格与编辑器亮/暗主题选区对比回归通过');
  await page.close();
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await vite.close();
}
