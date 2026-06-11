import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, useMessageStore } from '../store';
import { getMessages, markMessageAsRead, clearMessages } from '../api';
import { Message } from '../types';
import { CheckCircle, AlertTriangle, Info, XCircle, Trash2, CheckCircle2, Bell, ExternalLink } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { formatBeijingTime } from '../lib/utils';

export default function Messages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const appStore = useAppStore();
  const messageStore = useMessageStore();
  const styles = useThemeStyles();

  useEffect(() => {
    const fetchMessages = async () => {
      setLoading(true);
      try {
        const result = await getMessages();
        setMessages(result.data);
        messageStore.setMessages(result.data);
        messageStore.setUnreadCount(result.data.filter((m: Message) => !m.read).length);
      } catch (error) {
        appStore.addNotification({ title: '获取消息失败', message: (error as Error).message, type: 'error' });
      } finally {
        setLoading(false);
      }
    };
    fetchMessages();
  }, []);

  // 点击消息：跳转 + 自动标记已读
  const handleMessageClick = async (message: Message) => {
    // 先标记已读
    if (!message.read) {
      try {
        await markMessageAsRead(message.id);
        setMessages(prev => prev.map(m => m.id === message.id ? { ...m, read: true } : m));
        messageStore.markAsRead(message.id);
      } catch (error) {
        // 静默失败，不影响跳转
      }
    }
    // 跳转
    if (message.link) {
      navigate(message.link);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const unreadMessages = messages.filter(m => !m.read);
      for (const msg of unreadMessages) {
        await markMessageAsRead(msg.id);
      }
      setMessages(messages.map(m => ({ ...m, read: true })));
      messageStore.setUnreadCount(0);
      appStore.addNotification({ title: '操作成功', message: '所有消息已标记为已读', type: 'success' });
    } catch (error) {
      appStore.addNotification({ title: '操作失败', message: (error as Error).message, type: 'error' });
    }
  };

  const handleClearAll = async () => {
    if (!confirm('确定要清空所有消息吗？')) return;
    try {
      await clearMessages();
      setMessages([]);
      messageStore.setMessages([]);
      messageStore.setUnreadCount(0);
      appStore.addNotification({ title: '操作成功', message: '消息已清空', type: 'success' });
    } catch (error) {
      appStore.addNotification({ title: '操作失败', message: (error as Error).message, type: 'error' });
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

  const unreadCount = messages.filter(m => !m.read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${styles.textPrimary}`}>消息中心</h1>
          <p className={`${styles.textSecondary} mt-1`}>查看系统通知和消息</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleMarkAllAsRead}
            className={`flex items-center gap-2 px-4 py-2 ${styles.buttonSecondary} rounded-lg transition-colors`}
            disabled={unreadCount === 0}
          >
            <CheckCircle2 className="w-5 h-5" />
            全部标为已读
          </button>
          <button
            onClick={handleClearAll}
            className="flex items-center gap-2 px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-lg transition-colors"
          >
            <Trash2 className="w-5 h-5" />
            清空消息
          </button>
        </div>
      </div>

      <div className={`${styles.bgSecondary} rounded-xl border ${styles.border} overflow-hidden`}>
        {loading ? (
          <div className="px-6 py-12 text-center">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className={`w-20 h-20 ${styles.bgTertiary} rounded-full flex items-center justify-center mx-auto mb-4`}>
              <Bell className={`w-10 h-10 ${styles.textSecondary}`} />
            </div>
            <p className={`${styles.textSecondary} text-lg`}>暂无消息</p>
            <p className={`${styles.textSecondary} text-sm mt-2`}>系统将在这里显示通知消息</p>
          </div>
        ) : (
          <div className={`divide-y ${styles.tableRow}`}>
            <div className={`flex items-center justify-between px-6 py-3 ${styles.bgTertiary}`}>
              <span className={`${styles.textSecondary} text-sm`}>共 {messages.length} 条消息</span>
              {unreadCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                  {unreadCount} 条未读
                </span>
              )}
            </div>
            
            {messages.map((message) => (
              <div 
                key={message.id}
                onClick={() => handleMessageClick(message)}
                className={`px-6 py-4 transition-colors ${
                  message.link ? 'cursor-pointer' : ''
                } ${styles.tableHover} ${
                  !message.read ? 'bg-blue-500/5' : ''
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-lg ${typeColors[message.type]} flex items-center justify-center flex-shrink-0`}>
                    {typeIcons[message.type]}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <h3 className={`${styles.textPrimary} font-medium`}>{message.title}</h3>
                      <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                        {!message.read && (
                          <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                        )}
                        {message.link && (
                          <ExternalLink className={`w-3.5 h-3.5 ${styles.textMuted}`} />
                        )}
                      </div>
                    </div>
                    <p className={`${styles.textSecondary} mt-1`}>{message.content}</p>
                    <div className="flex items-center gap-4 mt-3">
                      <span className={`${styles.textSecondary} text-sm`}>
                        {formatBeijingTime(message.created_at)}
                      </span>
                      {!message.read && (
                        <span className="text-blue-400 text-sm">未读</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
