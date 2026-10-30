/**
 * EditorContextMenu - 编辑器右键菜单
 * 参考腾讯文档风格，支持格式化、批注、链接、标题转换、dark mode
 */
import { useState, useRef, useEffect, useLayoutEffect, useId, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Editor } from '@tiptap/react';
import { useAppStore } from '../../store';
import { calculateContextMenuPosition, calculateContextMenuSubmenuSafePosition, getContextMenuSubmenuArrowKey, getContextMenuSubmenuSide } from './menuBehavior';
import { useEditorTextPrompt } from './useEditorTextPrompt';
import { EDITOR_HIGHLIGHT_COLORS as HIGHLIGHT_COLORS, EDITOR_TEXT_COLORS as TEXT_COLORS } from './editorColorPalette';
import {
  Copy, Scissors, Clipboard,
  Bold, Italic, Underline, Strikethrough,
  Highlighter, Type, Link as LinkIcon, Unlink,
  MessageSquare, MessageSquarePlus, MessageSquareX,
  Heading1, Heading2, Heading3,
  Trash2, ChevronLeft, ChevronRight, X,
} from 'lucide-react';

interface EditorContextMenuProps {
  editor: Editor;
  onAddComment?: () => void;
  onEditComment?: (commentId: string, commentText: string) => void;
  onDeleteComment?: (commentId: string) => void;
  onOpenChange?: (open: boolean) => void;
}

interface MenuPosition { x: number; y: number; }
type ContextSubmenu = 'text-color' | 'highlight-color' | null;

interface CommentInfo { commentId: string; commentText: string; }

/** 从选区提取批注信息 */
function findCommentInSelection(editor: Editor): CommentInfo | null {
  const { from, to } = editor.state.selection;
  if (from === to) return null;
  let result: CommentInfo | null = null;
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (result || !node.isText) return;
    for (const mark of node.marks) {
      if (mark.type.name === 'comment' && mark.attrs.commentId) {
        result = {
          commentId: mark.attrs.commentId as string,
          commentText: (mark.attrs.commentText as string) || '',
        };
        return;
      }
    }
  });
  return result;
}

