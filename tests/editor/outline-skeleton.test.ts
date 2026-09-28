import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { buildMissingOutlineSkeleton, extractOutlineHeadings } from '../../src/components/editor/outlineSkeleton';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
Object.defineProperty(globalThis, 'DOMParser', { configurable: true, value: dom.window.DOMParser });

test('只提取真实大纲标题，保留小节层级并去重', () => {
  const headings = extractOutlineHeadings('<p>说明段落</p><h1>开场</h1><h3>采访  要点</h3><h5>收尾</h5><h2>开场</h2>');
  assert.deepEqual(headings, [
    { title: '开场', level: 2 },
    { title: '采访 要点', level: 3 },
    { title: '收尾', level: 4 },
  ]);
});

test('只追加正文中缺少的标题，标题文本不能变成 HTML', () => {
  const headings = extractOutlineHeadings('<h2>已有小节</h2><h2>新小节 &lt;img onerror=alert(1)&gt;</h2>');
  const skeleton = buildMissingOutlineSkeleton(headings, '<h2>已有小节</h2><p>已写内容</p>');
  assert.equal(skeleton.count, 1);
  assert.equal(skeleton.html, '<h2>新小节 &lt;img onerror=alert(1)&gt;</h2><p></p>');
  assert.equal(buildMissingOutlineSkeleton(headings, '<h2>已有小节</h2><h2>新小节 &lt;img onerror=alert(1)&gt;</h2>').count, 0);
});
