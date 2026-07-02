/**
 * 编辑器工具栏（重构版）
 * 分组布局：文件 | 编辑 | 标题 | 文字 | 颜色 | 段落 | 插入 | 高级
 * 支持响应式折叠、dark mode、高亮/文字颜色选择器、导出
 */
import { useState, useRef, useEffect } from 'react';
import type { CommandProps } from '@tiptap/core';
import { Editor } from '@tiptap/react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { useAppStore } from '../../store';
import { htmlToMarkdown } from '../../utils/markdown';
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
  MoreHorizontal, IndentIncrease,
} from 'lucide-react';

interface ToolbarProps {
  editor: Editor | null;
  onAddComment?: () => void;
  onToggleToc?: () => void;
  showToc?: boolean;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
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

const HEADING_OPTIONS = [
  { label: '正文', level: 0, icon: Type },
  { label: '标题 1', level: 1, icon: Heading1 },
  { label: '标题 2', level: 2, icon: Heading2 },
  { label: '标题 3', level: 3, icon: Heading3 },
  { label: '标题 4', level: 4, icon: Heading4 },
];

export default function Toolbar({
  editor,
  onAddComment,
  onToggleToc,
  showToc,
  onToggleFullscreen,
  isFullscreen,
}: ToolbarProps) {
  const isDark = useAppStore((s) => s.theme) === 'dark';
  const [showHeadingDropdown, setShowHeadingDropdown] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showTextColorPicker, setShowTextColorPicker] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const headingRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const textColorRef = useRef<HTMLDivElement>(null);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  // 检测工具栏宽度，自动折叠
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCollapsed(entry.contentRect.width < 700);
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

  if (!editor) return null;

  const btnClass = (active?: boolean) =>
    `p-1.5 rounded transition-colors ${
      active
        ? isDark
          ? 'bg-blue-600 text-white'
          : 'bg-blue-100 text-blue-600'
        : isDark
          ? 'text-gray-300 hover:bg-gray-700'
          : 'text-gray-600 hover:bg-gray-200'
    }`;

  const divider = <div className={`w-px h-6 mx-1 shrink-0 ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`} />;

