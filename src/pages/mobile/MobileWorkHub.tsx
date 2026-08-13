import { CalendarDays, Clapperboard, FilePenLine, Lightbulb, ListTodo, PenLine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePermission } from '@/hooks/usePermission';

const actions = [
  { label: '我的创作', description: '撰写、协作与提交稿件', icon: FilePenLine, path: '/production/content', permission: 'workflow:production' },
  { label: '写日报', description: '记录今天的工作进展', icon: PenLine, path: '/daily-report', permission: 'report:daily:submit' },
  { label: '日历', description: '查看排期与重要节点', icon: CalendarDays, path: '/calendar' },
  { label: '看板', description: '跟进流程与待办状态', icon: ListTodo, path: '/kanban' },
  { label: '灵感', description: '快速记录新的内容想法', icon: Lightbulb, path: '/inspirations' },
  { label: '拍摄', description: '查看拍摄执行任务', icon: Clapperboard, path: '/shooting', permission: 'workflow:shooting' },
];

export default function MobileWorkHub() {
  const navigate = useNavigate();
  const { hasPermission, loading } = usePermission();
  const visibleActions = actions.filter((action) => !action.permission || (!loading && hasPermission(action.permission)));
  const canCreateProduction = !loading && hasPermission('workflow:production');
  return <div className="space-y-5">
    <section className="rounded-2xl border border-studio-border-soft bg-studio-surface p-5">
      <p className="text-sm text-studio-text-muted">移动工作中心</p>
      <h2 className="mt-1 text-xl font-semibold">从一件正在推进的工作开始</h2>
      {canCreateProduction ? <button type="button" onClick={() => navigate('/production/content')} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-studio-primary text-sm font-semibold text-white"><FilePenLine className="h-4 w-4" />进入我的创作</button> : null}
    </section>
    <section>
      <h2 className="mb-3 text-base font-semibold">常用工作</h2>
      <div className="grid grid-cols-2 gap-3">{visibleActions.map((action) => { const Icon = action.icon; return <button key={action.path} type="button" onClick={() => navigate(action.path)} className="flex min-h-28 flex-col justify-between rounded-2xl border border-studio-border-soft bg-studio-surface p-4 text-left"><Icon className="h-5 w-5 text-studio-cyan" /><span><strong className="block text-sm">{action.label}</strong><small className="mt-1 block text-xs text-studio-text-muted">{action.description}</small></span></button>; })}</div>
    </section>
  </div>;
}
