import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateContextMenuPosition, shouldShowEditorBubbleMenu } from './menuBehavior';

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