export default function EditorContextMenu({
  editor, onAddComment, onEditComment, onDeleteComment, onOpenChange,
}: EditorContextMenuProps) {
  const isDark = useAppStore((s) => s.theme) === 'dark';
  const addNotification = useAppStore((s) => s.addNotification);
  const { prompt: promptEditorText, dialog: editorTextPromptDialog } = useEditorTextPrompt();
  const [visible, setVisible] = useState(false);
  const [openSubmenu, setOpenSubmenu] = useState<ContextSubmenu>(null);
  const [position, setPosition] = useState<MenuPosition>({ x: 0, y: 0 });
  const [submenuSide, setSubmenuSide] = useState<'left' | 'right'>('right');
  const [submenuTop, setSubmenuTop] = useState(0);
  const [anchor, setAnchor] = useState<MenuPosition>({ x: 0, y: 0 });
  const [measured, setMeasured] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuScrollRef = useRef<HTMLDivElement>(null);
  const submenuTriggerRefs = useRef<Record<Exclude<ContextSubmenu, null>, HTMLButtonElement | null>>({
    'text-color': null,
    'highlight-color': null,
  });
  const submenuPanelRefs = useRef<Record<Exclude<ContextSubmenu, null>, HTMLDivElement | null>>({
    'text-color': null,
    'highlight-color': null,
  });
  const submenuFocusRequestRef = useRef<ContextSubmenu>(null);
  const skipNextSubmenuFocusOpenRef = useRef(false);
  const menuInstanceId = useId().replace(/:/g, '');

  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const editorEl = editor.view.dom;
    const getSelectionAnchor = (): MenuPosition => {
      try {
        const selectionCoords = editor.view.coordsAtPos(editor.state.selection.from);
        return { x: selectionCoords.left, y: selectionCoords.bottom };
      } catch {
        const editorBounds = editorEl.getBoundingClientRect();
        return { x: editorBounds.left, y: editorBounds.top };
      }
    };
    const openMenuAt = (menuAnchor: MenuPosition) => {
      setAnchor(menuAnchor);
      setMeasured(false);
      setOpenSubmenu(null);
      setVisible(true);
    };
    const handleContextMenu = (e: MouseEvent) => {
      if (editor.isDestroyed) return;
      if (!editorEl.contains(e.target as Node)) return;
      e.preventDefault();
      if (e.clientX === 0 && e.clientY === 0) {
        openMenuAt(getSelectionAnchor());
      } else {
        openMenuAt({ x: e.clientX, y: e.clientY });
      }
    };
    const handleEditorKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.repeat) return;
      const shiftF10 = e.key === 'F10' && e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey;
      const contextMenuKey = e.key === 'ContextMenu' || e.code === 'ContextMenu';
      if (!shiftF10 && !contextMenuKey) return;
      e.preventDefault();
      openMenuAt(getSelectionAnchor());
    };
    editorEl.addEventListener('contextmenu', handleContextMenu);
    editorEl.addEventListener('keydown', handleEditorKeyDown);
    return () => {
      editorEl.removeEventListener('contextmenu', handleContextMenu);
      editorEl.removeEventListener('keydown', handleEditorKeyDown);
    };
  }, [editor]);

  useEffect(() => {
    onOpenChange?.(visible);
    return () => { if (visible) onOpenChange?.(false); };
  }, [onOpenChange, visible]);

  useLayoutEffect(() => {
    if (!visible || !menuRef.current) return;
    const updatePosition = () => {
      const menu = menuRef.current;
      if (!menu) return;
      const menuSize = { width: menu.offsetWidth, height: menu.offsetHeight };
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const menuPosition = calculateContextMenuSubmenuSafePosition(
        calculateContextMenuPosition(anchor, menuSize, viewport),
        menuSize,
        { width: 160, height: 120 },
        viewport,
      );
      setPosition(menuPosition);
      setSubmenuSide(getContextMenuSubmenuSide(menuPosition, menuSize, { width: 160, height: 120 }, viewport));
      setMeasured(true);
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('resize', updatePosition);
    };
  }, [anchor, visible]);

  useLayoutEffect(() => {
    if (!visible || !measured || !openSubmenu || !menuRef.current) return;
    const updateSubmenuPosition = () => {
      const menu = menuRef.current;
      const trigger = submenuTriggerRefs.current[openSubmenu];
      const panel = submenuPanelRefs.current[openSubmenu];
      if (!menu || !trigger || !panel) return;

      const menuBounds = menu.getBoundingClientRect();
      const triggerBounds = trigger.getBoundingClientRect();
      const viewportHeight = Math.min(window.innerHeight, window.visualViewport?.height ?? window.innerHeight);
      const safeTop = Math.max(8, Math.min(triggerBounds.top, viewportHeight - panel.offsetHeight - 8));
      setSubmenuTop(Math.max(0, safeTop - menuBounds.top));
    };

    let frame = 0;
    const schedulePositionUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateSubmenuPosition);
    };

    updateSubmenuPosition();
    const scrollArea = menuScrollRef.current;
    scrollArea?.addEventListener('scroll', schedulePositionUpdate, { passive: true });
    window.addEventListener('resize', schedulePositionUpdate);
    window.visualViewport?.addEventListener('resize', schedulePositionUpdate);
    return () => {
      window.cancelAnimationFrame(frame);
      scrollArea?.removeEventListener('scroll', schedulePositionUpdate);
      window.removeEventListener('resize', schedulePositionUpdate);
      window.visualViewport?.removeEventListener('resize', schedulePositionUpdate);
    };
  }, [measured, openSubmenu, position.x, position.y, submenuSide, visible]);

  useLayoutEffect(() => {
    if (!visible || !measured) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [measured, visible]);

  useLayoutEffect(() => {
    const requestedSubmenu = submenuFocusRequestRef.current;
    if (!requestedSubmenu || openSubmenu !== requestedSubmenu) return;
    const panelId = requestedSubmenu === 'text-color'
      ? `editor-context-color-${menuInstanceId}`
      : `editor-context-highlight-${menuInstanceId}`;
    menuRef.current?.querySelector<HTMLElement>(`#${panelId}`)?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    submenuFocusRequestRef.current = null;
  }, [menuInstanceId, openSubmenu]);

  useEffect(() => {
    if (!visible) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setVisible(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, [visible]);

  if (!visible || !editor || editor.isDestroyed) return editorTextPromptDialog;

  const comment = findCommentInSelection(editor);
  const hasSelection = !editor.state.selection.empty;

  const itemClass = `flex min-h-10 items-center gap-2.5 w-full px-3 py-2 text-sm transition-colors ${
    isDark ? 'text-studio-text-secondary hover:bg-studio-primary/20' : 'text-studio-text-muted hover:bg-studio-primary/10 hover:text-studio-primary-contrast'
  }`;
  const disabledClass = `flex min-h-10 items-center gap-2.5 w-full px-3 py-2 text-sm ${
    isDark ? 'text-studio-text-muted cursor-not-allowed' : 'text-studio-text-secondary cursor-not-allowed'
  }`;
  const divider = <div role="separator" className={`my-1 border-t ${isDark ? 'border-studio-border-soft' : 'border-studio-border-soft'}`} />;
  const subMenuClass = `flex min-h-10 items-center justify-between w-full px-3 py-2 text-sm transition-colors ${
    isDark ? 'text-studio-text-secondary hover:bg-studio-primary/20' : 'text-studio-text-muted hover:bg-studio-primary/10 hover:text-studio-primary-contrast'
  }`;
  const close = () => {
    setOpenSubmenu(null);
    setVisible(false);
  };
  const closeAndRestoreEditorFocus = () => {
    close();
    if (!editor.isDestroyed) editor.view.focus();
  };
  const openSubmenuAndFocusFirstOption = (submenu: Exclude<ContextSubmenu, null>) => {
    if (openSubmenu === submenu) {
      const panelId = submenu === 'text-color'
        ? `editor-context-color-${menuInstanceId}`
        : `editor-context-highlight-${menuInstanceId}`;
      menuRef.current?.querySelector<HTMLElement>(`#${panelId}`)?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
      return;
    }
    submenuFocusRequestRef.current = submenu;
    setOpenSubmenu(submenu);
  };
  const closeSubmenuAndFocusTrigger = (submenu: Exclude<ContextSubmenu, null>) => {
    skipNextSubmenuFocusOpenRef.current = true;
    setOpenSubmenu(null);
    submenuTriggerRefs.current[submenu]?.focus({ preventScroll: true });
  };
  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const activeMenu = target.closest<HTMLElement>('[role="menu"]');
    if (!activeMenu) return;
    const items = Array.from(activeMenu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      .filter((item) => item.closest('[role="menu"]') === activeMenu);

    if (event.key === 'Tab') {
      // The menu is opened from an editor context action. Restore that context
      // before the browser performs its normal forward/backward tab movement.
      close();
      if (!editor.isDestroyed) editor.view.dom.focus();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      const panel = target.closest<HTMLElement>('[data-context-submenu-panel]');
      if (activeMenu !== menuRef.current && openSubmenu && panel) {
        const submenu = panel.dataset.contextSubmenuPanel;
        if (submenu === 'text-color' || submenu === 'highlight-color') closeSubmenuAndFocusTrigger(submenu);
        return;
      }
      if (openSubmenu) {
        setOpenSubmenu(null);
        return;
      }
      closeAndRestoreEditorFocus();
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!items.length) return;
      event.preventDefault();
      const focusedItem = target.closest<HTMLButtonElement>('[role="menuitem"]');
      const currentIndex = focusedItem ? items.indexOf(focusedItem) : -1;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = currentIndex < 0
        ? (direction > 0 ? 0 : items.length - 1)
        : (currentIndex + direction + items.length) % items.length;
      items[nextIndex]?.focus();
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      if (!items.length) return;
      event.preventDefault();
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
      return;
    }

    if (activeMenu !== menuRef.current && openSubmenu
      && event.key === getContextMenuSubmenuArrowKey(submenuSide, 'close')) {
      const panel = target.closest<HTMLElement>('[data-context-submenu-panel]');
      const submenu = panel?.dataset.contextSubmenuPanel;
      if (submenu === 'text-color' || submenu === 'highlight-color') {
        event.preventDefault();
        closeSubmenuAndFocusTrigger(submenu);
      }
    }
  };
  const handleSubmenuFocus = (submenu: Exclude<ContextSubmenu, null>) => {
    if (skipNextSubmenuFocusOpenRef.current) {
      skipNextSubmenuFocusOpenRef.current = false;
      return;
    }
    setOpenSubmenu(submenu);
  };
  const handleSubmenuBlur = (
    submenu: Exclude<ContextSubmenu, null>,
    currentTarget: HTMLElement,
    relatedTarget: EventTarget | null,
  ) => {
    const nextFocusIsInPanel = relatedTarget instanceof Node && submenuPanelRefs.current[submenu]?.contains(relatedTarget);
    if (relatedTarget instanceof Node && (currentTarget.contains(relatedTarget) || nextFocusIsInPanel)) return;
    if (!currentTarget.matches(':hover') && !menuRef.current?.matches(':hover')) {
      setOpenSubmenu((current) => current === submenu ? null : current);
    }
  };
  const handleSubmenuMouseLeave = (submenu: Exclude<ContextSubmenu, null>) => {
    const panelHasFocus = submenuPanelRefs.current[submenu]?.contains(document.activeElement);
    if (!panelHasFocus && !menuRef.current?.matches(':hover')) {
      setOpenSubmenu((current) => current === submenu ? null : current);
    }
  };
  const handleSubmenuTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, submenu: Exclude<ContextSubmenu, null>) => {
    const openSubmenuKey = getContextMenuSubmenuArrowKey(submenuSide, 'open');
    if (event.key !== openSubmenuKey && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openSubmenuAndFocusFirstOption(submenu);
  };
  const act = (fn: () => void) => { fn(); close(); };
  const runClipboardCommand = (command: 'copy' | 'cut' | 'paste') => {
    let succeeded = false;
    try {
      succeeded = document.execCommand(command);
    } catch {
      succeeded = false;
    }

    const outcome = {
      copy: {
        title: succeeded ? '复制成功' : '复制失败',
        message: succeeded ? '所选内容已复制到剪贴板。' : '浏览器未能复制所选内容，请检查剪贴板权限后重试。',
      },
      cut: {
        title: succeeded ? '剪切成功' : '剪切未完成',
        message: succeeded ? '所选内容已剪切到剪贴板。' : '正文未确认变更；请检查剪贴板权限后重试。',
      },
      paste: {
        title: succeeded ? '粘贴成功' : '粘贴未完成',
        message: succeeded ? '剪贴板内容已粘贴。' : '浏览器未允许页面读取剪贴板，请使用系统粘贴快捷键或浏览器菜单。',
      },
    }[command];
    addNotification({ ...outcome, type: succeeded ? 'success' : 'error' });
    closeAndRestoreEditorFocus();
  };
  const insertLink = async () => {
    const url = await promptEditorText({
      title: '插入链接',
      label: '链接 URL',
      description: '输入要应用到所选文字的链接地址。',
      placeholder: 'https://example.com',
    });
    close();
    editor.commands.focus();
    if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <>
    {createPortal((
    <>
      <div data-testid="editor-context-menu-backdrop" className="fixed inset-0 z-editor-backdrop" onClick={close} />
      <div role="menu" aria-label="编辑器上下文菜单" data-testid="editor-context-menu" data-anchor-x={anchor.x} data-anchor-y={anchor.y} ref={menuRef} onKeyDown={handleMenuKeyDown} className="fixed z-editor-menu min-w-[200px] max-h-[calc(100vh-16px)] overflow-visible rounded-xl border border-studio-border-soft bg-studio-surface-glass py-1.5 shadow-2xl backdrop-blur-sm" style={{ left: position.x, top: position.y, visibility: measured ? 'visible' : 'hidden' }}>
        <div ref={menuScrollRef} className="max-h-[calc(100vh-30px)] overflow-y-auto">

        {/* 剪贴板 */}
        <button role="menuitem" tabIndex={-1} aria-disabled={!hasSelection || undefined} onClick={() => { if (hasSelection) runClipboardCommand('copy'); }} className={hasSelection ? itemClass : disabledClass}>
          <Copy className="w-4 h-4" /> 复制 <span className={`ml-auto text-xs text-studio-text-muted`}>Ctrl+C</span>
        </button>
        <button role="menuitem" tabIndex={-1} aria-disabled={!hasSelection || undefined} onClick={() => { if (hasSelection) runClipboardCommand('cut'); }} className={hasSelection ? itemClass : disabledClass}>
          <Scissors className="w-4 h-4" /> 剪切 <span className={`ml-auto text-xs text-studio-text-muted`}>Ctrl+X</span>
        </button>
        <button role="menuitem" tabIndex={-1} onClick={() => runClipboardCommand('paste')} className={itemClass}>
          <Clipboard className="w-4 h-4" /> 粘贴 <span className={`ml-auto text-xs text-studio-text-muted`}>Ctrl+V</span>
        </button>

        {divider}

        {/* 格式 */}
        <button role="menuitem" tabIndex={-1} onClick={() => act(() => editor.chain().focus().toggleBold().run())} className={itemClass}>
          <Bold className="w-4 h-4" /> 加粗 <span className={`ml-auto text-xs text-studio-text-muted`}>Ctrl+B</span>
        </button>
        <button role="menuitem" tabIndex={-1} onClick={() => act(() => editor.chain().focus().toggleItalic().run())} className={itemClass}>
          <Italic className="w-4 h-4" /> 斜体 <span className={`ml-auto text-xs text-studio-text-muted`}>Ctrl+I</span>
        </button>
        <button role="menuitem" tabIndex={-1} onClick={() => act(() => editor.chain().focus().toggleUnderline().run())} className={itemClass}>
          <Underline className="w-4 h-4" /> 下划线 <span className={`ml-auto text-xs text-studio-text-muted`}>Ctrl+U</span>
        </button>
        <button role="menuitem" tabIndex={-1} onClick={() => act(() => editor.chain().focus().toggleStrike().run())} className={itemClass}>
          <Strikethrough className="w-4 h-4" /> 删除线
        </button>

        {divider}

        {/* 文字颜色 */}
        <div
          role="none"
          className="relative group"
          onMouseEnter={() => setOpenSubmenu('text-color')}
          onMouseLeave={() => handleSubmenuMouseLeave('text-color')}
          onBlur={(event) => handleSubmenuBlur('text-color', event.currentTarget, event.relatedTarget)}
        >
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            ref={(element) => { submenuTriggerRefs.current['text-color'] = element; }}
            className={subMenuClass}
            aria-haspopup="menu"
            aria-expanded={openSubmenu === 'text-color'}
            aria-controls={`editor-context-color-${menuInstanceId}`}
            onFocus={() => handleSubmenuFocus('text-color')}
            onClick={() => setOpenSubmenu('text-color')}
            onKeyDown={(event) => handleSubmenuTriggerKeyDown(event, 'text-color')}
          >
            <span className="flex items-center gap-2.5"><Type className="w-4 h-4" /> 文字颜色</span>
            {submenuSide === 'left' ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        </div>

        {/* 高亮颜色 */}
        <div
          role="none"
          className="relative group"
          onMouseEnter={() => setOpenSubmenu('highlight-color')}
          onMouseLeave={() => handleSubmenuMouseLeave('highlight-color')}
          onBlur={(event) => handleSubmenuBlur('highlight-color', event.currentTarget, event.relatedTarget)}
        >
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            ref={(element) => { submenuTriggerRefs.current['highlight-color'] = element; }}
            className={subMenuClass}
            aria-haspopup="menu"
            aria-expanded={openSubmenu === 'highlight-color'}
            aria-controls={`editor-context-highlight-${menuInstanceId}`}
            onFocus={() => handleSubmenuFocus('highlight-color')}
            onClick={() => setOpenSubmenu('highlight-color')}
            onKeyDown={(event) => handleSubmenuTriggerKeyDown(event, 'highlight-color')}
          >
            <span className="flex items-center gap-2.5"><Highlighter className="w-4 h-4" /> 高亮颜色</span>
            {submenuSide === 'left' ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        </div>

        {divider}

        {/* 批注 - 捕获 comment 到本地变量避免 TS 缩窄丢失 */}
        {comment ? (
          <>
            <button role="menuitem" tabIndex={-1} onClick={() => { const c = comment; act(() => onEditComment?.(c.commentId, c.commentText)); }} className={itemClass}>
              <MessageSquarePlus className="w-4 h-4" /> 编辑批注
            </button>
            <button role="menuitem" tabIndex={-1} onClick={() => { const c = comment; act(() => onDeleteComment?.(c.commentId)); }} className={`${itemClass} text-studio-coral-contrast`}>
              <MessageSquareX className="w-4 h-4" /> 删除批注
            </button>
          </>
        ) : (
          <button role="menuitem" tabIndex={-1} aria-disabled={!hasSelection || undefined} onClick={() => { if (hasSelection) act(() => onAddComment?.()); }} className={hasSelection ? itemClass : disabledClass}>
            <MessageSquare className="w-4 h-4" /> 添加批注
          </button>
        )}

        {/* 链接 */}
        {editor.isActive('link') ? (
          <button role="menuitem" tabIndex={-1} onClick={() => act(() => editor.chain().focus().extendMarkRange('link').unsetLink().run())} className={itemClass}>
            <Unlink className="w-4 h-4" /> 删除链接
          </button>
        ) : (
          <button role="menuitem" tabIndex={-1} aria-disabled={!hasSelection || undefined} onClick={() => { if (hasSelection) void insertLink(); }}
            className={hasSelection ? itemClass : disabledClass}>
            <LinkIcon className="w-4 h-4" /> 插入链接
          </button>
        )}

        {divider}

        {/* 转标题 */}
        <button role="menuitem" tabIndex={-1} onClick={() => act(() => editor.chain().focus().toggleHeading({ level: 1 }).run())} className={itemClass}>
          <Heading1 className="w-4 h-4" /> 转为标题 1
        </button>
        <button role="menuitem" tabIndex={-1} onClick={() => act(() => editor.chain().focus().toggleHeading({ level: 2 }).run())} className={itemClass}>
          <Heading2 className="w-4 h-4" /> 转为标题 2
        </button>
        <button role="menuitem" tabIndex={-1} onClick={() => act(() => editor.chain().focus().toggleHeading({ level: 3 }).run())} className={itemClass}>
          <Heading3 className="w-4 h-4" /> 转为标题 3
        </button>

        {divider}

        {/* 删除选中 */}
        <button role="menuitem" tabIndex={-1} aria-disabled={!hasSelection || undefined} onClick={() => { if (hasSelection) act(() => editor.chain().focus().deleteSelection().run()); }}
          className={hasSelection ? `${itemClass} text-studio-coral-contrast` : disabledClass}>
          <Trash2 className="w-4 h-4" /> 删除选中
        </button>
        </div>
        <div
          id={`editor-context-color-${menuInstanceId}`}
          ref={(element) => { submenuPanelRefs.current['text-color'] = element; }}
          role="menu"
          aria-label="文字颜色选项"
          data-context-submenu-panel="text-color"
          data-testid="editor-context-color-submenu"
          data-side={submenuSide}
          onMouseEnter={() => setOpenSubmenu('text-color')}
          onMouseLeave={() => {
            if (!menuRef.current?.matches(':hover') && !submenuPanelRefs.current['text-color']?.contains(document.activeElement)) {
              setOpenSubmenu((current) => current === 'text-color' ? null : current);
            }
          }}
          onBlur={(event) => handleSubmenuBlur('text-color', event.currentTarget, event.relatedTarget)}
          className={`absolute z-10 ${submenuSide === 'left' ? 'right-full' : 'left-full'} max-[376px]:left-auto max-[376px]:right-0 top-0 w-[160px] rounded-lg shadow-xl border py-1.5 ${openSubmenu === 'text-color' ? 'block' : 'hidden'} ${isDark ? 'bg-studio-surface-soft border-studio-border-soft' : 'bg-studio-surface-glass border-studio-border-soft'}`}
          style={{ top: submenuTop }}
        >
          <div role="none" className="grid grid-cols-3 gap-1.5 px-2 py-1">
            {TEXT_COLORS.map((c) => (
              <button key={c.value || 'default'}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => act(() => {
                  if (c.value) editor.chain().focus().setColor(c.value).run();
                  else editor.chain().focus().unsetColor().run();
                })}
                className="h-10 w-10 rounded border transition-all hover:scale-105 flex items-center justify-center"
                style={{ borderColor: 'var(--xmt-border-soft)' }} title={c.name} aria-label={`文字颜色：${c.name}`}>
                <span className="w-4 h-4 rounded-sm font-bold text-xs flex items-center justify-center" style={{ color: c.value || 'var(--editor-fg)' }}>A</span>
              </button>
            ))}
          </div>
        </div>
        <div
          id={`editor-context-highlight-${menuInstanceId}`}
          ref={(element) => { submenuPanelRefs.current['highlight-color'] = element; }}
          role="menu"
          aria-label="高亮颜色选项"
          data-context-submenu-panel="highlight-color"
          data-testid="editor-context-highlight-submenu"
          data-side={submenuSide}
          onMouseEnter={() => setOpenSubmenu('highlight-color')}
          onMouseLeave={() => {
            if (!menuRef.current?.matches(':hover') && !submenuPanelRefs.current['highlight-color']?.contains(document.activeElement)) {
              setOpenSubmenu((current) => current === 'highlight-color' ? null : current);
            }
          }}
          onBlur={(event) => handleSubmenuBlur('highlight-color', event.currentTarget, event.relatedTarget)}
          className={`absolute z-10 ${submenuSide === 'left' ? 'right-full' : 'left-full'} max-[376px]:left-auto max-[376px]:right-0 top-0 w-[160px] rounded-lg shadow-xl border py-1.5 ${openSubmenu === 'highlight-color' ? 'block' : 'hidden'} ${isDark ? 'bg-studio-surface-soft border-studio-border-soft' : 'bg-studio-surface-glass border-studio-border-soft'}`}
          style={{ top: submenuTop }}
        >
          <div role="none" className="grid grid-cols-3 gap-1.5 px-2 py-1">
            {HIGHLIGHT_COLORS.map((c) => (
              <button key={c.value}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => act(() => {
                  if (editor.isActive('highlight', { color: c.value })) editor.chain().focus().unsetHighlight().run();
                  else editor.chain().focus().setHighlight({ color: c.value }).run();
                })}
                className="h-10 w-10 rounded border-2 transition-all hover:scale-105"
                style={{ backgroundColor: c.bg, borderColor: editor.isActive('highlight', { color: c.value }) ? 'var(--xmt-primary)' : 'transparent' }} title={c.name} aria-label={`高亮颜色：${c.name}`} />
            ))}
          </div>
          {editor.isActive('highlight') && (
            <button role="menuitem" tabIndex={-1} onClick={() => act(() => editor.chain().focus().unsetHighlight().run())}
              className={`flex min-h-10 items-center gap-1.5 w-full px-3 py-1.5 text-xs ${isDark ? 'text-studio-text-secondary hover:bg-studio-surface-soft' : 'text-studio-text-muted hover:bg-studio-surface-soft'}`}>
              <X className="w-3 h-3" /> 取消高亮
            </button>
          )}
        </div>
      </div>
    </>
    ), document.body)}
    {editorTextPromptDialog}
    </>
  );
}
