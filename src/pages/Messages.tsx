import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  CheckCircle2,
  ExternalLink,
  Info,
  Inbox,
  Radio,
  Trash2,
  XCircle,
} from 'lucide-react';
import { getMessages, markMessageAsRead, clearMessages } from '../api';
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
import { useAppStore, useMessageStore } from '../store';
import { Message } from '../types';

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
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<MessageFilter>('all');

  const navigate = useNavigate();
  const addNotification = useAppStore((state) => state.addNotification);
  const setStoreMessages = useMessageStore((state) => state.setMessages);
  const setUnreadCount = useMessageStore((state) => state.setUnreadCount);
  const markStoreMessageAsRead = useMessageStore((state) => state.markAsRead);

  useEffect(() => {
    const fetchMessages = async () => {
      setLoading(true);
      try {
        const result = await getMessages();
        setMessages(result.data);
        setStoreMessages(result.data);
        setUnreadCount(result.data.filter((message: Message) => !message.read).length);
      } catch (error) {
        addNotification({ title: '获取消息失败', message: (error as Error).message, type: 'error' });
      } finally {
        setLoading(false);
      }
    };

    void fetchMessages();
  }, [addNotification, setStoreMessages, setUnreadCount]);

  const unreadCount = messages.filter((message) => !message.read).length;
  const actionableCount = messages.filter((message) => Boolean(message.link) && !message.read).length;

  const filteredMessages = useMemo(() => {
    if (activeFilter === 'unread') {
      return messages.filter((message) => !message.read);
    }
    if (activeFilter === 'actionable') {
      return messages.filter((message) => Boolean(message.link));
    }
    if (activeFilter === 'system') {
      return messages.filter((message) => !message.link);
    }
    return messages;
  }, [activeFilter, messages]);

  const handleMessageClick = async (message: Message) => {
    if (!message.read) {
      try {
        await markMessageAsRead(message.id);
        setMessages((current) => current.map((item) => (item.id === message.id ? { ...item, read: true } : item)));
        markStoreMessageAsRead(message.id);
      } catch {
        // Mark-as-read failure should not block navigation.
      }
    }

    if (message.link) {
      navigate(message.link);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const unreadMessages = messages.filter((message) => !message.read);
      for (const message of unreadMessages) {
        await markMessageAsRead(message.id);
      }
      setMessages((current) => current.map((message) => ({ ...message, read: true })));
      setUnreadCount(0);
      addNotification({ title: '操作成功', message: '所有消息已标记为已读', type: 'success' });
    } catch (error) {
      addNotification({ title: '操作失败', message: (error as Error).message, type: 'error' });
    }
  };

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await clearMessages();
      setMessages([]);
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
              <ActionButton onClick={handleMarkAllAsRead} disabled={unreadCount === 0}>
                <CheckCircle2 className="h-4 w-4" />
                全部已读
              </ActionButton>
              <ActionButton onClick={() => setShowClearConfirm(true)} className="border-studio-coral/35 text-[#FFC2CC] hover:bg-studio-coral/10">
                <Trash2 className="h-4 w-4" />
                清空
              </ActionButton>
            </>
          }
        />

        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard title="未读消息" value={unreadCount} trend={{ label: '需要关注', up: unreadCount === 0 }} icon={Bell} tone="cyan" />
          <MetricCard title="待处理跳转" value={actionableCount} trend={{ label: '关联业务页面', up: actionableCount === 0 }} icon={Radio} tone="violet" />
          <MetricCard title="消息总量" value={messages.length} trend={{ label: '本地通知流', up: true }} icon={Inbox} tone="amber" />
        </div>

        <GlassPanel className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-studio-border-soft px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {filters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setActiveFilter(filter.key)}
                  className={`rounded-button border px-3 py-2 text-sm font-semibold transition ${
                    activeFilter === filter.key
                      ? 'border-studio-border-active bg-studio-primary/14 text-studio-text-primary'
                      : 'border-studio-border-soft bg-white/[0.04] text-studio-text-secondary hover:border-studio-border-active hover:text-studio-text-primary'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <span className="text-sm text-studio-text-muted">当前 {filteredMessages.length} 条</span>
          </div>

          {loading ? (
            <div className="px-6 py-12">
              <LoadingState type="section" text="正在同步消息流..." />
            </div>
          ) : messages.length === 0 ? (
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

                return (
                  <button
                    key={message.id}
                    type="button"
                    onClick={() => handleMessageClick(message)}
                    className={`group w-full px-5 py-4 text-left transition hover:bg-white/[0.045] ${
                      !message.read ? 'bg-studio-primary/[0.055] shadow-[inset_3px_0_0_rgba(34,211,238,0.65)]' : ''
                    } ${message.link ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border bg-white/[0.05] ${
                        meta.tone === 'success'
                          ? 'border-studio-success/35 text-studio-success'
                          : meta.tone === 'coral'
                            ? 'border-studio-coral/35 text-studio-coral'
                            : meta.tone === 'amber'
                              ? 'border-studio-amber/35 text-studio-amber'
                              : 'border-studio-cyan/35 text-studio-cyan'
                      }`}
                      >
                        {meta.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-studio-text-primary">{message.title}</h3>
                          <StatusPill tone={message.read ? 'muted' : 'cyan'}>{message.read ? '已读' : '未读'}</StatusPill>
                          {message.link ? <ExternalLink className="h-4 w-4 text-studio-text-muted opacity-60 transition group-hover:opacity-100" /> : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-studio-text-secondary">{message.content}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-studio-text-muted">
                          <span>{formatBeijingTime(message.created_at)}</span>
                          <span>{meta.label}</span>
                          {message.link ? <span className="text-studio-cyan">可进入关联页面</span> : null}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
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
