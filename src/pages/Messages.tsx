import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Info,
  Inbox,
  Radio,
  Trash2,
  XCircle,
} from 'lucide-react';
import { getMessages, markMessageAsRead, markAllAsRead, clearMessages } from '../api';
import { ConfirmModal, LoadingState } from '../components/common';
import {
  ActionButton,
  EmptyState,
  GlassPanel,
  MetricCard,
  PageHeader,
  PageShell,
  StatusPill,
} from '../components/studio';
import { formatBeijingTime } from '../lib/utils';
import { useAppStore, useAuthStore, useMessageStore } from '../store';
import type { Message } from '../types';

const MESSAGE_PAGE_SIZE = 20;

type MessageFilter = 'all' | 'unread' | 'actionable' | 'system';

const filters: { key: MessageFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'unread', label: '未读' },
  { key: 'actionable', label: '待处理' },
  { key: 'system', label: '系统' },
];

const typeMeta: Record<string, { icon: ReactNode; tone: 'success' | 'coral' | 'amber' | 'cyan'; label: string }> = {
  success: { icon: <CheckCircle className="h-5 w-5" />, tone: 'success', label: '完成' },
  error: { icon: <XCircle className="h-5 w-5" />, tone: 'coral', label: '异常' },
  warning: { icon: <AlertTriangle className="h-5 w-5" />, tone: 'amber', label: '提醒' },
  info: { icon: <Info className="h-5 w-5" />, tone: 'cyan', label: '通知' },
};

