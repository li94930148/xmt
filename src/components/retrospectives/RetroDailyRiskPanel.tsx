import { useMemo, useState } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
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
  onCreateAction: (payload: CreateRetroActionPayload) => void;
};

function excerpt(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 34 ? `${normalized.slice(0, 34)}...` : normalized;
}

export default function RetroDailyRiskPanel({
  risks,
  users,
  status,
  canManageActions,
  loading,
  onCreateAction,
}: Props) {
  const [selectedId, setSelectedId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [title, setTitle] = useState('');

  const selected = useMemo(
    () => risks.find((risk) => String(risk.itemId) === selectedId) || null,
    [risks, selectedId],
  );

  const canCreate = canManageActions && status !== 'archived';

  const handleSelect = (id: string) => {
    setSelectedId(id);
    const risk = risks.find((item) => String(item.itemId) === id);
    if (risk) {
      setTitle(`跟进日报风险：${excerpt(risk.contentMd)}`);
      setOwnerId(String(risk.userId || ''));
    }
  };

  const handleCreate = () => {
    if (!selected || !title.trim()) return;
    const sourceDescription = [
      `来源日报：${selected.reportDate}`,
      `成员：${selected.userName || selected.userId}`,
      `分段：${selected.sectionKey}`,
      `风险等级：${selected.riskLevel}`,
      '',
      '风险内容：',
      selected.contentMd,
    ].join('\n');

    onCreateAction({
      title: title.trim(),
      descriptionMd: sourceDescription,
      ownerId: ownerId ? Number(ownerId) : selected.userId,
      dueDate: dueDate || undefined,
    });
  };

  return (
    <GlassPanel className="p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-full border border-amber-400/30 bg-amber-400/10 p-2 text-amber-300">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-studio-text-primary">日报风险联动</h2>
          <p className="mt-1 text-sm text-studio-text-muted">
            读取当前复盘周期内的日报风险分段，可确认后转为复盘行动项。
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {loading ? (
          <div className="rounded-panel border border-studio-border-soft bg-white/[0.04] p-4 text-sm text-studio-text-muted">
            正在加载日报风险...
          </div>
        ) : risks.length === 0 ? (
          <div className="rounded-panel border border-studio-border-soft bg-white/[0.04] p-4 text-sm text-studio-text-muted">
            当前复盘周期内没有可联动的日报风险分段。
          </div>
        ) : (
          <select
            value={selectedId}
            onChange={(event) => handleSelect(event.target.value)}
            disabled={!canCreate}
            className="w-full rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary outline-none disabled:opacity-70"
          >
            <option value="">选择一条风险</option>
            {risks.map((risk) => (
              <option key={risk.itemId} value={risk.itemId}>
                {formatDate(risk.reportDate)} · {risk.userName || risk.userId} · {excerpt(risk.contentMd)}
              </option>
            ))}
          </select>
        )}

        {selected ? (
          <div className="rounded-panel border border-studio-border-soft bg-white/[0.04] p-4">
            <p className="text-xs text-studio-text-muted">
              {formatDate(selected.reportDate)} · {selected.userName || selected.userId} · {selected.riskLevel}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-studio-text-secondary">{selected.contentMd}</p>

            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.4fr)_180px_160px_auto]">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={!canCreate}
                className="rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary outline-none disabled:opacity-70"
                placeholder="行动项标题"
              />
              <select
                value={ownerId}
                onChange={(event) => setOwnerId(event.target.value)}
                disabled={!canCreate}
                className="rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary outline-none disabled:opacity-70"
              >
                <option value="">负责人</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.name || user.username}</option>)}
              </select>
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                disabled={!canCreate}
                className="rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary outline-none disabled:opacity-70"
              />
              <ActionButton variant="primary" onClick={handleCreate} disabled={!canCreate || loading || !title.trim()}>
                <Plus className="h-4 w-4" />
                生成行动项
              </ActionButton>
            </div>
          </div>
        ) : null}

        {!canCreate && status === 'archived' ? (
          <p className="text-xs text-studio-text-muted">复盘已归档，不能从日报风险新增行动项。</p>
        ) : null}
      </div>
    </GlassPanel>
  );
}
