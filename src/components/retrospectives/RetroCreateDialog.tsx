import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import type {
  CreateRetrospectivePayload,
  RetroTemplate,
  RetroTemplateCategory,
  RetrospectiveScopeType,
} from '../../api/retrospectives';
import type { User } from '../../types';
import { BaseModal } from '../common';
import { ActionButton } from '../studio';
import RetroAssigneeDirectoryNotice, { type RetroAssigneeDirectoryStatus } from './RetroAssigneeDirectoryNotice';
import { retroCategoryLabels, retroScopeLabels } from './retroLabels';

type Props = {
  open: boolean;
  templates: RetroTemplate[];
  users: User[];
  currentUserId?: number;
  loading: boolean;
  recovery: {
    status: 'checking' | 'submitting' | 'uncertain' | 'not_found';
    clientRequestId: string;
    payload: CreateRetrospectivePayload;
  } | { status: 'storage_error'; message: string } | null;
  createStorageError: string | null;
  canRetryRecovery: boolean;
  onVerifyRecovery: () => void;
  usersStatus: RetroAssigneeDirectoryStatus;
  usersError: string | null;
  onRetryUsers: () => void;
  onClose: () => void;
  onSubmit: (payload: CreateRetrospectivePayload) => void;
};

const categories: RetroTemplateCategory[] = ['weekly', 'project', 'channel', 'topic', 'daily', 'custom'];
const scopes: RetrospectiveScopeType[] = ['team', 'project', 'topic', 'channel', 'user', 'daily_report', 'custom'];

function today() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

function rangeDays(start: string, end: string) {
  const startTime = new Date(`${start}T00:00:00+08:00`).getTime();
  const endTime = new Date(`${end}T00:00:00+08:00`).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime > endTime) return null;
  return Math.floor((endTime - startTime) / 86_400_000) + 1;
}

