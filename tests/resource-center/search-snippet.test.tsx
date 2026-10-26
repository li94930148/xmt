import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResourceSearchSnippet } from '../../src/components/resource-center/ResourceSearchSnippet';

test('renders only FTS match markers as elements and escapes snippet content', () => {
  const html = renderToStaticMarkup(createElement(ResourceSearchSnippet, {
    snippet: '前缀 <mark>命中词</mark> & <img src=x onerror="alert(1)">',
  }));

  assert.match(html, /前缀/);
  assert.match(html, /<mark class="rounded-sm bg-studio-amber-soft px-0\.5 text-studio-amber-contrast">命中词<\/mark>/);
  assert.match(html, /&amp;/);
  assert.match(html, /&lt;img src=x onerror=/);
  assert.doesNotMatch(html, /<img\b/i);
});

test('keeps an unmatched marker as inert text', () => {
  const html = renderToStaticMarkup(createElement(ResourceSearchSnippet, {
    snippet: '未完成 <mark>命中词',
  }));

  assert.match(html, /&lt;mark&gt;命中词/);
  assert.doesNotMatch(html, /<mark\b/i);
});
