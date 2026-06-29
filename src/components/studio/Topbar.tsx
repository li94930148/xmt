import type { ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';

export default function Topbar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <header
      className={twMerge(
        'sticky top-0 z-40 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-studio-border-soft bg-studio-app-bg/78 px-4 py-2 backdrop-blur-2xl sm:px-6',
        className,
      )}
    >
      {children}
    </header>
  );
}
