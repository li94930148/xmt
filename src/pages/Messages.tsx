import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Bell, CheckCircle, CheckCircle2, ExternalLink, Info, Trash2, XCircle } from 'lucide-react';
import { getMessages, markMessageAsRead, clearMessages } from '../api';
import EmptyState from '../components/EmptyState';
import { ConfirmModal, LoadingState, PageHeader } from '../components/common';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { formatBeijingTime } from '../lib/utils';
import { useAppStore, useMessageStore } from '../store';
import { Message } from '../types';

export default function Messages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  const navigate = useNavigate();
  const addNotification = useAppStore((state) => state.addNotification);
  const setStoreMessages = useMessageStore((state) => state.setMessages);
  const setUnreadCount = useMessageStore((state) => state.setUnreadCount);
  const markStoreMessageAsRead = useMessageStore((state) => state.markAsRead);
  const styles = useThemeStyles();

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

  const typeIcons: Record<string, React.ReactNode> = {
    success: <CheckCircle className="w-5 h-5" />,
    error: <XCircle className="w-5 h-5" />,
    warning: <AlertTriangle className="w-5 h-5" />,
    info: <Info className="w-5 h-5" />,
  };

  const typeColors: Record<string, string> = {
    success: 'bg-green-500/20 text-green-400 border-green-500/30',
    error: 'bg-red-500/20 text-red-400 border-red-500/30',
    warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };

  const unreadCount = messages.filter((message) => !message.read).length;

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title="消息中心"
          description="查看系统通知和消息"
          actions={
            <div className="flex items-center gap-3">
              <button
                onClick={handleMarkAllAsRead}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 transition-colors ${styles.buttonSecondary}`}
                disabled={unreadCount === 0}
              >
                <CheckCircle2 className="w-5 h-5" />
                全部标为已读
              </button>
              <button
                onClick={() => setShowClearConfirm(true)}
                className="flex items-center gap-2 rounded-lg bg-red-600/80 px-4 py-2 text-white transition-colors hover:bg-red-600"
              >
                <Trash2 className="w-5 h-5" />
                清空消息
              </button>
            </div>
          }
        />

        <div className={`${styles.bgSecondary} overflow-hidden rounded-xl border ${styles.border}`}>
          {loading ? (
            <div className="px-6 py-12">
              <LoadingState type="section" text="加载消息中..." />
            </div>
          ) : messages.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="暂无消息"
              description="系统将在这里显示通知消息"
            />
          ) : (
            <div className={`divide-y ${styles.tableRow}`}>
              <div className={`flex items-center justify-between px-6 py-3 ${styles.bgTertiary}`}>
                <span className={`text-sm ${styles.textSecondary}`}>共 {messages.length} 条消息</span>
                {unreadCount > 0 ? (
                  <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400">
                    {unreadCount} 条未读
                  </span>
                ) : null}
              </div>

              {messages.map((message) => (
                <div
                  key={message.id}
                  onClick={() => handleMessageClick(message)}
                  className={`px-6 py-4 transition-colors ${
                    message.link ? 'cursor-pointer' : ''
                  } ${styles.tableHover} ${!message.read ? 'bg-blue-500/5' : ''}`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${typeColors[message.type]}`}>
                      {typeIcons[message.type]}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between">
                        <h3 className={`font-medium ${styles.textPrimary}`}>{message.title}</h3>
                        <div className="ml-2 flex shrink-0 items-center gap-2">
                          {!message.read ? <span className="h-2 w-2 rounded-full bg-blue-500"></span> : null}
                          {message.link ? <ExternalLink className={`h-3.5 w-3.5 ${styles.textMuted}`} /> : null}
                        </div>
                      </div>
                      <p className={`mt-1 ${styles.textSecondary}`}>{message.content}</p>
                      <div className="mt-3 flex items-center gap-4">
                        <span className={`text-sm ${styles.textSecondary}`}>{formatBeijingTime(message.created_at)}</span>
                        {!message.read ? <span className="text-sm text-blue-400">未读</span> : null}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
