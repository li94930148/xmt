import { CalendarDays, FilePlus2, FileText, MessageCircle, PenLine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTopics } from '@/hooks/useTopics';
import { usePermission } from '@/hooks/usePermission';
import { useAuthStore, useMessageStore } from '@/store';

const quickActions = [
  { label: '提报选题', path: '/topics/add', icon: FilePlus2, permission: 'topic:create' },
  { label: '写日报', path: '/daily-report', icon: PenLine, permission: 'report:daily:submit' },
  { label: '查看消息', path: '/messages', icon: MessageCircle },
  { label: '排期日历', path: '/calendar', icon: CalendarDays },
];

export default function MobileHome() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const unread = useMessageStore((state) => state.unreadCount);
  const { hasPermission, loading: permissionsLoading } = usePermission();
  const { data, isLoading } = useTopics({ page: 1, limit: 30 });
  const topics = data?.data ?? [];
  const active = topics.filter((topic) => !['completed', 'rejected'].includes(topic.status));
  const visibleActions = quickActions.filter((action) => !action.permission || (!permissionsLoading && hasPermission(action.permission)));

  return <div className="space-y-5">
    <section className="rounded-2xl border border-studio-border-soft bg-studio-surface p-5 shadow-card">
      <p className="text-sm text-studio-text-muted">你好，{user?.name ?? '同事'}</p>
      <h2 className="mt-1 text-xl font-semibold text-studio-text-primary">今天，先完成最重要的工作</h2>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button onClick={() => navigate('/topics')} className="rounded-xl bg-studio-primary/15 p-4 text-left"><p className="text-2xl font-semibold text-studio-cyan">{active.length}</p><p className="mt-1 text-sm text-studio-text-secondary">进行中选题</p></button>
        <button onClick={() => navigate('/messages')} className="rounded-xl bg-white/[0.04] p-4 text-left"><p className="text-2xl font-semibold text-studio-text-primary">{unread}</p><p className="mt-1 text-sm text-studio-text-secondary">未读消息</p></button>
      </div>
    </section>
    {visibleActions.length ? <section><h2 className="mb-3 text-base font-semibold">快捷操作</h2><div className="grid grid-cols-2 gap-3">{visibleActions.map((action) => { const Icon = action.icon; return <button key={action.path} onClick={() => navigate(action.path)} className="flex min-h-24 flex-col justify-between rounded-2xl border border-studio-border-soft bg-studio-surface p-4 text-left"><Icon className="h-5 w-5 text-studio-cyan" /><span className="text-sm font-medium">{action.label}</span></button>; })}</div></section> : null}
    <section><div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">我的最近选题</h2><button onClick={() => navigate('/topics')} className="text-sm text-studio-cyan">查看全部</button></div>{isLoading ? <p className="text-sm text-studio-text-muted">正在加载…</p> : <div className="space-y-2">{active.slice(0, 3).map((topic) => <button key={topic.id} onClick={() => navigate(`/topics/${topic.id}`)} className="flex w-full items-center gap-3 rounded-xl border border-studio-border-soft bg-studio-surface p-4 text-left"><FileText className="h-5 w-5 shrink-0 text-studio-cyan" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{topic.title}</span><span className="text-xs text-studio-text-muted">{topic.status}</span></button>)}</div>}</section>
  </div>;
}
