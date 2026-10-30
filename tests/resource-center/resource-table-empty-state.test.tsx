import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ResourceTable from '../../src/components/resource-center/ResourceTable';

test('filtered resource results distinguish no matches and announce the empty result', () => {
  const markup = renderToStaticMarkup(createElement(ResourceTable, {
    items: [],
    canEdit: false,
    canDelete: false,
    emptyState: {
      title: '没有符合条件的资料',
      description: '调整搜索内容或分类，或者清除筛选条件后重试。',
      actionLabel: '清除筛选',
      onAction: () => undefined,
    },
  }));

  assert.match(markup, /role="status" aria-live="polite"/);
  assert.match(markup, /没有符合条件的资料/);
  assert.match(markup, /清除筛选/);
});

test('unfiltered empty libraries keep the default empty state without a filter action', () => {
  const markup = renderToStaticMarkup(createElement(ResourceTable, {
    items: [],
    canEdit: false,
    canDelete: false,
  }));

  assert.match(markup, /暂无资料/);
  assert.doesNotMatch(markup, /清除筛选/);
});
