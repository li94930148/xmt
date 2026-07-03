import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import type { RetroAction, RetroActionStatus, UpdateRetroActionPayload } from '../../api/retrospectives';
import type { User } from '../../types';
import { BaseModal } from '../common';
import { ActionButton } from '../studio';
import { formatDateTime, retroActionStatusLabels } from './retroLabels';

type Props = {
  action: RetroAction | null;
  users: User[];
  currentUserId?: number;
  canManageActions: boolean;
  loading: boolean;
  onClose: () => void;
  onUpdate: (actionId: number, payload: UpdateRetroActionPayload) => void;
};

const statuses: RetroActionStatus[] = ['todo', 'doing', 'done', 'cancelled'];

export default function RetroActionDetailDrawer({
  action,
  users,
  currentUserId,
  canManageActions,
  loading,
  onClose,
  onUpdate,
}: Props) {
  const [title, setTitle] = useState('');
  const [descriptionMd, setDescriptionMd] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<RetroActionStatus>('todo');
  const [resultMd, setResultMd] = useState('');

  useEffect(() => {
    if (!action) return;
    setTitle(action.title);
    setDescriptionMd(action.descriptionMd || '');
    setOwnerId(action.ownerId ? String(action.ownerId) : '');
    setDueDate(action.dueDate || '');
    setStatus(action.status);
    setResultMd(action.resultMd || '');
  }, [action]);

  if (!action) return null;

  const canUpdateResult = canManageActions || action.ownerId === currentUserId;
  const canSave = canManageActions || canUpdateResult;

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
    onUpdate(action.id, payload);
  };

  return (
    <BaseModal
      open={Boolean(action)}
      onClose={onClose}
      size="xl"
      title="行动项详情"
      description={action.retroTitle || `复盘 #${action.retroId}`}
      footer={
        <div className="flex justify-end gap-3">
          <ActionButton variant="ghost" onClick={onClose}>关闭</ActionButton>
          {canSave ? (
            <ActionButton variant="primary" onClick={handleSave} disabled={loading || !title.trim()}>
              <Save className="h-4 w-4" />
              保存
            </ActionButton>
          ) : null}
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 md:col-span-2">
          <span className="text-xs text-studio-text-muted">标题</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={!canManageActions}
            className="w-full rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary outline-none disabled:opacity-70"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs text-studio-text-muted">负责人</span>
          <select
            value={ownerId}
            onChange={(event) => setOwnerId(event.target.value)}
            disabled={!canManageActions}
            className="w-full rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary outline-none disabled:opacity-70"
          >
            <option value="">未指定</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name || user.username}</option>)}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs text-studio-text-muted">截止日期</span>
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            disabled={!canManageActions}
            className="w-full rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary outline-none disabled:opacity-70"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs text-studio-text-muted">状态</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as RetroActionStatus)}
            disabled={!canUpdateResult}
            className="w-full rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary outline-none disabled:opacity-70"
          >
            {statuses.map((item) => <option key={item} value={item}>{retroActionStatusLabels[item]}</option>)}
          </select>
        </label>

        <div className="rounded-panel border border-studio-border-soft bg-white/[0.04] p-3 text-xs leading-6 text-studio-text-muted">
          <p>创建人：{action.creatorName || '-'}</p>
          <p>创建时间：{formatDateTime(action.createdAt)}</p>
          <p>更新时间：{formatDateTime(action.updatedAt)}</p>
          <p>关闭时间：{formatDateTime(action.closedAt)}</p>
        </div>

        <label className="space-y-1 md:col-span-2">
          <span className="text-xs text-studio-text-muted">说明</span>
          <textarea
            value={descriptionMd}
            onChange={(event) => setDescriptionMd(event.target.value)}
            disabled={!canManageActions}
            className="min-h-28 w-full rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary outline-none disabled:opacity-70"
          />
        </label>

        <label className="space-y-1 md:col-span-2">
          <span className="text-xs text-studio-text-muted">处理结果</span>
          <textarea
            value={resultMd}
            onChange={(event) => setResultMd(event.target.value)}
            disabled={!canUpdateResult}
            className="min-h-32 w-full rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary outline-none disabled:opacity-70"
            placeholder="填写进展、结论或关闭说明"
          />
        </label>
      </div>
    </BaseModal>
  );
}
