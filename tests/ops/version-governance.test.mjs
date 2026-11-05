import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessVersionGovernance } from '../../scripts/version-governance.mjs';
const sources = {
  'docs/SYSTEM_VERSION.md': '# XMT v2.18.2', 'docs/SYSTEM_UPDATE.md': '# v2.18.2', 'docs/系统更新说明.md': '# v2.18.2', 'README.md': '# v2.18.2', 'CHANGELOG.md': '# v2.18.2', 'docs/CHANGELOG.md': '# v2.18.2',
  'src/data/latest-changelog-entry.ts': "{ version: '2.18.2' }", 'src/data/changelog.ts': 'latestChangelogEntry',
  'api/config/index.ts': "path.resolve(configDirectory, '..', '..', 'package.json')",
  'api/app.ts': "from './config/index.js'\nversion: appVersion",
  'api/routes/system-settings.ts': "from '../config/index.js'\nversion: appVersion",
  'vite.config.ts': 'packageJson.version',
};
const input = (overrides = {}) => ({ version: '2.18.2', lock: { version: '2.18.2', packages: { '': { version: '2.18.2' } } }, read: (file) => overrides[file] ?? sources[file] });
assert.deepEqual(assessVersionGovernance(input()), []);
assert.ok(assessVersionGovernance(input({ 'docs/SYSTEM_VERSION.md': '# XMT v2.18.1' })).length > 0);
assert.ok(assessVersionGovernance({ ...input(), lock: { version: '2.18.1', packages: { '': { version: '2.18.1' } } } }).length > 0);
assert.ok(assessVersionGovernance(input({ 'api/app.ts': 'version: APP_VERSION' })).length > 0);
assert.ok(assessVersionGovernance(input({ 'api/routes/system-settings.ts': "from '../config/index.js'\nversion: APP_VERSION" })).length > 0);
assert.ok(assessVersionGovernance(input({ 'src/data/latest-changelog-entry.ts': "{ version: '2.18.1' }" })).length > 0);

const projectRoot = new URL('../../', import.meta.url);
const readProjectFile = (file) => readFileSync(new URL(file, projectRoot), 'utf8');
const packageVersion = JSON.parse(readProjectFile('package.json')).version;
const currentMajor = Number(packageVersion.split('.')[0]);
const activeVersion = (version) => Number(version.split('.')[0]) >= currentMajor - 1;
const markdownVersions = [...readProjectFile('CHANGELOG.md').matchAll(/^## v?(\d+\.\d+\.\d+)/gm)].map((match) => match[1]);
const uiArchiveVersions = [...readProjectFile('src/data/changelog.ts').matchAll(/version:\s*'(\d+\.\d+\.\d+)'/g)].map((match) => match[1]);
const latestUiVersion = readProjectFile('src/data/latest-changelog-entry.ts').match(/version:\s*'(\d+\.\d+\.\d+)'/)?.[1];
const activeMarkdown = markdownVersions.filter(activeVersion);
const activeUi = [...uiArchiveVersions, latestUiVersion].filter((version) => version && activeVersion(version));
assert.equal(activeMarkdown.length, new Set(activeMarkdown).size, '活跃版本的 Markdown 更新记录不能重复');
assert.equal(activeUi.length, new Set(activeUi).size, '活跃版本的前端更新记录不能重复');
assert.deepEqual([...new Set(activeUi)].sort(), [...new Set(activeMarkdown)].sort(), '当前和上一主版本的业务更新记录需与 Markdown 版本覆盖一致');
assert.equal(latestUiVersion, packageVersion, '首页更新提示版本需与工程版本一致');

const updateNotice = readProjectFile('src/components/UpdateNotification.tsx');
assert.match(updateNotice, /data\/latest-changelog-entry/);
assert.doesNotMatch(updateNotice, /from ['"][^'"]*data\/changelog['"]/);
console.log('version governance tests passed');
