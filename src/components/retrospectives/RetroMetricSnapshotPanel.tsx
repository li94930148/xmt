import { Database, RefreshCw } from 'lucide-react';
import type { RetroMetricSnapshot, RetrospectiveStatus } from '../../api/retrospectives';
import { ActionButton, GlassPanel } from '../studio';
import { formatDate, formatDateTime, metricCopy } from './retroLabels';

type Props = {
  snapshots: RetroMetricSnapshot[];
  status: RetrospectiveStatus;
  canGenerate: boolean;
  loading: boolean;
  onGenerate: () => void;
};

const groupOrder = ['内容生产', '团队执行', '风险闭环', '行动项', '其他'];

function sourceText(snapshot: RetroMetricSnapshot) {
  const source = snapshot.sourceRefJson;
  if (!source) return 'XMT 系统内部数据';
  const table = typeof source.table === 'string' ? source.table : 'internal';
  const field = typeof source.field === 'string' ? source.field : '';
  const sectionKey = typeof source.sectionKey === 'string' ? ` / ${source.sectionKey}` : '';
  return [table, field].filter(Boolean).join('.') + sectionKey;
}

function valueText(snapshot: RetroMetricSnapshot) {
  if (snapshot.valueText) return snapshot.valueText;
  if (snapshot.valueNum !== null) return snapshot.valueNum.toLocaleString();
  return '-';
}

export default function RetroMetricSnapshotPanel({ snapshots, status, canGenerate, loading, onGenerate }: Props) {
  const grouped = snapshots.reduce<Record<string, RetroMetricSnapshot[]>>((acc, snapshot) => {
    const group = metricCopy[snapshot.metricKey]?.group || '其他';
    acc[group] = [...(acc[group] || []), snapshot];
    return acc;
  }, {});
  const groups = groupOrder.filter((group) => grouped[group]?.length);
  const hasSnapshots = snapshots.length > 0;

  return (
    <GlassPanel className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-studio-text-primary">指标快照</h2>
          <p className="mt-1 text-sm text-studio-text-muted">
            来自 XMT 系统内部数据，不包含外部平台数据；外部平台数据后续接入。
          </p>
        </div>
        {status === 'draft' && canGenerate ? (
          <ActionButton onClick={onGenerate} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {hasSnapshots ? '刷新快照' : '生成快照'}
          </ActionButton>
        ) : (
          <span className="rounded-full border border-studio-border-soft px-3 py-1 text-xs text-studio-text-muted">
            {status === 'draft' ? '无快照生成权限' : '已锁定快照'}
          </span>
        )}
      </div>

      {!hasSnapshots ? (
        <div className="mt-5 rounded-panel border border-dashed border-studio-border-soft p-8 text-center">
          <Database className="mx-auto h-8 w-8 text-studio-text-muted" />
          <p className="mt-3 text-sm font-semibold text-studio-text-primary">尚未生成指标快照</p>
          <p className="mt-2 text-sm text-studio-text-muted">在草稿状态下生成快照后，复盘周期内的内部指标会固定下来。</p>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {groups.map((group) => (
            <section key={group}>
              <h3 className="mb-3 text-sm font-semibold text-studio-text-secondary">{group}</h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {grouped[group].map((snapshot) => {
                  const copy = metricCopy[snapshot.metricKey];
                  const source = snapshot.sourceRefJson;
                  const periodStart = typeof source?.periodStart === 'string' ? source.periodStart : null;
                  const periodEnd = typeof source?.periodEnd === 'string' ? source.periodEnd : null;
                  return (
                    <article key={snapshot.id} className="rounded-panel border border-studio-border-soft bg-white/[0.04] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-studio-text-primary">{copy?.label || snapshot.metricName}</p>
                          <p className="mt-1 text-xs text-studio-text-muted">{copy?.description || snapshot.metricName}</p>
                        </div>
                        <span className="text-2xl font-bold text-studio-text-primary">{valueText(snapshot)}</span>
                      </div>
                      <dl className="mt-4 space-y-2 text-xs text-studio-text-muted">
                        <div className="flex justify-between gap-3">
                          <dt>数据来源</dt>
                          <dd className="text-right text-studio-text-secondary">{sourceText(snapshot)}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt>查询周期</dt>
                          <dd className="text-right text-studio-text-secondary">
                            {periodStart && periodEnd ? `${formatDate(periodStart)} 至 ${formatDate(periodEnd)}` : '-'}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt>快照时间</dt>
                          <dd className="text-right text-studio-text-secondary">{formatDateTime(snapshot.capturedAt)}</dd>
                        </div>
                      </dl>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}
