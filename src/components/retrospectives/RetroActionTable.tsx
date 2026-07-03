import { Eye, Plus, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import type {
  CreateRetroActionPayload,
  RetroAction,
  RetroActionStatus,
  RetrospectiveStatus,
  UpdateRetroActionPayload,
} from '../../api/retrospectives';
import type { User } from '../../types';
import { ActionButton, GlassPanel } from '../studio';
import RetroStatusPill from './RetroStatusPill';
import { formatDate, formatDateTime, retroActionStatusLabels } from './retroLabels';

type Props = {
  actions: RetroAction[];
  users: User[];
  status: RetrospectiveStatus;
  currentUserId?: number;
  canManageActions: boolean;
  loading: boolean;
  onCreate: (payload: CreateRetroActionPayload) => void;
  onUpdate: (actionId: number, payload: UpdateRetroActionPayload) => void;
  onOpenDetail?: (action: RetroAction) => void;
};

const statuses: RetroActionStatus[] = ['todo', 'doing', 'done', 'cancelled'];

function today() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

function isOverdue(action: RetroAction) {
  return Boolean(action.dueDate && action.dueDate < today() && action.status !== 'done' && action.status !== 'cancelled');
}

export default function RetroActionTable({
  actions,
  users,
  status,
  currentUserId,
  canManageActions,
  loading,
  onCreate,
  onUpdate,
  onOpenDetail,
}: Props) {
  const [title, setTitle] = useState('');
  const [descriptionMd, setDescriptionMd] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [drafts, setDrafts] = useState<Record<number, { status: RetroActionStatus; resultMd: string }>>({});
  const canCreate = status !== 'archived' && canManageActions;

  const actionDrafts = useMemo(() => {
    const next = { ...drafts };
    for (const action of actions) {
      next[action.id] = next[action.id] || { status: action.status, resultMd: action.resultMd || '' };
    }
    return next;
  }, [actions, drafts]);

  const handleCreate = () => {
    if (!title.trim()) return;
    onCreate({
      title: title.trim(),
      descriptionMd: descriptionMd.trim(),
      ownerId: ownerId ? Number(ownerId) : undefined,
      dueDate: dueDate || undefined,
    });
    setTitle('');
    setDescriptionMd('');
    setOwnerId('');
    setDueDate('');
  };

  return (
    <GlassPanel className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-studio-text-primary">行动项</h2>
          <p className="mt-1 text-sm text-studio-text-muted">把复盘结论落到下一步动作，负责人可更新自己的状态和结果。</p>
        </div>
        {status === 'archived' ? (
          <span className="rounded-full border border-studio-border-soft px-3 py-1 text-xs text-studio-text-muted">已归档，不可新增</span>
        ) : null}
      </div>

      {canCreate ? (
        <div className="mt-5 grid gap-3 rounded-panel border border-studio-border-soft bg-white/[0.04] p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_180px_160px_auto]">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary outline-none"
            placeholder="行动项标题"
          />
          <input
            value={descriptionMd}
            onChange={(event) => setDescriptionMd(event.target.value)}
            className="rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary outline-none"
            placeholder="说明，可选"
          />
          <select
            value={ownerId}
            onChange={(event) => setOwnerId(event.target.value)}
            className="rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary outline-none"
          >
            <option value="">默认负责人</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name || user.username}</option>)}
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary outline-none"
          />
          <ActionButton variant="primary" onClick={handleCreate} disabled={loading || !title.trim()}>
            <Plus className="h-4 w-4" />
            新增
          </ActionButton>
        </div>
      ) : null}

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-[1080px] w-full text-left text-sm">
          <thead className="border-b border-studio-border-soft text-xs text-studio-text-muted">
            <tr>
              <th className="px-3 py-3">标题</th>
              <th className="px-3 py-3">负责人</th>
              <th className="px-3 py-3">截止日期</th>
              <th className="px-3 py-3">状态</th>
              <th className="px-3 py-3">结果</th>
              <th className="px-3 py-3">关闭时间</th>
              <th className="px-3 py-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-studio-border-soft">
            {actions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-studio-text-muted">暂无行动项</td>
              </tr>
            ) : actions.map((action) => {
              const draft = actionDrafts[action.id] || { status: action.status, resultMd: action.resultMd || '' };
              const canUpdate = canManageActions || action.ownerId === currentUserId;
              return (
                <tr key={action.id} className="align-top">
                  <td className="max-w-[260px] px-3 py-4">
                    <p className="font-semibold text-studio-text-primary">{action.title}</p>
                    {action.descriptionMd ? <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-studio-text-muted">{action.descriptionMd}</p> : null}
                  </td>
                  <td className="px-3 py-4 text-studio-text-secondary">{action.ownerName || '-'}</td>
                  <td className="px-3 py-4">
                    <div className="text-studio-text-secondary">{formatDate(action.dueDate)}</div>
                    {isOverdue(action) ? <span className="mt-1 inline-flex rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-300">已逾期</span> : null}
                  </td>
                  <td className="px-3 py-4">
                    {canUpdate ? (
                      <select
                        value={draft.status}
                        onChange={(event) => setDrafts((current) => ({
                          ...current,
                          [action.id]: { ...draft, status: event.target.value as RetroActionStatus },
                        }))}
                        className="rounded-button border border-studio-border-soft bg-studio-surface px-2 py-1.5 text-sm text-studio-text-primary outline-none"
                      >
                        {statuses.map((item) => <option key={item} value={item}>{retroActionStatusLabels[item]}</option>)}
                      </select>
                    ) : (
                      <RetroStatusPill kind="action" status={action.status} />
                    )}
                  </td>
                  <td className="px-3 py-4">
                    {canUpdate ? (
                      <textarea
                        value={draft.resultMd}
                        onChange={(event) => setDrafts((current) => ({
                          ...current,
                          [action.id]: { ...draft, resultMd: event.target.value },
                        }))}
                        className="min-h-20 w-full min-w-[220px] rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary outline-none"
                        placeholder="处理结果"
                      />
                    ) : (
                      <p className="max-w-[240px] whitespace-pre-wrap text-studio-text-secondary">{action.resultMd || '-'}</p>
                    )}
                  </td>
                  <td className="px-3 py-4 text-studio-text-secondary">{formatDateTime(action.closedAt)}</td>
                  <td className="px-3 py-4">
                    <div className="flex flex-wrap gap-2">
                      {onOpenDetail ? (
                        <ActionButton variant="ghost" onClick={() => onOpenDetail(action)}>
                          <Eye className="h-4 w-4" />
                          详情
                        </ActionButton>
                      ) : null}
                      {canUpdate ? (
                        <ActionButton
                          variant="ghost"
                          disabled={loading}
                          onClick={() => onUpdate(action.id, { status: draft.status, resultMd: draft.resultMd })}
                        >
                          <Save className="h-4 w-4" />
                          保存
                        </ActionButton>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </GlassPanel>
  );
}
