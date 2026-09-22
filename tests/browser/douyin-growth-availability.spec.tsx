import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import { GrowthBlock } from '../../src/pages/creator-center/CreatorDashboard.js';

const cssFile = readdirSync('dist/assets').find(name => /^index-.*\.css$/.test(name));
assert(cssFile, 'run npm run build before browser validation');
const css = readFileSync(path.join('dist/assets', cssFile), 'utf8');
const markup = renderToStaticMarkup(<div className="mx-auto max-w-2xl space-y-4 p-4">
  <GrowthBlock title="近 7 天" official data={{ fans: null, plays: 3505, interactions: 60 }} />
  <GrowthBlock title="近 30 天" official data={{ fans: 0, plays: 0, interactions: -9 }} />
</div>);
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    await page.setContent(`<style>${css}</style>${markup}`);
    assert.equal(await page.getByText('缺少可比粉丝快照').count(), 1);
    assert.equal(await page.getByText('新增播放').count(), 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${width}px layout must not overflow`);
    await page.close();
  }
  console.log('Douyin growth browser checks passed at 390px and 1280px.');
} finally {
  await browser.close();
}
