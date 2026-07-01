import type { ReactNode } from 'react';
import { Clock3 } from 'lucide-react';
import GlassPanel from './GlassPanel';

export default function TimelineCard({
  title,
  time,
  status,
  children,
}: {
  title: ReactNode;
  time?: ReactNode;
  status?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <GlassPanel className="p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-semibold text-studio-text-primary">{title}</h3>
          {time ? (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-studio-text-muted">
              <Clock3 className="h-3.5 w-3.5" />
              {time}
            </div>
          ) : null}
        </div>
        {status ? <div className="shrink-0">{status}</div> : null}
      </div>
      {children ? <div className="mt-3 text-sm leading-6 text-studio-text-secondary">{children}</div> : null}
    </GlassPanel>
  );
}
