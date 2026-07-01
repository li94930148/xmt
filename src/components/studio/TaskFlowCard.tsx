import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import MotionCard from './MotionCard';

export default function TaskFlowCard({
  title,
  eyebrow,
  meta,
  status,
  progress,
  action,
  children,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  progress?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <MotionCard className="group flex min-w-0 flex-col gap-4 p-5">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? <div className="mb-2 text-xs font-semibold text-studio-text-muted">{eyebrow}</div> : null}
          <h3 className="line-clamp-2 text-base font-semibold leading-snug text-studio-text-primary">{title}</h3>
          {meta ? <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-studio-text-secondary">{meta}</div> : null}
        </div>
        {status ? <div className="shrink-0">{status}</div> : null}
      </div>
      {progress ? <div>{progress}</div> : null}
      {children ? <div className="text-sm leading-6 text-studio-text-secondary">{children}</div> : null}
      {action ? (
        <div className="flex items-center justify-between border-t border-studio-border-soft pt-4">
          <span className="text-xs font-medium text-studio-text-muted">下一步</span>
          <div className="flex items-center gap-2 opacity-100 transition-opacity md:opacity-80 md:group-hover:opacity-100">
            {action}
            <ArrowRight className="hidden h-4 w-4 text-studio-text-muted md:block" />
          </div>
        </div>
      ) : null}
    </MotionCard>
  );
}
