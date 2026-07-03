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
import { retroCategoryLabels, retroScopeLabels } from './retroLabels';

type Props = {
  open: boolean;
  templates: RetroTemplate[];
  users: User[];
  currentUserId?: number;
  loading: boolean;
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

export default function RetroCreateDialog({ open, templates, users, currentUserId, loading, onClose, onSubmit }: Props) {
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
    setTitle('');
    setCategory((firstTemplate?.category as RetroTemplateCategory | undefined) || 'weekly');
    setTemplateId(firstTemplate ? String(firstTemplate.id) : '');
    setScopeType('team');
    setPeriodStart(daysAgo(6));
    setPeriodEnd(today());
    setOwnerId(currentUserId ? String(currentUserId) : '');
    setError('');
  }, [currentUserId, firstTemplate, open]);

  const handleSubmit = () => {
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

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      size="lg"
      title="新建复盘"
      description="创建后进入详情页，再生成指标快照、填写结论和行动项。"
      footer={
        <div className="flex justify-end gap-3">
          <ActionButton variant="ghost" onClick={onClose} disabled={loading}>取消</ActionButton>
          <ActionButton variant="primary" onClick={handleSubmit} disabled={loading}>
            <Plus className="h-4 w-4" />
            {loading ? '创建中...' : '创建复盘'}
          </ActionButton>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="md:col-span-2">
          <span className="text-sm font-semibold text-studio-text-primary">标题</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-2 w-full rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary outline-none focus:border-studio-border-active"
            placeholder="例如：7 月第一周内容运营复盘"
          />
        </label>

        <label>
          <span className="text-sm font-semibold text-studio-text-primary">类型</span>
          <select
            value={category}
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
            onChange={(event) => setScopeType(event.target.value as RetrospectiveScopeType)}
            className="mt-2 w-full rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary outline-none"
          >
            {scopes.map((item) => <option key={item} value={item}>{retroScopeLabels[item]}</option>)}
          </select>
        </label>

        <label>
          <span className="text-sm font-semibold text-studio-text-primary">负责人</span>
          <select
            value={ownerId}
            onChange={(event) => setOwnerId(event.target.value)}
            className="mt-2 w-full rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary outline-none"
          >
            <option value="">由后端默认</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.name || user.username}</option>
            ))}
          </select>
        </label>

        <label>
          <span className="flex items-center gap-2 text-sm font-semibold text-studio-text-primary">
            <CalendarDays className="h-4 w-4" />
            开始日期
          </span>
          <input
            type="date"
            value={periodStart}
            onChange={(event) => setPeriodStart(event.target.value)}
            className="mt-2 w-full rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary outline-none"
          />
        </label>

        <label>
          <span className="text-sm font-semibold text-studio-text-primary">结束日期</span>
          <input
            type="date"
            value={periodEnd}
            onChange={(event) => setPeriodEnd(event.target.value)}
            className="mt-2 w-full rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary outline-none"
          />
        </label>
      </div>

      {error ? <p className="mt-4 rounded-button border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
    </BaseModal>
  );
}
