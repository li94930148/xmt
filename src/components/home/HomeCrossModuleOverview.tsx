import { ActionButton } from '@/components/studio';
import { buildHomeCrossModuleMetrics, type HomeCrossModuleOptions, type HomeCrossModuleSummary } from '@/lib/homeCrossModuleOverview';

type HomeCrossModuleOverviewProps = HomeCrossModuleOptions & {
  summary: HomeCrossModuleSummary | null;
  onNavigate: (path: string) => void;
  compact?: boolean;
};

export default function HomeCrossModuleOverview({
  summary,
  isManagementRole,
  hasTopicAudit,
  hasPublishingAccess,
  actionableMessageCount,
  onNavigate,
  compact = false,
}: HomeCrossModuleOverviewProps) {
  const metrics = buildHomeCrossModuleMetrics(summary, {
    isManagementRole,
    hasTopicAudit,
    hasPublishingAccess,
    actionableMessageCount,
  });

  if (!metrics.length || !summary) return null;

  return <section aria-label="跨模块待处理事项" data-testid="home-cross-module-overview" className={compact ? 'mt-3' : 'border-b border-studio-border-soft px-3 pb-3'}>
    <h3 className="mb-2 px-1 text-xs font-semibold text-studio-text-secondary">跨模块待处理</h3>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {metrics.map((metric) => <ActionButton
        key={metric.id}
        type="button"
        variant="ghost"
        aria-label={`${metric.label}：${metric.count} 项，${metric.detail}`}
        onClick={() => onNavigate(metric.path)}
        className="h-auto min-h-[56px] w-full justify-between gap-2 rounded-xl border border-studio-border-soft bg-studio-surface-soft/45 px-3 py-2 text-left hover:bg-studio-surface-elevated/60"
      >
        <span className="min-w-0">
          <span className="block truncate text-xs font-medium text-studio-text-secondary">{metric.label}</span>
          <span className="mt-1 block truncate text-[10px] leading-snug text-studio-text-muted">{metric.detail}</span>
        </span>
        <span className="xmt-data-number shrink-0 text-lg font-semibold text-studio-text-primary">{metric.count}</span>
      </ActionButton>)}
    </div>
    <p className="mt-2 text-[11px] leading-snug text-studio-text-muted">
      {summary.scope === 'personal'
        ? '选题卡点按本人创建或负责范围统计；其他项目按各自权限范围统计。'
        : '各项目按当前账号已有权限与可见范围统计。'}
    </p>
  </section>;
}
