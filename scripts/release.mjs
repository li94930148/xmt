#!/usr/bin/env node

/**
 * 交互式版本发布脚本
 * 使用方式：npm run release
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// 读取当前版本
const packageJsonPath = path.join(rootDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const currentVersion = packageJson.version;

// 创建 readline 接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// 询问函数
function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

// 选择函数
function select(question, options) {
  return new Promise((resolve) => {
    console.log(question);
    options.forEach((opt, index) => {
      console.log(`  ${index + 1}. ${opt}`);
    });
    rl.question('请选择 (输入数字): ', (answer) => {
      const index = parseInt(answer) - 1;
      if (index >= 0 && index < options.length) {
        resolve(index);
      } else {
        resolve(0); // 默认选择第一个
      }
    });
  });
}

// 版本号递增函数
function incrementVersion(version, type) {
  const parts = version.split('.').map(Number);
  switch (type) {
    case 0: // patch
      parts[2] += 1;
      break;
    case 1: // minor
      parts[1] += 1;
      parts[2] = 0;
      break;
    case 2: // major
      parts[0] += 1;
      parts[1] = 0;
      parts[2] = 0;
      break;
  }
  return parts.join('.');
}

// 变更类型
const changeTypes = ['feature', 'improvement', 'fix', 'security'];
const changeTypeLabels = ['新增', '优化', '修复', '安全'];

async function main() {
  console.log('\n🚀 XMT 系统版本发布工具\n');
  console.log(`📦 当前版本: v${currentVersion}\n`);

  // 选择版本号更新方式
  const versionType = await select('请选择版本更新类型:', [
    `Patch (${currentVersion} → ${incrementVersion(currentVersion, 0)}) - Bug 修复`,
    `Minor (${currentVersion} → ${incrementVersion(currentVersion, 1)}) - 新功能`,
    `Major (${currentVersion} → ${incrementVersion(currentVersion, 2)}) - 重大更新`,
    '自定义版本号',
  ]);

  let newVersion;
  if (versionType === 3) {
    newVersion = await ask('请输入新版本号 (如 1.2.0): ');
  } else {
    newVersion = incrementVersion(currentVersion, versionType);
  }

  console.log(`\n📌 新版本: v${newVersion}\n`);

  // 输入更新标题
  const title = await ask('请输入本次更新标题 (如: 新增用户管理功能): ');
  if (!title) {
    console.log('❌ 标题不能为空');
    process.exit(1);
  }

  // 输入更新内容
  console.log('\n📝 请输入更新内容 (每条一行，输入空行结束):\n');
  const changes = [];

  while (true) {
    const description = await ask(`更新内容 #${changes.length + 1} (空行结束): `);
    if (!description) break;

    const typeIndex = await select('请选择类型:', changeTypeLabels);

    changes.push({
      type: changeTypes[typeIndex],
      description: description,
    });

    console.log(`✅ 已添加: [${changeTypeLabels[typeIndex]}] ${description}\n`);
  }

  if (changes.length === 0) {
    console.log('❌ 至少需要一条更新内容');
    process.exit(1);
  }

  // 确认信息
  console.log('\n' + '='.repeat(50));
  console.log(`📦 版本: v${newVersion}`);
  console.log(`📋 标题: ${title}`);
  console.log('📝 更新内容:');
  changes.forEach((change) => {
    const label = changeTypeLabels[changeTypes.indexOf(change.type)];
    console.log(`   [${label}] ${change.description}`);
  });
  console.log('='.repeat(50) + '\n');

  const confirm = await ask('确认发布? (y/n): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('❌ 已取消');
    process.exit(0);
  }

  // 更新 package.json
  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log('✅ 已更新 package.json');

  // 更新 changelog.ts
  const changelogPath = path.join(rootDir, 'src', 'data', 'changelog.ts');
  let changelogContent = fs.readFileSync(changelogPath, 'utf-8');

  // 获取当前日期
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // 生成新版本条目
  const newEntry = `  {
    version: '${newVersion}',
    date: '${date}',
    title: '${title.replace(/'/g, "\\'")}',
    changes: [
${changes
  .map(
    (change) =>
      `      {
        type: '${change.type}',
        description: '${change.description.replace(/'/g, "\\'")}',
      },`
  )
  .join('\n')}
    ],
  },`;

  // 在 changelog 数组开头插入新版本
  changelogContent = changelogContent.replace(
    /export const changelog: ChangelogEntry\[\] = \[/,
    `export const changelog: ChangelogEntry[] = [\n${newEntry}`
  );

  fs.writeFileSync(changelogPath, changelogContent);
  console.log('✅ 已更新 src/data/changelog.ts');

  console.log(`\n🎉 版本 v${newVersion} 发布准备完成！\n`);
  console.log('下一步:');
  console.log('  1. 运行 npm run build 构建项目');
  console.log('  2. 部署到服务器');
  console.log('  3. 用户登录时会自动看到更新提示\n');

  rl.close();
}

main().catch((err) => {
  console.error('❌ 错误:', err);
  process.exit(1);
});
