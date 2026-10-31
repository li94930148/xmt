import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { analyticsStatToneStyles } from '../../src/pages/analyticsStatColors';

const tokensCss = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
const toneNames = ['success', 'primary', 'coral', 'violet'] as const;

function tokenBlock(selector: string) {
  const selectorIndex = tokensCss.indexOf(selector);
  assert.notEqual(selectorIndex, -1, `theme token selector exists: ${selector}`);
  const openBrace = tokensCss.indexOf('{', selectorIndex);
  const closeBrace = tokensCss.indexOf('}', openBrace);
  assert.ok(openBrace !== -1 && closeBrace !== -1, `theme token selector has a complete block: ${selector}`);
  return tokensCss.slice(openBrace + 1, closeBrace);
}

function tokenValue(block: string, name: string) {
  const match = block.match(new RegExp(`^\\s*--${name}:\\s*([^;]+);`, 'm'));
  assert.ok(match, `theme token exists: --${name}`);
  return match[1].trim();
}

function parseHex(color: string): [number, number, number] {
  const match = color.match(/^#([\da-f]{6})$/i);
  assert.ok(match, `expected a six-digit hex color, received ${color}`);
  return [0, 2, 4].map((index) => Number.parseInt(match[1].slice(index, index + 2), 16)) as [number, number, number];
}

function relativeLuminance(color: string) {
  const [red, green, blue] = parseHex(color);
  const linearize = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return linearize(red) * 0.2126 + linearize(green) * 0.7152 + linearize(blue) * 0.0722;
}

function contrastRatio(foreground: string, background: string) {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

test('Analytics 统计卡使用语义令牌，浅深主题小号文字满足 4.5:1', () => {
  const themes = [
    { name: 'dark', block: tokenBlock(":root,\nhtml.dark,\n.xmt-theme-scope[data-theme='dark'] {") },
    { name: 'light', block: tokenBlock("html.light,\n.xmt-theme-scope[data-theme='light'] {") },
  ];

  assert.deepEqual(Object.keys(analyticsStatToneStyles).sort(), [...toneNames].sort());
  for (const tone of toneNames) {
    const style = analyticsStatToneStyles[tone];
    assert.equal(style.text, `var(--xmt-${tone}-contrast)`);
    assert.equal(style.icon, `var(--xmt-${tone}-contrast)`);
    assert.equal(style.iconBackground, `var(--xmt-${tone}-soft)`);

    for (const theme of themes) {
      const foreground = tokenValue(theme.block, `xmt-${tone}-contrast`);
      const backplate = tokenValue(theme.block, `xmt-${tone}-soft`);
      assert.match(backplate, /^rgba\(/, `${theme.name} ${tone} icon tile uses a translucent semantic fill`);

      for (const surfaceToken of ['xmt-app-bg', 'xmt-surface']) {
        const background = tokenValue(theme.block, surfaceToken);
        const ratio = contrastRatio(foreground, background);
        assert.ok(ratio >= 4.5, `${theme.name} ${tone} text on --${surfaceToken} has ${ratio.toFixed(2)}:1 contrast`);
      }
    }
  }
});
