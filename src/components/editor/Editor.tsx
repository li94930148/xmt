/**
 * Tiptap 富文本编辑器主组件（升级版）
 * 集成：Toolbar, BubbleMenu, FloatingMenu, ContextMenu, TableOfContents,
 * CommentExtension, 多色高亮, 自动保存, 全屏, 打印, 导出
 */
import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { getSchema } from '@tiptap/core';
import { generateJSON } from '@tiptap/html';
import { useEditor, EditorContent } from '@tiptap/react';
import { useAppStore } from '../../store';
import { markdownToHtml } from '../../utils/markdown';
import { syncToYjs } from '../../collaboration/core/writeConsistency';
import { TiptapCollaboration } from '../../collaboration/yjs/tiptapCollaboration';
import type { SocketYjsProvider } from '../../collaboration/yjs/SocketYjsProvider';
import type { CollaborationUserPresence } from '../../collaboration/core/events';
import { editorStateLabel, useEditorEventState, type EditorState } from '../../editor/state/editorStateManager';
import { emitEditorState } from '../../editor/state/editorStateEventBus';
import Toolbar from './Toolbar';
import BubbleMenuBar from './BubbleMenu';

import EditorContextMenu from './ContextMenu';
import TableOfContents from './TableOfContents';
import { createEditorExtensions } from './extensions/editorExtensions';

