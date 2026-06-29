import { CalendarDays, CheckCircle2, FileClock, PenLine } from 'lucide-react';
import { ActionButton, EmptyState, GlassPanel, PageHeader, PageShell, StatusPill } from '../components/studio';

export default function DailyReportPage() {
  return (
    <PageShell>
      <PageHeader
        title="日报中心"
        description="日报系统规划中。本阶段先预留团队日清、个人提交和管理复盘入口，不接入新的后端逻辑。"
        actions={
          <ActionButton variant="primary" disabled>
            <PenLine className="h-4 w-4" />
            填写日报
          </ActionButton>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: '今日待提交', value: '1', icon: FileClock, tone: 'amber' as const },
          { label: '已提交成员', value: '--', icon: CheckCircle2, tone: 'success' as const },
          { label: '团队摘要', value: '规划中', icon: CalendarDays, tone: 'cyan' as const },
        ].map((item) => (
          <GlassPanel key={item.label} className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-studio-text-muted">{item.label}</p>
                <p className="mt-3 text-3xl font-bold text-studio-text-primary">{item.value}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-studio-border-soft bg-white/[0.05]">
                <item.icon className="h-5 w-5 text-studio-cyan" />
              </div>
            </div>
          </GlassPanel>
        ))}
      </div>

      <GlassPanel className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-studio-text-primary">日报规划</h2>
            <p className="mt-1 text-sm text-studio-text-muted">后续可承载个人进展、阻塞项、明日计划和管理者摘要。</p>
          </div>
          <StatusPill tone="primary">Reserved</StatusPill>
        </div>
        <EmptyState
          icon={FileClock}
          title="日报系统规划中"
          description="当前只完成入口和页面语义预留，未新增数据库表、接口或审批语义。"
        />
      </GlassPanel>
    </PageShell>
  );
}
