import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SearchBar from '../../src/components/studio/SearchBar';

function getSearchInputMarkup(props: React.ComponentProps<typeof SearchBar>) {
  return renderToStaticMarkup(React.createElement(SearchBar, props));
}

test('shared SearchBar exposes an explicit label, placeholder fallback, or generic search name', () => {
  assert.match(getSearchInputMarkup({ 'aria-label': '搜索选题', placeholder: '搜索标题或描述' }), /aria-label="搜索选题"/);
  assert.match(getSearchInputMarkup({ placeholder: '搜索资料正文' }), /aria-label="搜索资料正文"/);
  assert.match(getSearchInputMarkup({}), /aria-label="搜索"/);
  assert.match(getSearchInputMarkup({ placeholder: '搜索资料' }), /<svg[^>]*aria-hidden="true"/);
});

test('shared SearchBar assigns stable unique form identifiers and preserves supplied ones', () => {
  const markup = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(SearchBar, { placeholder: '搜索选题' }),
    React.createElement(SearchBar, { placeholder: '搜索资料' }),
  ));
  const inputTags = Array.from(markup.matchAll(/<input\b[^>]*>/g), ([tag]) => tag);
  const ids = inputTags.map((tag) => tag.match(/\bid="([^"]+)"/)?.[1] ?? '');
  const names = inputTags.map((tag) => tag.match(/\bname="([^"]+)"/)?.[1] ?? '');
  assert.equal(inputTags.length, 2);
  assert.ok(ids.every((id) => id.startsWith('xmt-search-') && id.length > 'xmt-search-'.length));
  assert.equal(new Set(ids).size, 2, 'SearchBar ids are unique within the same render tree');
  assert.ok(names.every((name) => name.startsWith('search-') && name.length > 'search-'.length));

  const explicit = getSearchInputMarkup({ id: 'topic-search', name: 'topic_keyword', placeholder: '搜索选题' });
  assert.match(explicit, /id="topic-search"/);
  assert.match(explicit, /name="topic_keyword"/);
});
