export type Point = { x: number; y: number };
export type Size = { width: number; height: number };

export function calculateContextMenuPosition(pointer: Point, menu: Size, viewport: Size, margin = 8): Point {
  const maxX = Math.max(margin, viewport.width - menu.width - margin);
  const maxY = Math.max(margin, viewport.height - menu.height - margin);
  return {
    x: Math.max(margin, Math.min(pointer.x, maxX)),
    y: Math.max(margin, Math.min(pointer.y, maxY)),
  };
}

export function getContextMenuSubmenuSide(
  menuPosition: Point,
  menu: Size,
  submenu: Size,
  viewport: Size,
  margin = 8,
): 'left' | 'right' {
  const availableRight = viewport.width - (menuPosition.x + menu.width) - margin;
  const availableLeft = menuPosition.x - margin;
  if (availableRight >= submenu.width) return 'right';
  if (availableLeft >= submenu.width) return 'left';
  return availableLeft >= availableRight ? 'left' : 'right';
}

export function shouldShowEditorBubbleMenu(input: { contextMenuOpen: boolean; codeBlock: boolean; from: number; to: number }) {
  return !input.contextMenuOpen && !input.codeBlock && input.from !== input.to;
}
