import assert from 'node:assert/strict';
import { assessVersionGovernance } from '../../scripts/version-governance.mjs';
const sources = {
  'docs/SYSTEM_VERSION.md': '# XMT v2.18.2', 'docs/SYSTEM_UPDATE.md': '# v2.18.2', 'docs/系统更新说明.md': '# v2.18.2', 'README.md': '# v2.18.2', 'CHANGELOG.md': '# v2.18.2', 'docs/CHANGELOG.md': '# v2.18.2',
  'src/data/changelog.ts': "[{ version: '2.18.2' }]", 'api/app.ts': "path.join(__dirname, '..', 'package.json')\nversion: APP_VERSION", 'vite.config.ts': 'packageJson.version',
};
const input = (overrides = {}) => ({ version: '2.18.2', lock: { version: '2.18.2', packages: { '': { version: '2.18.2' } } }, read: (file) => overrides[file] ?? sources[file] });
assert.deepEqual(assessVersionGovernance(input()), []);
assert.ok(assessVersionGovernance(input({ 'docs/SYSTEM_VERSION.md': '# XMT v2.18.1' })).length > 0);
assert.ok(assessVersionGovernance({ ...input(), lock: { version: '2.18.1', packages: { '': { version: '2.18.1' } } } }).length > 0);
assert.ok(assessVersionGovernance(input({ 'api/app.ts': 'version: APP_VERSION' })).length > 0);
console.log('version governance tests passed');
