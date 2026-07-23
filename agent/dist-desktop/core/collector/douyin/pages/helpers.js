"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openPage = openPage;
exports.clickLabels = clickLabels;
exports.bodySnapshot = bodySnapshot;
async function openPage(page, url) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
}
async function clickLabels(page, labels) {
    for (const label of labels) {
        const target = page.getByText(label, { exact: true }).last();
        if (await target.isVisible().catch(() => false)) {
            await target.click({ timeout: 5000 }).catch(() => undefined);
            await page.waitForTimeout(1200);
        }
    }
}
async function bodySnapshot(page) {
    return page.locator('body').innerText({ timeout: 10_000 }).then((text) => text.slice(0, 200_000)).catch(() => '');
}
