import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { markdownToHtml } from '../../src/utils/markdown.js';
import { createHtmlSanitizer } from '../../src/utils/sanitizeHtml.js';

const window = new JSDOM('').window as unknown as Window;
const sanitizeHtml = createHtmlSanitizer(window);
const hostile = sanitizeHtml('<img src=x onerror="alert(1)"><svg onload="alert(1)"></svg><a href="javascript:alert(1)">bad</a><iframe srcdoc="<script>alert(1)</script>"></iframe><object data="javascript:alert(1)"></object><form action="javascript:alert(1)"></form>');
for (const forbidden of ['onerror', 'onload', 'javascript:', '<svg', '<iframe', '<object', '<form', 'srcdoc']) assert.equal(hostile.toLowerCase().includes(forbidden), false);

const markdown = sanitizeHtml(markdownToHtml('[bad](javascript:alert(1))'));
assert.equal(markdown.toLowerCase().includes('javascript:'), false);
const safe = sanitizeHtml('<h2 style="color:#ef4444">标题</h2><p><strong>粗体</strong><em>斜体</em><u>下划线</u></p><ul><li>列表</li></ul><table><tbody><tr><td>单元格</td></tr></tbody></table><a href="https://example.com">链接</a><img src="https://example.com/image.png" alt="图片">');
for (const expected of ['<h2', '<strong>', '<em>', '<u>', '<ul>', '<table>', 'https://example.com']) assert.ok(safe.includes(expected));
console.log('HTML sanitization security tests passed');
