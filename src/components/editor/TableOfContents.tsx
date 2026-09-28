/**
 * 自动目录（TOC）组件
 * 扫描 H1-H4 生成层级目录，支持实时更新、点击跳转、当前阅读位置高亮、折叠/展开
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Editor } from '@tiptap/react';
import { ChevronRight, ChevronDown, List } from 'lucide-react';

interface TocItem {
  id: string;
  level: number;
  text: string;
  pos: number;
}

interface TableOfContentsProps {
  editor: Editor | null;
  className?: string;
}

export default function TableOfContents({ editor, className }: TableOfContentsProps) {
  const [items, setItems] = useState<TocItem[]>([]);
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [panelOpen, setPanelOpen] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);

  const scanHeadings = useCallback(() => {
    if (!editor) return;
    const headings: TocItem[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading') {
        const text = node.textContent;
        if (text.trim()) {
          headings.push({
            id: `heading-${pos}`,
            level: node.attrs.level as number,
            text: text.trim(),
            pos,
          });
        }
      }
    });
    setItems(headings);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    scanHeadings();
    const handleUpdate = () => scanHeadings();
    editor.on('update', handleUpdate);
    return () => { editor.off('update', handleUpdate); };
  }, [editor, scanHeadings]);

  // 滚动检测：高亮当前阅读位置的标题
  useEffect(() => {
    if (!editor || items.length === 0) return;

    const findScrollContainer = (): HTMLElement | null => {
      const editorDom = editor.view.dom;
      let el: HTMLElement | null = editorDom.parentElement;
      while (el) {
        if (el.scrollHeight > el.clientHeight + 10) return el;
        el = el.parentElement;
      }
      return document.documentElement;
    };

    const container = findScrollContainer();
    scrollContainerRef.current = container;

    const handleScroll = () => {
      const editorDom = editor.view.dom;
      const editorRect = editorDom.getBoundingClientRect();
      let currentActive: string | null = null;

      for (const item of items) {
        try {
          const coords = editor.view.coordsAtPos(item.pos);
          // 标题顶部在编辑器可视区域内，且在编辑器顶部偏上位置
          if (coords.top - editorRect.top <= 120) {
            currentActive = item.id;
          }
        } catch { /* pos might be invalid */ }
      }

      if (currentActive !== activeId) {
        setActiveId(currentActive);
      }
    };

    container?.addEventListener('scroll', handleScroll, { passive: true });
    // 初始检测
    handleScroll();
    return () => container?.removeEventListener('scroll', handleScroll);
  }, [editor, items, activeId]);

  const scrollToHeading = (pos: number, id: string) => {
    if (!editor) return;
    editor.chain().focus().setTextSelection(pos).run();
    try {
      const coords = editor.view.coordsAtPos(pos);
      const editorDom = editor.view.dom;
      const editorRect = editorDom.getBoundingClientRect();
      const container = scrollContainerRef.current;
      if (container && coords) {
        const scrollTop = container?.scrollTop ?? 0;
        const targetTop = coords.top - editorRect.top + scrollTop - 80;
        container?.scrollTo({ top: targetTop, behavior: 'smooth' });
      }
    } catch { /* ignore */ }
    setActiveId(id);
  };

  const toggleCollapse = (level: number) => {
    setCollapsed((prev) => ({ ...prev, [level]: !prev[level] }));
  };

  const isItemVisible = (item: TocItem): boolean => {
    for (let l = item.level - 1; l >= 1; l--) {
      if (collapsed[l]) return false;
    }
    return true;
  };

  if (!editor || items.length === 0) return null;

  const visibleItems = items.filter(isItemVisible);

  const indentClass = (level: number) => {
    switch (level) {
      case 1: return 'pl-3';
      case 2: return 'pl-6';
      case 3: return 'pl-9';
      default: return 'pl-12';
    }
  };

  const levelFontSize = (level: number) => {
    switch (level) {
      case 1: return 'text-sm font-semibold';
      case 2: return 'text-sm font-medium';
      case 3: return 'text-xs';
      default: return 'text-xs';
    }
  };

  return (
    <div className={`${className || ''}`}>
      {/* TOC 标题栏 */}
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        className="flex w-full items-center gap-2 border-b border-studio-border-soft px-3 py-2 text-left text-sm font-medium text-studio-text-secondary transition-colors hover:bg-studio-surface-soft hover:text-studio-text-primary"
      >
        <List className="w-4 h-4" />
        <span>目录</span>
        <span className="ml-auto text-xs text-studio-text-muted">{items.length} 项</span>
        {panelOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>

      {panelOpen && (
        <div className="max-h-[calc(100vh-300px)] overflow-y-auto bg-studio-surface py-1">
          {visibleItems.map((item, idx) => {
            // 检查是否有子标题
            const nextItem = visibleItems[idx + 1];
            const hasChildren = nextItem && nextItem.level > item.level;
            const isCollapsed = collapsed[item.level];
            const isActive = activeId === item.id;

            return (
              <div key={item.id} className={`group flex items-center ${indentClass(item.level)} ${item.level === 1 ? 'mt-1' : ''}`}>
                {hasChildren && item.level < 4 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleCollapse(item.level); }}
                    className="mr-1 rounded p-0.5 text-studio-text-muted transition-colors hover:bg-studio-surface-elevated hover:text-studio-text-primary"
                  >
                    {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
                <button
                  onClick={() => scrollToHeading(item.pos, item.id)}
                  className={`flex-1 text-left py-1.5 px-2 rounded text-sm truncate transition-all ${levelFontSize(item.level)} ${
                    isActive
                      ? 'border-l-2 border-studio-primary bg-studio-primary/12 text-studio-primary-contrast'
                      : 'text-studio-text-secondary hover:bg-studio-surface-soft hover:text-studio-text-primary'
                  }`}
                  title={item.text}
                >
                  {item.text}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
