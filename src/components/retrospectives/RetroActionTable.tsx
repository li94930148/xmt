import { Eye, Plus, Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CreateRetroActionPayload,
  RetroAction,
  RetroActionStatus,
  RetroActionUpdateRecoveryState,
  RetrospectiveStatus,
  UpdateRetroActionPayload,
} from '../../api/retrospectives';
import type { User } from '../../types';
import { ActionButton, GlassPanel } from '../studio';
import RetroActionUpdateRecoveryNotice from './RetroActionUpdateRecoveryNotice';
import RetroStatusPill from './RetroStatusPill';
import { formatDate, formatDateTime, retroActionStatusLabels } from './retroLabels';

type Props = {
  actions: RetroAction[];
  users: User[];
  status: RetrospectiveStatus;
  currentUserId?: number;
  canManageActions: boolean;
  loading: boolean;
  onCreate: (payload: CreateRetroActionPayload) => Promise<boolean> | boolean;
  onUpdate: (actionId: number, payload: UpdateRetroActionPayload, source?: 'table' | 'drawer') => Promise<boolean> | boolean;
  resetCreateDraftSignal?: number;
  onOpenDetail?: (action: RetroAction) => void;
  actionUpdateRecoveryStates?: Record<number, RetroActionUpdateRecoveryState>;
  actionUpdateConflictDrafts?: Record<number, UpdateRetroActionPayload | undefined>;
  onVerifyActionUpdate?: (actionId: number) => void;
  onRetryActionUpdate?: (actionId: number) => void;
  onRefreshActionUpdate?: (actionId: number) => void;
  resetActionDraftSignal?: { actionId: number; sequence: number } | null;
  restoreActionDraftSignal?: { actionId: number; sequence: number; payload: UpdateRetroActionPayload } | null;
};

const statuses: RetroActionStatus[] = ['todo', 'doing', 'done', 'cancelled'];

type ActionDraft = {
  status: RetroActionStatus;
  resultMd: string;
  baselineStatus: RetroActionStatus;
  baselineResultMd: string;
};

