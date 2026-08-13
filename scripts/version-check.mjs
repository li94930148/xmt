import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');
const pkg = JSON.parse(read('package.json')); const lock = JSON.parse(read('package-lock.json'));
const version = pkg.version;
const expectVersion = (file, pattern) => { if (!pattern.test(read(file))) throw new Error(`版本不一致：${file}`); };
const firstVersion = (file) => read(file).match(/v?(\d+\.\d+\.\d+)/)?.[1];
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`系统版本不是标准语义版本：${version}`);
if (version !== lock.version || version !== lock.packages?.['']?.version) throw new Error(`版本不一致：package=${version} lock=${lock.version} root=${lock.packages?.['']?.version}`);
for (const file of ['docs/SYSTEM_VERSION.md', 'docs/SYSTEM_UPDATE.md', 'docs/系统更新说明.md', 'README.md', 'CHANGELOG.md', 'docs/CHANGELOG.md']) {
  expectVersion(file, new RegExp(`(?:v?${version.replaceAll('.', '\\.')})`));
  if (firstVersion(file) !== version) throw new Error(`最新版本不一致：${file}`);
}
const changelogSource = read('src/data/changelog.ts');
if (changelogSource.match(/version:\s*'([^']+)'/)?.[1] !== version) throw new Error('最新版本不一致：src/data/changelog.ts');
const agentPackage = JSON.parse(read('agent/package.json')); const agentVersion = JSON.parse(read('agent/version.json')).version;
if (agentPackage.version !== agentVersion || !/^\d+\.\d+\.\d+-agent$/.test(agentVersion)) throw new Error('Creator Agent 独立版本不一致或格式错误');
console.log(`版本一致：v${version}`);
