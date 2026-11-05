import { useCallback, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Camera, CheckCircle, Clock3, ExternalLink, FileText, Send, UserRound, XCircle } from 'lucide-react';
import { ActionButton, EmptyState, GlassPanel, StatusPill } from '../studio';
import { formatBeijingDate } from '../../lib/utils';
import { getPlatformLabel } from '../../platform/platform-labels';
import type { Topic } from '../../types';

type TopicStatus = Topic['status'];
type BoardColumn = { status: TopicStatus; label: string; icon: typeof Clock3; tone: string };

const columns: BoardColumn[] = [
  { status: 'pending', label: '待审核', icon: Clock3, tone: 'text-studio-amber' },
  { status: 'approved', label: '已通过', icon: CheckCircle, tone: 'text-studio-success' },
  { status: 'rejected', label: '已驳回', icon: XCircle, tone: 'text-studio-coral' },
  { status: 'production', label: '创作中', icon: FileText, tone: 'text-studio-primary' },
  { status: 'shooting', label: '成片制作', icon: Camera, tone: 'text-studio-violet' },
  { status: 'publishing', label: '发布中', icon: Send, tone: 'text-studio-cyan' },
  { status: 'completed', label: '已完成', icon: CheckCircle, tone: 'text-studio-text-muted' },
];

const statusLabels: Record<TopicStatus, string> = {
  pending: '待审核', approved: '已通过', rejected: '已驳回', production: '创作中',
  shooting: '成片制作', publishing: '发布中', completed: '已完成',
};

const nextStatuses: Record<TopicStatus, Array<{ status: TopicStatus; label: string }>> = {
  pending: [{ status: 'approved', label: '通过' }, { status: 'rejected', label: '驳回' }],
  approved: [{ status: 'production', label: '开始创作' }],
  rejected: [{ status: 'pending', label: '重新审核' }],
  production: [{ status: 'shooting', label: '进入成片制作' }],
  shooting: [{ status: 'publishing', label: '进入发布' }],
  publishing: [{ status: 'completed', label: '完成' }],
  completed: [],
};

const statusTone: Record<TopicStatus, 'primary' | 'cyan' | 'violet' | 'coral' | 'amber' | 'success' | 'muted'> = {
  pending: 'amber', approved: 'success', rejected: 'coral', production: 'primary',
  shooting: 'violet', publishing: 'cyan', completed: 'muted',
};

const topicColumnVirtualizationThreshold = 32;

type TopicsBoardColumnProps = {
  column: BoardColumn;
  items: Topic[];
  canUpdate: boolean;
  canAudit: boolean;
  statusVerificationIds?: ReadonlySet<number>;
  transitioningTopicIds: ReadonlySet<number>;
  onOpenTopic: (topic: Topic) => void;
  transitionTopic: (topic: Topic, status: TopicStatus) => Promise<void>;
};

