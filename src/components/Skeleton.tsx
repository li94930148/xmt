const shimmer = 'skeleton-shimmer bg-studio-surface-soft/80';

export function SkeletonLine({ width = '100%', height = '1rem' }: { width?: string; height?: string }) {
  return (
    <div
      className={`rounded-full ${shimmer}`}
      style={{ width, height }}
    />
  );
}

export function SkeletonAvatar({ size = 40 }: { size?: number }) {
  return (
    <div
      className={`rounded-full ${shimmer}`}
      style={{ width: size, height: size }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="xmt-card space-y-4 p-5">
      <div className="flex items-center gap-3">
        <SkeletonAvatar size={40} />
        <div className="flex-1 space-y-2">
          <SkeletonLine width="60%" height="0.875rem" />
          <SkeletonLine width="40%" height="0.75rem" />
        </div>
      </div>
      <SkeletonLine width="100%" height="0.75rem" />
      <SkeletonLine width="80%" height="0.75rem" />
      <div className="flex gap-2 pt-2">
        <SkeletonLine width="60px" height="1.5rem" />
        <SkeletonLine width="60px" height="1.5rem" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="xmt-card overflow-hidden">
      <div className="border-b border-studio-border-soft bg-studio-surface-soft/50 px-6 py-3.5">
        <div className="flex gap-6">
          {Array.from({ length: cols }).map((_, i) => (
            <SkeletonLine key={`h-${i}`} width={i === 0 ? '120px' : '80px'} height="0.75rem" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-studio-border-soft">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={`r-${rowIdx}`} className="flex gap-6 px-6 py-4">
            {Array.from({ length: cols }).map((_, colIdx) => (
              <SkeletonLine
                key={`c-${rowIdx}-${colIdx}`}
                width={colIdx === 0 ? '160px' : colIdx === cols - 1 ? '60px' : '100px'}
                height="0.875rem"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
