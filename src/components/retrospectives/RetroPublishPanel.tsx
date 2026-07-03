import { Archive, Lock, Send } from 'lucide-react';
import type { Retrospective, RetrospectivePermissions } from '../../api/retrospectives';
import { ActionButton, GlassPanel } from '../studio';
import { formatDateTime } from './retroLabels';

type Props = {
  retrospective: Retrospective;
  permissions: RetrospectivePermissions;
  loading: boolean;
  onPublish: () => void;
  onArchive: () => void;
};

export default function RetroPublishPanel({ retrospective, permissions, loading, onPublish, onArchive }: Props) {
  return (
    <GlassPanel className="p-5">
      <h2 className="text-lg font-bold text-studio-text-primary">发布与归档</h2>
      <p className="mt-2 text-sm leading-6 text-studio-text-muted">
        发布后基础信息和指标快照进入只读；归档后不再允许新增行动项。
      </p>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-studio-text-muted">发布时间</dt>
          <dd className="text-right text-studio-text-secondary">{formatDateTime(retrospective.publishedAt)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-studio-text-muted">归档时间</dt>
          <dd className="text-right text-studio-text-secondary">{formatDateTime(retrospective.archivedAt)}</dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap gap-3">
        {retrospective.status === 'draft' && permissions.canPublish ? (
          <ActionButton variant="primary" onClick={onPublish} disabled={loading}>
            <Send className="h-4 w-4" />
            发布复盘
          </ActionButton>
        ) : null}
        {retrospective.status === 'published' && permissions.canArchive ? (
          <ActionButton onClick={onArchive} disabled={loading}>
            <Archive className="h-4 w-4" />
            归档复盘
          </ActionButton>
        ) : null}
        {retrospective.status === 'archived' ? (
          <span className="inline-flex items-center gap-2 rounded-button border border-studio-border-soft px-3 py-2 text-sm text-studio-text-muted">
            <Lock className="h-4 w-4" />
            已归档，只读
          </span>
        ) : null}
        {retrospective.status !== 'archived' && !permissions.canPublish && !permissions.canArchive ? (
          <span className="inline-flex items-center gap-2 rounded-button border border-studio-border-soft px-3 py-2 text-sm text-studio-text-muted">
            <Lock className="h-4 w-4" />
            当前账号无发布/归档权限
          </span>
        ) : null}
      </div>
    </GlassPanel>
  );
}
