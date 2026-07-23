import type { Page } from 'playwright';

export async function openPage(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
}
export async function clickLabels(page: Page, labels: string[]) {
  for (const label of labels) {
    const target = page.getByText(label, { exact: true }).last();
    if (await target.isVisible().catch(() => false)) { await target.click({ timeout: 5000 }).catch(() => undefined); await page.waitForTimeout(1200); }
  }
}
export async function bodySnapshot(page: Page) {
  return page.locator('body').innerText({ timeout: 10_000 }).then((text) => text.slice(0, 200_000)).catch(() => '');
}
