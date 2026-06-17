import type { ReactNode } from 'react';
import { useThemeStyles } from '../../hooks/useThemeStyles';

interface PageToolbarProps {
  search?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  batchActions?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export default function PageToolbar({
  search,
  filters,
  actions,
  batchActions,
  left,
  right,
  children,
  className = '',
}: PageToolbarProps) {
  const styles = useThemeStyles();

  const hasPrimaryRow = search || filters || actions || left || right;

  return (
    <div className={`${styles.card} p-4 ${className}`.trim()}>
      {hasPrimaryRow ? (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-4 lg:flex-row lg:items-center">
            {left ? <div className="shrink-0">{left}</div> : null}
            {search ? <div className="min-w-0 flex-1">{search}</div> : null}
            {filters ? <div className="flex flex-wrap items-center gap-3">{filters}</div> : null}
          </div>

          {(actions || right) ? (
            <div className="flex flex-wrap items-center gap-3">
              {right}
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}

      {children ? <div className={hasPrimaryRow ? 'mt-4' : ''}>{children}</div> : null}
      {batchActions ? <div className={hasPrimaryRow || children ? 'mt-4' : ''}>{batchActions}</div> : null}
    </div>
  );
}
