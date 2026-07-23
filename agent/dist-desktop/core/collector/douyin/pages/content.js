"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectContent = collectContent;
const common_js_1 = require("../parser/common.js");
const helpers_js_1 = require("./helpers.js");
async function collectContent(page, captures) {
    await (0, helpers_js_1.openPage)(page, 'https://creator.douyin.com/creator-micro/content/manage');
    for (let current = 0; current < 100; current += 1) {
        const next = page.getByRole('button', { name: /下一页|next/i }).last();
        if (!(await next.isVisible().catch(() => false)) || await next.isDisabled().catch(() => true))
            break;
        await next.click().catch(() => undefined);
        await page.waitForTimeout(1400);
    }
    const observeMs = Math.max(0, Number(process.env.XMT_DOUYIN_WORK_LIST_OBSERVE_MS ?? 300_000));
    if (observeMs)
        await page.waitForTimeout(observeMs);
    let works = (0, common_js_1.parseWorks)(captures);
    if (!works.length) {
        works = await page.locator('[data-item-id], [data-id]').evaluateAll((nodes) => nodes.map((node) => {
            const element = node;
            const itemId = element.dataset.itemId || element.dataset.id || '';
            return { item_id: itemId, title: element.querySelector('[title]')?.getAttribute('title') || element.innerText.split('\n')[0] || '', raw: { source: 'dom' } };
        }).filter((item) => item.item_id && item.title)).catch(() => []);
    }
    return { works, dom: await (0, helpers_js_1.bodySnapshot)(page) };
}
