import { useEffect, useCallback } from 'react';

/** 判断当前焦点是否在输入元素中 */
function isInputElement(target: EventTarget | null): boolean {
  if (!target) return false;
  const el = target as HTMLElement;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable ||
    el.getAttribute('role') === 'textbox'
  );
}

interface ShortcutHandlers {
  onCommandPalette?: () => void;
  onShowHelp?: () => void;
  onEscape?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const inInput = isInputElement(e.target);

      // Ctrl+K / ⌘K — Command Palette (任何时候都生效)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        handlers.onCommandPalette?.();
        return;
      }

      // Escape — 关闭弹窗（任何时候都生效）
      if (e.key === 'Escape') {
        handlers.onEscape?.();
        return;
      }

      // ? — 快捷键帮助（仅在非输入区域生效）
      if (e.key === '?' && !inInput) {
        e.preventDefault();
        handlers.onShowHelp?.();
        return;
      }
    },
    [handlers]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
