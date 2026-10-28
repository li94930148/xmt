/**
 * EditorContextMenu - 编辑器右键菜单
 * 参考腾讯文档风格，支持格式化、批注、链接、标题转换、dark mode
 */
import { useState, useRef, useEffect, useLayoutEffect, useId, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Editor } from '@tiptap/react';
import { useAppStore } from '../../store';
import { calculateContextMenuPosition, getContextMenuSubmenuSide } from './menuBehavior';
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
  const { prompt: promptEditorText, dialog: editorTextPromptDialog } = useEditorTextPrompt();
  const [visible, setVisible] = useState(false);
  const [openSubmenu, setOpenSubmenu] = useState<ContextSubmenu>(null);
  const [position, setPosition] = useState<MenuPosition>({ x: 0, y: 0 });
  const [submenuSide, setSubmenuSide] = useState<'left' | 'right'>('right');
  const [anchor, setAnchor] = useState<MenuPosition>({ x: 0, y: 0 });
  const [measured, setMeasured] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuTriggerRefs = useRef<Record<Exclude<ContextSubmenu, null>, HTMLButtonElement | null>>({
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
    const menu = menuRef.current;
    const menuPosition = calculateContextMenuPosition(
      anchor,
      { width: menu.offsetWidth, height: menu.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    setPosition(menuPosition);
    setSubmenuSide(getContextMenuSubmenuSide(
      menuPosition,
      { width: menu.offsetWidth, height: menu.offsetHeight },
      { width: 160, height: 120 },
      { width: window.innerWidth, height: window.innerHeight },
    ));
    setMeasured(true);
  }, [anchor, visible]);

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

  const itemClass = `flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-colors ${
    isDark ? 'text-studio-text-secondary hover:bg-studio-primary/20' : 'text-studio-text-muted hover:bg-studio-primary/10 hover:text-studio-primary-contrast'
  }`;
  const disabledClass = `flex items-center gap-2.5 w-full px-3 py-2 text-sm ${
    isDark ? 'text-studio-text-muted cursor-not-allowed' : 'text-studio-text-secondary cursor-not-allowed'
  }`;
  const divider = <div className={`my-1 border-t ${isDark ? 'border-studio-border-soft' : 'border-studio-border-soft'}`} />;
  const subMenuClass = `flex items-center justify-between w-full px-3 py-2 text-sm transition-colors ${
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
    if (event.key === 'Escape') {
      event.preventDefault();
      const panel = (event.target as HTMLElement).closest<HTMLElement>('[data-context-submenu-panel]');
      if (openSubmenu && panel) {
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

    if (event.key === 'ArrowLeft' && openSubmenu) {
      const panel = (event.target as HTMLElement).closest<HTMLElement>('[data-context-submenu-panel]');
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
    if (relatedTarget instanceof Node && currentTarget.contains(relatedTarget)) return;
    if (!currentTarget.matches(':hover')) setOpenSubmenu((current) => current === submenu ? null : current);
  };
  const handleSubmenuMouseLeave = (submenu: Exclude<ContextSubmenu, null>, currentTarget: HTMLElement) => {
    if (!currentTarget.contains(document.activeElement)) setOpenSubmenu((current) => current === submenu ? null : current);
  };
  const handleSubmenuTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, submenu: Exclude<ContextSubmenu, null>) => {
    if (event.key !== 'ArrowRight') return;
    event.preventDefault();
    openSubmenuAndFocusFirstOption(submenu);
  };
  const act = (fn: () => void) => { fn(); close(); };
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
      <div data-testid="editor-context-menu" data-anchor-x={anchor.x} data-anchor-y={anchor.y} ref={menuRef} onKeyDown={handleMenuKeyDown} className="fixed z-editor-menu min-w-[200px] rounded-xl border border-studio-border-soft bg-studio-surface-glass py-1.5 shadow-2xl backdrop-blur-sm" style={{ left: position.x, top: position.y, visibility: measured ? 'visible' : 'hidden' }}>

        {/* 剪贴板 */}
        <button onClick={() => act(() => document.execCommand('copy'))} className={hasSelection ? itemClass : disabledClass} disabled={!hasSelection}>
          <Copy className="w-4 h-4" /> 复制 <span className={`ml-auto text-xs text-studio-text-muted`}>Ctrl+C</span>
        </button>
        <button onClick={() => act(() => document.execCommand('cut'))} className={hasSelection ? itemClass : disabledClass} disabled={!hasSelection}>
          <Scissors className="w-4 h-4" /> 剪切 <span className={`ml-auto text-xs text-studio-text-muted`}>Ctrl+X</span>
        </button>
        <button onClick={() => act(() => document.execCommand('paste'))} className={itemClass}>
          <Clipboard className="w-4 h-4" /> 粘贴 <span className={`ml-auto text-xs text-studio-text-muted`}>Ctrl+V</span>
        </button>

        {divider}

        {/* 格式 */}
        <button onClick={() => act(() => editor.chain().focus().toggleBold().run())} className={itemClass}>
          <Bold className="w-4 h-4" /> 加粗 <span className={`ml-auto text-xs text-studio-text-muted`}>Ctrl+B</span>
        </button>
        <button onClick={() => act(() => editor.chain().focus().toggleItalic().run())} className={itemClass}>
          <Italic className="w-4 h-4" /> 斜体 <span className={`ml-auto text-xs text-studio-text-muted`}>Ctrl+I</span>
        </button>
        <button onClick={() => act(() => editor.chain().focus().toggleUnderline().run())} className={itemClass}>
          <Underline className="w-4 h-4" /> 下划线 <span className={`ml-auto text-xs text-studio-text-muted`}>Ctrl+U</span>
        </button>
        <button onClick={() => act(() => editor.chain().focus().toggleStrike().run())} className={itemClass}>
          <Strikethrough className="w-4 h-4" /> 删除线
        </button>

        {divider}

        {/* 文字颜色 */}
        <div
          className="relative group"
          onMouseEnter={() => setOpenSubmenu('text-color')}
          onMouseLeave={(event) => handleSubmenuMouseLeave('text-color', event.currentTarget)}
          onBlur={(event) => handleSubmenuBlur('text-color', event.currentTarget, event.relatedTarget)}
        >
          <button
            type="button"
            ref={(element) => { submenuTriggerRefs.current['text-color'] = element; }}
            className={subMenuClass}
            aria-expanded={openSubmenu === 'text-color'}
            aria-controls={`editor-context-color-${menuInstanceId}`}
            onFocus={() => handleSubmenuFocus('text-color')}
            onClick={() => setOpenSubmenu('text-color')}
            onKeyDown={(event) => handleSubmenuTriggerKeyDown(event, 'text-color')}
          >
            <span className="flex items-center gap-2.5"><Type className="w-4 h-4" /> 文字颜色</span>
            {submenuSide === 'left' ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          <div id={`editor-context-color-${menuInstanceId}`} role="group" aria-label="文字颜色选项" data-context-submenu-panel="text-color" data-testid="editor-context-color-submenu" data-side={submenuSide} className={`absolute ${submenuSide === 'left' ? 'right-full mr-0.5' : 'left-full ml-0.5'} top-0 w-[160px] rounded-lg shadow-xl border py-1.5 ${openSubmenu === 'text-color' ? 'block' : 'hidden'} ${isDark ? 'bg-studio-surface-soft border-studio-border-soft' : 'bg-studio-surface-glass border-studio-border-soft'}`}>
            <div className="grid grid-cols-4 gap-1.5 px-2 py-1">
              {TEXT_COLORS.map((c) => (
                <button key={c.value || 'default'}
                  type="button"
                  onClick={() => act(() => {
                    if (c.value) editor.chain().focus().setColor(c.value).run();
                    else editor.chain().focus().unsetColor().run();
                  })}
                  className="w-6 h-6 rounded border transition-all hover:scale-110 flex items-center justify-center"
                  style={{ borderColor: 'var(--xmt-border-soft)' }} title={c.name} aria-label={`文字颜色：${c.name}`}>
                  <span className="w-4 h-4 rounded-sm font-bold text-xs flex items-center justify-center" style={{ color: c.value || 'var(--editor-fg)' }}>A</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 高亮颜色 */}
        <div
          className="relative group"
          onMouseEnter={() => setOpenSubmenu('highlight-color')}
          onMouseLeave={(event) => handleSubmenuMouseLeave('highlight-color', event.currentTarget)}
          onBlur={(event) => handleSubmenuBlur('highlight-color', event.currentTarget, event.relatedTarget)}
        >
          <button
            type="button"
            ref={(element) => { submenuTriggerRefs.current['highlight-color'] = element; }}
            className={subMenuClass}
            aria-expanded={openSubmenu === 'highlight-color'}
            aria-controls={`editor-context-highlight-${menuInstanceId}`}
            onFocus={() => handleSubmenuFocus('highlight-color')}
            onClick={() => setOpenSubmenu('highlight-color')}
            onKeyDown={(event) => handleSubmenuTriggerKeyDown(event, 'highlight-color')}
          >
            <span className="flex items-center gap-2.5"><Highlighter className="w-4 h-4" /> 高亮颜色</span>
            {submenuSide === 'left' ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          <div id={`editor-context-highlight-${menuInstanceId}`} role="group" aria-label="高亮颜色选项" data-context-submenu-panel="highlight-color" data-testid="editor-context-highlight-submenu" data-side={submenuSide} className={`absolute ${submenuSide === 'left' ? 'right-full mr-0.5' : 'left-full ml-0.5'} top-0 w-[160px] rounded-lg shadow-xl border py-1.5 ${openSubmenu === 'highlight-color' ? 'block' : 'hidden'} ${isDark ? 'bg-studio-surface-soft border-studio-border-soft' : 'bg-studio-surface-glass border-studio-border-soft'}`}>
            <div className="grid grid-cols-4 gap-1.5 px-2 py-1">
              {HIGHLIGHT_COLORS.map((c) => (
                <button key={c.value}
                  type="button"
                  onClick={() => act(() => {
                    if (editor.isActive('highlight', { color: c.value })) editor.chain().focus().unsetHighlight().run();
                    else editor.chain().focus().setHighlight({ color: c.value }).run();
                  })}
                  className="w-6 h-6 rounded border-2 transition-all hover:scale-110"
                  style={{ backgroundColor: c.bg, borderColor: editor.isActive('highlight', { color: c.value }) ? 'var(--xmt-primary)' : 'transparent' }} title={c.name} aria-label={`高亮颜色：${c.name}`} />
              ))}
            </div>
            {editor.isActive('highlight') && (
              <button onClick={() => act(() => editor.chain().focus().unsetHighlight().run())}
                className={`flex items-center gap-1.5 w-full px-3 py-1.5 text-xs ${isDark ? 'text-studio-text-secondary hover:bg-studio-surface-soft' : 'text-studio-text-muted hover:bg-studio-surface-soft'}`}>
                <X className="w-3 h-3" /> 取消高亮
              </button>
            )}
          </div>
        </div>

        {divider}

        {/* 批注 - 捕获 comment 到本地变量避免 TS 缩窄丢失 */}
        {comment ? (
          <>
            <button onClick={() => { const c = comment; act(() => onEditComment?.(c.commentId, c.commentText)); }} className={itemClass}>
              <MessageSquarePlus className="w-4 h-4" /> 编辑批注
            </button>
            <button onClick={() => { const c = comment; act(() => onDeleteComment?.(c.commentId)); }} className={`${itemClass} text-studio-coral-contrast`}>
              <MessageSquareX className="w-4 h-4" /> 删除批注
            </button>
          </>
        ) : (
          <button onClick={() => act(() => onAddComment?.())} className={hasSelection ? itemClass : disabledClass} disabled={!hasSelection}>
            <MessageSquare className="w-4 h-4" /> 添加批注
          </button>
        )}

        {/* 链接 */}
        {editor.isActive('link') ? (
          <button onClick={() => act(() => editor.chain().focus().extendMarkRange('link').unsetLink().run())} className={itemClass}>
            <Unlink className="w-4 h-4" /> 删除链接
          </button>
        ) : (
          <button onClick={() => void insertLink()}
            className={hasSelection ? itemClass : disabledClass} disabled={!hasSelection}>
            <LinkIcon className="w-4 h-4" /> 插入链接
          </button>
        )}

        {divider}

        {/* 转标题 */}
        <button onClick={() => act(() => editor.chain().focus().toggleHeading({ level: 1 }).run())} className={itemClass}>
          <Heading1 className="w-4 h-4" /> 转为标题 1
        </button>
        <button onClick={() => act(() => editor.chain().focus().toggleHeading({ level: 2 }).run())} className={itemClass}>
          <Heading2 className="w-4 h-4" /> 转为标题 2
        </button>
        <button onClick={() => act(() => editor.chain().focus().toggleHeading({ level: 3 }).run())} className={itemClass}>
          <Heading3 className="w-4 h-4" /> 转为标题 3
        </button>

        {divider}

        {/* 删除选中 */}
        <button onClick={() => act(() => editor.chain().focus().deleteSelection().run())}
          className={hasSelection ? `${itemClass} text-studio-coral-contrast` : disabledClass} disabled={!hasSelection}>
          <Trash2 className="w-4 h-4" /> 删除选中
        </button>
      </div>
    </>
    ), document.body)}
    {editorTextPromptDialog}
    </>
  );
}
