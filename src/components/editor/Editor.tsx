/**
 * Tiptap 富文本编辑器主组件（升级版）
 * 集成：Toolbar, BubbleMenu, FloatingMenu, ContextMenu, TableOfContents,
 * CommentExtension, 多色高亮, 自动保存, 全屏, 打印, 导出
 */
import { useEffect, useLayoutEffect, useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getSchema, type Editor as TiptapEditor } from '@tiptap/core';
import { generateJSON } from '@tiptap/html';
import { useEditor, EditorContent } from '@tiptap/react';
import { useAppStore } from '../../store';
import BaseModal from '../common/BaseModal';
import ActionButton from '../studio/ActionButton';
import { markdownToHtml } from '../../utils/markdown';
import { syncToYjs } from '../../collaboration/core/writeConsistency';
import { getCollaboratorDisplayColors } from '../../collaboration/core/collaboratorColors';
import { TiptapCollaboration } from '../../collaboration/yjs/tiptapCollaboration';
import type { SocketYjsProvider } from '../../collaboration/yjs/SocketYjsProvider';
import type { CollaborationUserPresence } from '../../collaboration/core/events';
import { editorStateLabel, useEditorEventState, type EditorState } from '../../editor/state/editorStateManager';
import { emitEditorState } from '../../editor/state/editorStateEventBus';
import Toolbar from './Toolbar';
import FindReplacePanel from './FindReplacePanel';
import WritingMetrics from './WritingMetrics';
import { countWritingCharacters } from './writingMetricUtils';
import BubbleMenuBar from './BubbleMenu';

import EditorContextMenu from './ContextMenu';
import TableOfContents from './TableOfContents';
import { createEditorExtensions } from './extensions/editorExtensions';
import type { FormatPainterMode } from './formatPainter';
import { resolveEditorInsertionSelection } from './editorInsertion';
import { isLocalEditorChange } from './editorChangeOrigin';
import { calculateContextMenuPosition, type Point } from './menuBehavior';
import { confirmManualEditorSave } from './manualSaveConfirmation';

interface EditorProps {
  value: string;
  onChange: (html: string, local: boolean) => void;
  onSave?: () => void | boolean | Promise<void | boolean>;
  readOnly?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  collaboration?: {
    provider: SocketYjsProvider;
    users: CollaborationUserPresence[];
    connected: boolean;
  };
  immersive?: boolean;
  focusMode?: boolean;
  pageScroll?: boolean;
  stateDocId?: string;
  writingGoalStorageKey?: string;
  onCommandHandleChange?: (handle: EditorCommandHandle | null) => void;
  toolbarVariant?: 'full' | 'basic';
  toolbarStickyTop?: string | number;
}

export interface EditorCommandHandle {
  getContent(): string | null;
  insertHtmlAtSelectionOrEnd(html: string): boolean;
  appendHtml(html: string): boolean;
  getSelectedText(): string | null;
  getReviewAnchor(): EditorReviewAnchor | null;
  selectReviewAnchor(anchor: EditorReviewAnchor): boolean;
  applyReviewSuggestion(anchor: EditorReviewAnchor, proposedText: string): 'applied' | 'already_applied' | 'missing';
}

export interface EditorReviewAnchor {
  quote: string;
  context: string;
  from: number;
  to: number;
}

function parseReviewContext(context: string): { before: string; after: string } {
  try {
    const value: unknown = JSON.parse(context);
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return {
        before: typeof record.before === 'string' ? record.before : '',
        after: typeof record.after === 'string' ? record.after : '',
      };
    }
  } catch {
    // Older or malformed anchors can still use the exact saved positions.
  }
  return { before: '', after: '' };
}

function findReviewAnchorRange(editor: TiptapEditor, anchor: EditorReviewAnchor, expectedQuote = anchor.quote) {
  const docSize = editor.state.doc.content.size;
  if (anchor.from >= 0 && anchor.to <= docSize && anchor.to > anchor.from) {
    const current = editor.state.doc.textBetween(anchor.from, anchor.to, '\n', '\n');
    if (current === expectedQuote) return { from: anchor.from, to: anchor.to };
  }

  if (!expectedQuote) return null;
  const { before, after } = parseReviewContext(anchor.context);
  const matches: Array<{ from: number; to: number; score: number }> = [];
  editor.state.doc.descendants((node, position) => {
    if (!node.isTextblock) return;
    const text = node.textContent;
    let offset = text.indexOf(expectedQuote);
    while (offset >= 0) {
      const beforeMatch = text.slice(0, offset);
      const afterMatch = text.slice(offset + expectedQuote.length);
      let beforeScore = 0;
      for (let length = Math.min(before.length, beforeMatch.length); length > 0; length -= 1) {
        if (beforeMatch.endsWith(before.slice(-length))) { beforeScore = length; break; }
      }
      let afterScore = 0;
      for (let length = Math.min(after.length, afterMatch.length); length > 0; length -= 1) {
        if (afterMatch.startsWith(after.slice(0, length))) { afterScore = length; break; }
      }
      const exactBefore = before ? beforeMatch.endsWith(before) : false;
      const exactAfter = after ? afterMatch.startsWith(after) : false;
      matches.push({
        from: position + 1 + offset,
        to: position + 1 + offset + expectedQuote.length,
        score: (exactBefore ? 1000 : 0) + (exactAfter ? 1000 : 0) + beforeScore + afterScore,
      });
      offset = text.indexOf(expectedQuote, offset + 1);
    }
  });
  if (matches.length === 1) return { from: matches[0].from, to: matches[0].to };
  if (matches.length > 1) {
    const ranked = [...matches].sort((a, b) => b.score - a.score);
    if (ranked[0].score > ranked[1].score) return { from: ranked[0].from, to: ranked[0].to };
  }
  return null;
}

