import type { ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';

export default function ResponsiveTableShell({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={twMerge('min-w-0 overflow-hidden rounded-panel border border-studio-border-soft bg-studio-surface-glass shadow-card backdrop-blur-xl', className)}>
      <div className="min-w-0 overflow-x-auto">{children}</div>
    </div>
  );
}
