import { useEffect, useId, useMemo, useState } from 'react';
import { AlertTriangle, Plus, RefreshCw } from 'lucide-react';
import type { CreateRetroActionPayload, RetroDailyRiskItem, RetrospectiveStatus } from '../../api/retrospectives';
import type { User } from '../../types';
import { ActionButton, GlassPanel } from '../studio';
import { formatDate } from './retroLabels';

type Props = {
  risks: RetroDailyRiskItem[];
  users: User[];
  status: RetrospectiveStatus;
  canManageActions: boolean;
  loading: boolean;
  locked?: boolean;
  resetCreateDraftSignal?: number;
  error: string | null;
  onRefresh: () => void;
  onCreateAction: (payload: CreateRetroActionPayload) => Promise<boolean> | boolean;
};

function excerpt(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 34 ? `${normalized.slice(0, 34)}...` : normalized;
}

const sectionLabels: Record<string, string> = {
  risk: '风险',
  risks: '风险',
  blocker: '阻塞',
  blockers: '阻塞',
};

const riskLabels: Record<string, string> = {
  normal: '无风险',
  warning: '有风险',
  blocked: '阻塞',
  low: '低',
  medium: '中',
  high: '高',
};

export default function RetroDailyRiskPanel({
  risks,
  users,
  status,
  canManageActions,
  loading,
  locked = false,
  resetCreateDraftSignal,
  error,
  onRefresh,
  onCreateAction,
}: Props) {
  const riskSelectId = useId();
  const [selectedId, setSelectedId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (resetCreateDraftSignal === undefined) return;
    setSelectedId('');
    setOwnerId('');
    setDueDate('');
    setTitle('');
  }, [resetCreateDraftSignal]);

  const selected = useMemo(
    () => risks.find((risk) => String(risk.itemId) === selectedId) || null,
    [risks, selectedId],
  );

  const canCreate = canManageActions && status !== 'archived' && !error && !loading && !locked;

  const handleSelect = (id: string) => {
    setSelectedId(id);
    const risk = risks.find((item) => String(item.itemId) === id);
    if (risk) {
      setTitle(`跟进日报风险：${excerpt(risk.contentMd)}`);
      setOwnerId(String(risk.userId || ''));
    }
  };

  const handleCreate = async () => {
    if (!selected || !title.trim()) return;
    const sourceDescription = [
      `来源日报：${selected.reportDate}`,
      `成员：${selected.userName || selected.userId}`,
      `分段：${sectionLabels[selected.sectionKey] || '风险'}`,
      `风险等级：${riskLabels[selected.riskLevel] || '未知风险'}`,
      '',
      '风险内容：',
      selected.contentMd,
    ].join('\n');

    const created = await onCreateAction({
      title: title.trim(),
      descriptionMd: sourceDescription,
      ownerId: ownerId ? Number(ownerId) : selected.userId,
      dueDate: dueDate || undefined,
    });
    if (!created) return;
    setSelectedId('');
    setOwnerId('');
    setDueDate('');
    setTitle('');
  };

  return (
    <GlassPanel data-testid="retro-daily-risk-panel" className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-full border border-studio-amber/30 bg-studio-amber/10 p-2 text-studio-amber">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-studio-text-primary">日报风险联动</h2>
            <p className="mt-1 text-sm text-studio-text-secondary">
              读取当前复盘周期内的日报风险分段，可确认后转为复盘行动项。
            </p>
          </div>
        </div>
        <ActionButton variant="ghost" onClick={onRefresh} disabled={loading || locked} aria-busy={loading}>
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} />
          刷新日报风险
        </ActionButton>
      </div>

      {error ? (
        <div role="alert" className="mt-4 flex flex-col gap-3 rounded-panel border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-primary sm:flex-row sm:items-center sm:justify-between">
          <p>{risks.length > 0 ? `日报风险刷新失败，仍显示最近一次成功读取的内容：${error}` : `日报风险暂不可用：${error}`}</p>
          <ActionButton variant="ghost" onClick={onRefresh} disabled={loading}>重新加载日报风险</ActionButton>
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {loading ? (
          <div role="status" aria-live="polite" aria-atomic="true" className="rounded-panel border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-secondary">
            正在加载日报风险...
          </div>
        ) : error && risks.length === 0 ? null : risks.length === 0 ? (
          <div className="rounded-panel border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-secondary">
            当前复盘周期内没有可联动的日报风险分段。
          </div>
        ) : (
          <label htmlFor={riskSelectId} className="grid min-w-0 gap-1">
            <span className="text-xs text-studio-text-secondary">选择日报风险</span>
            <select
              id={riskSelectId}
              aria-label="选择日报风险"
              value={selectedId}
              onChange={(event) => handleSelect(event.target.value)}
              disabled={!canCreate}
              className="xmt-field min-h-10 text-sm disabled:opacity-70"
            >
              <option value="">选择一条风险</option>
              {risks.map((risk) => (
                <option key={risk.itemId} value={risk.itemId}>
                  {formatDate(risk.reportDate)} · {risk.userName || risk.userId} · {excerpt(risk.contentMd)}
                </option>
              ))}
            </select>
          </label>
        )}

        {selected ? (
          <div className="rounded-panel border border-studio-border-soft bg-studio-surface-soft p-4">
            <p className="text-xs text-studio-text-secondary">
              {formatDate(selected.reportDate)} · {selected.userName || selected.userId} · {riskLabels[selected.riskLevel] || '未知风险'}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-studio-text-secondary">{selected.contentMd}</p>

            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.4fr)_180px_160px_auto]">
              <label className="grid min-w-0 gap-1">
                <span className="text-xs text-studio-text-secondary">行动项标题</span>
                <input
                  aria-label="行动项标题"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={!canCreate}
                  className="xmt-field min-h-10 text-sm disabled:opacity-70"
                  placeholder="行动项标题"
                />
              </label>
              <label className="grid min-w-0 gap-1">
                <span className="text-xs text-studio-text-secondary">负责人</span>
                <select
                  aria-label="负责人"
                  value={ownerId}
                  onChange={(event) => setOwnerId(event.target.value)}
                  disabled={!canCreate}
                  className="xmt-field min-h-10 text-sm disabled:opacity-70"
                >
                  <option value="">负责人</option>
                  {users.map((user) => <option key={user.id} value={user.id}>{user.name || user.username}</option>)}
                </select>
              </label>
              <label className="grid min-w-0 gap-1">
                <span className="text-xs text-studio-text-secondary">截止日期</span>
                <input
                  type="date"
                  aria-label="截止日期"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  disabled={!canCreate}
                  className="xmt-field min-h-10 text-sm disabled:opacity-70"
                />
              </label>
              <ActionButton variant="primary" onClick={() => void handleCreate()} disabled={!canCreate || !title.trim()}>
                <Plus className="h-4 w-4" />
                生成行动项
              </ActionButton>
            </div>
          </div>
        ) : null}

        {!canCreate && status === 'archived' ? (
          <p className="text-xs text-studio-text-secondary">复盘已归档，不能从日报风险新增行动项。</p>
        ) : null}
      </div>
    </GlassPanel>
  );
}
