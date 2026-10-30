export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type ContextMenuSubmenuSide = 'left' | 'right';

export function getContextMenuSubmenuArrowKey(side: ContextMenuSubmenuSide, action: 'open' | 'close') {
  if (action === 'open') return side === 'left' ? 'ArrowLeft' : 'ArrowRight';
  return side === 'left' ? 'ArrowRight' : 'ArrowLeft';
}

export function calculateContextMenuPosition(pointer: Point, menu: Size, viewport: Size, margin = 8): Point {
  const maxX = Math.max(margin, viewport.width - menu.width - margin);
  const maxY = Math.max(margin, viewport.height - menu.height - margin);
  return {
    x: Math.max(margin, Math.min(pointer.x, maxX)),
    y: Math.max(margin, Math.min(pointer.y, maxY)),
  };
}

export function calculateContextMenuSubmenuSafePosition(
  menuPosition: Point,
  menu: Size,
  submenu: Size,
  viewport: Size,
  margin = 8,
): Point {
  const minimumForLeftSubmenu = submenu.width + margin;
  const maximumForRightSubmenu = viewport.width - menu.width - submenu.width - margin;
  const canFitSubmenuBesideMenu = viewport.width >= menu.width + submenu.width + margin * 2;
  const menuIsBetweenSafeSides = menuPosition.x > maximumForRightSubmenu && menuPosition.x < minimumForLeftSubmenu;

  if (!canFitSubmenuBesideMenu || !menuIsBetweenSafeSides) return menuPosition;

  const distanceToRightSubmenu = menuPosition.x - maximumForRightSubmenu;
  const distanceToLeftSubmenu = minimumForLeftSubmenu - menuPosition.x;
  return {
    ...menuPosition,
    x: distanceToLeftSubmenu <= distanceToRightSubmenu ? minimumForLeftSubmenu : maximumForRightSubmenu,
  };
}

export function getContextMenuSubmenuSide(
  menuPosition: Point,
  menu: Size,
  submenu: Size,
  viewport: Size,
  margin = 8,
): ContextMenuSubmenuSide {
  const availableRight = viewport.width - (menuPosition.x + menu.width) - margin;
  const availableLeft = menuPosition.x - margin;
  if (availableRight >= submenu.width) return 'right';
  if (availableLeft >= submenu.width) return 'left';
  return availableLeft >= availableRight ? 'left' : 'right';
}

export function shouldShowEditorBubbleMenu(input: { contextMenuOpen: boolean; codeBlock: boolean; from: number; to: number }) {
  return !input.contextMenuOpen && !input.codeBlock && input.from !== input.to;
}
