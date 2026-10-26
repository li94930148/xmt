import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, Users, ArrowRight, BookOpen, ClipboardList, Lightbulb, RotateCcw, ScrollText } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { usePermission } from '../hooks/usePermission';
import { navigationSections, canAccessNavigationItem, canAccessNavigationSection } from '../config/navigation';
import { useAuthStore } from '../store';
import { searchGlobalContent, type GlobalSearchHit, type GlobalSearchScopes } from '../api/globalSearch';

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

function iconForGroup(group: string) {
  if (group === '创作稿件') return <ScrollText className="h-4 w-4 text-studio-cyan" />;
  if (group === '资料') return <BookOpen className="h-4 w-4 text-studio-violet" />;
  if (group === '日报') return <ClipboardList className="h-4 w-4 text-studio-amber" />;
  if (group === '复盘') return <RotateCcw className="h-4 w-4 text-studio-emerald" />;
  if (group === '选题') return <Lightbulb className="h-4 w-4 text-studio-primary" />;
  if (group === '用户') return <Users className="h-4 w-4 text-studio-violet" />;
  return <FileText className="h-4 w-4 text-studio-text-muted" />;
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchHits, setSearchHits] = useState<GlobalSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [unavailableScopes, setUnavailableScopes] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();
  const styles = useThemeStyles();
  const user = useAuthStore((state) => state.user);
  const { loading, permissions, hasAnyPermission, hasAllPermissions } = usePermission();
  const isAdmin = user?.role === 'admin';
  const scopes = useMemo<GlobalSearchScopes>(() => {
    const hasPermission = (code: string) => isAdmin || permissions.includes('*') || permissions.includes(code);
    return {
      topics: hasPermission('topic:view'),
      production: hasPermission('production:view'),
      resources: hasPermission('resource:view'),
      dailyReports: hasPermission('report:daily:archive') || hasPermission('report:daily:submit'),
      retrospectives: hasPermission('analytics:retro:view'),
      users: hasPermission('user:view'),
    };
  }, [isAdmin, permissions]);

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
    setSearchHits([]);
    setUnavailableScopes(0);
  }, [isOpen]);

  useEffect(() => {
    const keyword = query.trim();
    if (!isOpen || loading || Array.from(keyword).length < 2) {
      setSearchHits([]);
      setSearching(false);
      setUnavailableScopes(0);
      return;
    }

    const controller = new AbortController();
    setSearching(true);
    setUnavailableScopes(0);
    const timer = window.setTimeout(() => {
      void searchGlobalContent(keyword, scopes, controller.signal)
        .then(({ hits, unavailableScopes: failures }) => {
          if (controller.signal.aborted) return;
          setSearchHits(hits);
          setUnavailableScopes(failures);
          setSelectedIndex(0);
        })
        .catch(() => {
          if (!controller.signal.aborted) setUnavailableScopes(1);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isOpen, loading, query, retryNonce, scopes]);

  const filteredItems = useMemo(() => {
    const q = query.toLowerCase().trim();
    const items: CommandItem[] = [];
    const matchedPages = q ? pageItems.filter((item) => item.label.toLowerCase().includes(q)) : pageItems;
    items.push(...matchedPages);

    if (q.length >= 2) {
      searchHits.forEach((hit) => {
        items.push({
          id: hit.id,
          label: hit.label,
          group: hit.group,
          icon: iconForGroup(hit.group),
          action: () => navigate(hit.path),
        });
      });
    }
    return items;
  }, [pageItems, query, searchHits, navigate]);

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
      const activeElement = document.activeElement;
      previousFocusRef.current = activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : null;
      inputRef.current?.focus();
      return;
    }

    const previousFocus = previousFocusRef.current;
    previousFocusRef.current = null;
    if (previousFocus?.isConnected) previousFocus.focus();
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
      setSelectedIndex((index) => Math.min(index + 1, Math.max(0, filteredItems.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (filteredItems[selectedIndex]) handleSelect(filteredItems[selectedIndex]);
    } else if (event.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  let globalIndex = -1;
  const normalizedQuery = query.trim();
  const showNoResults = filteredItems.length === 0 && Array.from(normalizedQuery).length >= 2 && !searching;

  return (
    <div className="xmt-overlay xmt-overlay-top z-command" onClick={onClose}>
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
            maxLength={100}
            aria-label="全局搜索"
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            placeholder="搜索稿件、资料、日报、复盘、选题和成员..."
            className="min-w-0 flex-1 bg-transparent text-sm outline-none text-studio-text-primary placeholder:text-studio-text-secondary"
          />
          <kbd className="rounded-md border border-studio-border-soft bg-[var(--xmt-overlay-tint)] px-1.5 py-0.5 font-mono text-[10px] text-studio-text-secondary">ESC</kbd>
        </div>

        <div ref={listRef} className="relative z-[1] max-h-[360px] overflow-y-auto py-2">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-studio-text-secondary">
              {loading ? '正在确认可搜索范围…' : searching ? '正在检索内容…' : showNoResults ? '没有找到匹配结果' : '输入至少 2 个字，搜索你有权查看的内容'}
            </div>
          ) : (
            Object.entries(groupedItems).map(([group, items]) => (
              <div key={group}>
                <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-studio-text-secondary">{group}</div>
                {items.map((item) => {
                  globalIndex++;
                  const index = globalIndex;
                  const isSelected = index === selectedIndex;
                  const hit = searchHits.find((candidate) => candidate.id === item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
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
                      {hit?.detail && <span className="max-w-[35%] truncate text-xs text-studio-text-secondary">{hit.detail}</span>}
                      {isSelected && <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="relative z-[1] flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-studio-border-soft px-4 py-2.5 text-[11px] text-studio-text-secondary">
          <span className="flex items-center gap-1"><kbd className="rounded-md border border-studio-border-soft bg-studio-surface-soft px-1 py-0.5 font-mono">↑↓</kbd> 导航</span>
          <span className="flex items-center gap-1"><kbd className="rounded-md border border-studio-border-soft bg-studio-surface-soft px-1 py-0.5 font-mono">↵</kbd> 选择</span>
          <span className="flex items-center gap-1"><kbd className="rounded-md border border-studio-border-soft bg-studio-surface-soft px-1 py-0.5 font-mono">ESC</kbd> 关闭</span>
          {searching && <span role="status">正在检索…</span>}
          {unavailableScopes > 0 && (
            <span role="status" className="ml-auto flex items-center gap-2">
              部分内容暂不可用
              <button type="button" className="text-studio-primary-contrast underline underline-offset-2" onClick={() => setRetryNonce((value) => value + 1)}>重试</button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
