import type { RetroActionStatus, RetrospectiveStatus } from '../../api/retrospectives';
import { retroActionStatusLabels, retroStatusLabels } from './retroLabels';

type Props = {
  status: RetrospectiveStatus | RetroActionStatus;
  kind?: 'retro' | 'action';
};

const retroClasses: Record<RetrospectiveStatus, string> = {
  draft: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  published: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  archived: 'border-slate-400/30 bg-slate-400/10 text-slate-300',
};

const actionClasses: Record<RetroActionStatus, string> = {
  todo: 'border-slate-400/30 bg-slate-400/10 text-slate-300',
  doing: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
  done: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  cancelled: 'border-zinc-400/30 bg-zinc-400/10 text-zinc-300',
};

export default function RetroStatusPill({ status, kind = 'retro' }: Props) {
  const classes = kind === 'action'
    ? actionClasses[status as RetroActionStatus]
    : retroClasses[status as RetrospectiveStatus];
  const label = kind === 'action'
    ? retroActionStatusLabels[status as RetroActionStatus]
    : retroStatusLabels[status as RetrospectiveStatus];

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${classes}`}>
      {label}
    </span>
  );
}