function TopicsBoardColumn({
  column,
  items,
  canUpdate,
  canAudit,
  statusVerificationIds,
  transitioningTopicIds,
  onOpenTopic,
  transitionTopic,
}: TopicsBoardColumnProps) {
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const [showAllTopics, setShowAllTopics] = useState(false);
  const shouldVirtualize = items.length > topicColumnVirtualizationThreshold && !showAllTopics;
  const listId = `topics-board-list-${column.status}`;
  const getItemKey = useCallback((index: number) => items[index]?.id ?? index, [items]);
  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? items.length : 0,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => 184,
    getItemKey,
    overscan: 6,
    gap: 12,
  });

  const renderTopic = (topic: Topic, index: number, virtual = false, start = 0) => {
    const canChange = topic.status === 'pending' ? canAudit : canUpdate;
    const isTransitioning = transitioningTopicIds.has(topic.id);
    const statusNeedsVerification = statusVerificationIds?.has(topic.id) ?? false;

    return (
      <div
        key={topic.id}
        ref={virtual ? virtualizer.measureElement : undefined}
        data-index={virtual ? index : undefined}
        className={virtual ? 'absolute left-0 top-0 w-full' : 'relative'}
        style={virtual ? { transform: `translateY(${start}px)` } : undefined}
      >
        <article
          role="listitem"
          aria-posinset={index + 1}
          aria-setsize={items.length}
          className="rounded-card border border-studio-border-soft bg-studio-surface-soft p-3.5 transition hover:border-studio-border-active"
        >
          <ActionButton type="button" variant="ghost" onClick={() => onOpenTopic(topic)} className="group min-h-10 w-full items-start justify-between gap-2 p-0 text-left">
            <span className="line-clamp-2 text-sm font-semibold text-studio-text-primary group-hover:text-studio-primary-contrast">{topic.title}</span>
            <ExternalLink aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-studio-text-muted" />
          </ActionButton>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusPill tone={statusTone[topic.status]}>{statusLabels[topic.status]}</StatusPill>
            {topic.platform ? <span className="rounded-full border border-studio-border-soft bg-studio-surface px-2 py-0.5 text-[10px] text-studio-text-secondary">{getPlatformLabel(topic.platform)}</span> : null}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-studio-text-secondary">
            <span className="truncate">{topic.assignee_name || '未分配'}</span>
            {topic.deadline ? <time className={new Date(topic.deadline) < new Date() && !['completed', 'rejected'].includes(topic.status) ? 'shrink-0 text-studio-coral-contrast' : 'shrink-0'}>{formatBeijingDate(topic.deadline)}</time> : null}
          </div>
          {canChange && nextStatuses[topic.status].length ? (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-studio-border-soft pt-3">
              {nextStatuses[topic.status].map((next) => (
                <ActionButton key={next.status} type="button" variant="secondary" disabled={isTransitioning || statusNeedsVerification} aria-busy={isTransitioning} title={statusNeedsVerification ? '只读核实后才能更新状态' : undefined} className="min-h-10 px-2.5 py-1 text-xs" onClick={() => { void transitionTopic(topic, next.status); }}>
                  {isTransitioning ? '处理中…' : next.label}
                </ActionButton>
              ))}
            </div>
          ) : null}
        </article>
      </div>
    );
  };

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <section aria-labelledby={`topic-column-${column.status}`} className="w-[min(18rem,82vw)] shrink-0">
      <GlassPanel className="h-full p-0">
        <header className="flex items-center gap-2 border-b border-studio-border-soft px-4 py-3">
          <column.icon className={`h-4 w-4 ${column.tone}`} />
          <h2 id={`topic-column-${column.status}`} className="text-sm font-semibold text-studio-text-primary">{column.label}</h2>
          <span className="ml-auto rounded-full bg-studio-surface-soft px-2 py-0.5 text-xs tabular-nums text-studio-text-secondary">{items.length}</span>
        </header>
        {items.length > topicColumnVirtualizationThreshold ? (
          <div className="flex items-center justify-between gap-2 border-b border-studio-border-soft px-3 py-2">
            <span className="text-xs text-studio-text-secondary">键盘进入卡片时会展开完整列表</span>
            <ActionButton
              type="button"
              variant="ghost"
              aria-expanded={!shouldVirtualize}
              aria-controls={listId}
              onClick={() => setShowAllTopics((current) => !current)}
              className="min-h-10 shrink-0 px-2 py-1 text-xs"
            >
              {shouldVirtualize ? `显示全部 ${items.length} 条` : '恢复优化显示'}
            </ActionButton>
          </div>
        ) : null}
        <div
          ref={scrollElementRef}
          onFocusCapture={() => {
            if (shouldVirtualize) setShowAllTopics(true);
          }}
          className="max-h-[calc(100vh-24rem)] min-h-40 overflow-y-auto p-3"
        >
          {items.length === 0 ? (
            <p className="py-8 text-center text-xs text-studio-text-secondary">暂无选题</p>
          ) : shouldVirtualize ? (
            <div
              id={listId}
              role="list"
              aria-label={`${column.label}选题`}
              data-virtualized="true"
              className="relative"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualItems.map((item) => renderTopic(items[item.index], item.index, true, item.start))}
            </div>
          ) : (
            <div id={listId} role="list" aria-label={`${column.label}选题`} className="space-y-3">
              {items.map((topic, index) => renderTopic(topic, index))}
            </div>
          )}
        </div>
      </GlassPanel>
    </section>
  );
}

export type TopicsBoardViewProps = {
  topics: Topic[];
  total: number;
  statusFilter: string;
  hasActiveQueryFilters: boolean;
  loading: boolean;
  canUpdate: boolean;
  canAudit: boolean;
  statusVerificationIds?: ReadonlySet<number>;
  onClearQueryFilters: () => void;
  onOpenTopic: (topic: Topic) => void;
  onTransition: (topic: Topic, status: TopicStatus) => void | Promise<void>;
};

