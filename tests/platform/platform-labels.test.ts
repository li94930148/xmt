import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import PlatformBadge from '../../src/components/studio/PlatformBadge';
import { getPlatformLabel } from '../../src/platform/platform-labels';

test('known platform identifiers use the shared business labels', () => {
  assert.equal(getPlatformLabel('douyin'), '抖音');
  assert.equal(getPlatformLabel('kuaishou'), '快手');
  assert.equal(getPlatformLabel('bilibili'), 'B站');
  assert.equal(getPlatformLabel('xiaohongshu'), '小红书');
  assert.equal(getPlatformLabel('weixin'), '微信视频号');
  assert.equal(getPlatformLabel('other'), '其他');
  assert.equal(getPlatformLabel('RedNote'), '小红书');
  assert.equal(getPlatformLabel('wechat_channels'), '微信视频号');
});

test('localized and custom platform names remain intact while blank values stay blank', () => {
  assert.equal(getPlatformLabel(' DouYin '), '抖音');
  assert.equal(getPlatformLabel('小红书'), '小红书');
  assert.equal(getPlatformLabel('TikTok'), 'TikTok');
  assert.equal(getPlatformLabel('  '), '');
  assert.equal(getPlatformLabel(null), '');
});

test('platform badges pair known identifiers with their shared label and semantic tone', () => {
  const platforms = [
    ['douyin', '抖音', 'text-studio-cyan-contrast'],
    ['kuaishou', '快手', 'text-studio-amber-contrast'],
    ['bilibili', 'B站', 'text-studio-violet-contrast'],
    ['xiaohongshu', '小红书', 'text-studio-coral-contrast'],
    ['rednote', '小红书', 'text-studio-coral-contrast'],
    ['weixin', '微信视频号', 'text-studio-success-contrast'],
    ['wechat_channels', '微信视频号', 'text-studio-success-contrast'],
    ['other', '其他', 'text-studio-text-secondary'],
  ] as const;

  for (const [value, label, tone] of platforms) {
    const markup = renderToStaticMarkup(createElement(PlatformBadge, { platform: value }));
    assert.ok(markup.includes(label), `${value} uses the ${label} business label`);
    assert.ok(markup.includes(tone), `${value} uses its existing semantic tone`);
    assert.ok(!markup.includes(`>${value}<`), `${value} is not exposed as a raw identifier`);
  }
});
