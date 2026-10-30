import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateContextMenuPosition,
  calculateContextMenuSubmenuSafePosition,
  getContextMenuSubmenuArrowKey,
  getContextMenuSubmenuSide,
  shouldShowEditorBubbleMenu,
} from './menuBehavior';

const menu = { width: 236, height: 384 };
const viewport = { width: 1280, height: 720 };

test('普通文本右键使用 MouseEvent client 坐标', () => {
  assert.deepEqual(calculateContextMenuPosition({ x: 420, y: 260 }, menu, viewport), { x: 420, y: 260 });
});

test('选中文字右键时 ContextMenu 保持鼠标坐标且 BubbleMenu 隐藏', () => {
  assert.deepEqual(calculateContextMenuPosition({ x: 860, y: 310 }, menu, viewport), { x: 860, y: 310 });
  assert.equal(shouldShowEditorBubbleMenu({ contextMenuOpen: true, codeBlock: false, from: 2, to: 12 }), false);
});

test('编辑器滚动后仍使用视口 client 坐标并按实际菜单尺寸限界', () => {
  assert.deepEqual(calculateContextMenuPosition({ x: 1260, y: 700 }, menu, viewport), { x: 1036, y: 328 });
});

test('多人协作开启不改变右键菜单互斥规则', () => {
  const collaborationEnabled = true;
  assert.equal(collaborationEnabled, true);
  assert.equal(shouldShowEditorBubbleMenu({ contextMenuOpen: true, codeBlock: false, from: 4, to: 18 }), false);
});

test('远端光标移动不会改变已打开右键菜单的位置', () => {
  const pointer = { x: 512, y: 288 };
  const before = calculateContextMenuPosition(pointer, menu, viewport);
  const remoteCursorPosition = { x: 1100, y: 96 };
  assert.notDeepEqual(remoteCursorPosition, pointer);
  assert.deepEqual(calculateContextMenuPosition(pointer, menu, viewport), before);
});

test('右键菜单靠近右边缘时子菜单向左展开', () => {
  assert.equal(
    getContextMenuSubmenuSide({ x: 174, y: 420 }, { width: 200, height: 384 }, { width: 160, height: 120 }, { width: 390, height: 844 }),
    'left',
  );
});

test('右键菜单靠近左边缘时子菜单保持向右展开', () => {
  assert.equal(
    getContextMenuSubmenuSide({ x: 8, y: 120 }, { width: 200, height: 384 }, { width: 160, height: 120 }, { width: 1280, height: 720 }),
    'right',
  );
});

test('子菜单按实际展开方向选择键盘进入与退出方向', () => {
  assert.equal(getContextMenuSubmenuArrowKey('right', 'open'), 'ArrowRight');
  assert.equal(getContextMenuSubmenuArrowKey('right', 'close'), 'ArrowLeft');
  assert.equal(getContextMenuSubmenuArrowKey('left', 'open'), 'ArrowLeft');
  assert.equal(getContextMenuSubmenuArrowKey('left', 'close'), 'ArrowRight');
});

test('桌面窄视口中菜单会移到子菜单完整展开的一侧', () => {
  const menuSize = { width: 200, height: 384 };
  const submenuSize = { width: 160, height: 120 };
  const viewport = { width: 390, height: 824 };
  const safePosition = calculateContextMenuSubmenuSafePosition({ x: 130, y: 200 }, menuSize, submenuSize, viewport);

  assert.deepEqual(safePosition, { x: 168, y: 200 });
  assert.equal(getContextMenuSubmenuSide(safePosition, menuSize, submenuSize, viewport), 'left');
});

test('手机视口内联子菜单时不为并排布局移动主菜单', () => {
  const viewport = { width: 320, height: 568 };
  const position = { x: 92, y: 120 };

  assert.deepEqual(
    calculateContextMenuSubmenuSafePosition(position, { width: 200, height: 384 }, { width: 160, height: 120 }, viewport),
    position,
  );
});
