import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

console.log('正在访问网站...');
await page.goto('https://shandong-chorography.org/#library-c4f66874', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// 截图看看页面结构
await page.screenshot({ path: 'page-overview.png', fullPage: false });
console.log('截图已保存: page-overview.png');

// 获取页面上所有的链接和文本
const links = await page.evaluate(() => {
  const allLinks = [];
  document.querySelectorAll('a, [role="treeitem"], .ant-tree-treenode, [class*="tree"], [class*="menu"]').forEach(el => {
    const text = el.textContent?.trim();
    const href = el.getAttribute('href');
    if (text && text.includes('泰安')) {
      allLinks.push({ text: text.substring(0, 100), href, tag: el.tagName, classes: el.className });
    }
  });
  return allLinks;
});

console.log('找到泰安相关元素:', JSON.stringify(links, null, 2));

// 也搜索一下所有包含"泰安"的文本
const taianTexts = await page.evaluate(() => {
  const texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent?.trim();
    if (text && text.includes('泰安') && text.length < 200) {
      texts.push(text);
    }
  }
  return texts.slice(0, 20);
});

console.log('页面中包含泰安的文本:', JSON.stringify(taianTexts, null, 2));

await browser.close();
