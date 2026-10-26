import { useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import type { RetroAction, RetroActionStatus, RetroActionUpdateRecoveryState, UpdateRetroActionPayload } from '../../api/retrospectives';
import type { User } from '../../types';
import { BaseModal } from '../common';
import { ActionButton } from '../studio';
import { formatDateTime, retroActionStatusLabels } from './retroLabels';
import RetroActionUpdateRecoveryNotice from './RetroActionUpdateRecoveryNotice';

type Props = {
  action: RetroAction | null;
  users: User[];
  currentUserId?: number;
  canManageActions: boolean;
  loading: boolean;
  updateRecoveryState?: RetroActionUpdateRecoveryState;
  conflictDraft?: UpdateRetroActionPayload;
  restoreActionDraftSignal?: { actionId: number; sequence: number; payload: UpdateRetroActionPayload } | null;
  onClose: () => void;
  onUpdate: (actionId: number, payload: UpdateRetroActionPayload, source?: 'table' | 'drawer') => void;
  onVerifyActionUpdate?: (actionId: number) => void;
  onRetryActionUpdate?: (actionId: number) => void;
  onRefreshActionUpdate?: (actionId: number) => void;
};

const statuses: RetroActionStatus[] = ['todo', 'doing', 'done', 'cancelled'];

export default function RetroActionDetailDrawer({
  action,
  users,
  currentUserId,
  canManageActions,
  loading,
  updateRecoveryState,
  conflictDraft,
  restoreActionDraftSignal,
  onClose,
  onUpdate,
  onVerifyActionUpdate,
  onRetryActionUpdate,
  onRefreshActionUpdate,
}: Props) {
  const [title, setTitle] = useState('');
  const [descriptionMd, setDescriptionMd] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<RetroActionStatus>('todo');
  const [resultMd, setResultMd] = useState('');
  const appliedRestoreSignalsRef = useRef(new Map<number, number>());
  const appliedConflictDraftsRef = useRef(new Map<number, UpdateRetroActionPayload>());

  useEffect(() => {
    if (!action) return;
    const restoreSignal = restoreActionDraftSignal?.actionId === action.id ? restoreActionDraftSignal : null;
    const signalAlreadyApplied = restoreSignal
      && appliedRestoreSignalsRef.current.get(action.id) === restoreSignal.sequence;
    if (restoreSignal && !signalAlreadyApplied) {
      appliedRestoreSignalsRef.current.set(action.id, restoreSignal.sequence);
      const payload = restoreSignal.payload;
      setTitle(payload.title ?? action.title);
      setDescriptionMd(payload.descriptionMd ?? action.descriptionMd ?? '');
      setOwnerId(payload.ownerId !== undefined ? (payload.ownerId ? String(payload.ownerId) : '') : (action.ownerId ? String(action.ownerId) : ''));
      setDueDate(payload.dueDate !== undefined ? payload.dueDate || '' : action.dueDate || '');
      setStatus(payload.status ?? action.status);
      setResultMd(payload.resultMd ?? action.resultMd ?? '');
      return;
    }
    if (restoreSignal && signalAlreadyApplied && updateRecoveryState === 'conflict_reedit') {
      return;
    }
    if (updateRecoveryState === 'conflict_reedit' && conflictDraft) {
      if (appliedConflictDraftsRef.current.get(action.id) === conflictDraft) return;
      appliedConflictDraftsRef.current.set(action.id, conflictDraft);
      setTitle(conflictDraft.title ?? action.title);
      setDescriptionMd(conflictDraft.descriptionMd ?? action.descriptionMd ?? '');
      setOwnerId(conflictDraft.ownerId !== undefined ? (conflictDraft.ownerId ? String(conflictDraft.ownerId) : '') : (action.ownerId ? String(action.ownerId) : ''));
      setDueDate(conflictDraft.dueDate !== undefined ? conflictDraft.dueDate || '' : action.dueDate || '');
      setStatus(conflictDraft.status ?? action.status);
      setResultMd(conflictDraft.resultMd ?? action.resultMd ?? '');
      return;
    }
    setTitle(action.title);
    setDescriptionMd(action.descriptionMd || '');
    setOwnerId(action.ownerId ? String(action.ownerId) : '');
    setDueDate(action.dueDate || '');
    setStatus(action.status);
    setResultMd(action.resultMd || '');
  }, [action, conflictDraft, restoreActionDraftSignal, updateRecoveryState]);

  if (!action) return null;

  const canUpdateResult = canManageActions || action.ownerId === currentUserId;
  const canSave = canManageActions || canUpdateResult;
  const fieldsLocked = loading || Boolean(updateRecoveryState && updateRecoveryState !== 'conflict_reedit');

  const handleSave = () => {
    const payload: UpdateRetroActionPayload = {
      status,
      resultMd,
    };
    if (canManageActions) {
      payload.title = title.trim();
      payload.descriptionMd = descriptionMd;
      payload.ownerId = ownerId ? Number(ownerId) : null;
      payload.dueDate = dueDate || null;
    }
    onUpdate(action.id, payload, 'drawer');
  };

  return (
    <BaseModal
      open={Boolean(action)}
          onClose={() => { if (!loading) onClose(); }}
      size="xl"
      title="行动项详情"
      description={action.retroTitle || `复盘 #${action.retroId}`}
      footer={
        <div className="flex justify-end gap-3">
          <ActionButton variant="ghost" onClick={onClose} disabled={loading}>关闭</ActionButton>
          {canSave ? (
            <ActionButton variant="primary" onClick={handleSave} disabled={fieldsLocked || !title.trim()}>
              <Save className="h-4 w-4" />
              保存
            </ActionButton>
          ) : null}
        </div>
      }
    >
      {updateRecoveryState ? (
        <div className="mb-4">
          <RetroActionUpdateRecoveryNotice
            state={updateRecoveryState}
            submittedDraft={conflictDraft}
            currentAction={action}
            onVerify={onVerifyActionUpdate ? () => onVerifyActionUpdate(action.id) : undefined}
            onRetry={onRetryActionUpdate ? () => onRetryActionUpdate(action.id) : undefined}
            onRefresh={onRefreshActionUpdate ? () => onRefreshActionUpdate(action.id) : undefined}
          />
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 md:col-span-2">
          <span className="text-xs text-studio-text-secondary">标题</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={!canManageActions || fieldsLocked}
            className="xmt-field min-h-10 text-sm disabled:opacity-70"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs text-studio-text-secondary">负责人</span>
          <select
            value={ownerId}
            onChange={(event) => setOwnerId(event.target.value)}
            disabled={!canManageActions || fieldsLocked}
            className="xmt-field min-h-10 text-sm disabled:opacity-70"
          >
            <option value="">未指定</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name || user.username}</option>)}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs text-studio-text-secondary">截止日期</span>
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            disabled={!canManageActions || fieldsLocked}
            className="xmt-field min-h-10 text-sm disabled:opacity-70"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs text-studio-text-secondary">状态</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as RetroActionStatus)}
            disabled={!canUpdateResult || fieldsLocked}
            className="xmt-field min-h-10 text-sm disabled:opacity-70"
          >
            {statuses.map((item) => <option key={item} value={item}>{retroActionStatusLabels[item]}</option>)}
          </select>
        </label>

        <div className="rounded-panel border border-studio-border-soft bg-studio-surface-soft p-3 text-xs leading-6 text-studio-text-secondary">
          <p>创建人：{action.creatorName || '-'}</p>
          <p>创建时间：{formatDateTime(action.createdAt)}</p>
          <p>更新时间：{formatDateTime(action.updatedAt)}</p>
          <p>关闭时间：{formatDateTime(action.closedAt)}</p>
        </div>

        <label className="space-y-1 md:col-span-2">
          <span className="text-xs text-studio-text-secondary">说明</span>
          <textarea
            value={descriptionMd}
            onChange={(event) => setDescriptionMd(event.target.value)}
            disabled={!canManageActions || fieldsLocked}
            className="xmt-field min-h-28 resize-y text-sm disabled:opacity-70"
          />
        </label>

        <label className="space-y-1 md:col-span-2">
          <span className="text-xs text-studio-text-secondary">处理结果</span>
          <textarea
            value={resultMd}
            onChange={(event) => setResultMd(event.target.value)}
            disabled={!canUpdateResult || fieldsLocked}
            className="xmt-field min-h-32 resize-y text-sm disabled:opacity-70"
            placeholder="填写进展、结论或关闭说明"
          />
        </label>
      </div>
    </BaseModal>
  );
}
