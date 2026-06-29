import type { ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';

export default function Topbar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <header
      className={twMerge(
        'sticky top-0 z-40 flex h-16 items-center justify-between border-b border-studio-border-soft bg-studio-app-bg/78 px-4 backdrop-blur-2xl sm:px-6',
        className,
      )}
    >
      {children}
    </header>
  );
}
