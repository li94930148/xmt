import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, Users, ArrowRight } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { getTopics, getUsers } from '../api';
import { usePermission } from '../hooks/usePermission';
import { navigationSections, canAccessNavigationItem, canAccessNavigationSection } from '../config/navigation';
import { useAuthStore } from '../store';

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
  const user = useAuthStore((state) => state.user);
  const { loading, hasAnyPermission, hasAllPermissions } = usePermission();

  const pageItems: CommandItem[] = useMemo(
    () => navigationSections
      .filter((section) => !section.debugOnly && canAccessNavigationSection(section, user?.role))
      .flatMap((section) => section.items
        .filter((item) => canAccessNavigationItem(item, { hasAnyPermission, hasAllPermissions }, user?.role))
        .map((item) => {
          const Icon = item.icon;
          return {
            id: `page-${item.id}`,
            label: item.label,
            group: section.label,
            icon: <Icon className="h-4 w-4" />,
            action: () => navigate(item.path),
          };
        })),
    [hasAllPermissions, hasAnyPermission, navigate, user?.role],
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
        icon: <FileText className="w-4 h-4 text-studio-primary" />,
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
        icon: <Users className="w-4 h-4 text-studio-violet" />,
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
    <div
      className="xmt-overlay xmt-overlay-top"
      onClick={onClose}
    >
      <div
        className={`${styles.modal} studio-sheen xmt-panel-enter relative mx-4 w-full max-w-xl overflow-hidden rounded-panel border border-studio-border-soft shadow-floating`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="relative z-[1] flex items-center gap-3 border-b border-studio-border-soft px-4 py-3.5">
          <Search className="h-5 w-5 flex-shrink-0 text-studio-text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            placeholder="搜索选题、页面、用户..."
            className="flex-1 bg-transparent text-sm outline-none text-studio-text-primary placeholder:text-studio-text-muted"
          />
          <kbd className="rounded-md border border-studio-border-soft bg-[var(--xmt-overlay-tint)] px-1.5 py-0.5 font-mono text-[10px] text-studio-text-muted">ESC</kbd>
        </div>

        <div ref={listRef} className="relative z-[1] max-h-[360px] overflow-y-auto py-2">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-studio-text-muted">没有找到匹配结果</div>
          ) : (
            Object.entries(groupedItems).map(([group, items]) => (
              <div key={group}>
                <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-studio-text-muted">
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
                      className={`mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-150 ${
                        isSelected
                          ? 'bg-studio-surface-elevated/75 text-studio-text-primary shadow-[inset_0_0_0_1px_var(--xmt-border-active)]'
                          : 'text-studio-text-secondary hover:bg-studio-surface-soft/70'
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

        <div className="relative z-[1] flex items-center gap-4 border-t border-studio-border-soft px-4 py-2.5 text-[11px] text-studio-text-muted">
          <span className="flex items-center gap-1">
            <kbd className="rounded-md border border-studio-border-soft bg-white/[0.04] px-1 py-0.5 font-mono">↑↓</kbd> 导航
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded-md border border-studio-border-soft bg-white/[0.04] px-1 py-0.5 font-mono">↵</kbd> 选择
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded-md border border-studio-border-soft bg-white/[0.04] px-1 py-0.5 font-mono">ESC</kbd> 关闭
          </span>
        </div>
      </div>
    </div>
  );
}
