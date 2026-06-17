import { useThemeStyles } from '../hooks/useThemeStyles';

const shimmer = 'animate-pulse bg-gradient-to-r from-transparent via-white/10 to-transparent bg-[length:200%_100%]';

export function SkeletonLine({ width = '100%', height = '1rem' }: { width?: string; height?: string }) {
  const styles = useThemeStyles();
  return (
    <div
      className={`rounded-lg ${styles.bgTertiary} ${shimmer}`}
      style={{ width, height }}
    />
  );
}

export function SkeletonAvatar({ size = 40 }: { size?: number }) {
  const styles = useThemeStyles();
  return (
    <div
      className={`rounded-full ${styles.bgTertiary} ${shimmer}`}
      style={{ width: size, height: size }}
    />
  );
}

export function SkeletonCard() {
  const styles = useThemeStyles();
  return (
    <div className={`${styles.card} p-5 space-y-4`}>
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
  const styles = useThemeStyles();
  return (
    <div className={`${styles.card} overflow-hidden`}>
      {/* Header */}
      <div className={`px-6 py-3.5 ${styles.tableHeader}`}>
        <div className="flex gap-6">
          {Array.from({ length: cols }).map((_, i) => (
            <SkeletonLine key={`h-${i}`} width={i === 0 ? '120px' : '80px'} height="0.75rem" />
          ))}
        </div>
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={`r-${rowIdx} border-t ${styles.tableRow}`}>
          <div className="flex gap-6 px-6 py-4">
            {Array.from({ length: cols }).map((_, colIdx) => (
              <SkeletonLine
                key={`c-${rowIdx}-${colIdx}`}
                width={colIdx === 0 ? '160px' : colIdx === cols - 1 ? '60px' : '100px'}
                height="0.875rem"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
