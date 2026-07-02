/**
 * EditorContextMenu - 编辑器右键菜单
 * 参考腾讯文档风格，支持格式化、批注、链接、标题转换、dark mode
 */
import { useState, useRef, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { useAppStore } from '../../store';
import {
  Copy, Scissors, Clipboard,
  Bold, Italic, Underline, Strikethrough,
  Highlighter, Type, Link as LinkIcon, Unlink,
  MessageSquare, MessageSquarePlus, MessageSquareX,
  Heading1, Heading2, Heading3,
  Trash2, ChevronRight, X,
} from 'lucide-react';

interface EditorContextMenuProps {
  editor: Editor;
  onAddComment?: () => void;
  onEditComment?: (commentId: string, commentText: string) => void;
  onDeleteComment?: (commentId: string) => void;
}

interface MenuPosition { x: number; y: number; }

interface CommentInfo { commentId: string; commentText: string; }

const HIGHLIGHT_COLORS = [
  { name: '黄色', value: 'yellow', bg: '#fef08a' },
  { name: '绿色', value: 'green', bg: '#bbf7d0' },
  { name: '蓝色', value: 'blue', bg: '#bfdbfe' },
  { name: '红色', value: 'red', bg: '#fecaca' },
  { name: '紫色', value: 'purple', bg: '#ddd6fe' },
  { name: '橙色', value: 'orange', bg: '#fed7aa' },
  { name: '灰色', value: 'gray', bg: '#e5e7eb' },
  { name: '青色', value: 'cyan', bg: '#a5f3fc' },
];

const TEXT_COLORS = [
  { name: '默认', value: '', bg: '#374151' },
  { name: '红色', value: '#ef4444', bg: '#ef4444' },
  { name: '橙色', value: '#f97316', bg: '#f97316' },
  { name: '黄色', value: '#eab308', bg: '#eab308' },
  { name: '绿色', value: '#22c55e', bg: '#22c55e' },
  { name: '蓝色', value: '#3b82f6', bg: '#3b82f6' },
  { name: '紫色', value: '#a855f7', bg: '#a855f7' },
  { name: '粉色', value: '#ec4899', bg: '#ec4899' },
];

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
  editor, onAddComment, onEditComment, onDeleteComment,
}: EditorContextMenuProps) {
  const isDark = useAppStore((s) => s.theme) === 'dark';
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<MenuPosition>({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;
    const handleContextMenu = (e: MouseEvent) => {
      const editorEl = editor.view.dom;
      if (!editorEl.contains(e.target as Node)) return;
      e.preventDefault();
      setPosition({
        x: Math.min(e.clientX, window.innerWidth - 220),
        y: Math.min(e.clientY, window.innerHeight - 400),
      });
      setVisible(true);
    };
    const editorEl = editor.view.dom;
    editorEl.addEventListener('contextmenu', handleContextMenu);
    return () => editorEl.removeEventListener('contextmenu', handleContextMenu);
  }, [editor]);

  useEffect(() => {
    if (!visible) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setVisible(false);
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setVisible(false); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [visible]);

  if (!visible || !editor) return null;

  const comment = findCommentInSelection(editor);
  const hasSelection = !editor.state.selection.empty;

  const itemClass = `flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-colors ${
    isDark ? 'text-gray-200 hover:bg-blue-600/20' : 'text-gray-700 hover:bg-blue-50'
  }`;
  const disabledClass = `flex items-center gap-2.5 w-full px-3 py-2 text-sm ${
    isDark ? 'text-gray-600 cursor-not-allowed' : 'text-gray-300 cursor-not-allowed'
  }`;
  const divider = <div className={`my-1 border-t ${isDark ? 'border-gray-700' : 'border-gray-100'}`} />;
  const subMenuClass = `flex items-center justify-between w-full px-3 py-2 text-sm transition-colors ${
    isDark ? 'text-gray-200 hover:bg-blue-600/20' : 'text-gray-700 hover:bg-blue-50'
  }`;
  const close = () => setVisible(false);
  const act = (fn: () => void) => { fn(); close(); };

  return (
    <>
      <div className="fixed inset-0 z-[200]" onClick={close} />
      <div ref={menuRef} className={`fixed z-[201] min-w-[200px] rounded-xl shadow-2xl border py-1.5 backdrop-blur-sm ${
        isDark ? 'bg-gray-800/95 border-gray-600' : 'bg-white/95 border-gray-200'
      }`} style={{ left: position.x, top: position.y }}>

        {/* 剪贴板 */}
        <button onClick={() => act(() => document.execCommand('copy'))} className={hasSelection ? itemClass : disabledClass} disabled={!hasSelection}>
          <Copy className="w-4 h-4" /> 复制 <span className={`ml-auto text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Ctrl+C</span>
        </button>
        <button onClick={() => act(() => document.execCommand('cut'))} className={hasSelection ? itemClass : disabledClass} disabled={!hasSelection}>
          <Scissors className="w-4 h-4" /> 剪切 <span className={`ml-auto text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Ctrl+X</span>
        </button>
        <button onClick={() => act(() => document.execCommand('paste'))} className={itemClass}>
          <Clipboard className="w-4 h-4" /> 粘贴 <span className={`ml-auto text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Ctrl+V</span>
        </button>

        {divider}

        {/* 格式 */}
        <button onClick={() => act(() => editor.chain().focus().toggleBold().run())} className={itemClass}>
          <Bold className="w-4 h-4" /> 加粗 <span className={`ml-auto text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Ctrl+B</span>
        </button>
        <button onClick={() => act(() => editor.chain().focus().toggleItalic().run())} className={itemClass}>
          <Italic className="w-4 h-4" /> 斜体 <span className={`ml-auto text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Ctrl+I</span>
        </button>
        <button onClick={() => act(() => editor.chain().focus().toggleUnderline().run())} className={itemClass}>
          <Underline className="w-4 h-4" /> 下划线 <span className={`ml-auto text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Ctrl+U</span>
        </button>
        <button onClick={() => act(() => editor.chain().focus().toggleStrike().run())} className={itemClass}>
          <Strikethrough className="w-4 h-4" /> 删除线
        </button>

        {divider}

        {/* 文字颜色 */}
        <div className="relative group">
          <div className={subMenuClass}>
            <span className="flex items-center gap-2.5"><Type className="w-4 h-4" /> 文字颜色</span>
            <ChevronRight className="w-3 h-3" />
          </div>
          <div className={`absolute left-full top-0 ml-0.5 min-w-[160px] rounded-lg shadow-xl border py-1.5 hidden group-hover:block ${isDark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}`}>
            <div className="grid grid-cols-4 gap-1.5 px-2 py-1">
              {TEXT_COLORS.map((c) => (
                <button key={c.value || 'default'}
                  onClick={() => act(() => {
                    if (c.value) editor.chain().focus().setColor(c.value).run();
                    else editor.chain().focus().unsetColor().run();
                  })}
                  className="w-6 h-6 rounded border transition-all hover:scale-110 flex items-center justify-center"
                  style={{ borderColor: isDark ? '#4b5563' : '#d1d5db' }} title={c.name}>
                  <span className="w-4 h-4 rounded-sm font-bold text-xs flex items-center justify-center" style={{ color: c.value || (isDark ? '#fff' : '#000') }}>A</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 高亮颜色 */}
        <div className="relative group">
          <div className={subMenuClass}>
            <span className="flex items-center gap-2.5"><Highlighter className="w-4 h-4" /> 高亮颜色</span>
            <ChevronRight className="w-3 h-3" />
          </div>
          <div className={`absolute left-full top-0 ml-0.5 min-w-[160px] rounded-lg shadow-xl border py-1.5 hidden group-hover:block ${isDark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}`}>
            <div className="grid grid-cols-4 gap-1.5 px-2 py-1">
              {HIGHLIGHT_COLORS.map((c) => (
                <button key={c.value}
                  onClick={() => act(() => {
                    if (editor.isActive('highlight', { color: c.value })) editor.chain().focus().unsetHighlight().run();
                    else editor.chain().focus().setHighlight({ color: c.value }).run();
                  })}
                  className="w-6 h-6 rounded border-2 transition-all hover:scale-110"
                  style={{ backgroundColor: c.bg, borderColor: editor.isActive('highlight', { color: c.value }) ? '#3b82f6' : 'transparent' }} title={c.name} />
              ))}
            </div>
            {editor.isActive('highlight') && (
              <button onClick={() => act(() => editor.chain().focus().unsetHighlight().run())}
                className={`flex items-center gap-1.5 w-full px-3 py-1.5 text-xs ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}>
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
            <button onClick={() => { const c = comment; act(() => onDeleteComment?.(c.commentId)); }} className={`${itemClass} text-red-500`}>
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
          <button onClick={() => act(() => { const url = window.prompt('输入链接 URL'); if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run(); })}
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
          className={hasSelection ? `${itemClass} text-red-500` : disabledClass} disabled={!hasSelection}>
          <Trash2 className="w-4 h-4" /> 删除选中
        </button>
      </div>
    </>
  );
}
