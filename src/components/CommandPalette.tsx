import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, Users, LayoutDashboard, ArrowRight, Settings } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { getTopics, getUsers } from '../api';
import { usePermission } from '../hooks/usePermission';

interface CommandItem {
  id: string;
  label: string;
  group: string;
  icon: React.ReactNode;
  action: () => void;
  permissions?: string[];
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
  const { loading, hasAnyPermission } = usePermission();

  const pageItems: CommandItem[] = useMemo(
    () => [
      { id: 'page-home', label: '首页', group: '页面导航', icon: <LayoutDashboard className="w-4 h-4" />, action: () => navigate('/') },
      { id: 'page-topics', label: '选题管理', group: '页面导航', icon: <FileText className="w-4 h-4" />, action: () => navigate('/topics') },
      { id: 'page-production', label: '创作管理', group: '页面导航', icon: <FileText className="w-4 h-4" />, action: () => navigate('/production') },
      { id: 'page-shooting', label: '成片制作', group: '页面导航', icon: <FileText className="w-4 h-4" />, action: () => navigate('/shooting'), permissions: ['workflow:shooting'] },
      { id: 'page-publishing', label: '发布管理', group: '页面导航', icon: <FileText className="w-4 h-4" />, action: () => navigate('/publishing'), permissions: ['workflow:publishing'] },
      { id: 'page-analytics', label: '实时数据看板', group: '运营复盘', icon: <FileText className="w-4 h-4" />, action: () => navigate('/analytics'), permissions: ['analytics:view'] },
      { id: 'page-users', label: '人员管理', group: '页面导航', icon: <Users className="w-4 h-4" />, action: () => navigate('/users'), permissions: ['user:view'] },
      { id: 'page-assets', label: '资料中心', group: '页面导航', icon: <FileText className="w-4 h-4" />, action: () => navigate('/asset-center') },
      { id: 'page-resources', label: '内容档案库', group: '资料中心', icon: <FileText className="w-4 h-4" />, action: () => navigate('/resources') },
      { id: 'page-daily-report', label: '日报归档', group: '运营复盘', icon: <FileText className="w-4 h-4" />, action: () => navigate('/daily-report') },
      { id: 'page-messages', label: '消息中心', group: '页面导航', icon: <FileText className="w-4 h-4" />, action: () => navigate('/messages') },
      { id: 'page-settings', label: '设置中心', group: '页面导航', icon: <Settings className="w-4 h-4" />, action: () => navigate('/notification-settings') },
    ],
    [navigate],
  );

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setSelectedIndex(0);

    const fetchData = async () => {
      try {
        const [topics, users] = await Promise.all([getTopics({ limit: 20 }), getUsers({})]);
        setTopicResults((topics.data || []).map((t: any) => ({ id: t.id, title: t.title })));
        const userList = Array.isArray(users) ? users : (users as any).data || [];
        setUserResults(userList.map((u: any) => ({ id: u.id, name: u.name || u.username })));
      } catch {
        // Search still works with static page items.
      }
    };

    void fetchData();
  }, [isOpen]);

  const filteredItems = useMemo(() => {
    const q = query.toLowerCase().trim();
    const items: CommandItem[] = [];

    const matchedTopics = q
      ? topicResults.filter((t) => t.title.toLowerCase().includes(q))
      : topicResults.slice(0, 5);
    matchedTopics.forEach((topic) => {
      items.push({
        id: `topic-${topic.id}`,
        label: topic.title,
        group: '选题',
        icon: <FileText className="w-4 h-4 text-[#5c7cfa]" />,
        action: () => navigate(`/topics/${topic.id}`),
      });
    });

    const visiblePages = pageItems.filter((item) => {
      if (!item.permissions || item.permissions.length === 0) {
        return true;
      }
      return !loading && hasAnyPermission(item.permissions);
    });

    const matchedPages = q
      ? visiblePages.filter((item) => item.label.toLowerCase().includes(q))
      : visiblePages;
    items.push(...matchedPages);

    const matchedUsers = q
      ? userResults.filter((u) => u.name.toLowerCase().includes(q))
      : userResults.slice(0, 5);
    matchedUsers.forEach((user) => {
      items.push({
        id: `user-${user.id}`,
        label: user.name,
        group: '用户',
        icon: <Users className="w-4 h-4 text-[#cc5de8]" />,
        action: () => navigate('/users'),
        permissions: ['user:view'],
      });
    });

    return items.filter((item) => {
      if (!item.permissions || item.permissions.length === 0) {
        return true;
      }
      return !loading && hasAnyPermission(item.permissions);
    });
  }, [query, topicResults, userResults, pageItems, navigate, loading, hasAnyPermission]);

  const groupedItems = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    filteredItems.forEach((item) => {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    });
    return groups;
  }, [filteredItems]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!listRef.current) return;
    const element = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    element?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleSelect = (item: CommandItem) => {
    onClose();
    item.action();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((index) => Math.min(index + 1, filteredItems.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (filteredItems[selectedIndex]) {
        handleSelect(filteredItems[selectedIndex]);
      }
    } else if (event.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  let globalIndex = -1;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div
        className={`${styles.modal} mx-4 w-full max-w-xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className={`flex items-center gap-3 border-b px-4 py-3 ${styles.divider}`}>
          <Search className={`h-5 w-5 flex-shrink-0 ${styles.textMuted}`} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            placeholder="搜索选题、页面、用户..."
            className={`flex-1 bg-transparent text-sm outline-none ${styles.textPrimary} ${styles.textPlaceholder}`}
          />
          <kbd className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${styles.bgTertiary} ${styles.textMuted}`}>ESC</kbd>
        </div>

        <div ref={listRef} className="max-h-[360px] overflow-y-auto py-2">
          {filteredItems.length === 0 ? (
            <div className={`px-4 py-8 text-center text-sm ${styles.textMuted}`}>没有找到匹配结果</div>
          ) : (
            Object.entries(groupedItems).map(([group, items]) => (
              <div key={group}>
                <div className={`px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${styles.textMuted}`}>
                  {group}
                </div>
                {items.map((item) => {
                  globalIndex++;
                  const index = globalIndex;
                  const isSelected = index === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      data-index={index}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-100 ${
                        isSelected
                          ? `${styles.isDark ? 'bg-[#252840]' : 'bg-[#f1f3f5]'} ${styles.textPrimary}`
                          : styles.textSecondary
                      }`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <span className="flex-shrink-0">{item.icon}</span>
                      <span className="flex-1 truncate text-left">{item.label}</span>
                      {isSelected && <ArrowRight className="h-3.5 w-3.5 opacity-50" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className={`flex items-center gap-4 border-t px-4 py-2.5 text-[11px] ${styles.divider} ${styles.textMuted}`}>
          <span className="flex items-center gap-1">
            <kbd className={`rounded px-1 py-0.5 font-mono ${styles.bgTertiary}`}>↑↓</kbd> 导航
          </span>
          <span className="flex items-center gap-1">
            <kbd className={`rounded px-1 py-0.5 font-mono ${styles.bgTertiary}`}>↵</kbd> 选择
          </span>
          <span className="flex items-center gap-1">
            <kbd className={`rounded px-1 py-0.5 font-mono ${styles.bgTertiary}`}>ESC</kbd> 关闭
          </span>
        </div>
      </div>
    </div>
  );
}