export default function TopicsBoardView({
  topics, total, statusFilter, hasActiveQueryFilters, loading, canUpdate, canAudit, statusVerificationIds, onClearQueryFilters, onOpenTopic, onTransition,
}: TopicsBoardViewProps) {
  const [platformFilter, setPlatformFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [transitioningTopicIds, setTransitioningTopicIds] = useState<Set<number>>(() => new Set());
  const transitionsInFlightRef = useRef(new Set<number>());
  const platforms = useMemo(() => [...new Set(topics.map((topic) => topic.platform).filter(Boolean))].sort(), [topics]);
  const assignees = useMemo(() => {
    const unique = new Map<number, string>();
    for (const topic of topics) {
      if (topic.assignee_id && topic.assignee_name) unique.set(topic.assignee_id, topic.assignee_name);
    }
    return [...unique.entries()].sort((a, b) => a[1].localeCompare(b[1], 'zh-CN'));
  }, [topics]);
  const filteredTopics = useMemo(() => topics.filter((topic) => {
    if (platformFilter && topic.platform !== platformFilter) return false;
    if (assigneeFilter && String(topic.assignee_id ?? '') !== assigneeFilter) return false;
    return true;
  }), [assigneeFilter, platformFilter, topics]);
  const visibleColumns = statusFilter === 'creation'
    ? columns.filter((column) => column.status === 'approved' || column.status === 'production')
    : statusFilter ? columns.filter((column) => column.status === statusFilter) : columns;
  const transitionTopic = async (topic: Topic, status: TopicStatus) => {
    if (transitionsInFlightRef.current.has(topic.id)) return;
    transitionsInFlightRef.current.add(topic.id);
    setTransitioningTopicIds((current) => new Set(current).add(topic.id));
    try {
      await onTransition(topic, status);
    } finally {
      transitionsInFlightRef.current.delete(topic.id);
      setTransitioningTopicIds((current) => {
        const next = new Set(current);
        next.delete(topic.id);
        return next;
      });
    }
  };

  return (
    <div className="space-y-4">
      <GlassPanel className="flex flex-wrap items-center gap-3 p-4">
        <label className="flex w-full min-w-0 items-center gap-2 text-sm text-studio-text-secondary sm:w-auto sm:flex-initial">
          <span className="shrink-0 whitespace-nowrap">平台</span>
          <select id="topics-board-platform-filter" name="topicsBoardPlatformFilter" aria-label="看板平台筛选" value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)} className="xmt-field min-w-0 flex-1 sm:min-w-28 sm:flex-initial">
            <option value="">全部平台</option>
            {platforms.map((platform) => <option key={platform} value={platform}>{getPlatformLabel(platform)}</option>)}
          </select>
        </label>
        <label className="flex w-full min-w-0 items-center gap-2 text-sm text-studio-text-secondary sm:w-auto sm:flex-initial">
          <UserRound className="h-4 w-4 shrink-0 text-studio-text-muted" />
          <span className="shrink-0 whitespace-nowrap">负责人</span>
          <select id="topics-board-assignee-filter" name="topicsBoardAssigneeFilter" aria-label="看板负责人筛选" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} className="xmt-field min-w-0 flex-1 sm:min-w-28 sm:flex-initial">
            <option value="">全部负责人</option>
            {assignees.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <span role="status" aria-live="polite" aria-atomic="true" className="ml-auto text-xs text-studio-text-secondary">显示 {filteredTopics.length} / {total} 个选题</span>
      </GlassPanel>

      {total > topics.length ? (
        <p role="status" className="text-sm text-studio-text-secondary">
          看板最多显示最近 200 个选题。当前共有 {total} 个，请使用标题搜索或阶段筛选缩小范围。
        </p>
      ) : null}

      {loading ? (
        <div role="status" className="rounded-panel border border-studio-border-soft bg-studio-surface-soft p-8 text-center text-sm text-studio-text-secondary">正在加载选题看板…</div>
      ) : filteredTopics.length === 0 ? (
        topics.length === 0 && hasActiveQueryFilters ? (
          <EmptyState
            title="没有匹配当前筛选条件的选题"
            description="没有符合当前标题搜索或状态筛选的选题。"
            actionLabel="清除筛选"
            onAction={onClearQueryFilters}
          />
        ) : topics.length === 0 ? (
          <EmptyState title="暂无选题" description="提报选题后会在这里进入生产链路。" />
        ) : (
          <EmptyState title="没有匹配的选题" description="调整平台或负责人筛选条件后再试。" />
        )
      ) : (
        <div role="region" className="flex min-w-0 gap-4 overflow-x-auto pb-4" aria-label="选题状态看板">
          {visibleColumns.map((column) => {
            const items = filteredTopics.filter((topic) => topic.status === column.status);
            return (
              <TopicsBoardColumn
                key={column.status}
                column={column}
                items={items}
                canUpdate={canUpdate}
                canAudit={canAudit}
                statusVerificationIds={statusVerificationIds}
                transitioningTopicIds={transitioningTopicIds}
                onOpenTopic={onOpenTopic}
                transitionTopic={transitionTopic}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