function toActionDraft(action: RetroAction): ActionDraft {
  return { status: action.status, resultMd: action.resultMd || '', baselineStatus: action.status, baselineResultMd: action.resultMd || '' };
}

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
  resetCreateDraftSignal,
  onOpenDetail,
  actionUpdateRecoveryStates = {},
  actionUpdateConflictDrafts = {},
  onVerifyActionUpdate,
  onRetryActionUpdate,
  onRefreshActionUpdate,
  resetActionDraftSignal,
  restoreActionDraftSignal,
}: Props) {
  const [title, setTitle] = useState('');
  const [descriptionMd, setDescriptionMd] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [drafts, setDrafts] = useState<Record<number, ActionDraft>>({});
  const appliedRestoreSignalsRef = useRef(new Map<number, number>());
  const canCreate = status !== 'archived' && canManageActions;

  useEffect(() => {
    if (!resetCreateDraftSignal) return;
    setTitle('');
    setDescriptionMd('');
    setOwnerId('');
    setDueDate('');
  }, [resetCreateDraftSignal]);

  useEffect(() => {
    if (!resetActionDraftSignal) return;
    setDrafts((current) => {
      if (!(resetActionDraftSignal.actionId in current)) return current;
      const next = { ...current };
      delete next[resetActionDraftSignal.actionId];
      return next;
    });
  }, [resetActionDraftSignal]);

  useEffect(() => {
    if (!restoreActionDraftSignal || appliedRestoreSignalsRef.current.get(restoreActionDraftSignal.actionId) === restoreActionDraftSignal.sequence) return;
    const action = actions.find((item) => item.id === restoreActionDraftSignal.actionId);
    if (!action) return;
    appliedRestoreSignalsRef.current.set(restoreActionDraftSignal.actionId, restoreActionDraftSignal.sequence);
    setDrafts((current) => ({
      ...current,
      [action.id]: {
        status: restoreActionDraftSignal.payload.status ?? action.status,
        resultMd: restoreActionDraftSignal.payload.resultMd ?? action.resultMd ?? '',
        baselineStatus: action.status,
        baselineResultMd: action.resultMd ?? '',
      },
    }));
  }, [actions, restoreActionDraftSignal]);

  const actionDrafts = useMemo(() => {
    const next: Record<number, ActionDraft> = {};
    for (const action of actions) {
      const draft = drafts[action.id];
      const isDirty = draft && (draft.status !== draft.baselineStatus || draft.resultMd !== draft.baselineResultMd);
      next[action.id] = isDirty ? draft : toActionDraft(action);
    }
    return next;
  }, [actions, drafts]);

  const handleUpdate = async (actionId: number, draft: ActionDraft) => {
    if (loading) return;
    const confirmed = await onUpdate(actionId, { status: draft.status, resultMd: draft.resultMd }, 'table');
    if (!confirmed) return;
    setDrafts((current) => {
      const next = { ...current };
      const latest = current[actionId];
      if (!latest || (latest.status === draft.status && latest.resultMd === draft.resultMd)) {
        delete next[actionId];
      } else {
        next[actionId] = { ...latest, baselineStatus: draft.status, baselineResultMd: draft.resultMd };
      }
      return next;
    });
  };

  const handleCreate = async () => {
    if (!title.trim() || loading) return;
    const created = await onCreate({
      title: title.trim(),
      descriptionMd: descriptionMd.trim(),
      ownerId: ownerId ? Number(ownerId) : undefined,
      dueDate: dueDate || undefined,
    });
    if (!created) return;
    setTitle('');
    setDescriptionMd('');
    setOwnerId('');
    setDueDate('');
  };

  return (
    <GlassPanel data-testid="retro-action-table-panel" className="overflow-visible p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-studio-text-primary">行动项</h2>
          <p className="mt-1 text-sm text-studio-text-secondary">把复盘结论落到下一步动作，负责人可更新自己的状态和结果。</p>
        </div>
        {status === 'archived' ? (
          <span className="rounded-full border border-studio-border-soft px-3 py-1 text-xs text-studio-text-secondary">已归档，不可新增</span>
        ) : null}
      </div>

      {canCreate ? (
        <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-3 rounded-panel border border-studio-border-soft bg-studio-surface-soft p-4">
          <label className="grid min-w-0 gap-1">
            <span className="text-xs text-studio-text-secondary">行动项标题</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={loading}
              className="xmt-field min-h-10 text-sm disabled:opacity-70"
              placeholder="行动项标题"
            />
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="text-xs text-studio-text-secondary">说明（可选）</span>
            <input
              value={descriptionMd}
              onChange={(event) => setDescriptionMd(event.target.value)}
              disabled={loading}
              className="xmt-field min-h-10 text-sm disabled:opacity-70"
              placeholder="说明，可选"
            />
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="text-xs text-studio-text-secondary">负责人</span>
            <select
              value={ownerId}
              aria-label="负责人"
              onChange={(event) => setOwnerId(event.target.value)}
              disabled={loading}
              className="xmt-field min-h-10 text-sm disabled:opacity-70"
            >
              <option value="">默认负责人</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.name || user.username}</option>)}
            </select>
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="text-xs text-studio-text-secondary">截止日期</span>
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              disabled={loading}
              className="xmt-field min-h-10 text-sm disabled:opacity-70"
            />
          </label>
          <ActionButton variant="primary" onClick={() => void handleCreate()} disabled={loading || !title.trim()}>
            <Plus className="h-4 w-4" />
            新增
          </ActionButton>
        </div>
      ) : null}

      <div data-testid="retro-action-table-scroll" className="mt-5 overflow-x-auto">
        <table className="min-w-[1080px] w-full table-fixed text-left text-sm">
          <thead className="border-b border-studio-border-soft text-xs text-studio-text-secondary">
            <tr>
              <th className="px-3 py-3">标题</th>
              <th className="px-3 py-3">负责人</th>
              <th className="px-3 py-3">截止日期</th>
              <th className="px-3 py-3">状态</th>
              <th className="px-3 py-3">结果</th>
              <th className="px-3 py-3">关闭时间</th>
              <th className="sticky right-0 z-20 w-[116px] bg-studio-surface-soft px-3 py-3 sm:w-[188px]">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-studio-border-soft">
            {actions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-studio-text-secondary">暂无行动项</td>
              </tr>
            ) : actions.map((action) => {
              const draft = actionDrafts[action.id] || toActionDraft(action);
              const canUpdate = canManageActions || action.ownerId === currentUserId;
              const updateRecoveryState = actionUpdateRecoveryStates[action.id];
              const updateRecoveryLocked = Boolean(updateRecoveryState && updateRecoveryState !== 'conflict_reedit');
              return (
                <tr key={action.id} className="align-top">
                  <td className="max-w-[260px] px-3 py-4">
                    <p className="font-semibold text-studio-text-primary">{action.title}</p>
                    {action.descriptionMd ? <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-studio-text-secondary">{action.descriptionMd}</p> : null}
                  </td>
                  <td className="px-3 py-4 text-studio-text-secondary">{action.ownerName || '-'}</td>
                  <td className="px-3 py-4">
                    <div className="text-studio-text-secondary">{formatDate(action.dueDate)}</div>
                    {isOverdue(action) ? <span className="mt-1 inline-flex rounded-full bg-studio-coral/10 px-2 py-0.5 text-xs text-studio-coral-contrast">已逾期</span> : null}
                  </td>
                  <td className="px-3 py-4">
                    {canUpdate ? (
                      <select
                        value={draft.status}
                        aria-label={`行动项“${action.title}”的状态`}
                        disabled={loading || updateRecoveryLocked}
                        onChange={(event) => setDrafts((current) => ({
                          ...current,
                          [action.id]: { ...draft, status: event.target.value as RetroActionStatus },
                        }))}
                        className="xmt-field min-h-10 min-w-0 text-sm disabled:opacity-70"
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
                        aria-label={`行动项“${action.title}”的处理结果`}
                        disabled={loading || updateRecoveryLocked}
                        onChange={(event) => setDrafts((current) => ({
                          ...current,
                          [action.id]: { ...draft, resultMd: event.target.value },
                        }))}
                        className="min-h-20 w-full min-w-[220px] rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary"
                        placeholder="处理结果"
                      />
                    ) : (
                      <p className="max-w-[240px] whitespace-pre-wrap text-studio-text-secondary">{action.resultMd || '-'}</p>
                    )}
                  </td>
                  <td className="px-3 py-4 text-studio-text-secondary">{formatDateTime(action.closedAt)}</td>
                  <td data-testid={`retro-action-row-actions-${action.id}`} className="sticky right-0 z-10 w-[116px] bg-studio-surface px-3 py-4 sm:w-[188px]">
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      {onOpenDetail ? (
                        <ActionButton variant="ghost" className="scroll-mb-20" onClick={() => onOpenDetail(action)}>
                          <Eye className="h-4 w-4" />
                          详情
                        </ActionButton>
                      ) : null}
                      {canUpdate ? (
                        <ActionButton
                          variant="ghost"
                          className="scroll-mb-20"
                          disabled={loading || updateRecoveryLocked}
                          onClick={() => void handleUpdate(action.id, draft)}
                        >
                          <Save className="h-4 w-4" />
                          保存
                        </ActionButton>
                      ) : null}
                      {updateRecoveryState ? (
                        <RetroActionUpdateRecoveryNotice
                          state={updateRecoveryState}
                          submittedDraft={actionUpdateConflictDrafts[action.id]}
                          currentAction={action}
                          onVerify={onVerifyActionUpdate ? () => onVerifyActionUpdate(action.id) : undefined}
                          onRetry={onRetryActionUpdate ? () => onRetryActionUpdate(action.id) : undefined}
                          onRefresh={onRefreshActionUpdate ? () => onRefreshActionUpdate(action.id) : undefined}
                        />
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
