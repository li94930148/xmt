/**
 * BubbleMenu - 选中文字浮动工具栏
 * 选中文字后在选区上方显示，支持格式化、颜色、链接、批注等
 */
import { useState, useRef, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { BubbleMenu as TiptapBubbleMenu } from '@tiptap/react/menus';
import { useAppStore } from '../../store';
import { shouldShowEditorBubbleMenu } from './menuBehavior';
import {
  Bold, Italic, Underline, Strikethrough,
  Highlighter, Type, Link as LinkIcon,
  MessageSquare, Code, Quote,
  ChevronDown, X,
} from 'lucide-react';

interface BubbleMenuProps {
  editor: Editor;
  onAddComment?: () => void;
  contextMenuOpen?: boolean;
}

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

export default function BubbleMenuBar({ editor, onAddComment, contextMenuOpen = false }: BubbleMenuProps) {
  const isDark = useAppStore((s) => s.theme) === 'dark';
  const [showHighlight, setShowHighlight] = useState(false);
  const [showTextColor, setShowTextColor] = useState(false);
  const highlightRef = useRef<HTMLDivElement>(null);
  const textColorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (highlightRef.current && !highlightRef.current.contains(e.target as Node)) setShowHighlight(false);
      if (textColorRef.current && !textColorRef.current.contains(e.target as Node)) setShowTextColor(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const btnClass = (active?: boolean) =>
    `p-1.5 rounded transition-colors ${
      active
        ? isDark ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-600'
        : isDark ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-600 hover:bg-gray-200'
    }`;

  const divider = <div className={`w-px h-5 mx-0.5 ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`} />;

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('输入链接 URL', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const handleHighlight = (color: string) => {
    if (editor.isActive('highlight', { color })) {
      editor.chain().focus().unsetHighlight().run();
    } else {
      editor.chain().focus().setHighlight({ color }).run();
    }
    setShowHighlight(false);
  };

  const handleTextColor = (color: string) => {
    if (!color) {
      editor.chain().focus().unsetColor().run();
    } else {
      editor.chain().focus().setColor(color).run();
    }
    setShowTextColor(false);
  };

  const setHeading = (level: 1 | 2 | 3 | 4) => {
    editor.chain().focus().toggleHeading({ level }).run();
  };

  if (contextMenuOpen) return null;

  return (
    <TiptapBubbleMenu
      editor={editor}
      shouldShow={({ editor: e, state }) => {
        // 不在代码块内显示
        if (e.isActive('codeBlock')) return false;
        // 必须有选区
        const { from, to } = state.selection;
        return shouldShowEditorBubbleMenu({ contextMenuOpen, codeBlock: e.isActive('codeBlock'), from, to });
      }}
      className={`flex items-center gap-0.5 px-2 py-1.5 rounded-lg shadow-xl border backdrop-blur-sm ${
        isDark
          ? 'bg-gray-800/95 border-gray-600 text-gray-200'
          : 'bg-white/95 border-gray-200 text-gray-700'
      }`}
      style={{ minWidth: 'fit-content' }}
    >
      {/* 文字格式 */}
      <button onClick={() => editor.chain().focus().toggleBold().run()} className={btnClass(editor.isActive('bold'))} title="加粗">
        <Bold className="w-3.5 h-3.5" />
      </button>
      <button onClick={() => editor.chain().focus().toggleItalic().run()} className={btnClass(editor.isActive('italic'))} title="斜体">
        <Italic className="w-3.5 h-3.5" />
      </button>
      <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={btnClass(editor.isActive('underline'))} title="下划线">
        <Underline className="w-3.5 h-3.5" />
      </button>
      <button onClick={() => editor.chain().focus().toggleStrike().run()} className={btnClass(editor.isActive('strike'))} title="删除线">
        <Strikethrough className="w-3.5 h-3.5" />
      </button>

      {divider}

      {/* 文字颜色 */}
      <div className="relative" ref={textColorRef}>
        <button onClick={() => { setShowTextColor(!showTextColor); setShowHighlight(false); }} className={`${btnClass()} flex items-center gap-0.5`} title="文字颜色">
          <Type className="w-3.5 h-3.5" />
          <ChevronDown className="w-2.5 h-2.5" />
        </button>
        {showTextColor && (
          <div className={`absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 p-3 rounded-lg shadow-xl border ${isDark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}`} style={{ minWidth: '176px' }}>
            <div className="text-xs font-medium mb-2 opacity-60">文字颜色</div>
            <div className="grid grid-cols-4 gap-2.5">
              {TEXT_COLORS.map((c) => (
                <button key={c.value || 'default'} onClick={() => handleTextColor(c.value)}
                  className="w-8 h-8 rounded-lg border-2 transition-all hover:scale-110 flex items-center justify-center"
                  style={{ borderColor: isDark ? '#4b5563' : '#d1d5db' }} title={c.name}>
                  <span className="font-bold text-sm" style={{ color: c.value || (isDark ? '#fff' : '#000') }}>A</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 高亮颜色 */}
      <div className="relative" ref={highlightRef}>
        <button onClick={() => { setShowHighlight(!showHighlight); setShowTextColor(false); }} className={`${btnClass(editor.isActive('highlight'))} flex items-center gap-0.5`} title="高亮">
          <Highlighter className="w-3.5 h-3.5" />
          <ChevronDown className="w-2.5 h-2.5" />
        </button>
        {showHighlight && (
          <div className={`absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 p-3 rounded-lg shadow-xl border ${isDark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}`} style={{ minWidth: '176px' }}>
            <div className="text-xs font-medium mb-2 opacity-60">高亮颜色</div>
            <div className="grid grid-cols-4 gap-2.5 mb-1">
              {HIGHLIGHT_COLORS.map((c) => (
                <button key={c.value} onClick={() => handleHighlight(c.value)}
                  className="w-8 h-8 rounded-lg border-2 transition-all hover:scale-110"
                  style={{ backgroundColor: c.bg, borderColor: editor.isActive('highlight', { color: c.value }) ? '#3b82f6' : 'transparent' }}
                  title={c.name} />
              ))}
            </div>
            {editor.isActive('highlight') && (
              <button onClick={() => { editor.chain().focus().unsetHighlight().run(); setShowHighlight(false); }}
                className={`w-full text-xs py-1 rounded flex items-center justify-center gap-1 ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                <X className="w-3 h-3" /> 取消高亮
              </button>
            )}
          </div>
        )}
      </div>

      {divider}

      {/* 链接 */}
      <button onClick={setLink} className={btnClass(editor.isActive('link'))} title="链接">
        <LinkIcon className="w-3.5 h-3.5" />
      </button>

      {/* 代码 */}
      <button onClick={() => editor.chain().focus().toggleCode().run()} className={btnClass(editor.isActive('code'))} title="行内代码">
        <Code className="w-3.5 h-3.5" />
      </button>

      {/* 引用 */}
      <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btnClass(editor.isActive('blockquote'))} title="引用">
        <Quote className="w-3.5 h-3.5" />
      </button>

      {divider}

      {/* 标题切换 H1-H4 */}
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4].map((level) => (
          <button key={level} onClick={() => setHeading(level as 1 | 2 | 3 | 4)}
            className={`${btnClass(editor.isActive('heading', { level }))} text-xs font-semibold px-1.5`}
            title={`标题${level}`}>
            H{level}
          </button>
        ))}
      </div>

      {divider}

      {/* 批注 */}
      <button onClick={onAddComment} className={btnClass()} title="添加批注">
        <MessageSquare className="w-3.5 h-3.5" />
      </button>
    </TiptapBubbleMenu>
  );
}
