import type { ReactNode } from 'react';

export default function AnimatedPage({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`xmt-page-enter ${className}`} data-page-transition="xmt-300ms">
      {children}
    </div>
  );
}