  const groupLabel = (text: string) => (
    <span className={`text-[10px] font-medium uppercase tracking-wider select-none ${
      isDark ? 'text-gray-500' : 'text-gray-400'
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
        .comment-mark,span[data-comment-id]{background-color:#fef3c7!important;border-bottom:2px solid #f59e0b!important}
        span[data-comment-id]::after{content:"【批注："attr(data-comment-text)"】";font-size:7pt;color:#92400e;background:#fffbeb;border:1px solid #fbbf24;border-radius:2pt;padding:0 4pt;margin-left:4pt;vertical-align:middle;white-space:nowrap}
        @media print{body{padding:20px}}
      </style></head><body>${printContent}</body></html>`);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    }
    setShowFileMenu(false);
  };

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

  const addImage = () => {
    const url = window.prompt('输入图片 URL');
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

  const dropdownClass = `absolute top-full left-0 mt-1 z-50 rounded-lg shadow-xl border py-1 ${
    isDark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'
  }`;

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
      </div>

      {divider}

      {/* 标题组 - 下拉 */}
      <div className="flex items-center gap-0.5">
        {groupLabel('标题')}
        <div className="relative" ref={headingRef}>
          <button
            onClick={() => setShowHeadingDropdown(!showHeadingDropdown)}
            className={`${btnClass()} flex items-center gap-1 min-w-[60px]`}
            title="标题层级"
          >
            <span className="text-xs font-medium">{getCurrentHeadingLabel()}</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {showHeadingDropdown && (
            <div className={`${dropdownClass} w-32`}>
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
                        ? isDark ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-600'
                        : isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'
                      : editor.isActive('heading', { level: opt.level })
                        ? isDark ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-600'
                        : isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'
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
        <button onClick={() => editor.chain().focus().toggleBold().run()} className={btnClass(editor.isActive('bold'))} title="加粗 (Ctrl+B)">
          <Bold className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().toggleItalic().run()} className={btnClass(editor.isActive('italic'))} title="斜体 (Ctrl+I)">
          <Italic className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={btnClass(editor.isActive('underline'))} title="下划线 (Ctrl+U)">
          <Underline className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().toggleStrike().run()} className={btnClass(editor.isActive('strike'))} title="删除线">
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
            onClick={() => {
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
            <div className={`${dropdownClass} p-3`} style={{ minWidth: '176px' }}>
              <div className="text-xs font-medium mb-2 opacity-60">文字颜色</div>
              <div className="grid grid-cols-4 gap-2.5">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c.value || 'default'}
                    onClick={() => handleTextColor(c.value)}
                    className="w-8 h-8 rounded-lg border-2 transition-all hover:scale-110 flex items-center justify-center"
                    style={{ borderColor: isDark ? '#4b5563' : '#d1d5db' }}
                    title={c.name}
                  >
                    <span
                      className="font-bold text-sm flex items-center justify-center"
                      style={{ color: c.value || (isDark ? '#fff' : '#000') }}
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
            onClick={() => {
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
            <div className={`${dropdownClass} p-3`} style={{ minWidth: '176px' }}>
              <div className="text-xs font-medium mb-2 opacity-60">高亮颜色</div>
              <div className="grid grid-cols-4 gap-2.5 mb-1">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c.value}
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
                    isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
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
        <button onClick={() => editor.chain().focus().setTextAlign('left').run()} className={btnClass(editor.isActive({ textAlign: 'left' }))} title="左对齐">
          <AlignLeft className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().setTextAlign('center').run()} className={btnClass(editor.isActive({ textAlign: 'center' }))} title="居中">
          <AlignCenter className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().setTextAlign('right').run()} className={btnClass(editor.isActive({ textAlign: 'right' }))} title="右对齐">
          <AlignRight className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().setTextAlign('justify').run()} className={btnClass(editor.isActive({ textAlign: 'justify' }))} title="两端对齐">
          <AlignJustify className="w-4 h-4" />
        </button>
        <button onClick={toggleFirstLineIndent} className={btnClass(isTextIndentActive())} title="首行缩进">
          <IndentIncrease className="w-4 h-4" />
        </button>
      </div>

      {divider}

      {/* 插入组 */}
      <div className="flex items-center gap-0.5">
        {groupLabel('插入')}
        <button onClick={addImage} className={btnClass()} title="图片">
          <ImageIcon className="w-4 h-4" />
        </button>
        <button onClick={insertTable} className={btnClass()} title="表格">
          <TableIcon className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btnClass(editor.isActive('blockquote'))} title="引用">
          <Quote className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={btnClass(editor.isActive('codeBlock'))} title="代码块">
          <Code className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().setHorizontalRule().run()} className={btnClass()} title="分割线">
          <Minus className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().toggleTaskList().run()} className={btnClass(editor.isActive('taskList'))} title="待办">
          <CheckSquare className="w-4 h-4" />
        </button>
        <button onClick={setLink} className={btnClass(editor.isActive('link'))} title="链接">
          <LinkIcon className="w-4 h-4" />
        </button>
        <button onClick={onAddComment} className={btnClass()} title="批注">
          <MessageSquare className="w-4 h-4" />
        </button>
      </div>
    </>
  );

  return (
    <div
      ref={toolbarRef}
      className={`editor-toolbar shrink-0 flex items-center flex-wrap gap-1 px-3 py-2 border-b ${
        isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
      }`}
    >
      {/* 文件组 */}
      <div className="flex items-center gap-0.5 relative" ref={fileMenuRef}>
        {groupLabel('文件')}
        <button onClick={handlePrint} className={btnClass()} title="打印">
          <Printer className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowFileMenu(!showFileMenu)}
          className={`${btnClass()} flex items-center gap-0.5`}
          title="导出"
        >
          <Download className="w-4 h-4" />
          <ChevronDown className="w-2.5 h-2.5" />
        </button>
        {showFileMenu && (
          <div className={`${dropdownClass} w-40`}>
            <button onClick={exportMarkdown} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}>
              <FileText className="w-4 h-4" /> 导出 Markdown
            </button>
            <button onClick={exportHTML} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}>
              <FileCode className="w-4 h-4" /> 导出 HTML
            </button>
            <button onClick={exportJSON} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}>
              <FileJson className="w-4 h-4" /> 导出 JSON
            </button>
          </div>
        )}
      </div>

      {divider}

      {coreButtons}

      {collapsed ? (
        /* 响应式折叠：显示"更多"按钮 */
        <>
          <div className="flex-1" />
          <div className="relative" ref={moreMenuRef}>
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className={btnClass()}
              title="更多操作"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {showMoreMenu && (
              <div className={`${dropdownClass} right-0 w-56`}>
                {/* 段落 */}
                <div className={`px-3 py-1 text-xs font-medium ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>段落</div>
                <button onClick={() => editor.chain().focus().setTextAlign('left').run()} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                  <AlignLeft className="w-4 h-4" /> 左对齐
                </button>
                <button onClick={() => editor.chain().focus().setTextAlign('center').run()} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                  <AlignCenter className="w-4 h-4" /> 居中
                </button>
                <button onClick={() => editor.chain().focus().setTextAlign('right').run()} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                  <AlignRight className="w-4 h-4" /> 右对齐
                </button>
                <button onClick={() => editor.chain().focus().setTextAlign('justify').run()} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                  <AlignJustify className="w-4 h-4" /> 两端对齐
                </button>
                <button onClick={() => { toggleFirstLineIndent(); setShowMoreMenu(false); }} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isTextIndentActive() ? (isDark ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-600') : (isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100')}`}>
                  <IndentIncrease className="w-4 h-4" /> 首行缩进
                </button>
                <div className={`my-1 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`} />
                {/* 插入 */}
                <div className={`px-3 py-1 text-xs font-medium ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>插入</div>
                <button onClick={() => { addImage(); setShowMoreMenu(false); }} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                  <ImageIcon className="w-4 h-4" /> 图片
                </button>
                <button onClick={() => { insertTable(); setShowMoreMenu(false); }} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                  <TableIcon className="w-4 h-4" /> 表格
                </button>
                <button onClick={() => { editor.chain().focus().toggleBlockquote().run(); setShowMoreMenu(false); }} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                  <Quote className="w-4 h-4" /> 引用
                </button>
                <button onClick={() => { editor.chain().focus().toggleCodeBlock().run(); setShowMoreMenu(false); }} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                  <Code className="w-4 h-4" /> 代码块
                </button>
                <button onClick={() => { editor.chain().focus().setHorizontalRule().run(); setShowMoreMenu(false); }} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                  <Minus className="w-4 h-4" /> 分割线
                </button>
                <button onClick={() => { editor.chain().focus().toggleTaskList().run(); setShowMoreMenu(false); }} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                  <CheckSquare className="w-4 h-4" /> 待办
                </button>
                <button onClick={() => { setLink(); setShowMoreMenu(false); }} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                  <LinkIcon className="w-4 h-4" /> 链接
                </button>
                <button onClick={() => { onAddComment?.(); setShowMoreMenu(false); }} className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}>
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
      <div className="flex items-center gap-0.5">
        {groupLabel('高级')}
        {onToggleToc && (
          <button
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
    </div>
  );
}
