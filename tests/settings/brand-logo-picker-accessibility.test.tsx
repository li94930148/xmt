import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrandLogoPicker } from '../../src/pages/NotificationSettings';

function renderPicker(disabled = false) {
  return renderToStaticMarkup(createElement(BrandLogoPicker, {
    disabled,
    onChange: () => undefined,
    buttonClassName: 'xmt-btn xmt-btn-primary',
  }));
}

test('brand logo picker keeps its file input keyboard reachable with a visible focus indicator', () => {
  const markup = renderPicker();

  assert.match(markup, /<label[^>]*aria-disabled="false"/);
  assert.match(markup, /选择品牌 Logo 图片/);
  assert.match(markup, /type="file"[^>]*accept="image\/\*"/);
  assert.match(markup, /aria-label="选择品牌 Logo 图片"/);
  assert.match(markup, /class="sr-only"/);
  assert.match(markup, /focus-within:outline/);
  assert.doesNotMatch(markup, /class="hidden"/);
});

test('brand logo picker disables the actual file input when settings are locked', () => {
  const markup = renderPicker(true);

  assert.match(markup, /aria-disabled="true"/);
  assert.match(markup, /type="file"[^>]*disabled=""/);
});
