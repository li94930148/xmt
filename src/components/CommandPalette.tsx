import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, Users, LayoutDashboard, ArrowRight, Command } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useTopicStore } from '../store';
import { getTopics, getUsers } from '../api';

interface CommandItem {
  id: string;
  label: string;
  group: string;
  icon: React.ReactNode;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [topicResults, setTopicResults] = useState<{ id: number; title: string }[]>([]);
  const [userResults, setUserResults] = useState<{ id: number; name: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const styles = useThemeStyles();

  // 页面导航项
  const pageItems: CommandItem[] = useMemo(
    () => [
      { id: 'page-home', label: '首页', group: '页面导航', icon: <LayoutDashboard className="w-4 h-4" />, action: () => navigate('/') },
      { id: 'page-topics', label: '选题管理', group: '页面导航', icon: <FileText className="w-4 h-4" />, action: () => navigate('/topics') },
      { id: 'page-production', label: '创作管理', group: '页面导航', icon: <FileText className="w-4 h-4" />, action: () => navigate('/production') },
      { id: 'page-shooting', label: '成片制作', group: '页面导航', icon: <FileText className="w-4 h-4" />, action: () => navigate('/shooting') },
      { id: 'page-publishing', label: '发布管理', group: '页面导航', icon: <FileText className="w-4 h-4" />, action: () => navigate('/publishing') },
      { id: 'page-analytics', label: '数据复盘', group: '页面导航', icon: <FileText className="w-4 h-4" />, action: () => navigate('/analytics') },
      { id: 'page-users', label: '人员管理', group: '页面导航', icon: <Users className="w-4 h-4" />, action: () => navigate('/users') },
      { id: 'page-resources', label: '资源库', group: '页面导航', icon: <FileText className="w-4 h-4" />, action: () => navigate('/resources') },
      { id: 'page-messages', label: '消息中心', group: '页面导航', icon: <FileText className="w-4 h-4" />, action: () => navigate('/messages') },
      { id: 'page-settings', label: '系统设置', group: '页面导航', icon: <FileText className="w-4 h-4" />, action: () => navigate('/notification-settings') },
    ],
    [navigate]
  );

  // Fetch data when open
  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setSelectedIndex(0);

    const fetch = async () => {
      try {
        const [topics, users] = await Promise.all([
          getTopics({ limit: 20 }),
          getUsers({}),
        ]);
        setTopicResults((topics.data || []).map((t: any) => ({ id: t.id, title: t.title })));
        const userList = Array.isArray(users) ? users : (users as any).data || [];
        setUserResults(userList.map((u: any) => ({ id: u.id, name: u.name || u.username })));
      } catch {
        // Silently fail — search still works with pages
      }
    };
    fetch();
  }, [isOpen]);

  // Filter items
  const filteredItems = useMemo(() => {
    const q = query.toLowerCase().trim();
    const items: CommandItem[] = [];

    // 选题
    const matchedTopics = q
      ? topicResults.filter((t) => t.title.toLowerCase().includes(q))
      : topicResults.slice(0, 5);
    matchedTopics.forEach((t) => {
      items.push({
        id: `topic-${t.id}`,
        label: t.title,
        group: '选题',
        icon: <FileText className="w-4 h-4 text-[#5c7cfa]" />,
        action: () => navigate(`/topics/${t.id}`),
      });
    });

    // 页面导航
    const matchedPages = q
      ? pageItems.filter((p) => p.label.toLowerCase().includes(q))
      : pageItems;
    items.push(...matchedPages);

    // 用户
    const matchedUsers = q
      ? userResults.filter((u) => u.name.toLowerCase().includes(q))
      : userResults.slice(0, 5);
    matchedUsers.forEach((u) => {
      items.push({
        id: `user-${u.id}`,
        label: u.name,
        group: '用户',
        icon: <Users className="w-4 h-4 text-[#cc5de8]" />,
        action: () => navigate(`/users`), // Navigate to users page
      });
    });

    return items;
  }, [query, topicResults, userResults, pageItems, navigate]);

  // Group items
  const groupedItems = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    filteredItems.forEach((item) => {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    });
    return groups;
  }, [filteredItems]);

  const flatItems = filteredItems; // for keyboard navigation

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Keep selected item in view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleSelect = (item: CommandItem) => {
    onClose();
    item.action();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatItems[selectedIndex]) handleSelect(flatItems[selectedIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  let globalIndex = -1;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div
        className={`${styles.modal} w-full max-w-xl mx-4 overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input */}
        <div className={`flex items-center gap-3 px-4 py-3 border-b ${styles.divider}`}>
          <Search className={`w-5 h-5 ${styles.textMuted} flex-shrink-0`} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="搜索选题、页面、用户..."
            className={`flex-1 bg-transparent outline-none text-sm ${styles.textPrimary} ${styles.textPlaceholder}`}
          />
          <kbd className={`text-[10px] px-1.5 py-0.5 rounded ${styles.bgTertiary} ${styles.textMuted} font-mono`}>ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[360px] overflow-y-auto py-2">
          {flatItems.length === 0 ? (
            <div className={`px-4 py-8 text-center text-sm ${styles.textMuted}`}>
              没有找到匹配结果
            </div>
          ) : (
            Object.entries(groupedItems).map(([group, items]) => (
              <div key={group}>
                <div className={`px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${styles.textMuted}`}>
                  {group}
                </div>
                {items.map((item) => {
                  globalIndex++;
                  const idx = globalIndex;
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      data-index={idx}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-100 ${
                        isSelected
                          ? `${styles.isDark ? 'bg-[#252840]' : 'bg-[#f1f3f5]'} ${styles.textPrimary}`
                          : `${styles.textSecondary}`
                      }`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <span className="flex-shrink-0">{item.icon}</span>
                      <span className="flex-1 text-left truncate">{item.label}</span>
                      {isSelected && <ArrowRight className="w-3.5 h-3.5 opacity-50" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center gap-4 px-4 py-2.5 border-t ${styles.divider} text-[11px] ${styles.textMuted}`}>
          <span className="flex items-center gap-1">
            <kbd className={`px-1 py-0.5 rounded ${styles.bgTertiary} font-mono`}>↑↓</kbd> 导航
          </span>
          <span className="flex items-center gap-1">
            <kbd className={`px-1 py-0.5 rounded ${styles.bgTertiary} font-mono`}>↵</kbd> 选择
          </span>
          <span className="flex items-center gap-1">
            <kbd className={`px-1 py-0.5 rounded ${styles.bgTertiary} font-mono`}>ESC</kbd> 关闭
          </span>
        </div>
      </div>
    </div>
  );
}
