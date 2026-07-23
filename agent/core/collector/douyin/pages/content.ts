import type { Page } from 'playwright';
import type { CreatorWork, NetworkCapture } from '../../../types.js';
import { parseWorks } from '../parser/common.js';
import { bodySnapshot, openPage } from './helpers.js';

export async function collectContent(page: Page, captures: NetworkCapture[]): Promise<{ works: CreatorWork[]; dom: string }> {
  await openPage(page, 'https://creator.douyin.com/creator-micro/content/manage');
  for (let current = 0; current < 100; current += 1) {
    const next = page.getByRole('button', { name: /下一页|next/i }).last();
    if (!(await next.isVisible().catch(() => false)) || await next.isDisabled().catch(() => true)) break;
    await next.click().catch(() => undefined); await page.waitForTimeout(1400);
  }
  let works = parseWorks(captures.filter((capture) => capture.name === 'works' || capture.name === 'unknown'));
  if (!works.length) {
    works = await page.locator('[data-item-id], [data-id]').evaluateAll((nodes) => nodes.map((node) => {
      const element = node as HTMLElement; const itemId = element.dataset.itemId || element.dataset.id || '';
      return { item_id: itemId, title: element.querySelector('[title]')?.getAttribute('title') || element.innerText.split('\n')[0] || '', raw: { source: 'dom' } };
    }).filter((item) => item.item_id && item.title)).catch(() => []);
  }
  return { works, dom: await bodySnapshot(page) };
}