export default function RetroCreateDialog({
  open,
  templates,
  users,
  currentUserId,
  loading,
  recovery,
  createStorageError,
  canRetryRecovery,
  onVerifyRecovery,
  usersStatus,
  usersError,
  onRetryUsers,
  onClose,
  onSubmit,
}: Props) {
  const firstTemplate = useMemo(() => templates.find((template) => template.status === 'active') || templates[0], [templates]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<RetroTemplateCategory>('weekly');
  const [templateId, setTemplateId] = useState('');
  const [scopeType, setScopeType] = useState<RetrospectiveScopeType>('team');
  const [periodStart, setPeriodStart] = useState(daysAgo(6));
  const [periodEnd, setPeriodEnd] = useState(today());
  const [ownerId, setOwnerId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    if (recovery && recovery.status !== 'storage_error') {
      setTitle(recovery.payload.title);
      setCategory(recovery.payload.category || 'weekly');
      setTemplateId(recovery.payload.templateId ? String(recovery.payload.templateId) : '');
      setScopeType(recovery.payload.scopeType);
      setPeriodStart(recovery.payload.periodStart);
      setPeriodEnd(recovery.payload.periodEnd);
      setOwnerId(recovery.payload.ownerId ? String(recovery.payload.ownerId) : '');
      setError('');
      return;
    }
    if (recovery?.status === 'storage_error') {
      setError(recovery.message);
      return;
    }
    setTitle('');
    setCategory((firstTemplate?.category as RetroTemplateCategory | undefined) || 'weekly');
    setTemplateId(firstTemplate ? String(firstTemplate.id) : '');
    setScopeType('team');
    setPeriodStart(daysAgo(6));
    setPeriodEnd(today());
    setOwnerId(currentUserId ? String(currentUserId) : '');
    setError('');
  }, [currentUserId, firstTemplate, open, recovery]);

  const handleSubmit = () => {
    if (recovery) {
      if (recovery.status === 'not_found' && canRetryRecovery) onSubmit(recovery.payload);
      return;
    }
    const titleText = title.trim();
    if (!titleText) {
      setError('请填写复盘标题');
      return;
    }

    const days = rangeDays(periodStart, periodEnd);
    if (!days) {
      setError('开始日期不能晚于结束日期');
      return;
    }
    if (days > 366) {
      setError('复盘周期不能超过 366 天');
      return;
    }

    onSubmit({
      title: titleText,
      category,
      templateId: templateId ? Number(templateId) : null,
      scopeType,
      periodStart,
      periodEnd,
      ownerId: ownerId ? Number(ownerId) : undefined,
    });
  };

  const fieldsDisabled = loading || recovery !== null;
  const primaryDisabled = loading
    || recovery?.status === 'checking'
    || recovery?.status === 'submitting'
    || recovery?.status === 'storage_error'
    || (recovery?.status === 'not_found' && !canRetryRecovery);
  const canClose = !loading && recovery?.status !== 'submitting';
  const primaryLabel = recovery?.status === 'checking'
    ? '正在核实...'
    : recovery?.status === 'submitting'
      ? '提交中...'
      : recovery?.status === 'uncertain'
        ? '重新核实'
        : recovery?.status === 'not_found'
          ? '用原请求编号重试'
          : recovery?.status === 'storage_error'
            ? '暂不可安全提交'
            : loading ? '创建中...' : '创建复盘';
  const primaryAction = recovery?.status === 'uncertain' ? onVerifyRecovery : handleSubmit;

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      size="lg"
      title="新建复盘"
      closeOnOverlayClick={canClose}
      closeOnEscape={canClose}
      showCloseButton={canClose}
      description="创建后进入详情页，再生成指标快照、填写结论和行动项。"
      footer={
        <div className="flex justify-end gap-3">
          <ActionButton variant="ghost" onClick={onClose} disabled={!canClose}>{recovery ? '稍后处理' : '取消'}</ActionButton>
          <ActionButton variant="primary" onClick={primaryAction} disabled={primaryDisabled}>
            {!recovery ? <Plus className="h-4 w-4" /> : null}
            {primaryLabel}
          </ActionButton>
        </div>
      }
    >
      {recovery ? (
        <div className="mb-4 rounded-card border border-studio-border-soft bg-studio-surface-soft p-3 text-sm leading-6 text-studio-text-primary" role="status" aria-live="polite">
          {recovery.status === 'checking'
            ? '正在核实原请求。核实完成前不会重复提交。'
            : recovery.status === 'submitting'
              ? '正在提交原请求，请勿另建一条复盘。'
              : recovery.status === 'uncertain'
                ? '服务端暂时无法确认结果。可以重新核实；请不要新建另一条复盘。'
                : recovery.status === 'not_found'
                  ? `服务端尚未记录此请求。可在权限允许时使用同一请求编号安全重试：${recovery.clientRequestId}`
                  : 'message' in recovery ? recovery.message : '无法读取创建恢复信息'}
        </div>
      ) : null}
      {createStorageError ? (
        <div className="mb-4 rounded-card border border-studio-coral/30 bg-studio-coral/10 p-3 text-sm leading-6 text-studio-coral-contrast" role="alert">
          {createStorageError}
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="md:col-span-2">
          <span className="text-sm font-semibold text-studio-text-primary">标题</span>
          <input
            value={title}
            disabled={fieldsDisabled}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-2 w-full rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary outline-none focus:border-studio-border-active"
            placeholder="例如：7 月第一周内容运营复盘"
          />
        </label>

        <label>
          <span className="text-sm font-semibold text-studio-text-primary">类型</span>
          <select
            value={category}
            disabled={fieldsDisabled}
            onChange={(event) => setCategory(event.target.value as RetroTemplateCategory)}
            className="mt-2 w-full rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary outline-none"
          >
            {categories.map((item) => <option key={item} value={item}>{retroCategoryLabels[item]}</option>)}
          </select>
        </label>

        <label>
          <span className="text-sm font-semibold text-studio-text-primary">模板</span>
          <select
            value={templateId}
            disabled={fieldsDisabled}
            onChange={(event) => setTemplateId(event.target.value)}
            className="mt-2 w-full rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary outline-none"
          >
            {templates.length === 0 ? <option value="">默认空模板</option> : null}
            {templates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
        </label>

        <label>
          <span className="text-sm font-semibold text-studio-text-primary">复盘范围</span>
          <select
            value={scopeType}
            disabled={fieldsDisabled}
            onChange={(event) => setScopeType(event.target.value as RetrospectiveScopeType)}
            className="mt-2 w-full rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary outline-none"
          >
            {scopes.map((item) => <option key={item} value={item}>{retroScopeLabels[item]}</option>)}
          </select>
        </label>

        <div>
          <label>
            <span className="text-sm font-semibold text-studio-text-primary">负责人</span>
            <select
              value={ownerId}
              disabled={fieldsDisabled}
              onChange={(event) => setOwnerId(event.target.value)}
              className="mt-2 w-full rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary outline-none"
            >
              <option value="">由后端默认</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.name || user.username}</option>
              ))}
            </select>
          </label>
          <RetroAssigneeDirectoryNotice status={usersStatus} error={usersError} onRetry={onRetryUsers} />
        </div>

        <label>
          <span className="flex items-center gap-2 text-sm font-semibold text-studio-text-primary">
            <CalendarDays className="h-4 w-4" />
            开始日期
          </span>
          <input
            type="date"
            value={periodStart}
            disabled={fieldsDisabled}
            onChange={(event) => setPeriodStart(event.target.value)}
            className="mt-2 w-full rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary outline-none"
          />
        </label>

        <label>
          <span className="text-sm font-semibold text-studio-text-primary">结束日期</span>
          <input
            type="date"
            value={periodEnd}
            disabled={fieldsDisabled}
            onChange={(event) => setPeriodEnd(event.target.value)}
            className="mt-2 w-full rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary outline-none"
          />
        </label>
      </div>

      {error ? <p className="mt-4 rounded-button border border-studio-coral/30 bg-studio-coral/10 px-3 py-2 text-sm text-studio-coral-contrast">{error}</p> : null}
    </BaseModal>
  );
}
