import type { LucideIcon } from 'lucide-react';
import { FileText } from 'lucide-react';
import ActionButton from './ActionButton';

export default function StudioEmptyState({
  icon: Icon = FileText,
  title,
  titleLevel = 3,
  description,
  actionLabel,
  onAction,
}: {
  icon?: LucideIcon;
  title: string;
  titleLevel?: 2 | 3 | 4;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const Title = titleLevel === 2 ? 'h2' : titleLevel === 4 ? 'h4' : 'h3';

  return (
    <div className="flex flex-col items-center justify-center rounded-panel border border-dashed border-studio-border-soft bg-[var(--xmt-overlay-tint)] px-6 py-14 text-center">
      <div className="xmt-empty-illustration mb-5 flex h-16 w-16 items-center justify-center rounded-card border border-studio-border-soft bg-studio-surface-soft text-studio-cyan ring-1 ring-inset ring-studio-border-soft">
        <Icon className="h-7 w-7" />
      </div>
      <Title className="text-base font-semibold tracking-tight text-studio-text-primary">{title}</Title>
      {description ? <p className="mt-2 max-w-md text-sm leading-relaxed text-studio-text-secondary">{description}</p> : null}
      {actionLabel && onAction ? (
        <ActionButton type="button" onClick={onAction} variant="primary" className="mt-5">
          {actionLabel}
        </ActionButton>
      ) : null}
    </div>
  );
}
