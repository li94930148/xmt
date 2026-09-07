import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const { scripts } = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));
const missing = [];
let checked = 0;
for (const [name, command] of Object.entries(scripts)) {
  if (!name.startsWith('test:')) continue;
  for (const [file] of command.matchAll(/(?:tests|scripts)\/[\w./-]+\.(?:[cm]?[jt]s|tsx)\b/g)) {
    checked++;
    if (!fs.existsSync(new URL(file, root))) missing.push(`${name}: ${file}`);
  }
}
assert.deepEqual(missing, [], `测试入口不存在：\n${missing.join('\n')}`);
console.log(`测试入口检查通过：${checked} 个文件`);
