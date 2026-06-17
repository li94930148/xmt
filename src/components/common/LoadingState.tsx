import { Loader2 } from 'lucide-react';
import { SkeletonCard, SkeletonTable } from '../Skeleton';
import { useThemeStyles } from '../../hooks/useThemeStyles';

type LoadingStateType = 'page' | 'section' | 'table' | 'inline';

interface LoadingStateProps {
  type?: LoadingStateType;
  text?: string;
  rows?: number;
  className?: string;
}

export default function LoadingState({
  type = 'section',
  text = '加载中...',
  rows = 5,
  className = '',
}: LoadingStateProps) {
  const styles = useThemeStyles();

  if (type === 'table') {
    return (
      <div className={className}>
        <SkeletonTable rows={rows} cols={5} />
      </div>
    );
  }

  if (type === 'inline') {
    return (
      <div className={`inline-flex items-center gap-2 ${styles.textSecondary} ${className}`.trim()}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">{text}</span>
      </div>
    );
  }

  if (type === 'page') {
    return (
      <div className={`flex min-h-[60vh] items-center justify-center ${className}`.trim()}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className={`h-8 w-8 animate-spin ${styles.textSecondary}`} />
          <p className={`text-sm ${styles.textSecondary}`}>{text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-4 py-12 ${className}`.trim()}>
      <SkeletonCard />
      <p className={`text-sm ${styles.textSecondary}`}>{text}</p>
    </div>
  );
}
