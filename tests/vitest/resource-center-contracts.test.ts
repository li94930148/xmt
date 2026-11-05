import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ResourceSearchSnippet } from '../../src/components/resource-center/ResourceSearchSnippet';
import { findUniqueArchiveScriptSourceSnapshot } from '../../src/components/resource-center/findUniqueArchiveScriptSourceSnapshot.js';

describe('Published archive source', () => {
  it('resolves only one same-topic production/version snapshot', () => {
    const source = { topic_id: 71, production_id: 801, version: 'v1.0' };
    const snapshot = { ...source, content: '<p>准确的 v1.0 来源正文</p>' };
    expect(findUniqueArchiveScriptSourceSnapshot([snapshot], source)).toBe(snapshot);
    expect(findUniqueArchiveScriptSourceSnapshot([snapshot, { ...snapshot, content: '<p>冲突副本</p>' }], source)).toBeUndefined();
    expect(findUniqueArchiveScriptSourceSnapshot([], source)).toBeUndefined();
    expect(findUniqueArchiveScriptSourceSnapshot([{ ...snapshot, topic_id: 72 }], source)).toBeUndefined();
  });
});

describe('Resource search snippet', () => {
  it('renders only match markers and escapes snippet content', () => {
    const html = renderToStaticMarkup(createElement(ResourceSearchSnippet, {
      snippet: '前缀 <mark>命中词</mark> & <img src=x onerror="alert(1)">',
    }));

    expect(html).toMatch(/前缀/);
    expect(html).toMatch(/<mark class="rounded-sm bg-studio-amber-soft px-0\.5 text-studio-amber-contrast">命中词<\/mark>/);
    expect(html).toMatch(/&amp;/);
    expect(html).toMatch(/&lt;img src=x onerror=/);
    expect(html).not.toMatch(/<img\b/i);
  });

  it('keeps an unmatched marker as inert text', () => {
    const html = renderToStaticMarkup(createElement(ResourceSearchSnippet, {
      snippet: '未完成 <mark>命中词',
    }));

    expect(html).toMatch(/&lt;mark&gt;命中词/);
    expect(html).not.toMatch(/<mark\b/i);
  });
});
