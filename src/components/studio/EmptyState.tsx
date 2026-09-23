import type { LucideIcon } from 'lucide-react';
import { FileText } from 'lucide-react';
import ActionButton from './ActionButton';

export default function StudioEmptyState({
  icon: Icon = FileText,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-panel border border-dashed border-studio-border-soft bg-white/[0.02] px-6 py-14 text-center">
      <div className="xmt-empty-illustration mb-5 flex h-16 w-16 items-center justify-center rounded-card border border-studio-border-soft bg-white/[0.04] text-studio-cyan ring-1 ring-inset ring-white/[0.04]">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="text-base font-semibold tracking-tight text-studio-text-primary">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-sm leading-relaxed text-studio-text-secondary">{description}</p> : null}
      {actionLabel && onAction ? (
        <ActionButton type="button" onClick={onAction} variant="primary" className="mt-5">
          {actionLabel}
        </ActionButton>
      ) : null}
    </div>
  );
}
