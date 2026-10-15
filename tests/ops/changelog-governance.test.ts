import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { changelog } from '../../src/data/changelog.js';

const packageVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version as string;
const versions = changelog.map(({ version }) => version);
const duplicates = versions.filter((version, index) => versions.indexOf(version) !== index);

assert.deepEqual(duplicates, [], '每个版本号在用户更新说明中只出现一次');
assert.equal(changelog[0]?.version, packageVersion, '当前版本应排在更新说明首位');

console.log(`更新说明版本唯一性通过（${versions.length} 个版本）`);