interface EditorProps {
  value: string;
  onChange: (html: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
  placeholder?: string;
  collaboration?: {
    provider: SocketYjsProvider;
    users: CollaborationUserPresence[];
    connected: boolean;
  };
  immersive?: boolean;
  pageScroll?: boolean;
  stateDocId?: string;
}

export default function Editor({
  value,
  onChange,
  onSave,
  readOnly = false,
  placeholder = '开始编写...',
  collaboration,
  immersive = false,
  stateDocId,
}: EditorProps) {
  const isDark = useAppStore((s) => s.theme) === 'dark';
  const lastValueRef = useRef(value);
  const [saveStatus, setSaveStatus] = useState<Extract<EditorState, 'idle' | 'saving' | 'synced' | 'conflicted'>>('idle');
  const eventSaveStatus = useEditorEventState(stateDocId);
  const [showToc, setShowToc] = useState(false);
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
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [wordCount, setWordCount] = useState(0);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const baseExtensions = useMemo(() => createEditorExtensions(placeholder), [placeholder]);

  // 立即保存（仅 Ctrl+S 触发）
  const performSave = useCallback(() => {
    if (!onSave) return;
    savingRef.current = true;
    if (stateDocId) emitEditorState('writeConsistency:save', stateDocId, { reason: 'manual save' });
    else setSaveStatus('saving');
    try {
      onSave();
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
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      if (html === lastValueRef.current) return;
      lastValueRef.current = html;
      setWordCount(editor.getText().replace(/\s+/g, '').length);
      onChange(html);
      if (collaboration?.provider) {
        collaboration.provider.setTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          collaboration.provider.setTyping(false);
        }, 1200);
      }
    },
    editorProps: {
      attributes: {
        class: `editor-content prose max-w-none ${immersive ? 'px-4 sm:px-8 lg:px-16 py-8 lg:py-12' : 'px-10 py-8'} min-h-[300px] outline-none ${isDark ? 'prose-invert' : ''}`,
      },
      handleKeyDown: (view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
          event.preventDefault();
          performSave();
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
  }, [readOnly, collaboration?.provider, baseExtensions]);

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
    if (!editor) return;
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

    setWordCount(editor.getText().replace(/\s+/g, '').length);
  }, [editor, value, collaboration?.provider]);

  useEffect(() => {
    if (!editor) return;
    setWordCount(editor.getText().replace(/\s+/g, '').length);
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

  // 点击空白处关闭批注气泡
  useEffect(() => {
    if (!clickedComment) return;
    const handler = () => setClickedComment(null);
    // 延迟注册，避免当前点击立即触发关闭
    const timer = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => { clearTimeout(timer); document.removeEventListener('click', handler); };
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
      alert('请先选中要添加批注的文本');
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

  const cancelComment = () => {
    setCommentState({ show: false, mode: 'add', selectedText: '' });
    setCommentText('');
  };

  // ======== 保存状态指示器 ========
  const statusIndicator = () => {
    const statusConfig = {
      idle: null,
      saving: { icon: '⟳', color: 'text-blue-500', label: '保存中...', animate: true },
      synced: { icon: '✓', color: 'text-green-500', label: editorStateLabel('synced'), animate: false },
      conflicted: { icon: '⚠', color: 'text-red-500', label: editorStateLabel('conflicted'), animate: false },
    };
    const status = stateDocId ? eventSaveStatus : saveStatus;
    const config = statusConfig[status as keyof typeof statusConfig];
    if (!config) return null;

    return (
      <div
        className={`save-status flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-all ${
          config.color
        } ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}
      >
        <span className={config.animate ? 'animate-spin inline-block' : ''}>
          {config.icon}
        </span>
        <span>{config.label}</span>
      </div>
    );
  };

  const containerClass = isFullscreen
    ? 'fixed inset-0 z-[100] flex flex-col rounded-none h-screen min-h-0'
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
        className={`flex items-center justify-between shrink-0 relative z-30 sticky top-0 ${
          isDark ? 'bg-[var(--editor-panel)]' : 'bg-[var(--editor-panel)]'
        }`}
      >
        <div className="flex-1">
          {editor && !readOnly && (
            <Toolbar
              editor={editor}
              onAddComment={handleAddComment}
              onToggleToc={() => setShowToc(!showToc)}
              showToc={showToc}
              onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
              isFullscreen={isFullscreen}
            />
          )}
        </div>
        <div className="flex items-center gap-2 px-3 shrink-0">
          {editor && (
            <button
              type="button"
              onClick={() => void handleCopyAll()}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                isDark
                  ? 'border-white/15 text-gray-200 hover:bg-white/10'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-100'
              }`}
              title="复制编辑器全部内容（文本和 HTML）"
            >
              {copyStatus === 'copied' ? '已复制' : copyStatus === 'failed' ? '复制失败' : '复制全文'}
            </button>
          )}
          {collaboration && (
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  collaboration.connected ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                title={collaboration.connected ? '协作已连接' : '协作重连中'}
              />
              <div className="flex -space-x-1">
                {collaboration.users.slice(0, 5).map((user) => (
                  <span
                    key={user.socketId || `${user.id}-${user.name}`}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/50 text-[10px] font-semibold text-white"
                    style={{ backgroundColor: user.color }}
                    title={`${user.name}${user.typing ? ' 正在输入' : ''}`}
                  >
                    {(user.name || '?').slice(0, 1)}
                  </span>
                ))}
              </div>
              {collaboration.users.some((user) => user.typing) && (
                <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  正在输入...
                </span>
              )}
            </div>
          )}
          {statusIndicator()}
        </div>
      </div>

      {/* 编辑区域 + 目录侧栏 */}
      <div className="editor-shell relative min-w-0 max-w-full">
        <div
          className="relative min-w-0 max-w-full bg-[var(--editor-bg)] text-[var(--editor-fg)]"
        >
          {/* BubbleMenu */}
          {editor && !readOnly && (
            <BubbleMenuBar editor={editor} onAddComment={handleAddComment} />
          )}

          <div className="relative min-h-full min-w-0 max-w-full">
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* 目录面板 */}
      {showToc && (
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
        字数 {wordCount}
      </div>

      {/* 右键菜单 */}
      {editor && !readOnly && (
        <EditorContextMenu
          editor={editor}
          onAddComment={handleAddComment}
          onEditComment={handleEditComment}
          onDeleteComment={handleDeleteComment}
        />
      )}

      {/* 批注点击气泡：点击带批注文字后显示编辑/删除 */}
      {clickedComment && (
        <div
          className="fixed z-[400] rounded-lg shadow-xl border py-1 min-w-[120px]"
          style={{
            left: Math.min(clickedComment.x, window.innerWidth - 160),
            top: clickedComment.y + 10,
            background: isDark ? '#1f2937' : '#fff',
            borderColor: isDark ? '#374151' : '#e5e7eb',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`px-3 py-1.5 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} border-b ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
            {clickedComment.commentText.slice(0, 40)}{clickedComment.commentText.length > 40 ? '...' : ''}
          </div>
          <button
            onClick={() => {
              handleEditComment(clickedComment.commentId, clickedComment.commentText);
              setClickedComment(null);
            }}
            className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            编辑批注
          </button>
          <button
            onClick={() => {
              handleDeleteComment(clickedComment.commentId);
              setClickedComment(null);
            }}
            className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors text-red-500 ${isDark ? 'hover:bg-red-900/20' : 'hover:bg-red-50'}`}
          >
            删除批注
          </button>
        </div>
      )}

      {/* 批注输入弹窗 */}
      {commentState.show && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/30">
          <div
            className={`rounded-lg shadow-xl p-4 w-80 ${
              isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white'
            }`}
          >
            <div className="mb-2">
              <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                {commentState.mode === 'add'
                  ? `为「${commentState.selectedText.slice(0, 20)}${commentState.selectedText.length > 20 ? '...' : ''}」添加批注`
                  : '编辑批注'}
              </span>
            </div>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="输入批注内容..."
              className={`w-full p-2 border rounded text-sm resize-none ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              }`}
              rows={3}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  confirmComment();
                }
                if (e.key === 'Escape') cancelComment();
              }}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={cancelComment}
                className={`px-3 py-1.5 text-sm rounded transition-colors ${
                  isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                取消
              </button>
              <button
                onClick={confirmComment}
                disabled={!commentText.trim()}
                className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {commentState.mode === 'add' ? '确认' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .tiptap p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: ${isDark ? '#6b7280' : '#9ca3af'};
          pointer-events: none;
          height: 0;
        }
        .tiptap {
          min-height: 100%;
          background: var(--editor-bg);
          color: var(--editor-fg);
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
          outline: 2px solid #3b82f6;
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
          accent-color: #3b82f6;
        }
        .tiptap blockquote {
          border-left: 3px solid #3b82f6;
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
          color: #3b82f6;
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
          background-color: ${isDark ? '#422006' : '#fef3c7'} !important;
          border-bottom: 2px solid #f59e0b !important;
          cursor: help;
          position: relative;
        }
        .tiptap span[data-comment-id]::after {
          content: "【批注：" attr(data-comment-text) "】" !important;
          display: inline !important;
          font-size: 0.75em !important;
          color: ${isDark ? '#d97706' : '#92400e'} !important;
          background: ${isDark ? '#1f2937' : '#fffbeb'} !important;
          border: 1px solid ${isDark ? '#924006' : '#fbbf24'} !important;
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
          background-color: ${isDark ? '#422006' : '#fef3c7'} !important;
          border-bottom: 2px solid #f59e0b !important;
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
          color: ${isDark ? '#d97706' : '#92400e'} !important;
          background: ${isDark ? '#1f2937' : '#fffbeb'} !important;
          border: 1px solid ${isDark ? '#924006' : '#fbbf24'} !important;
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
            background-color: #fef3c7 !important;
            border-bottom: 2px solid #f59e0b !important;
            cursor: default !important;
          }
          .tiptap span[data-comment-id]::after {
            display: inline !important;
            content: "【批注：" attr(data-comment-text) "】" !important;
            font-size: 7pt;
            color: #92400e;
            background: #fffbeb;
            border: 1px solid #fbbf24;
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
          z-index: 40;
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
          z-index: 39;
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
