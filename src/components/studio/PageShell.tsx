import type { ReactNode } from 'react';
import AnimatedPage from './AnimatedPage';

export default function PageShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <AnimatedPage className={`space-y-6 ${className}`}>{children}</AnimatedPage>;
}
