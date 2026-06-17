/**
 * FloatingMenu - 段落左侧浮动菜单
 * 鼠标移到段落左侧时显示 + 和 ⋮⋮ 按钮
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { FloatingMenu as TiptapFloatingMenu } from '@tiptap/react/menus';
import { useAppStore } from '../../store';
import {
  Plus, GripVertical,
  Heading1, Heading2, Heading3, Heading4,
  Type, Image as ImageIcon, Table as TableIcon,
  Quote, Code, CheckSquare, Minus,
  Copy, Trash2, ArrowUp, ArrowDown,
} from 'lucide-react';

interface FloatingMenuProps {
  editor: Editor;
}

export default function FloatingMenuBar({ editor }: FloatingMenuProps) {
  const isDark = useAppStore((s) => s.theme) === 'dark';
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const insertRef = useRef<HTMLDivElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);

  const closeAll = useCallback(() => {
    setShowInsertMenu(false);
    setShowBlockMenu(false);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (insertRef.current && !insertRef.current.contains(e.target as Node)) setShowInsertMenu(false);
      if (blockRef.current && !blockRef.current.contains(e.target as Node)) setShowBlockMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const menuBtnClass = `flex items-center gap-2 w-full px-3 py-2 text-sm rounded transition-colors ${
    isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'
  }`;

  const handleInsert = (action: () => void) => {
    action();
    closeAll();
  };

  const addImage = () => {
    const url = window.prompt('输入图片 URL');
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  // 块操作
  const copyBlock = () => {
    const { state } = editor;
    const { $from } = state.selection;
    const depth = $from.depth;
    const node = $from.node(depth > 0 ? depth : 0);
    if (node) {
      navigator.clipboard.writeText(node.textContent).catch(() => {});
    }
    closeAll();
  };

  const deleteBlock = () => {
    const { state } = editor;
    const { $from } = state.selection;
    const depth = $from.depth;
    if (depth > 0) {
      const start = $from.before(depth);
      const end = $from.after(depth);
      editor.chain().focus().deleteRange({ from: start, to: end }).run();
    }
    closeAll();
  };

  const moveUp = () => {
    const { state } = editor;
    const { $from } = state.selection;
    const depth = $from.depth;
    if (depth <= 0) { closeAll(); return; }
    const currentNodePos = $from.before(depth);
    if (currentNodePos <= 0) { closeAll(); return; }
    const $pos = state.doc.resolve(currentNodePos);
    const prevNodeStart = $pos.before(depth);
    if (prevNodeStart < 0) { closeAll(); return; }
    const currentSlice = state.doc.slice(currentNodePos, $from.after(depth));
    editor.chain().focus()
      .deleteRange({ from: currentNodePos, to: $from.after(depth) })
      .insertContentAt(prevNodeStart, currentSlice.content)
      .run();
    closeAll();
  };

  const moveDown = () => {
    const { state } = editor;
    const { $from } = state.selection;
    const depth = $from.depth;
    if (depth <= 0) { closeAll(); return; }
    const currentNodeEnd = $from.after(depth);
    if (currentNodeEnd >= state.doc.content.size) { closeAll(); return; }
    const currentNodeStart = $from.before(depth);
    const currentSlice = state.doc.slice(currentNodeStart, currentNodeEnd);
    const $nextPos = state.doc.resolve(currentNodeEnd);
    const nextNodeEnd = $nextPos.after(depth > 0 ? depth - 1 : 0);
    editor.chain().focus()
      .deleteRange({ from: currentNodeStart, to: currentNodeEnd })
      .insertContentAt(nextNodeEnd - (currentNodeEnd - currentNodeStart), currentSlice.content)
      .run();
    closeAll();
  };

  const menuBg = isDark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200';

  return (
    <TiptapFloatingMenu
      editor={editor}
      shouldShow={({ editor: e, state }) => {
        const { $from } = state.selection;
        // 只在空段落或段落开头显示
        return $from.parent.type.name === 'paragraph';
      }}
      className="flex items-center gap-0.5"
    >
      {/* + 按钮 */}
      <div className="relative" ref={insertRef}>
        <button
          onClick={() => { setShowInsertMenu(!showInsertMenu); setShowBlockMenu(false); }}
          className={`p-1 rounded-md transition-colors ${
            showInsertMenu
              ? isDark ? 'bg-gray-600 text-white' : 'bg-gray-200 text-gray-800'
              : isDark ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-200' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
          }`}
          title="插入"
        >
          <Plus className="w-4 h-4" />
        </button>
        {showInsertMenu && (
          <div className={`absolute left-full top-0 ml-1 z-50 w-48 rounded-lg shadow-xl border py-1 ${menuBg}`}>
            <div className={`px-3 py-1.5 text-xs font-medium ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>插入内容</div>
            <button onClick={() => handleInsert(() => editor.chain().focus().setParagraph().run())} className={menuBtnClass}>
              <Type className="w-4 h-4" /> 正文
            </button>
            <button onClick={() => handleInsert(() => editor.chain().focus().toggleHeading({ level: 1 }).run())} className={menuBtnClass}>
              <Heading1 className="w-4 h-4" /> 标题 1
            </button>
            <button onClick={() => handleInsert(() => editor.chain().focus().toggleHeading({ level: 2 }).run())} className={menuBtnClass}>
              <Heading2 className="w-4 h-4" /> 标题 2
            </button>
            <button onClick={() => handleInsert(() => editor.chain().focus().toggleHeading({ level: 3 }).run())} className={menuBtnClass}>
              <Heading3 className="w-4 h-4" /> 标题 3
            </button>
            <button onClick={() => handleInsert(() => editor.chain().focus().toggleHeading({ level: 4 }).run())} className={menuBtnClass}>
              <Heading4 className="w-4 h-4" /> 标题 4
            </button>
            <div className={`my-1 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`} />
            <button onClick={() => handleInsert(addImage)} className={menuBtnClass}>
              <ImageIcon className="w-4 h-4" /> 图片
            </button>
            <button onClick={() => handleInsert(insertTable)} className={menuBtnClass}>
              <TableIcon className="w-4 h-4" /> 表格
            </button>
            <button onClick={() => handleInsert(() => editor.chain().focus().toggleBlockquote().run())} className={menuBtnClass}>
              <Quote className="w-4 h-4" /> 引用
            </button>
            <button onClick={() => handleInsert(() => editor.chain().focus().toggleCodeBlock().run())} className={menuBtnClass}>
              <Code className="w-4 h-4" /> 代码块
            </button>
            <button onClick={() => handleInsert(() => editor.chain().focus().toggleTaskList().run())} className={menuBtnClass}>
              <CheckSquare className="w-4 h-4" /> 待办
            </button>
            <button onClick={() => handleInsert(() => editor.chain().focus().setHorizontalRule().run())} className={menuBtnClass}>
              <Minus className="w-4 h-4" /> 分割线
            </button>
          </div>
        )}
      </div>

      {/* ⋮⋮ 按钮 */}
      <div className="relative" ref={blockRef}>
        <button
          onClick={() => { setShowBlockMenu(!showBlockMenu); setShowInsertMenu(false); }}
          className={`p-1 rounded-md transition-colors ${
            showBlockMenu
              ? isDark ? 'bg-gray-600 text-white' : 'bg-gray-200 text-gray-800'
              : isDark ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-200' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
          }`}
          title="块操作"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        {showBlockMenu && (
          <div className={`absolute left-full top-0 ml-1 z-50 w-40 rounded-lg shadow-xl border py-1 ${menuBg}`}>
            <button onClick={copyBlock} className={menuBtnClass}>
              <Copy className="w-4 h-4" /> 复制块
            </button>
            <button onClick={deleteBlock} className={`${menuBtnClass} text-red-500`}>
              <Trash2 className="w-4 h-4" /> 删除块
            </button>
            <div className={`my-1 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`} />
            <button onClick={moveUp} className={menuBtnClass}>
              <ArrowUp className="w-4 h-4" /> 上移
            </button>
            <button onClick={moveDown} className={menuBtnClass}>
              <ArrowDown className="w-4 h-4" /> 下移
            </button>
          </div>
        )}
      </div>
    </TiptapFloatingMenu>
  );
}