export default function Editor({
  value,
  onChange,
  onSave,
  readOnly = false,
  placeholder = '开始编写...',
  ariaLabel,
  collaboration,
  immersive = false,
  focusMode = false,
  stateDocId,
  writingGoalStorageKey,
  onCommandHandleChange,
  toolbarVariant = 'full',
  toolbarStickyTop,
}: EditorProps) {
  const isDark = useAppStore((s) => s.theme) === 'dark';
  const lastValueRef = useRef(value);
  const [saveStatus, setSaveStatus] = useState<Extract<EditorState, 'idle' | 'saving' | 'synced' | 'conflicted'>>('idle');
  const eventSaveStatus = useEditorEventState(stateDocId);
  const [showToc, setShowToc] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [commentState, setCommentState] = useState<{
    show: boolean;
    mode: 'add' | 'edit';
    selectedText: string;
    commentId?: string;
    commentText?: string;
  }>({ show: false, mode: 'add', selectedText: '' });
  const [commentText, setCommentText] = useState('');
  const [clickedComment, setClickedComment] = useState<{
    commentId: string;
    commentText: string;
    x: number;
    y: number;
  } | null>(null);
  const commentMenuRef = useRef<HTMLDivElement>(null);
  const findReplaceReturnFocusRef = useRef<HTMLElement | null>(null);
  const [commentMenuPosition, setCommentMenuPosition] = useState<Point>({ x: 8, y: 8 });
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [wordCount, setWordCount] = useState(0);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [formatPainterMode, setFormatPainterMode] = useState<FormatPainterMode>('idle');
  const lastFocusedSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const baseExtensions = useMemo(() => createEditorExtensions(placeholder), [placeholder]);

  // 立即保存（仅 Ctrl+S 触发）
  const performSave = useCallback(async () => {
    if (!onSave || savingRef.current) return;
    savingRef.current = true;
    if (stateDocId) emitEditorState('writeConsistency:save', stateDocId, { reason: 'manual save' });
    else setSaveStatus('saving');
    try {
      const confirmed = await confirmManualEditorSave(onSave);
      if (!confirmed) {
        if (stateDocId) emitEditorState('conflict:event', stateDocId, { reason: 'manual save not confirmed' });
        else setSaveStatus('conflicted');
        return;
      }
      lastValueRef.current = value;
      if (stateDocId) emitEditorState('writeConsistency:saved', stateDocId, { reason: 'manual save' });
      else setSaveStatus('synced');
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
      savedTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      if (stateDocId) emitEditorState('conflict:event', stateDocId, { reason: 'manual save failed' });
      else setSaveStatus('conflicted');
    } finally {
      savingRef.current = false;
    }
  }, [onSave, stateDocId, value]);
  const performSaveRef = useRef(performSave);
  performSaveRef.current = performSave;

  useEffect(() => {
    if (!collaboration?.provider || !value?.trim()) return;
    const initialContent = value.includes('<') ? value : markdownToHtml(value);
    try {
      syncToYjs({
        provider: collaboration.provider,
        contentJson: generateJSON(initialContent, baseExtensions),
        schema: getSchema(baseExtensions),
        docId: stateDocId,
      });
    } catch {
      // 如果历史内容中存在当前 schema 不支持的节点，保持 Yjs 原状态，避免覆盖已有协作文档。
    }
  }, [baseExtensions, collaboration?.provider, stateDocId, value]);

  const editor = useEditor({
    extensions: [
      ...baseExtensions.slice(0, 1),
      ...(collaboration?.provider
        ? [
            TiptapCollaboration.configure({
              fragment: collaboration.provider.fragment,
              awareness: collaboration.provider.awareness,
            }),
          ]
        : []),
      ...baseExtensions.slice(1),
    ],
    content: collaboration?.provider ? '' : value || '',
    editable: !readOnly,
    onUpdate: ({ editor, transaction }) => {
      const html = editor.getHTML();
      if (html === lastValueRef.current) return;
      lastValueRef.current = html;
      setWordCount(countWritingCharacters(editor.getText()));
      const local = isLocalEditorChange(transaction, Boolean(collaboration?.provider));
      onChange(html, local);
      if (local && collaboration?.provider) {
        collaboration.provider.setTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          collaboration.provider.setTyping(false);
        }, 1200);
      }
    },
    onFocus: ({ editor }) => {
      const { from, to } = editor.state.selection;
      lastFocusedSelectionRef.current = { from, to };
    },
    onSelectionUpdate: ({ editor }) => {
      if (!editor.isFocused) return;
      const { from, to } = editor.state.selection;
      lastFocusedSelectionRef.current = { from, to };
    },
    editorProps: {
      attributes: {
        class: `editor-content prose max-w-none ${immersive ? 'px-4 sm:px-8 lg:px-16 py-8 lg:py-12' : 'px-10 py-8'} min-h-[300px] outline-none ${isDark ? 'prose-invert' : ''}`,
        role: 'textbox',
        'aria-label': ariaLabel?.trim() || (readOnly ? '只读正文' : '正文编辑区'),
        'aria-multiline': 'true',
        ...(readOnly ? { 'aria-readonly': 'true' } : {}),
      },
      handleKeyDown: (view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
          event.preventDefault();
          findReplaceReturnFocusRef.current = view.dom;
          setShowFindReplace(true);
          return true;
        }
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
          event.preventDefault();
          void performSaveRef.current();
          return true;
        }
        return false;
      },
      handleClick: (view, pos, event) => {
        // 检查点击位置前后是否有批注 mark
        const $pos = view.state.doc.resolve(pos);
        let foundId: string | null = null;
        let foundText = '';
        // 优先检查当前位置的 marks
        const marksAtPos = $pos.marks();
        for (const mark of marksAtPos) {
          if (mark.type.name === 'comment' && mark.attrs.commentId) {
            foundId = mark.attrs.commentId as string;
            foundText = (mark.attrs.commentText as string) || '';
            break;
          }
        }
        // 如果当前位置没有，检查前一个字符
        if (!foundId && pos > 0) {
          const $prev = view.state.doc.resolve(pos - 1);
          for (const mark of $prev.marks()) {
            if (mark.type.name === 'comment' && mark.attrs.commentId) {
              foundId = mark.attrs.commentId as string;
              foundText = (mark.attrs.commentText as string) || '';
              break;
            }
          }
        }
        if (foundId) {
          setClickedComment({
            commentId: foundId,
            commentText: foundText,
            x: (event as MouseEvent).clientX,
            y: (event as MouseEvent).clientY,
          });
        } else {
          setClickedComment(null);
        }
        return false;
      },
    },
  // Read-only transitions use editor.setEditable below. Recreating Tiptap here
  // would detach the live document and command handle during save/review locks.
  }, [collaboration?.provider, baseExtensions]);

  const closeFindReplace = useCallback(() => {
    setShowFindReplace(false);
    const returnFocusTarget = findReplaceReturnFocusRef.current;
    findReplaceReturnFocusRef.current = null;
    window.requestAnimationFrame(() => {
      if (returnFocusTarget?.isConnected) {
        returnFocusTarget.focus({ preventScroll: true });
      } else if (editor && !editor.isDestroyed) {
        editor.commands.focus();
      }
    });
  }, [editor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    let frame = 0;
    const updateMenuPositions = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (editor.isDestroyed) return;
        editor.view.dispatch(editor.state.tr
          .setMeta('bubbleMenu', 'updatePosition')
          .setMeta('floatingMenu', 'updatePosition'));
      });
    };
    // Body-mounted menus must follow scrolls in any editor or page ancestor.
    document.addEventListener('scroll', updateMenuPositions, true);
    window.visualViewport?.addEventListener('resize', updateMenuPositions);
    return () => {
      document.removeEventListener('scroll', updateMenuPositions, true);
      window.visualViewport?.removeEventListener('resize', updateMenuPositions);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || !onCommandHandleChange) return;
    const handle: EditorCommandHandle = {
      getContent() {
        if (editor.isDestroyed) return null;
        return editor.getHTML();
      },
      insertHtmlAtSelectionOrEnd(html) {
        if (!html || readOnlyRef.current) return false;
        const docEnd = editor.state.doc.content.size;
        const target = resolveEditorInsertionSelection(lastFocusedSelectionRef.current, docEnd);
        return editor.chain().focus().setTextSelection(target).insertContent(html).run();
      },
      appendHtml(html) {
        if (!html || readOnlyRef.current || editor.isDestroyed) return false;
        return editor.chain().focus().insertContentAt(editor.state.doc.content.size, html).run();
      },
      getSelectedText() {
        if (editor.isDestroyed || editor.state.selection.empty) return null;
        const { from, to } = editor.state.selection;
        return editor.state.doc.textBetween(from, to, '\n', '\n').trim() || null;
      },
      getReviewAnchor() {
        if (editor.isDestroyed) return null;
        const selection = editor.state.selection.empty ? lastFocusedSelectionRef.current : editor.state.selection;
        if (!selection || selection.from === selection.to) return null;
        const { from, to } = selection;
        const quote = editor.state.doc.textBetween(from, to, '\n', '\n');
        if (!quote.trim() || Array.from(quote).length > 2000) return null;
        const before = editor.state.doc.textBetween(Math.max(0, from - 100), from, '\n', '\n').slice(-100);
        const after = editor.state.doc.textBetween(to, Math.min(editor.state.doc.content.size, to + 100), '\n', '\n').slice(0, 100);
        return { quote, context: JSON.stringify({ before, after }), from, to };
      },
      selectReviewAnchor(anchor) {
        if (editor.isDestroyed) return false;
        const range = findReviewAnchorRange(editor, anchor);
        if (!range) return false;
        return editor.chain().focus().setTextSelection(range).run();
      },
      applyReviewSuggestion(anchor, proposedText) {
        if (editor.isDestroyed || readOnlyRef.current) return 'missing';
        const originalRange = findReviewAnchorRange(editor, anchor);
        if (originalRange) {
          const transaction = proposedText
            ? editor.state.tr.insertText(proposedText, originalRange.from, originalRange.to)
            : editor.state.tr.delete(originalRange.from, originalRange.to);
          editor.view.dispatch(transaction);
          return 'applied';
        }
        if (findReviewAnchorRange(editor, anchor, proposedText)) return 'already_applied';
        return 'missing';
      },
    };
    onCommandHandleChange(handle);
    return () => onCommandHandleChange(null);
  }, [editor, onCommandHandleChange]);

  const handleCopyAll = useCallback(async () => {
    if (!editor) return;

    const plainText = editor.getText({ blockSeparator: '\n\n' });
    const html = editor.getHTML();

    const copyPlainTextWithLegacyFallback = () => {
      const textarea = document.createElement('textarea');
      textarea.value = plainText;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      if (!copied) throw new Error('Legacy clipboard copy failed');
    };

    if (copyStatusTimeoutRef.current) clearTimeout(copyStatusTimeoutRef.current);

    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error('Rich clipboard API unavailable');
      }

      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ]);
      setCopyStatus('copied');
    } catch {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(plainText);
        } else {
          copyPlainTextWithLegacyFallback();
        }
        setCopyStatus('copied');
      } catch {
        try {
          copyPlainTextWithLegacyFallback();
          setCopyStatus('copied');
        } catch {
          setCopyStatus('failed');
        }
      }
    } finally {
      copyStatusTimeoutRef.current = setTimeout(() => setCopyStatus('idle'), 2000);
    }
  }, [editor]);

  // 外部 value 变化时同步
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (collaboration?.provider) return;
    if (savingRef.current) return;
    if (value === lastValueRef.current) return;

    let content = value;
    if (value && !value.includes('<') && (value.includes('#') || value.includes('**') || value.includes('```'))) {
      content = markdownToHtml(value);
    }

    const { from, to } = editor.state.selection;
    const parsedDoc = editor.schema.nodeFromJSON(generateJSON(content || '<p></p>', createEditorExtensions(placeholder)));
    editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, parsedDoc.content));
    lastValueRef.current = value;

    try {
      const docSize = editor.state.doc.content.size;
      if (from <= docSize && to <= docSize) {
        editor.commands.setTextSelection({ from, to });
      }
    } catch {
      // 忽略
    }

    setWordCount(countWritingCharacters(editor.getText()));
  }, [editor, value, collaboration?.provider, placeholder]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    setWordCount(countWritingCharacters(editor.getText()));
  }, [editor]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (copyStatusTimeoutRef.current) clearTimeout(copyStatusTimeoutRef.current);
    };
  }, []);

  // 选区变化非常高频，保持浏览器原生选区，避免拖选文字时写 React state 或触发协同同步重算。

  useLayoutEffect(() => {
    if (!clickedComment || !commentMenuRef.current) return;
    const bounds = commentMenuRef.current.getBoundingClientRect();
    setCommentMenuPosition(calculateContextMenuPosition(
      { x: clickedComment.x, y: clickedComment.y + 10 },
      { width: bounds.width, height: bounds.height },
      { width: window.innerWidth, height: window.innerHeight },
    ));
  }, [clickedComment, focusMode]);

  // Close click-anchored actions when their viewport anchor becomes stale.
  useEffect(() => {
    if (!clickedComment) return;
    const handler = () => setClickedComment(null);
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && commentMenuRef.current?.contains(event.target)) return;
      handler();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handler();
    };
    // 延迟注册，避免当前点击立即触发关闭
    const timer = setTimeout(() => document.addEventListener('click', handler), 0);
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', handler);
    window.visualViewport?.addEventListener('resize', handler);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handler);
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', handler);
      window.visualViewport?.removeEventListener('resize', handler);
    };
  }, [clickedComment]);

  // 只读模式切换
  useEffect(() => {
    if (editor) editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  // 全屏模式
  useEffect(() => {
    if (!isFullscreen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isFullscreen]);

  // ======== 批注操作 ========
  const handleAddComment = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) {
      useAppStore.getState().addNotification({
        title: '请先选中文字',
        message: '选中要添加批注的文字后，再选择添加批注。',
        type: 'info',
      });
      return;
    }
    const selectedText = editor.state.doc.textBetween(from, to);
    setCommentState({ show: true, mode: 'add', selectedText });
    setCommentText('');
  };

  const handleEditComment = (_commentId: string, oldText: string) => {
    setCommentState({
      show: true,
      mode: 'edit',
      selectedText: '',
      commentId: _commentId,
      commentText: oldText,
    });
    setCommentText(oldText);
  };

  const handleDeleteComment = (commentId: string) => {
    if (!editor) return;
    editor.chain().focus().removeComment(commentId).run();
  };

  const confirmComment = () => {
    if (!editor || !commentText.trim()) return;
    if (commentState.mode === 'add') {
      const commentId = `comment-${Date.now()}`;
      const createdAt = new Date().toISOString();
      editor.chain().focus().setComment(commentId, commentText.trim(), createdAt).run();
    } else if (commentState.mode === 'edit' && commentState.commentId) {
      editor.chain().focus().updateComment(commentState.commentId, commentText.trim()).run();
    }
    setCommentState({ show: false, mode: 'add', selectedText: '' });
    setCommentText('');
  };

  const cancelComment = useCallback(() => {
    setCommentState({ show: false, mode: 'add', selectedText: '' });
    setCommentText('');
  }, []);

  // ======== 保存状态指示器 ========
  const statusIndicator = () => {
    const statusConfig = {
      idle: null,
      saving: { icon: '⟳', color: 'text-studio-primary-contrast', label: '保存中...', animate: true },
      synced: { icon: '✓', color: 'text-studio-success-contrast', label: editorStateLabel('synced'), animate: false },
      conflicted: { icon: '⚠', color: 'text-studio-coral-contrast', label: editorStateLabel('conflicted'), animate: false },
    };
    const status = stateDocId ? eventSaveStatus : saveStatus;
    const config = statusConfig[status as keyof typeof statusConfig];
    if (!config) return null;

    return (
      <div
        className={`save-status flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-all ${
          config.color
        } ${isDark ? 'bg-studio-surface-soft' : 'bg-studio-surface-soft'}`}
      >
        <span className={config.animate ? 'animate-spin inline-block' : ''}>
          {config.icon}
        </span>
        <span>{config.label}</span>
      </div>
    );
  };

  const containerClass = isFullscreen
    ? 'fixed inset-0 z-page-overlay flex flex-col rounded-none h-screen min-h-0'
    : immersive
      ? 'flex flex-col min-w-0'
      : 'rounded-xl border flex flex-col min-w-0';

  return (
    <div
      ref={containerRef}
      className={`${containerClass} ${
        immersive
          ? isDark
            ? 'bg-[var(--editor-bg)]'
            : 'bg-[var(--editor-soft)]'
          : isDark
            ? 'bg-[var(--editor-panel)] border-[var(--editor-border)] shadow-lg shadow-black/20'
            : 'bg-[var(--editor-panel)] border-[var(--editor-border)] shadow-md'
      }`}
      style={{
        height: isFullscreen ? '100vh' : undefined,
        minHeight: isFullscreen ? '100vh' : '0',
      }}
    >
      {/* 工具栏 - overflow-visible 确保下拉菜单不被裁剪 */}
      <div
        aria-hidden={focusMode}
        className={`flex flex-wrap sm:flex-nowrap items-center justify-between shrink-0 relative z-sticky sticky top-0 ${
          isDark ? 'bg-[var(--editor-panel)]' : 'bg-[var(--editor-panel)]'
        } ${focusMode ? 'hidden' : ''}`}
        style={{ top: isFullscreen ? 0 : toolbarStickyTop ?? 'calc(var(--xmt-app-topbar-height, 0px) + 1px)' }}
      >
        <div className="min-w-0 w-full sm:w-auto sm:flex-1">
          {editor && !readOnly && (
            <Toolbar
              editor={editor}
              variant={toolbarVariant}
              onAddComment={handleAddComment}
              onToggleToc={() => setShowToc(!showToc)}
              showToc={showToc}
              onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
              isFullscreen={isFullscreen}
              onFormatPainterModeChange={setFormatPainterMode}
            />
          )}
        </div>
        <div className="flex w-full sm:w-auto items-center justify-end gap-2 px-3 py-1 sm:py-0 shrink-0">
          {editor && (
            <button
              type="button"
              onClick={(event) => {
                if (showFindReplace) {
                  closeFindReplace();
                  return;
                }
                findReplaceReturnFocusRef.current = event.currentTarget;
                setShowFindReplace(true);
              }}
              className="xmt-btn xmt-btn-ghost"
              aria-label="查找替换"
              aria-expanded={showFindReplace}
              title="查找替换（⌘/Ctrl+F）"
            >查找</button>
          )}
          {editor && (
            <ActionButton
              type="button"
              variant="secondary"
              onClick={() => void handleCopyAll()}
              className={`min-h-10 px-2.5 py-1 text-xs font-medium ${isDark ? 'text-studio-text-secondary' : 'text-studio-text-muted'}`}
              title="复制编辑器全部内容（文本和 HTML）"
            >
              {copyStatus === 'copied' ? '已复制' : copyStatus === 'failed' ? '复制失败' : '复制全文'}
            </ActionButton>
          )}
          {collaboration && (
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  collaboration.connected ? 'bg-studio-success' : 'bg-studio-amber'
                }`}
                title={collaboration.connected ? '协作已连接' : '协作重连中'}
              />
              <div className="flex -space-x-1">
                {collaboration.users.slice(0, 5).map((user) => {
                  const colors = getCollaboratorDisplayColors(user.color);
                  return (
                    <span
                      key={user.socketId || `${user.id}-${user.name}`}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/50 text-[10px] font-semibold"
                      style={{ backgroundColor: colors.backgroundColor, color: colors.foregroundColor }}
                      title={`${user.name}${user.typing ? ' 正在输入' : ''}`}
                    >
                      {(user.name || '?').slice(0, 1)}
                    </span>
                  );
                })}
              </div>
              {collaboration.users.some((user) => user.typing) && (
                <span className={`text-xs ${isDark ? 'text-studio-text-muted' : 'text-studio-text-muted'}`}>
                  正在输入...
                </span>
              )}
            </div>
          )}
          {statusIndicator()}
        </div>
      </div>

      {editor && showFindReplace && !focusMode && (
        <FindReplacePanel editor={editor} readOnly={readOnly} onClose={closeFindReplace} />
      )}

      {/* 编辑区域 + 目录侧栏 */}
      <div className="editor-shell relative min-w-0 max-w-full">
        <div
          className="relative min-w-0 max-w-full bg-[var(--editor-bg)] text-[var(--editor-fg)]"
        >
          {/* BubbleMenu */}
          {editor && !readOnly && !focusMode && (
            <BubbleMenuBar editor={editor} onAddComment={handleAddComment} contextMenuOpen={contextMenuOpen} />
          )}
          <div className="relative min-h-full min-w-0 max-w-full">
            <EditorContent editor={editor} className={formatPainterMode === 'idle' ? undefined : 'cursor-copy'} />
          </div>
        </div>

        {/* 目录面板 */}
      {showToc && !focusMode && (
          <div
            className={`toc-panel w-64 border-l shrink-0 ${
              isDark ? 'border-[var(--editor-border)] bg-[var(--editor-panel)]' : 'border-[var(--editor-border)] bg-[var(--editor-soft)]'
            }`}
          >
            <TableOfContents editor={editor} />
          </div>
        )}
      </div>

      <div
        className={`shrink-0 px-4 py-2 border-t text-xs flex items-center justify-end ${
          isDark
            ? `${immersive ? 'border-[var(--editor-border)] bg-[var(--editor-bg)]' : 'border-[var(--editor-border)] bg-[var(--editor-panel)]'} text-[var(--editor-muted)]`
            : `${immersive ? 'border-[var(--editor-border)] bg-[var(--editor-bg)]' : 'border-[var(--editor-border)] bg-[var(--editor-soft)]'} text-[var(--editor-muted)]`
        }`}
      >
        <WritingMetrics key={writingGoalStorageKey || 'current-page'} count={wordCount} readOnly={readOnly} storageKey={writingGoalStorageKey} />
      </div>

      {/* 右键菜单 */}
      {editor && !readOnly && !focusMode && (
        <EditorContextMenu
          editor={editor}
          onAddComment={handleAddComment}
          onEditComment={handleEditComment}
          onDeleteComment={handleDeleteComment}
          onOpenChange={setContextMenuOpen}
        />
      )}

      {/* 批注点击气泡：点击带批注文字后显示编辑/删除 */}
      {clickedComment && !focusMode && createPortal(
        <div
          ref={commentMenuRef}
          role="group"
          aria-label="批注操作"
          className="fixed z-editor-menu w-60 max-w-[calc(100vw-16px)] max-h-[calc(100vh-16px)] overflow-y-auto break-words rounded-lg shadow-xl border py-1"
          style={{
            left: commentMenuPosition.x,
            top: commentMenuPosition.y,
            background: 'var(--editor-panel)',
            borderColor: 'var(--editor-border)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`px-3 py-1.5 text-xs ${isDark ? 'text-studio-text-muted' : 'text-studio-text-muted'} border-b ${isDark ? 'border-studio-border-soft' : 'border-studio-border-soft'}`}>
            {clickedComment.commentText.slice(0, 40)}{clickedComment.commentText.length > 40 ? '...' : ''}
          </div>
          <button
            onClick={() => {
              handleEditComment(clickedComment.commentId, clickedComment.commentText);
              setClickedComment(null);
            }}
            className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${isDark ? 'text-studio-text-secondary hover:bg-studio-surface-soft' : 'text-studio-text-muted hover:bg-studio-surface-soft'}`}
          >
            编辑批注
          </button>
          <button
            onClick={() => {
              handleDeleteComment(clickedComment.commentId);
              setClickedComment(null);
            }}
            className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors text-studio-coral ${isDark ? 'hover:bg-studio-coral/20' : 'hover:bg-studio-coral/10'}`}
          >
            删除批注
          </button>
        </div>, document.body,
      )}

      {/* 批注输入弹窗 */}
      <BaseModal
        open={commentState.show}
        onClose={cancelComment}
        title={commentState.mode === 'add'
          ? `为「${commentState.selectedText.slice(0, 20)}${commentState.selectedText.length > 20 ? '...' : ''}」添加批注`
          : '编辑批注'}
        size="sm"
        closeOnEscape
        closeOnOverlayClick={false}
      >
        <div className="space-y-4">
          <label className="block text-sm text-studio-text-secondary">
            批注内容
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="输入批注内容..."
              className="xmt-field mt-2 min-h-24 resize-y text-sm"
              rows={3}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  confirmComment();
                }
              }}
            />
          </label>
          <div className="flex justify-end gap-2">
            <ActionButton onClick={cancelComment} variant="ghost" className="px-3 py-2">
              取消
            </ActionButton>
            <ActionButton onClick={confirmComment} variant="primary" disabled={!commentText.trim()} className="px-3 py-2">
              {commentState.mode === 'add' ? '确认' : '保存'}
            </ActionButton>
          </div>
        </div>
      </BaseModal>

      <style>{`
        .tiptap p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: var(--editor-muted);
          pointer-events: none;
          height: 0;
        }
        .tiptap {
          min-height: 100%;
          background: var(--editor-bg);
          color: var(--editor-fg);
        }
        .tiptap::selection,
        .tiptap *::selection {
          background-color: var(--editor-selection-bg) !important;
          color: var(--editor-selection-fg) !important;
          text-shadow: none !important;
        }
        .tiptap::-moz-selection,
        .tiptap *::-moz-selection {
          background-color: var(--editor-selection-bg) !important;
          color: var(--editor-selection-fg) !important;
          text-shadow: none !important;
        }
        .tiptap .ProseMirror {
          min-height: 100%;
          outline: none;
          color: var(--editor-fg);
        }
        .tiptap em,
        .tiptap i {
          font-style: italic;
        }
        .tiptap p[style*="text-indent"] {
          text-indent: 2em;
        }
        .tiptap .ProseMirror-selectednode {
          outline: 2px solid var(--xmt-primary);
          border-radius: 4px;
        }
        /* === 标题样式 === */
        .tiptap h1 {
          font-size: 2em;
          font-weight: 700;
          margin-top: 0.67em;
          margin-bottom: 0.33em;
          line-height: 1.2;
        }
        .tiptap h2 {
          font-size: 1.5em;
          font-weight: 600;
          margin-top: 0.5em;
          margin-bottom: 0.25em;
          line-height: 1.3;
        }
        .tiptap h3 {
          font-size: 1.17em;
          font-weight: 600;
          margin-top: 0.4em;
          margin-bottom: 0.2em;
          line-height: 1.4;
        }
        .tiptap h4 {
          font-size: 1em;
          font-weight: 600;
          margin-top: 0.33em;
          margin-bottom: 0.17em;
        }
        .tiptap h5 {
          font-size: 0.83em;
          font-weight: 600;
          margin-top: 0.25em;
          margin-bottom: 0.13em;
        }
        .tiptap h6 {
          font-size: 0.67em;
          font-weight: 600;
          margin-top: 0.2em;
          margin-bottom: 0.1em;
        }
        /* === 表格样式 === */
        .tiptap table {
          border-collapse: collapse;
          width: 100%;
        }
        .tiptap table td,
        .tiptap table th {
          border: 1px solid var(--editor-border);
          padding: 8px 12px;
          text-align: left;
        }
        .tiptap table th {
          background: var(--editor-soft);
          font-weight: 600;
        }
        .tiptap ul[data-type="taskList"] {
          list-style: none;
          padding-left: 0;
        }
        .tiptap ul[data-type="taskList"] li {
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }
        .tiptap ul[data-type="taskList"] li label {
          margin-top: 4px;
        }
        .tiptap ul[data-type="taskList"] li input[type="checkbox"] {
          width: 16px;
          height: 16px;
          accent-color: var(--xmt-primary);
        }
        .tiptap blockquote {
          border-left: 3px solid var(--xmt-primary);
          padding-left: 1rem;
          margin-left: 0;
          color: var(--editor-muted);
        }
        .tiptap pre {
          background: var(--editor-code-bg);
          border-radius: 8px;
          padding: 12px 16px;
          overflow-x: auto;
        }
        .tiptap pre code {
          background: transparent;
          padding: 0;
        }
        .tiptap code {
          background: var(--editor-code-bg);
          padding: 2px 4px;
          border-radius: 4px;
          font-size: 0.9em;
        }
        .tiptap a {
          color: var(--xmt-primary);
          text-decoration: underline;
          cursor: pointer;
        }
        /* === 多色高亮 === */
        .tiptap mark {
          border-radius: 2px;
          padding: 0 2px;
        }
        .tiptap mark[data-color="yellow"] { background-color: #fef08a; }
        .tiptap mark[data-color="green"] { background-color: #bbf7d0; }
        .tiptap mark[data-color="blue"] { background-color: #bfdbfe; }
        .tiptap mark[data-color="red"] { background-color: #fecaca; }
        .tiptap mark[data-color="purple"] { background-color: #ddd6fe; }
        .tiptap mark[data-color="orange"] { background-color: #fed7aa; }
        .tiptap mark[data-color="gray"] { background-color: #e5e7eb; }
        .tiptap mark[data-color="cyan"] { background-color: #a5f3fc; }
        .tiptap mark:not([data-color]) { background-color: #fef08a; }
        /* dark mode 柔和高亮 */
        ${isDark ? `
        .tiptap mark[data-color="yellow"] { background-color: #713f12; }
        .tiptap mark[data-color="green"] { background-color: #166534; }
        .tiptap mark[data-color="blue"] { background-color: #1e40af; }
        .tiptap mark[data-color="red"] { background-color: #991b1b; }
        .tiptap mark[data-color="purple"] { background-color: #6b21a8; }
        .tiptap mark[data-color="orange"] { background-color: #9a3412; }
        .tiptap mark[data-color="gray"] { background-color: #4b5563; }
        .tiptap mark[data-color="cyan"] { background-color: #155e75; }
        .tiptap mark:not([data-color]) { background-color: #713f12; }
        ` : ''}
        /* === 批注样式 === */
        .tiptap .comment-mark,
        .tiptap span[data-comment-id] {
          background-color: color-mix(in srgb, var(--xmt-amber) 18%, transparent) !important;
          border-bottom: 2px solid var(--xmt-amber) !important;
          cursor: help;
          position: relative;
        }
        .tiptap span[data-comment-id]::after {
          content: "【批注：" attr(data-comment-text) "】" !important;
          display: inline !important;
          font-size: 0.75em !important;
          color: var(--xmt-amber-contrast) !important;
          background: var(--editor-panel) !important;
          border: 1px solid color-mix(in srgb, var(--xmt-amber) 45%, transparent) !important;
          border-radius: 4px !important;
          padding: 1px 6px !important;
          margin-left: 4px !important;
          vertical-align: middle !important;
          white-space: nowrap !important;
        }
        /* === 全局规则（非 .tiptap 包裹的预览区也能匹配） === */
        mark[data-color="yellow"] { background-color: #fef08a; }
        mark[data-color="green"] { background-color: #bbf7d0; }
        mark[data-color="blue"] { background-color: #bfdbfe; }
        mark[data-color="red"] { background-color: #fecaca; }
        mark[data-color="purple"] { background-color: #ddd6fe; }
        mark[data-color="orange"] { background-color: #fed7aa; }
        mark[data-color="gray"] { background-color: #e5e7eb; }
        mark[data-color="cyan"] { background-color: #a5f3fc; }
        mark:not([data-color]) { background-color: #fef08a; }
        span[data-comment-id] {
          background-color: color-mix(in srgb, var(--xmt-amber) 18%, transparent) !important;
          border-bottom: 2px solid var(--xmt-amber) !important;
          cursor: help;
        }
        .production-preview em,
        .production-preview i {
          font-style: italic;
        }
        .production-preview p[style*="text-indent"] {
          text-indent: 2em;
        }
        span[data-comment-id]::after {
          content: "【批注：" attr(data-comment-text) "】" !important;
          display: inline !important;
          font-size: 0.75em !important;
          color: var(--xmt-amber-contrast) !important;
          background: var(--editor-panel) !important;
          border: 1px solid color-mix(in srgb, var(--xmt-amber) 45%, transparent) !important;
          border-radius: 4px !important;
          padding: 1px 6px !important;
          margin-left: 4px !important;
          vertical-align: middle !important;
          white-space: nowrap !important;
        }
        ${isDark ? `
        mark[data-color="yellow"] { background-color: #713f12; }
        mark[data-color="green"] { background-color: #166534; }
        mark[data-color="blue"] { background-color: #1e40af; }
        mark[data-color="red"] { background-color: #991b1b; }
        mark[data-color="purple"] { background-color: #6b21a8; }
        mark[data-color="orange"] { background-color: #9a3412; }
        mark[data-color="gray"] { background-color: #4b5563; }
        mark[data-color="cyan"] { background-color: #155e75; }
        mark:not([data-color]) { background-color: #713f12; }
        ` : ''}
        /* === 打印时显示批注 === */
        @media print {
          .tiptap .comment-mark,
          .tiptap span[data-comment-id] {
            background-color: color-mix(in srgb, var(--xmt-amber) 18%, transparent) !important;
            border-bottom: 2px solid var(--xmt-amber) !important;
            cursor: default !important;
          }
          .tiptap span[data-comment-id]::after {
            display: inline !important;
            content: "【批注：" attr(data-comment-text) "】" !important;
            font-size: 7pt;
            color: var(--xmt-amber-contrast);
            background: var(--editor-panel);
            border: 1px solid color-mix(in srgb, var(--xmt-amber) 45%, transparent);
            border-radius: 2pt;
            padding: 0 4pt;
            margin-left: 4pt;
          }
        }
        .xmt-collaboration-cursor {
          position: relative;
          border-left: 2px solid;
          margin-left: -1px;
          pointer-events: none;
          word-break: normal;
        }
        .xmt-collaboration-cursor-label {
          position: fixed;
          z-index: var(--xmt-z-page-overlay);
          border-radius: 5px;
          color: #fff;
          font-size: 11px;
          font-weight: 600;
          line-height: 1;
          padding: 4px 6px;
          white-space: nowrap;
          user-select: none;
          pointer-events: none;
          opacity: 0;
          transform: translateY(-1px);
          transition: left 140ms ease-out, top 140ms ease-out, opacity 180ms ease, transform 180ms ease;
          box-shadow: 0 2px 8px rgb(15 23 42 / 18%);
        }
        .xmt-collaboration-cursor-label.is-active {
          opacity: 1;
          transform: translateY(0);
        }
        .xmt-collaboration-cursor-overflow {
          position: fixed;
          z-index: calc(var(--xmt-z-page-overlay) - 1);
          display: flex;
          align-items: center;
          justify-content: flex-end;
          min-width: 24px;
          opacity: 0;
          pointer-events: none;
          transition: opacity 180ms ease;
        }
        .xmt-collaboration-cursor-overflow.is-visible {
          opacity: 1;
        }
        .xmt-collaboration-cursor-avatar {
          display: grid;
          width: 24px;
          height: 24px;
          margin-left: -5px;
          place-items: center;
          border: 2px solid var(--editor-bg);
          border-radius: 999px;
          color: #fff;
          font-size: 10px;
          font-weight: 700;
          box-shadow: 0 2px 6px rgb(15 23 42 / 16%);
        }
      `}</style>
    </div>
  );
}
