import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import resolveConfig from 'tailwindcss/resolveConfig.js';
import tailwindConfig from '../../tailwind.config.js';

const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
const studioColors = new Set(Object.keys(tailwindConfig.theme.extend.colors.studio));
const tokenSource = readFileSync('src/styles/tokens.css', 'utf8');
const designSource = readFileSync('DESIGN.md', 'utf8');
const colorUtilityPattern = /(?:^|[^a-z0-9-])(?:bg|text|border|ring|from|via|to|divide|placeholder|decoration|outline|fill|stroke)-studio-([a-z0-9-]+)/g;
const alphaUtilityPattern = /(?:^|[^a-z0-9-])(?:bg|text|border|ring|from|via|to|divide|placeholder|decoration|outline|fill|stroke)-studio-[a-z0-9-]+\/(\d+)(?=$|[^0-9])/g;
const unsupportedThemeAlphaPattern = /(?:^|[^a-z0-9-])(?:bg|text|border|ring|from|via|to|divide|placeholder|decoration|outline|fill|stroke)-theme-[a-z0-9-]+\/\d+(?=$|[^0-9])/g;
const usedColors = new Set();
const usedOpacityValues = new Set();
const unsupportedThemeAlphaUtilities = new Set();
const resolvedOpacityValues = new Set(Object.keys(resolveConfig(tailwindConfig).theme.opacity));

function parseHex(value) {
  return value.slice(1).match(/../g).map((channel) => Number.parseInt(channel, 16));
}

function relativeLuminance(rgb) {
  const channels = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first, second) {
  const values = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function token(block, name) {
  const value = block.match(new RegExp(`--${name}:\\s*(#[\\da-f]{6})`, 'i'))?.[1];
  assert.ok(value, `Studio token ${name} must have a hex color`);
  return parseHex(value);
}

const lightBoundary = tokenSource.indexOf('html.light,');
assert.notEqual(lightBoundary, -1, 'Studio tokens must define a light theme scope');
const themes = [
  { name: 'dark', source: tokenSource.slice(0, lightBoundary) },
  { name: 'light', source: tokenSource.slice(lightBoundary) },
];
for (const theme of themes) {
  const foreground = token(theme.source, 'xmt-text-muted');
  const mutedRgb = theme.source.match(/--xmt-text-muted-rgb:\s*([\d ]+)/)?.[1].trim().split(/\s+/).map(Number);
  assert.deepEqual(mutedRgb, foreground, `${theme.name} muted RGB channels must match the canonical color token`);
  const surfaces = ['xmt-app-bg', 'xmt-app-bg-soft', 'xmt-surface', 'xmt-surface-soft', 'xmt-surface-elevated'];
  for (const surfaceName of surfaces) {
    const surface = token(theme.source, surfaceName);
    const ratio = contrastRatio(foreground, surface);
    assert.ok(ratio >= 4.5, `${theme.name} muted text must reach 4.5:1 on ${surfaceName}; got ${ratio.toFixed(2)}:1`);
  }
}
assert.ok(designSource.includes('`#8594AD`'), 'DESIGN.md must document the current dark muted token');

function collectSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    return sourceExtensions.has(path.slice(path.lastIndexOf('.'))) ? [path] : [];
  });
}

for (const path of collectSourceFiles('src')) {
  const source = readFileSync(path, 'utf8');
  for (const match of source.matchAll(colorUtilityPattern)) usedColors.add(match[1]);
  for (const match of source.matchAll(alphaUtilityPattern)) usedOpacityValues.add(match[1]);
  for (const match of source.matchAll(unsupportedThemeAlphaPattern)) unsupportedThemeAlphaUtilities.add(match[0].trim());
}

const missingColors = [...usedColors].filter((color) => !studioColors.has(color)).sort();
assert.deepEqual(missingColors, [], `Studio color utilities must map to design tokens: ${missingColors.join(', ')}`);
const missingOpacityValues = [...usedOpacityValues].filter((value) => !resolvedOpacityValues.has(value)).sort((a, b) => Number(a) - Number(b));
assert.deepEqual(missingOpacityValues, [], `Studio color alpha utilities must resolve to generated opacity values: ${missingOpacityValues.join(', ')}`);
assert.deepEqual([...unsupportedThemeAlphaUtilities], [], `theme-* CSS variable colors cannot use slash opacity modifiers: ${[...unsupportedThemeAlphaUtilities].join(', ')}`);

console.log(`Studio token usage passed: ${usedColors.size} referenced color utilities map to Studio tokens; all ${usedOpacityValues.size} used alpha values resolve in Tailwind.`);