export default function Messages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ total: 0, unread: 0, actionable: 0 });
  const [searchParams] = useSearchParams();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [activeFilter, setActiveFilter] = useState<MessageFilter>(() => searchParams.get('filter') === 'actionable' ? 'actionable' : 'all');
  const markingMessageIdsRef = useRef(new Set<number>());
  const latestMessageRequestRef = useRef(0);
  const loadedQueryKeyRef = useRef<string | null>(null);
  const [loadedQueryKey, setLoadedQueryKey] = useState<string | null>(null);
  const [markingMessageIds, setMarkingMessageIds] = useState<Set<number>>(() => new Set());

  const navigate = useNavigate();
  const userId = useAuthStore((state) => state.user?.id);
  const messageQueryKey = JSON.stringify([userId ?? null, page, activeFilter]);
  const addNotification = useAppStore((state) => state.addNotification);
  const setStoreMessages = useMessageStore((state) => state.setMessages);
  const setUnreadCount = useMessageStore((state) => state.setUnreadCount);
  const markStoreMessageAsRead = useMessageStore((state) => state.markAsRead);

  useEffect(() => {
    const refreshMessages = () => setReloadKey((current) => current + 1);
    window.addEventListener('xmt-messages-refresh', refreshMessages);
    return () => window.removeEventListener('xmt-messages-refresh', refreshMessages);
  }, []);

  useEffect(() => {
    let active = true;
    const requestId = ++latestMessageRequestRef.current;
    const params = {
      page,
      limit: MESSAGE_PAGE_SIZE,
      ...(activeFilter === 'unread' ? { read: 'unread' as const } : {}),
      ...(activeFilter === 'actionable' ? { read: 'unread' as const, link: 'present' as const } : {}),
      ...(activeFilter === 'system' ? { link: 'absent' as const } : {}),
    };

    setLoading(true);
    setLoadError(null);
    void getMessages(params)
      .then((result) => {
        if (!active || requestId !== latestMessageRequestRef.current) return;
        setMessages(result.data);
        setTotal(result.total);
        setSummary(result.summary);
        loadedQueryKeyRef.current = messageQueryKey;
        setLoadedQueryKey(messageQueryKey);
        setStoreMessages(result.data);
        setUnreadCount(result.summary.unread);
      })
      .catch((error) => {
        if (!active || requestId !== latestMessageRequestRef.current) return;
        const message = error instanceof Error ? error.message : '请检查网络后重试';
        if (loadedQueryKeyRef.current !== messageQueryKey) {
          setMessages([]);
          setTotal(0);
          setSummary({ total: 0, unread: 0, actionable: 0 });
          setLoadedQueryKey(null);
          loadedQueryKeyRef.current = null;
          setStoreMessages([]);
          setUnreadCount(0);
        }
        setLoadError(message);
        addNotification({ title: '获取消息失败', message, type: 'error' });
      })
      .finally(() => {
        if (active && requestId === latestMessageRequestRef.current) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeFilter, addNotification, messageQueryKey, page, reloadKey, setStoreMessages, setUnreadCount]);

  const totalPages = Math.max(1, Math.ceil(total / MESSAGE_PAGE_SIZE));
  const unreadCount = summary.unread;
  const actionableCount = summary.actionable;
  const filteredMessages = messages;
  const showUnreadOnly = activeFilter === 'unread' || activeFilter === 'actionable';
  const hasCurrentResults = loadedQueryKey === messageQueryKey;

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleMessageClick = async (message: Message) => {
    if (!message.read) {
      if (markingMessageIdsRef.current.has(message.id)) return;
      markingMessageIdsRef.current.add(message.id);
      setMarkingMessageIds(new Set(markingMessageIdsRef.current));

      try {
        await markMessageAsRead(message.id);
        latestMessageRequestRef.current += 1;
        setLoading(false);
        setMessages((current) => showUnreadOnly
          ? current.filter((item) => item.id !== message.id)
          : current.map((item) => (item.id === message.id ? { ...item, read: true } : item)));
        if (showUnreadOnly) setTotal((current) => Math.max(0, current - 1));
        setSummary((current) => ({
          ...current,
          unread: Math.max(0, current.unread - 1),
          actionable: message.link ? Math.max(0, current.actionable - 1) : current.actionable,
        }));
        markStoreMessageAsRead(message.id);
      } catch (error) {
        addNotification({
          title: '标记已读失败',
          message: error instanceof Error ? error.message : '消息仍保持未读，请稍后重试',
          type: 'error',
        });
        return;
      } finally {
        markingMessageIdsRef.current.delete(message.id);
        setMarkingMessageIds(new Set(markingMessageIdsRef.current));
      }
    }

    if (message.link) {
      navigate(message.link);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    try {
      const result = await markAllAsRead();
      latestMessageRequestRef.current += 1;
      setLoading(false);
      const nextMessages = showUnreadOnly
        ? []
        : messages.map((message) => ({ ...message, read: true }));
      setMessages(nextMessages);
      setStoreMessages(nextMessages);
      setSummary((current) => ({ ...current, unread: 0, actionable: 0 }));
      setUnreadCount(0);
      if (showUnreadOnly) {
        setTotal(0);
        setPage(1);
      }
      addNotification({
        title: '操作成功',
        message: result.updatedCount > 0
          ? `已将 ${result.updatedCount} 条未读消息标记为已读`
          : '当前没有需要标记的未读消息',
        type: 'success',
      });
    } catch (error) {
      addNotification({
        title: '操作失败',
        message: error instanceof Error ? error.message : '消息仍保持未读，请稍后重试',
        type: 'error',
      });
    } finally {
      setMarkingAll(false);
    }
  };

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await clearMessages();
      latestMessageRequestRef.current += 1;
      setLoading(false);
      setMessages([]);
      setPage(1);
      setTotal(0);
      setSummary({ total: 0, unread: 0, actionable: 0 });
      setStoreMessages([]);
      setUnreadCount(0);
      setShowClearConfirm(false);
      addNotification({ title: '操作成功', message: '消息已清空', type: 'success' });
    } catch (error) {
      addNotification({ title: '操作失败', message: (error as Error).message, type: 'error' });
    } finally {
      setClearing(false);
    }
  };

  return (
    <>
      <PageShell>
        <PageHeader
          title="消息中心"
          description="聚合协作提醒、审核反馈和系统通知，优先处理仍未读的内容节点。"
          actions={
            <>
              <ActionButton onClick={handleMarkAllAsRead} disabled={unreadCount === 0 || markingAll}>
                <CheckCircle2 className="h-4 w-4" />
                {markingAll ? '处理中' : '全部已读'}
              </ActionButton>
              <ActionButton onClick={() => setShowClearConfirm(true)} variant="danger">
                <Trash2 className="h-4 w-4" />
                清空
              </ActionButton>
            </>
          }
        />

        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard title="未读消息" value={unreadCount} trend={{ label: '需要关注', up: unreadCount === 0 }} icon={Bell} tone="cyan" />
          <MetricCard title="待处理跳转" value={actionableCount} trend={{ label: '关联业务页面', up: actionableCount === 0 }} icon={Radio} tone="violet" />
          <MetricCard title="消息总量" value={summary.total} trend={{ label: '本地通知流', up: true }} icon={Inbox} tone="amber" />
        </div>

        <GlassPanel className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-studio-border-soft px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {filters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  aria-pressed={activeFilter === filter.key}
                  onClick={() => {
                    setPage(1);
                    setActiveFilter(filter.key);
                  }}
                  className={`min-h-10 rounded-button border px-3 py-2 text-sm font-semibold leading-snug transition ${
                    activeFilter === filter.key
                      ? 'border-studio-border-active bg-studio-primary/14 text-studio-text-primary'
                      : 'border-studio-border-soft bg-studio-surface-soft text-studio-text-secondary hover:border-studio-border-active hover:text-studio-text-primary'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <span className="text-sm text-studio-text-muted">本页 {filteredMessages.length} 条，共 {total} 条</span>
          </div>

          {loading ? (
            <div className="px-6 py-12">
              <LoadingState type="section" text="正在同步消息流..." />
            </div>
          ) : loadError && !hasCurrentResults ? (
            <div className="flex flex-col items-center gap-4 p-6">
              <EmptyState icon={AlertTriangle} title="消息加载失败" description={loadError} />
              <ActionButton type="button" onClick={() => setReloadKey((current) => current + 1)}>重试加载</ActionButton>
            </div>
          ) : (
            <>
              {loadError ? (
                <div role="alert" className="flex flex-col gap-3 border-b border-studio-amber/30 bg-studio-amber/10 px-5 py-4 text-studio-text-primary md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-studio-amber-contrast" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">刷新失败，仍显示上次成功加载的消息</p>
                      <p className="mt-1 break-words text-sm text-studio-text-secondary">{loadError} 当前内容可能不是最新。</p>
                    </div>
                  </div>
                  <ActionButton type="button" onClick={() => setReloadKey((current) => current + 1)}>重新加载</ActionButton>
                </div>
              ) : null}
              {messages.length === 0 ? (
                <div className="p-6">
                  <EmptyState icon={Bell} title="暂无消息" description="协作通知、审核反馈和系统提醒会出现在这里。" />
                </div>
              ) : filteredMessages.length === 0 ? (
                <div className="p-6">
                  <EmptyState icon={Inbox} title="当前筛选无消息" description="切换筛选条件查看其他消息类型。" />
                </div>
              ) : (
                <div className="divide-y divide-studio-border-soft">
                  {filteredMessages.map((message) => {
                    const meta = typeMeta[message.type] || typeMeta.info;
                    const isMarking = markingMessageIds.has(message.id);

                    return (
                      <button
                        key={message.id}
                        type="button"
                        onClick={() => handleMessageClick(message)}
                        disabled={isMarking}
                        aria-busy={isMarking}
                        className={`group w-full px-5 py-4 text-left transition hover:bg-studio-surface-soft ${
                          !message.read ? 'bg-studio-primary/[0.055] shadow-[inset_3px_0_0_rgba(34,211,238,0.65)]' : ''
                        } ${isMarking ? 'cursor-wait' : message.link ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        <div className="flex items-start gap-4">
                          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border bg-studio-surface-soft ${
                            meta.tone === 'success'
                              ? 'border-studio-success/35 text-studio-success-contrast'
                              : meta.tone === 'coral'
                                ? 'border-studio-coral/35 text-studio-coral-contrast'
                                : meta.tone === 'amber'
                                  ? 'border-studio-amber/35 text-studio-amber-contrast'
                                  : 'border-studio-cyan/35 text-studio-cyan-contrast'
                          }`}
                          >
                            {meta.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-studio-text-primary">{message.title}</h3>
                              <StatusPill tone={message.read ? 'muted' : 'cyan'}>{isMarking ? '标记中' : message.read ? '已读' : '未读'}</StatusPill>
                              {message.link ? <ExternalLink className="h-4 w-4 text-studio-text-muted opacity-60 transition group-hover:opacity-100" /> : null}
                            </div>
                            <p className="mt-1 text-sm leading-6 text-studio-text-secondary">{message.content}</p>
                            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-studio-text-muted">
                              <span>{formatBeijingTime(message.created_at)}</span>
                              <span>{meta.label}</span>
                              {message.link ? <span className="text-studio-cyan-contrast">可进入关联页面</span> : null}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {!loading && (!loadError || hasCurrentResults) && total > MESSAGE_PAGE_SIZE ? (
            <div className="flex flex-col gap-3 border-t border-studio-border-soft px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-studio-text-secondary">共 {total} 条，第 {page} / {totalPages} 页</span>
              <div className="flex items-center gap-2">
                <ActionButton
                  type="button"
                  variant="ghost"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft className="h-4 w-4" /> 上一页
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="ghost"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  下一页 <ChevronRight className="h-4 w-4" />
                </ActionButton>
              </div>
            </div>
          ) : null}
        </GlassPanel>
      </PageShell>

      <ConfirmModal
        open={showClearConfirm}
        title="确认清空消息"
        description="确定要清空所有消息吗？该操作执行后将无法恢复。"
        confirmText="确认清空"
        cancelText="取消"
        variant="danger"
        loading={clearing}
        onConfirm={handleClearAll}
        onCancel={() => {
          if (!clearing) {
            setShowClearConfirm(false);
          }
        }}
      />
    </>
  );
}
