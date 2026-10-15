import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import tailwindConfig from '../../tailwind.config.js';

const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
const studioColors = new Set(Object.keys(tailwindConfig.theme.extend.colors.studio));
const colorUtilityPattern = /(?:^|[^a-z0-9-])(?:bg|text|border|ring|from|via|to|divide|placeholder|decoration|outline|fill|stroke)-studio-([a-z0-9-]+)/g;
const usedColors = new Set();

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
}

const missingColors = [...usedColors].filter((color) => !studioColors.has(color)).sort();
assert.deepEqual(missingColors, [], `Studio color utilities must map to design tokens: ${missingColors.join(', ')}`);

console.log(`Studio token usage passed: ${usedColors.size} referenced color utilities map to the Studio token palette.`);
