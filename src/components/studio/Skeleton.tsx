export function StudioSkeletonLine({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={`skeleton-shimmer rounded-full bg-studio-surface-soft/80 ${className}`} />;
}

export function StudioSkeletonCard() {
  return (
    <div className="rounded-card border border-studio-border-soft bg-studio-surface-glass p-5">
      <div className="flex items-center gap-3">
        <StudioSkeletonLine className="h-11 w-11 rounded-[14px]" />
        <div className="flex-1 space-y-2">
          <StudioSkeletonLine className="h-3 w-1/2" />
          <StudioSkeletonLine className="h-4 w-2/3" />
        </div>
      </div>
      <div className="mt-5 space-y-2">
        <StudioSkeletonLine className="h-3 w-full" />
        <StudioSkeletonLine className="h-3 w-5/6" />
      </div>
    </div>
  );
}

export function StudioSkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-panel border border-studio-border-soft bg-studio-surface-glass">
      <div className="border-b border-studio-border-soft bg-studio-surface-soft/50 px-4 py-3">
        <div className="flex gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <StudioSkeletonLine key={i} className="h-3 flex-1" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-studio-border-soft">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4 px-4 py-3.5">
            {Array.from({ length: cols }).map((__, c) => (
              <StudioSkeletonLine key={c} className="h-3.5 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function StudioSkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-card border border-studio-border-soft bg-studio-surface-glass p-4">
          <StudioSkeletonLine className="h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <StudioSkeletonLine className="h-3.5 w-2/5" />
            <StudioSkeletonLine className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
