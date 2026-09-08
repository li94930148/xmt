import type { RetroActionStatus, RetrospectiveStatus } from '../../api/retrospectives';
import { retroActionStatusLabels, retroStatusLabels } from './retroLabels';

type Props = {
  status: RetrospectiveStatus | RetroActionStatus;
  kind?: 'retro' | 'action';
};

const retroClasses: Record<RetrospectiveStatus, string> = {
  draft: 'border-studio-amber/30 bg-studio-amber/10 text-studio-amber-contrast',
  published: 'border-studio-success/30 bg-studio-success/10 text-studio-success-contrast',
  archived: 'border-studio-border-soft bg-studio-surface-soft text-studio-text-secondary',
};

const actionClasses: Record<RetroActionStatus, string> = {
  todo: 'border-studio-border-soft bg-studio-surface-soft text-studio-text-secondary',
  doing: 'border-studio-cyan/30 bg-studio-cyan/10 text-studio-cyan-contrast',
  done: 'border-studio-success/30 bg-studio-success/10 text-studio-success-contrast',
  cancelled: 'border-studio-border-soft bg-studio-surface-soft text-studio-text-secondary',
};

export default function RetroStatusPill({ status, kind = 'retro' }: Props) {
  const classes = kind === 'action'
    ? actionClasses[status as RetroActionStatus]
    : retroClasses[status as RetrospectiveStatus];
  const label = kind === 'action'
    ? retroActionStatusLabels[status as RetroActionStatus]
    : retroStatusLabels[status as RetrospectiveStatus];

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${classes || 'border-studio-border-soft bg-studio-surface-soft text-studio-text-secondary'}`}>
      {label || '未知状态'}
    </span>
  );
}
