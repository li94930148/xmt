import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const source = fs.readFileSync(path.join(root, 'src/pages/ProductionDetail.tsx'), 'utf8');
const buttonSource = fs.readFileSync(
  path.join(root, 'src/features/reactbits-appearance/ReactBitsButtonSlot.tsx'),
  'utf8',
);

function extractVersionActionBlock() {
  const actionStart = source.indexOf('>版本操作<');
  assert.ok(actionStart > 0, '缺少版本操作标题');
  const actionEnd = source.indexOf('关联选题', actionStart);
  assert.ok(actionEnd > actionStart, '版本操作区块边界异常');
  return source.slice(actionStart, actionEnd);
}

function testVersionActionsNotHiddenByBreakpoint() {
  assert.ok(
    !/showSidebar \? 'flex' : 'hidden'/.test(source),
    '版本侧栏禁止再用 hidden/xl:flex 在小屏隐藏核心操作',
  );
  assert.ok(!source.includes('flex-col xl:flex'), '禁止 xl:flex 强制显示/隐藏侧栏');
  assert.ok(source.includes('flex flex-col self-start overflow-visible'), '版本侧栏应始终可见且不裁切');
}

function testCoreActionsAlwaysMounted() {
  for (const label of ['当前版本查看 / 编辑', '小修保存', '另开新版', '提交审核']) {
    assert.ok(source.includes(label), `缺少核心操作：${label}`);
  }
  const actionBlock = extractVersionActionBlock();
  assert.ok(!actionBlock.includes('showSidebar ?'), '版本操作按钮不得随侧栏折叠隐藏');
  assert.ok(actionBlock.includes('flex flex-wrap'), '小修/另开新版应可换行而不是固定两列裁切');
  assert.ok(!actionBlock.includes('grid grid-cols-2'), '禁止刚性两列导致按钮被裁');
}

function testButtonsMayShrinkNotClip() {
  assert.ok(!buttonSource.includes('shrink-0 appearance-none'), '按钮不应强制 shrink-0 导致溢出裁切');
  assert.ok(buttonSource.includes('min-w-0 shrink'), '按钮应允许在窄容器收缩/换行');
}

function testPermissionRulesPreserved() {
  assert.ok(source.includes('canEditProduction && !editorLocked'), '保留编辑权限判断');
  assert.ok(source.includes("editData.status === 'draft'"), '保留提交审核状态判断');
  assert.ok(source.includes("handleVersionedSave('major')"), '保留另开新版业务入口');
}

function testNoViewportWidthGatingForActions() {
  const actionBlock = extractVersionActionBlock();
  assert.ok(!actionBlock.includes('innerWidth'), '操作按钮禁止依赖窗口宽度');
  assert.ok(!actionBlock.includes('matchMedia'), '操作按钮禁止依赖媒体查询 JS');
}

testVersionActionsNotHiddenByBreakpoint();
testCoreActionsAlwaysMounted();
testButtonsMayShrinkNotClip();
testPermissionRulesPreserved();
testNoViewportWidthGatingForActions();

console.log('version-actions-visibility tests passed');
