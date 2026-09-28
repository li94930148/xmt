import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { buildResourceReferenceHtml, referencedResourceIds, resourceIncludesExcerpt } from '../../src/components/production/resourceReference';
import { sanitizeRichText } from '../../api/utils/sanitize-rich-text';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
Object.defineProperty(globalThis, 'DOMParser', { configurable: true, value: dom.window.DOMParser });

test('引用正文携带安全来源链接，后端清洗仍保留来源', () => {
  const html = buildResourceReferenceHtml({ resource_id: 42, title: '采访 <原稿>', content_html: '<p>原话</p>' });
  assert.match(html, /<blockquote><p>原话<\/p><\/blockquote>/);
  assert.match(html, /href="\/asset-center\/resources\/42"/);
  assert.match(html, /来源：采访 &lt;原稿&gt;/);
  assert.deepEqual([...referencedResourceIds(sanitizeRichText(html))], [42]);
});

test('已用只从正文中的本站资料来源链接判断，删除引用即恢复待用', () => {
  const html = '<p>资料 7 只被提及</p><a href="/asset-center/resources/7">来源：资料七</a>'
    + '<a href="https://elsewhere.example/asset-center/resources/8">来源：资料八</a>'
    + '<a href="/asset-center/resources/9">普通链接</a>';
  assert.deepEqual([...referencedResourceIds(html)], [7]);
  assert.deepEqual([...referencedResourceIds('<p>引用已删除</p>')], []);
});

test('无效 ID 或空正文不会生成引用', () => {
  assert.equal(buildResourceReferenceHtml({ resource_id: -1, title: '坏资料', content_html: '<p>正文</p>' }), '');
  assert.equal(buildResourceReferenceHtml({ resource_id: 1, title: '空资料', content_html: ' ' }), '');
});

test('选中片段必须出现在所选资料原文，引用只写入片段和来源', () => {
  const resource = { resource_id: 42, title: '采访原稿', content_html: '<p>第一段采访原话</p><p>第二段其他内容</p>' };
  assert.equal(resourceIncludesExcerpt(resource, '采访 原话'), true);
  assert.equal(resourceIncludesExcerpt(resource, '手动写入的说法'), false);
  const html = buildResourceReferenceHtml(resource, '采访原话');
  assert.match(html, /<blockquote><p>采访原话<\/p><\/blockquote>/);
  assert.doesNotMatch(html, /第二段其他内容/);
  assert.deepEqual([...referencedResourceIds(html)], [42]);
  assert.equal(buildResourceReferenceHtml(resource, '手动写入的说法'), '');
});

test('片段文本按纯文本转义，不能插入 HTML', () => {
  const resource = { resource_id: 7, title: '原稿', content_html: '<p>&lt;script&gt;安全原文&lt;/script&gt;</p>' };
  const html = buildResourceReferenceHtml(resource, '<script>安全原文</script>');
  assert.match(html, /&lt;script&gt;安全原文&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
