export function assessVersionGovernance({ version, lock, read }) {
  const errors = [];
  const expected = new RegExp(`(?:v?${version.replaceAll('.', '\\.')})`);
  const firstVersion = (file) => read(file).match(/v?(\d+\.\d+\.\d+)/)?.[1];
  if (!/^\d+\.\d+\.\d+$/.test(version)) errors.push('系统版本不是标准语义版本');
  if (version !== lock.version || version !== lock.packages?.['']?.version) errors.push('package-lock 版本不一致');
  for (const file of ['docs/SYSTEM_VERSION.md', 'docs/SYSTEM_UPDATE.md', 'docs/系统更新说明.md', 'README.md', 'CHANGELOG.md', 'docs/CHANGELOG.md']) {
    if (!expected.test(read(file)) || firstVersion(file) !== version) errors.push(`最新版本不一致：${file}`);
  }
  if (read('src/data/changelog.ts').match(/version:\s*'([^']+)'/)?.[1] !== version) errors.push('最新版本不一致：src/data/changelog.ts');
  const healthSource = read('api/app.ts'); const viteSource = read('vite.config.ts');
  if (!healthSource.includes("path.join(__dirname, '..', 'package.json')") || !/version:\s*APP_VERSION/.test(healthSource)) errors.push('health 版本源契约不一致');
  if (!viteSource.includes('packageJson.version')) errors.push('UI 版本源契约不一致');
  return errors;
}
