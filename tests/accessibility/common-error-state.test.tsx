import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ErrorState from '../../src/components/common/ErrorState';
import { ErrorState as StudioErrorState } from '../../src/components/studio/AsyncState';

const defaultErrorMarkup = renderToStaticMarkup(React.createElement(ErrorState, {
  title: '消息加载失败',
  description: '请检查连接后重试。',
  actionText: '重试加载',
  onRetry: () => undefined,
}));

assert.match(defaultErrorMarkup, /<div role="alert" aria-atomic="true"/, 'default error states announce their heading and explanation assertively as one message');
assert.match(defaultErrorMarkup, /<h2[^>]*>消息加载失败<\/h2>/, 'the announced region contains the error heading');
assert.match(defaultErrorMarkup, /<p[^>]*>请检查连接后重试。<\/p>/, 'the announced region contains the recovery explanation');
const alertEnd = defaultErrorMarkup.indexOf('</div>', defaultErrorMarkup.indexOf('role="alert"'));
const retryButton = defaultErrorMarkup.indexOf('<button');
assert.ok(retryButton > alertEnd, 'the retry control remains independently reachable outside the alert region');

const notFoundMarkup = renderToStaticMarkup(React.createElement(ErrorState, { variant: 'notFound' }));
assert.match(notFoundMarkup, /<div role="status"/, 'not-found states are announced as a non-urgent status');
assert.doesNotMatch(notFoundMarkup, /role="status" aria-atomic="true"/, 'the non-urgent not-found state is not marked as assertive');

const overriddenMarkup = renderToStaticMarkup(React.createElement(ErrorState, {
  title: 'Background refresh failed',
  announcementRole: 'status',
}));
assert.match(overriddenMarkup, /<div role="status"/, 'callers may override the default alert for non-urgent errors');
assert.doesNotMatch(overriddenMarkup, /role="status" aria-atomic="true"/, 'the status override keeps polite announcement semantics');

const studioPageErrorMarkup = renderToStaticMarkup(React.createElement(StudioErrorState, {
  title: '创作来源快照暂不可用',
  description: '无权查看该来源选题',
  headingLevel: 2,
}));
assert.match(studioPageErrorMarkup, /<h2[^>]*>创作来源快照暂不可用<\/h2>/, 'page-level error messages can use the next heading level');
assert.doesNotMatch(studioPageErrorMarkup, /<h3/, 'the configured page error does not skip a heading level');

console.log('Common error-state accessibility tests passed');
