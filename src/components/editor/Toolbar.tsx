/**
 * 编辑器工具栏（重构版）
 * 分组布局：文件 | 编辑 | 标题 | 文字 | 颜色 | 段落 | 插入 | 高级
 * 支持响应式折叠、dark mode、高亮/文字颜色选择器、导出
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import type { CommandProps } from '@tiptap/core';
import { Editor } from '@tiptap/react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { useAppStore } from '../../store';
import { htmlToMarkdown } from '../../utils/markdown';
import { EDITOR_HIGHLIGHT_COLORS as HIGHLIGHT_COLORS, EDITOR_TEXT_COLORS as TEXT_COLORS } from './editorColorPalette';
import {
  Bold, Italic, Underline, Strikethrough,
  Heading1, Heading2, Heading3, Heading4, Type,
  Quote, Code,
  CheckSquare, Link as LinkIcon, Image as ImageIcon,
  Table as TableIcon, Minus, Undo, Redo,
  Highlighter, Printer, MessageSquare,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  ChevronDown, Maximize, Minimize,
  PanelRight, PanelRightClose,
  Download, FileText, FileCode, FileJson,
  MoreHorizontal, IndentIncrease, Paintbrush, List, ListOrdered,
} from 'lucide-react';
import { captureFormatSnapshot, createFormatPainterTransaction, type FormatPainterMode, type FormatSnapshot } from './formatPainter';
import { useEditorTextPrompt } from './useEditorTextPrompt';

interface ToolbarProps {
  editor: Editor | null;
  variant?: 'full' | 'basic';
  onAddComment?: () => void;
  onToggleToc?: () => void;
  showToc?: boolean;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
  onFormatPainterModeChange?: (mode: FormatPainterMode) => void;
}

const HEADING_OPTIONS = [
  { label: '正文', level: 0, icon: Type },
  { label: '标题 1', level: 1, icon: Heading1 },
  { label: '标题 2', level: 2, icon: Heading2 },
  { label: '标题 3', level: 3, icon: Heading3 },
  { label: '标题 4', level: 4, icon: Heading4 },
];

type ToolbarDropdownKey = 'heading' | 'textColor' | 'highlight' | 'file' | 'more';
type ToolbarDropdownLayout = { placement: 'above' | 'below'; maxHeight: number; left?: number; width?: number };
const DEFAULT_DROPDOWN_LAYOUT: ToolbarDropdownLayout = { placement: 'below', maxHeight: 448 };
const TOOLBAR_DROPDOWN_WIDTH: Record<ToolbarDropdownKey, number> = {
  heading: 128,
  textColor: 176,
  highlight: 176,
  file: 160,
  more: 224,
};

function getVisibleBounds(anchor: HTMLElement | null) {
  const visible = { top: 0, right: window.innerWidth, bottom: window.innerHeight, left: 0 };
  let ancestor = anchor?.parentElement ?? null;
  while (ancestor && ancestor !== document.body) {
    const style = window.getComputedStyle(ancestor);
    const clipsX = style.overflowX !== 'visible';
    const clipsY = style.overflowY !== 'visible';
    if (clipsX || clipsY) {
      const bounds = ancestor.getBoundingClientRect();
      const left = bounds.left + ancestor.clientLeft;
      const top = bounds.top + ancestor.clientTop;
      if (clipsX) {
        visible.left = Math.max(visible.left, left);
        visible.right = Math.min(visible.right, left + ancestor.clientWidth);
      }
      if (clipsY) {
        visible.top = Math.max(visible.top, top);
        visible.bottom = Math.min(visible.bottom, top + ancestor.clientHeight);
      }
    }
    ancestor = ancestor.parentElement;
  }
  return visible;
}

export default function Toolbar({
  editor,
  variant = 'full',
  onAddComment,
  onToggleToc,
  showToc,
  onToggleFullscreen,
  isFullscreen,
  onFormatPainterModeChange,
}: ToolbarProps) {
  const isDark = useAppStore((s) => s.theme) === 'dark';
  const [showHeadingDropdown, setShowHeadingDropdown] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showTextColorPicker, setShowTextColorPicker] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [dropdownLayouts, setDropdownLayouts] = useState<Record<ToolbarDropdownKey, ToolbarDropdownLayout>>({
    heading: DEFAULT_DROPDOWN_LAYOUT,
    textColor: DEFAULT_DROPDOWN_LAYOUT,
    highlight: DEFAULT_DROPDOWN_LAYOUT,
    file: DEFAULT_DROPDOWN_LAYOUT,
    more: DEFAULT_DROPDOWN_LAYOUT,
  });
  const headingRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const textColorRef = useRef<HTMLDivElement>(null);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [compact, setCompact] = useState(false);
  const [formatPainterMode, setFormatPainterMode] = useState<FormatPainterMode>('idle');
  const { prompt: promptEditorText, dialog: editorTextPromptDialog } = useEditorTextPrompt();
  const formatPainterModeRef = useRef<FormatPainterMode>('idle');
  const formatSnapshotRef = useRef<FormatSnapshot | null>(null);
  const singleClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressDoubleClickRef = useRef(false);
  const applyingFormatRef = useRef(false);

  const setPainterMode = useCallback((mode: FormatPainterMode) => {
    formatPainterModeRef.current = mode;
    setFormatPainterMode(mode);
    onFormatPainterModeChange?.(mode);
  }, [onFormatPainterModeChange]);

  const stopFormatPainter = useCallback(() => {
    if (singleClickTimerRef.current) clearTimeout(singleClickTimerRef.current);
    singleClickTimerRef.current = null;
    formatSnapshotRef.current = null;
    setPainterMode('idle');
  }, [setPainterMode]);

  const positionDropdown = useCallback((key: ToolbarDropdownKey, anchor: HTMLDivElement | null) => {
    const bounds = anchor?.getBoundingClientRect();
    if (!bounds) return;
    const visibleBounds = getVisibleBounds(anchor);
    const spaceAbove = bounds.top - visibleBounds.top;
    const spaceBelow = visibleBounds.bottom - bounds.bottom;
    const zoomScale = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    const preferredHeight = Math.min((visibleBounds.bottom - visibleBounds.top) * 0.7, 448) * zoomScale;
    const placement = spaceBelow >= preferredHeight
      ? 'below'
      : spaceAbove >= preferredHeight
        ? 'above'
        : spaceAbove > spaceBelow ? 'above' : 'below';
    const availableSpace = placement === 'above' ? spaceAbove : spaceBelow;
    const toolbarBounds = toolbarRef.current?.getBoundingClientRect();
    const safeLeft = Math.max(8, visibleBounds.left, toolbarBounds?.left ?? 8);
    const safeRight = Math.max(safeLeft, Math.min(visibleBounds.right - 8, toolbarBounds?.right ?? visibleBounds.right - 8));
    const menuWidth = Math.max(0, Math.min(TOOLBAR_DROPDOWN_WIDTH[key], safeRight - safeLeft));
    const menuLeft = Math.min(Math.max(safeLeft, bounds.right - menuWidth), safeRight - menuWidth) - bounds.left;
    const maxHeight = Math.max(0, Math.min(448, (availableSpace - 8) / zoomScale));
    setDropdownLayouts((current) => {
      const previous = current[key];
      if (previous.placement === placement && previous.maxHeight === maxHeight && previous.left === menuLeft && previous.width === menuWidth) return current;
      return { ...current, [key]: { placement, maxHeight, left: menuLeft, width: menuWidth } };
    });
  }, []);

  const dropdownPositionStyle = (key: ToolbarDropdownKey) => {
    const layout = dropdownLayouts[key];
    return {
      top: layout.placement === 'below' ? '100%' : 'auto',
      bottom: layout.placement === 'above' ? '100%' : 'auto',
      marginTop: layout.placement === 'below' ? '0.25rem' : 0,
      marginBottom: layout.placement === 'above' ? '0.25rem' : 0,
      maxHeight: `${layout.maxHeight}px`,
      overflowY: 'auto' as const,
      left: `${layout.left ?? 0}px`,
      right: 'auto',
      width: `${layout.width ?? TOOLBAR_DROPDOWN_WIDTH[key]}px`,
    };
  };

  const startFormatPainter = useCallback((mode: Exclude<FormatPainterMode, 'idle'>) => {
    if (!editor) return;
    const snapshot = captureFormatSnapshot(editor.state);
    if (!snapshot) return;
    formatSnapshotRef.current = snapshot;
    setPainterMode(mode);
  }, [editor, setPainterMode]);

  useEffect(() => {
    if (!editor) return;
    const applyTargetSelection = () => {
      const mode = formatPainterModeRef.current;
      const snapshot = formatSnapshotRef.current;
      if (mode === 'idle' || !snapshot || applyingFormatRef.current) return;
      if (editor.state.selection.empty) return;
      applyingFormatRef.current = true;
      try {
        const tr = createFormatPainterTransaction(editor.state, snapshot);
        if (!tr) return;
        editor.view.dispatch(tr);
        if (mode === 'single') stopFormatPainter();
      } finally {
        applyingFormatRef.current = false;
      }
    };
    editor.on('selectionUpdate', applyTargetSelection);
    return () => {
      editor.off('selectionUpdate', applyTargetSelection);
    };
  }, [editor, stopFormatPainter]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const dropdownOpen = showHeadingDropdown || showHighlightPicker || showTextColorPicker || showFileMenu || showMoreMenu;
      const painterActive = formatPainterModeRef.current !== 'idle';
      if (!dropdownOpen && !painterActive) return;

      const activeElement = document.activeElement;
      if (dropdownOpen && activeElement instanceof HTMLElement) {
        const activeMenuRef = [headingRef, textColorRef, highlightRef, fileMenuRef, moreMenuRef]
          .find((ref) => ref.current?.contains(activeElement));
        const trigger = activeMenuRef?.current?.querySelector('button');
        if (trigger && trigger !== activeElement) trigger.focus();
      }

      event.preventDefault();
      setShowHeadingDropdown(false);
      setShowHighlightPicker(false);
      setShowTextColorPicker(false);
      setShowFileMenu(false);
      setShowMoreMenu(false);
      if (painterActive) stopFormatPainter();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showFileMenu, showHeadingDropdown, showHighlightPicker, showMoreMenu, showTextColorPicker, stopFormatPainter]);

  useEffect(() => () => stopFormatPainter(), [stopFormatPainter]);

  const handleFormatPainterClick = () => {
    if (formatPainterModeRef.current !== 'idle') {
      suppressDoubleClickRef.current = true;
      stopFormatPainter();
      return;
    }
    if (singleClickTimerRef.current) clearTimeout(singleClickTimerRef.current);
    singleClickTimerRef.current = setTimeout(() => {
      singleClickTimerRef.current = null;
      startFormatPainter('single');
    }, 220);
  };

  const handleFormatPainterDoubleClick = () => {
    if (suppressDoubleClickRef.current) {
      suppressDoubleClickRef.current = false;
      return;
    }
    if (singleClickTimerRef.current) clearTimeout(singleClickTimerRef.current);
    singleClickTimerRef.current = null;
    startFormatPainter('persistent');
  };

  // 检测工具栏宽度，自动折叠
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCollapsed(entry.contentRect.width < 700);
        setCompact(entry.contentRect.width < 480);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 点击外部关闭所有弹出
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (headingRef.current && !headingRef.current.contains(target)) setShowHeadingDropdown(false);
      if (highlightRef.current && !highlightRef.current.contains(target)) setShowHighlightPicker(false);
      if (textColorRef.current && !textColorRef.current.contains(target)) setShowTextColorPicker(false);
      if (fileMenuRef.current && !fileMenuRef.current.contains(target)) setShowFileMenu(false);
      if (moreMenuRef.current && !moreMenuRef.current.contains(target)) setShowMoreMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const anchorIsVisible = (anchor: HTMLDivElement | null) => {
      if (!anchor) return false;
      const bounds = anchor.getBoundingClientRect();
      const visibleBounds = getVisibleBounds(anchor);
      return bounds.bottom > visibleBounds.top
        && bounds.top < visibleBounds.bottom
        && bounds.right > visibleBounds.left
        && bounds.left < visibleBounds.right;
    };
    const closeOffscreenDropdowns = () => {
      if (showHeadingDropdown) {
        if (anchorIsVisible(headingRef.current)) positionDropdown('heading', headingRef.current);
        else setShowHeadingDropdown(false);
      }
      if (showHighlightPicker) {
        if (anchorIsVisible(highlightRef.current)) positionDropdown('highlight', highlightRef.current);
        else setShowHighlightPicker(false);
      }
      if (showTextColorPicker) {
        if (anchorIsVisible(textColorRef.current)) positionDropdown('textColor', textColorRef.current);
        else setShowTextColorPicker(false);
      }
      if (showFileMenu) {
        if (anchorIsVisible(fileMenuRef.current)) positionDropdown('file', fileMenuRef.current);
        else setShowFileMenu(false);
      }
      if (showMoreMenu) {
        if (anchorIsVisible(moreMenuRef.current)) positionDropdown('more', moreMenuRef.current);
        else setShowMoreMenu(false);
      }
    };
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(closeOffscreenDropdowns);
    const observeClippingAncestors = (anchor: HTMLDivElement | null) => {
      let ancestor = anchor?.parentElement ?? null;
      while (resizeObserver && ancestor && ancestor !== document.body) {
        const style = window.getComputedStyle(ancestor);
        if (style.overflowX !== 'visible' || style.overflowY !== 'visible') resizeObserver.observe(ancestor);
        ancestor = ancestor.parentElement;
      }
    };
    if (showHeadingDropdown) observeClippingAncestors(headingRef.current);
    if (showHighlightPicker) observeClippingAncestors(highlightRef.current);
    if (showTextColorPicker) observeClippingAncestors(textColorRef.current);
    if (showFileMenu) observeClippingAncestors(fileMenuRef.current);
    if (showMoreMenu) observeClippingAncestors(moreMenuRef.current);
    if (toolbarRef.current) resizeObserver?.observe(toolbarRef.current);
    document.addEventListener('scroll', closeOffscreenDropdowns, { capture: true, passive: true });
    window.addEventListener('resize', closeOffscreenDropdowns);
    return () => {
      document.removeEventListener('scroll', closeOffscreenDropdowns, true);
      window.removeEventListener('resize', closeOffscreenDropdowns);
      resizeObserver?.disconnect();
    };
  }, [positionDropdown, showFileMenu, showHeadingDropdown, showHighlightPicker, showMoreMenu, showTextColorPicker]);

  if (!editor) return null;

  const btnClass = (active?: boolean) =>
    `inline-flex min-h-10 min-w-10 items-center justify-center rounded transition-colors ${
      active
        ? isDark
          ? 'bg-studio-primary-button text-white'
          : 'bg-studio-primary/15 text-studio-primary'
        : 'text-studio-text-secondary hover:bg-studio-surface-soft'
    }`;

  const divider = <div className={`editor-toolbar-divider w-px h-6 mx-1 shrink-0 bg-studio-border-soft`} />;

  const groupLabel = (text: string) => (
    <span className={`editor-group-label text-[10px] font-medium uppercase tracking-wider select-none ${
      isDark ? 'text-studio-text-muted' : 'text-studio-text-muted'
    }`}>
      {text}
    </span>
  );

  // 当前标题状态
  const getCurrentHeadingLabel = () => {
    for (let level = 1; level <= 4; level++) {
      if (editor.isActive('heading', { level })) return `H${level}`;
    }
    return '正文';
  };

  // 导出功能
  const exportMarkdown = () => {
    const html = editor.getHTML();
    const md = htmlToMarkdown(html);
    downloadFile(md, 'document.md', 'text/markdown');
    setShowFileMenu(false);
  };

  const exportHTML = () => {
    const html = editor.getHTML();
    downloadFile(html, 'document.html', 'text/html');
    setShowFileMenu(false);
  };

  const exportJSON = () => {
    const json = JSON.stringify(editor.getJSON(), null, 2);
    downloadFile(json, 'document.json', 'application/json');
    setShowFileMenu(false);
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (!editor) return;
    const printContent = editor.getHTML();
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`<!DOCTYPE html><html><head><title>打印</title><meta charset="utf-8"><style>
        body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;line-height:1.8;padding:40px;max-width:800px;margin:0 auto;color:#1a1a1a}
        h1,h2,h3,h4,h5,h6{margin-top:1.5em;margin-bottom:.5em}p{margin-bottom:1em}
        table{border-collapse:collapse;width:100%}table td,table th{border:1px solid #999;padding:6pt}table th{background:#eee!important;font-weight:bold}
        blockquote{border-left:3px solid #999;padding-left:12pt;margin-left:0;color:#555}
        pre{background:#f5f5f5;border:1px solid #ddd;padding:8pt;white-space:pre-wrap}
        /* 高亮：每种颜色独立显示 */
        mark{padding:0 2px;border-radius:2px}
        mark[data-color="yellow"]{background-color:#fef08a}
        mark[data-color="green"]{background-color:#bbf7d0}
        mark[data-color="blue"]{background-color:#bfdbfe}
        mark[data-color="red"]{background-color:#fecaca}
        mark[data-color="purple"]{background-color:#ddd6fe}
        mark[data-color="orange"]{background-color:#fed7aa}
        mark[data-color="gray"]{background-color:#e5e7eb}
        mark[data-color="cyan"]{background-color:#a5f3fc}
        mark:not([data-color]){background-color:#fef08a}
        /* 批注 */
        .comment-mark,span[data-comment-id]{background-color:#fef3c7!important;border-bottom:2px solid #F5C86B!important}
        span[data-comment-id]::after{content:"【批注："attr(data-comment-text)"】";font-size:7pt;color:#FDEFC8;background:#121826;border:1px solid #F5C86B;border-radius:2pt;padding:0 4pt;margin-left:4pt;vertical-align:middle;white-space:nowrap}
        @media print{body{padding:20px}}
      </style></head><body>${printContent}</body></html>`);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    }
    setShowFileMenu(false);
  };

  const setLink = async () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = await promptEditorText({
      title: previousUrl ? '编辑链接' : '插入链接',
      label: '链接 URL',
      description: '输入要应用到所选文字的链接地址。留空并确认可移除当前链接。',
      initialValue: typeof previousUrl === 'string' ? previousUrl : '',
      placeholder: 'https://example.com',
    });
    editor.commands.focus();
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const addImage = async () => {
    const url = await promptEditorText({
      title: '插入图片',
      label: '图片 URL',
      description: '输入图片地址，确认后插入到当前光标位置。',
      placeholder: 'https://example.com/image.jpg',
    });
    editor.commands.focus();
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const handleHighlight = (color: string) => {
    if (editor.isActive('highlight', { color })) {
      editor.chain().focus().unsetHighlight().run();
    } else {
      editor.chain().focus().setHighlight({ color }).run();
    }
    setShowHighlightPicker(false);
  };

  const handleTextColor = (color: string) => {
    if (!color) {
      editor.chain().focus().unsetColor().run();
    } else {
      editor.chain().focus().setColor(color).run();
    }
    setShowTextColorPicker(false);
  };

  const getSelectedParagraphs = () => {
    const { state } = editor;
    const { from, to, $from } = state.selection;
    const paragraphs: Array<{ pos: number; node: ProseMirrorNode }> = [];
    const seen = new Set<number>();

    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name !== 'paragraph' || seen.has(pos)) return;
      seen.add(pos);
      paragraphs.push({ pos, node });
    });

    if (paragraphs.length === 0) {
      for (let depth = $from.depth; depth > 0; depth -= 1) {
        const node = $from.node(depth);
        if (node.type.name === 'paragraph') {
          const pos = $from.before(depth);
          paragraphs.push({ pos, node });
          break;
        }
      }
    }

    return paragraphs;
  };

  const isTextIndentActive = () => getSelectedParagraphs().some(({ node }) => node.attrs.textIndent === '2em');

  const toggleFirstLineIndent = () => {
    const paragraphs = getSelectedParagraphs();
    if (paragraphs.length === 0) return;
    const shouldClear = paragraphs.every(({ node }) => node.attrs.textIndent === '2em');

    editor.chain().focus().command(({ tr, dispatch }: CommandProps) => {
      paragraphs.forEach(({ pos, node }) => {
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          textIndent: shouldClear ? null : '2em',
        });
      });
      if (dispatch) dispatch(tr.scrollIntoView());
      return true;
    }).run();
  };

  const toggleMoreMenu = () => {
    if (!showMoreMenu) positionDropdown('more', moreMenuRef.current);
    setShowMoreMenu((open) => !open);
  };

  const dropdownClass = `absolute left-0 z-editor-menu rounded-lg shadow-xl border py-1 ${
    isDark ? 'bg-studio-surface-soft border-studio-border-soft' : 'bg-studio-surface-glass border-studio-border-soft'
  }`;

  if (variant === 'basic') {
    return (
      <>
      <div
        className={`editor-toolbar flex shrink-0 flex-wrap items-center gap-1 border-b px-3 py-2 ${
          isDark ? 'border-studio-border-soft bg-studio-surface-soft' : 'border-studio-border-soft bg-studio-surface'
        }`}
        role="group"
        aria-label="基础富文本工具栏"
      >
        <button type="button" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className={btnClass()} title="撤销 (Ctrl+Z)" aria-label="撤销">
          <Undo className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className={btnClass()} title="重做 (Ctrl+Y)" aria-label="重做">
          <Redo className="h-4 w-4" />
        </button>
        {divider}
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btnClass(editor.isActive('bold'))} title="加粗 (Ctrl+B)" aria-label="加粗" aria-pressed={editor.isActive('bold')}>
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btnClass(editor.isActive('italic'))} title="斜体 (Ctrl+I)" aria-label="斜体" aria-pressed={editor.isActive('italic')}>
          <Italic className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btnClass(editor.isActive('underline'))} title="下划线 (Ctrl+U)" aria-label="下划线" aria-pressed={editor.isActive('underline')}>
          <Underline className="h-4 w-4" />
        </button>
        {divider}
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btnClass(editor.isActive('bulletList'))} title="项目符号列表" aria-label="项目符号列表" aria-pressed={editor.isActive('bulletList')}>
          <List className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btnClass(editor.isActive('orderedList'))} title="编号列表" aria-label="编号列表" aria-pressed={editor.isActive('orderedList')}>
          <ListOrdered className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => void setLink()} className={btnClass(editor.isActive('link'))} title="链接" aria-label="链接">
          <LinkIcon className="h-4 w-4" />
        </button>
      </div>
      {editorTextPromptDialog}
      </>
    );
  }

  // 核心工具按钮（始终显示）
  const coreButtons = (
    <>
      {/* 编辑组 */}
      <div className="flex items-center gap-0.5">
        {groupLabel('编辑')}
        <button onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className={btnClass()} title="撤销 (Ctrl+Z)">
          <Undo className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className={btnClass()} title="重做 (Ctrl+Y)">
          <Redo className="w-4 h-4" />
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleFormatPainterClick}
          onDoubleClick={handleFormatPainterDoubleClick}
          className={btnClass(formatPainterMode !== 'idle')}
          title={formatPainterMode === 'persistent' ? '格式刷：连续应用中，按 Esc 退出' : formatPainterMode === 'single' ? '格式刷：选择目标文字应用格式' : '格式刷'}
          aria-pressed={formatPainterMode !== 'idle'}
        >
          <Paintbrush className="w-4 h-4" />
        </button>
      </div>

      {divider}

      {/* 标题组 - 下拉 */}
      <div className="flex items-center gap-0.5">
        {groupLabel('标题')}
        <div className="relative" ref={headingRef}>
          <button
            type="button"
            aria-expanded={showHeadingDropdown}
            onClick={() => {
              if (!showHeadingDropdown) positionDropdown('heading', headingRef.current);
              setShowHeadingDropdown(!showHeadingDropdown);
            }}
            className={`${btnClass()} flex items-center gap-1 min-w-[60px]`}
            title="标题层级"
          >
            <span className="text-xs font-medium">{getCurrentHeadingLabel()}</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {showHeadingDropdown && (
            <div className={`${dropdownClass} w-32`} style={dropdownPositionStyle('heading')}>
              {HEADING_OPTIONS.map((opt) => (
                <button
                  key={opt.level}
                  onClick={() => {
                    if (opt.level === 0) {
                      editor.chain().focus().setParagraph().run();
                    } else {
                      editor.chain().focus().toggleHeading({ level: opt.level as 1 | 2 | 3 | 4 }).run();
                    }
                    setShowHeadingDropdown(false);
                  }}
                  className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${
                    opt.level === 0
                      ? !editor.isActive('heading')
                        ? isDark ? 'bg-studio-primary/20 text-studio-primary' : 'bg-studio-primary-button text-white'
                        : isDark ? 'text-studio-text-secondary hover:bg-studio-surface-soft' : 'text-studio-text-muted hover:bg-studio-surface-soft'
                      : editor.isActive('heading', { level: opt.level })
                        ? isDark ? 'bg-studio-primary/20 text-studio-primary' : 'bg-studio-primary-button text-white'
                        : isDark ? 'text-studio-text-secondary hover:bg-studio-surface-soft' : 'text-studio-text-muted hover:bg-studio-surface-soft'
                  }`}
                >
                  <opt.icon className="w-4 h-4" />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {divider}

      {/* 文字组 */}
      <div className="flex items-center gap-0.5">
        {groupLabel('文字')}
        <button onClick={() => editor.chain().focus().toggleBold().run()} className={btnClass(editor.isActive('bold'))} title="加粗 (Ctrl+B)" aria-pressed={editor.isActive('bold')}>
          <Bold className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().toggleItalic().run()} className={btnClass(editor.isActive('italic'))} title="斜体 (Ctrl+I)" aria-pressed={editor.isActive('italic')}>
          <Italic className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={btnClass(editor.isActive('underline'))} title="下划线 (Ctrl+U)" aria-pressed={editor.isActive('underline')}>
          <Underline className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().toggleStrike().run()} className={btnClass(editor.isActive('strike'))} title="删除线" aria-pressed={editor.isActive('strike')}>
          <Strikethrough className="w-4 h-4" />
        </button>
      </div>

      {divider}

      {/* 颜色组 */}
      <div className="flex items-center gap-0.5">
        {groupLabel('颜色')}
        {/* 文字颜色 */}
        <div className="relative" ref={textColorRef}>
          <button
            type="button"
            aria-label="文字颜色"
            aria-expanded={showTextColorPicker}
            onClick={() => {
              if (!showTextColorPicker) positionDropdown('textColor', textColorRef.current);
              setShowTextColorPicker(!showTextColorPicker);
              setShowHighlightPicker(false);
            }}
            className={`${btnClass(false)} flex items-center gap-0.5`}
            title="文字颜色"
          >
            <Type className="w-4 h-4" />
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
          {showTextColorPicker && (
            <div className={`${dropdownClass} p-3`} style={{ ...dropdownPositionStyle('textColor'), minWidth: `${Math.min(176, dropdownLayouts.textColor.width ?? 176)}px` }}>
              <div className="mb-2 text-xs font-medium text-studio-text-secondary">文字颜色</div>
              <div role="group" aria-label="文字颜色选项" className="grid grid-cols-4 gap-2.5">
                {TEXT_COLORS.map((c) => (
                  <button
                    type="button"
                    key={c.value || 'default'}
                    aria-label={`${c.name}文字颜色`}
                    aria-pressed={c.value ? editor.isActive('textStyle', { color: c.value }) : !editor.getAttributes('textStyle').color}
                    onClick={() => handleTextColor(c.value)}
                    className="w-8 h-8 rounded-lg border-2 transition-all hover:scale-110 flex items-center justify-center"
                    style={{ borderColor: 'var(--xmt-border-soft)' }}
                    title={c.name}
                  >
                      <span aria-hidden="true"
                      className="font-bold text-sm flex items-center justify-center"
                      style={{ color: c.value || 'var(--editor-fg)' }}
                    >
                      A
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 高亮颜色 */}
        <div className="relative" ref={highlightRef}>
          <button
            type="button"
            aria-label="高亮颜色"
            aria-expanded={showHighlightPicker}
            onClick={() => {
              if (!showHighlightPicker) positionDropdown('highlight', highlightRef.current);
              setShowHighlightPicker(!showHighlightPicker);
              setShowTextColorPicker(false);
            }}
            className={`${btnClass(editor.isActive('highlight'))} flex items-center gap-0.5`}
            title="高亮颜色"
          >
            <Highlighter className="w-4 h-4" />
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
          {showHighlightPicker && (
            <div className={`${dropdownClass} p-3`} style={{ ...dropdownPositionStyle('highlight'), minWidth: `${Math.min(176, dropdownLayouts.highlight.width ?? 176)}px` }}>
              <div className="mb-2 text-xs font-medium text-studio-text-secondary">高亮颜色</div>
              <div role="group" aria-label="高亮颜色选项" className="grid grid-cols-4 gap-2.5 mb-1">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    type="button"
                    key={c.value}
                    aria-label={`${c.name}高亮颜色`}
                    aria-pressed={editor.isActive('highlight', { color: c.value })}
                    onClick={() => handleHighlight(c.value)}
                    className="w-8 h-8 rounded-lg border-2 transition-all hover:scale-110"
                    style={{
                      backgroundColor: c.bg,
                      borderColor: editor.isActive('highlight', { color: c.value })
                        ? '#3b82f6'
                        : 'transparent',
                    }}
                    title={c.name}
                  />
                ))}
              </div>
              {editor.isActive('highlight') && (
                <button
                  onClick={() => {
                    editor.chain().focus().unsetHighlight().run();
                    setShowHighlightPicker(false);
                  }}
                  className={`w-full text-xs py-1 rounded transition-colors ${
                    isDark ? 'text-studio-text-secondary hover:bg-studio-surface-soft' : 'text-studio-text-muted hover:bg-studio-surface-soft'
                  }`}
                >
                  取消高亮
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );

  // 折叠到"更多"菜单的按钮
  const moreButtons = (
    <>
      {divider}

      {/* 段落组 */}
      <div className="flex items-center gap-0.5">
        {groupLabel('段落')}
        <button onClick={() => editor.chain().focus().setTextAlign('left').run()} className={btnClass(editor.isActive({ textAlign: 'left' }))} title="左对齐" aria-pressed={editor.isActive({ textAlign: 'left' })}>
          <AlignLeft className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().setTextAlign('center').run()} className={btnClass(editor.isActive({ textAlign: 'center' }))} title="居中" aria-pressed={editor.isActive({ textAlign: 'center' })}>
          <AlignCenter className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().setTextAlign('right').run()} className={btnClass(editor.isActive({ textAlign: 'right' }))} title="右对齐" aria-pressed={editor.isActive({ textAlign: 'right' })}>
          <AlignRight className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().setTextAlign('justify').run()} className={btnClass(editor.isActive({ textAlign: 'justify' }))} title="两端对齐" aria-pressed={editor.isActive({ textAlign: 'justify' })}>
          <AlignJustify className="w-4 h-4" />
        </button>
        <button onClick={toggleFirstLineIndent} className={btnClass(isTextIndentActive())} title="首行缩进" aria-pressed={isTextIndentActive()}>
          <IndentIncrease className="w-4 h-4" />
        </button>
      </div>

      {divider}

      {/* 插入组 */}
      <div className="flex items-center gap-0.5">
        {groupLabel('插入')}
        <button onClick={() => void addImage()} className={btnClass()} title="图片">
          <ImageIcon className="w-4 h-4" />
        </button>
        <button onClick={insertTable} className={btnClass()} title="表格">
          <TableIcon className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btnClass(editor.isActive('blockquote'))} title="引用" aria-pressed={editor.isActive('blockquote')}>
          <Quote className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={btnClass(editor.isActive('codeBlock'))} title="代码块" aria-pressed={editor.isActive('codeBlock')}>
          <Code className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().setHorizontalRule().run()} className={btnClass()} title="分割线">
          <Minus className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().toggleTaskList().run()} className={btnClass(editor.isActive('taskList'))} title="待办" aria-pressed={editor.isActive('taskList')}>
          <CheckSquare className="w-4 h-4" />
        </button>
        <button onClick={() => void setLink()} className={btnClass(editor.isActive('link'))} title="链接">
          <LinkIcon className="w-4 h-4" />
        </button>
        <button onClick={onAddComment} className={btnClass()} title="批注">
          <MessageSquare className="w-4 h-4" />
        </button>
      </div>
    </>
  );

  return (
    <>
    <div
      ref={toolbarRef}
      className={`editor-toolbar shrink-0 flex items-center flex-wrap gap-1 px-3 py-2 border-b ${compact ? 'editor-toolbar-compact' : ''} ${
        isDark ? 'border-studio-border-soft bg-studio-surface-soft' : 'border-studio-border-soft bg-studio-surface'
      }`}
    >
      {/* 文件组 */}
      <div className={`flex items-center gap-0.5 relative ${compact ? 'hidden' : ''}`} ref={fileMenuRef}>
        {groupLabel('文件')}
        <button onClick={handlePrint} className={btnClass()} title="打印">
          <Printer className="w-4 h-4" />
        </button>
        <button
          type="button"
          aria-expanded={showFileMenu}
          onClick={() => {
            if (!showFileMenu) positionDropdown('file', fileMenuRef.current);
            setShowFileMenu(!showFileMenu);
          }}
          className={`${btnClass()} flex items-center gap-0.5`}
          title="导出"
        >
          <Download className="w-4 h-4" />
          <ChevronDown className="w-2.5 h-2.5" />
        </button>
        {showFileMenu && (
          <div className={`${dropdownClass} w-40`} style={dropdownPositionStyle('file')}>
            <button onClick={exportMarkdown} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-studio-text-secondary hover:bg-studio-surface-soft' : 'text-studio-text-muted hover:bg-studio-surface-soft'}`}>
              <FileText className="w-4 h-4" /> 导出 Markdown
            </button>
            <button onClick={exportHTML} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-studio-text-secondary hover:bg-studio-surface-soft' : 'text-studio-text-muted hover:bg-studio-surface-soft'}`}>
              <FileCode className="w-4 h-4" /> 导出 HTML
            </button>
            <button onClick={exportJSON} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-studio-text-secondary hover:bg-studio-surface-soft' : 'text-studio-text-muted hover:bg-studio-surface-soft'}`}>
              <FileJson className="w-4 h-4" /> 导出 JSON
            </button>
          </div>
        )}
      </div>

      {!compact && divider}

      {coreButtons}

      {collapsed ? (
        /* 响应式折叠：显示"更多"按钮 */
        <>
          <div className="flex-1" />
          <div className="relative" ref={moreMenuRef}>
            <button
              type="button"
              aria-expanded={showMoreMenu}
              onClick={toggleMoreMenu}
              className={btnClass()}
              title="更多操作"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {showMoreMenu && (
              <div
                className={`${dropdownClass} right-0 w-56`}
                style={dropdownPositionStyle('more')}
              >
                {/* 段落 */}
                <div className={`px-3 py-1 text-xs font-medium text-studio-text-muted`}>段落</div>
                <button onClick={() => editor.chain().focus().setTextAlign('left').run()} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-studio-text-secondary hover:bg-studio-surface-soft' : 'text-studio-text-muted hover:bg-studio-surface-soft'}`}>
                  <AlignLeft className="w-4 h-4" /> 左对齐
                </button>
                <button onClick={() => editor.chain().focus().setTextAlign('center').run()} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-studio-text-secondary hover:bg-studio-surface-soft' : 'text-studio-text-muted hover:bg-studio-surface-soft'}`}>
                  <AlignCenter className="w-4 h-4" /> 居中
                </button>
                <button onClick={() => editor.chain().focus().setTextAlign('right').run()} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-studio-text-secondary hover:bg-studio-surface-soft' : 'text-studio-text-muted hover:bg-studio-surface-soft'}`}>
                  <AlignRight className="w-4 h-4" /> 右对齐
                </button>
                <button onClick={() => editor.chain().focus().setTextAlign('justify').run()} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-studio-text-secondary hover:bg-studio-surface-soft' : 'text-studio-text-muted hover:bg-studio-surface-soft'}`}>
                  <AlignJustify className="w-4 h-4" /> 两端对齐
                </button>
                <button onClick={() => { toggleFirstLineIndent(); setShowMoreMenu(false); }} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isTextIndentActive() ? (isDark ? 'bg-studio-primary/20 text-studio-primary' : 'bg-studio-primary-button text-white') : (isDark ? 'text-studio-text-secondary hover:bg-studio-surface-soft' : 'text-studio-text-muted hover:bg-studio-surface-soft')}`} aria-pressed={isTextIndentActive()}>
                  <IndentIncrease className="w-4 h-4" /> 首行缩进
                </button>
                <div className={`my-1 border-t ${isDark ? 'border-studio-border-soft' : 'border-studio-border-soft'}`} />
                {/* 插入 */}
                <div className={`px-3 py-1 text-xs font-medium text-studio-text-muted`}>插入</div>
                <button onClick={() => { void addImage(); setShowMoreMenu(false); }} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-studio-text-secondary hover:bg-studio-surface-soft' : 'text-studio-text-muted hover:bg-studio-surface-soft'}`}>
                  <ImageIcon className="w-4 h-4" /> 图片
                </button>
                <button onClick={() => { insertTable(); setShowMoreMenu(false); }} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-studio-text-secondary hover:bg-studio-surface-soft' : 'text-studio-text-muted hover:bg-studio-surface-soft'}`}>
                  <TableIcon className="w-4 h-4" /> 表格
                </button>
                <button onClick={() => { editor.chain().focus().toggleBlockquote().run(); setShowMoreMenu(false); }} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-studio-text-secondary hover:bg-studio-surface-soft' : 'text-studio-text-muted hover:bg-studio-surface-soft'}`}>
                  <Quote className="w-4 h-4" /> 引用
                </button>
                <button onClick={() => { editor.chain().focus().toggleCodeBlock().run(); setShowMoreMenu(false); }} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-studio-text-secondary hover:bg-studio-surface-soft' : 'text-studio-text-muted hover:bg-studio-surface-soft'}`}>
                  <Code className="w-4 h-4" /> 代码块
                </button>
                <button onClick={() => { editor.chain().focus().setHorizontalRule().run(); setShowMoreMenu(false); }} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-studio-text-secondary hover:bg-studio-surface-soft' : 'text-studio-text-muted hover:bg-studio-surface-soft'}`}>
                  <Minus className="w-4 h-4" /> 分割线
                </button>
                <button onClick={() => { editor.chain().focus().toggleTaskList().run(); setShowMoreMenu(false); }} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-studio-text-secondary hover:bg-studio-surface-soft' : 'text-studio-text-muted hover:bg-studio-surface-soft'}`}>
                  <CheckSquare className="w-4 h-4" /> 待办
                </button>
                <button onClick={() => { void setLink(); setShowMoreMenu(false); }} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-studio-text-secondary hover:bg-studio-surface-soft' : 'text-studio-text-muted hover:bg-studio-surface-soft'}`}>
                  <LinkIcon className="w-4 h-4" /> 链接
                </button>
                <button onClick={() => { onAddComment?.(); setShowMoreMenu(false); }} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-studio-text-secondary hover:bg-studio-surface-soft' : 'text-studio-text-muted hover:bg-studio-surface-soft'}`}>
                  <MessageSquare className="w-4 h-4" /> 批注
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        /* 完整显示 */
        moreButtons
      )}

      {/* 右侧：高级功能 */}
      <div className="flex-1" />
      <div className={`flex items-center gap-0.5 ${compact ? 'hidden' : ''}`}>
        {groupLabel('高级')}
        {onToggleToc && (
          <button
            type="button"
            aria-expanded={showToc}
            onClick={onToggleToc}
            className={btnClass(showToc)}
            title={showToc ? '隐藏目录' : '显示目录'}
          >
            {showToc ? <PanelRightClose className="w-4 h-4" /> : <PanelRight className="w-4 h-4" />}
          </button>
        )}
        {onToggleFullscreen && (
          <button
            onClick={onToggleFullscreen}
            className={btnClass(isFullscreen)}
            title={isFullscreen ? '退出全屏' : '全屏'}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        )}
      </div>
      <style>{`.editor-toolbar-compact .editor-group-label{display:none}.editor-toolbar-compact .editor-toolbar-divider{display:none}`}</style>
    </div>
    {editorTextPromptDialog}
    </>
  );
}
