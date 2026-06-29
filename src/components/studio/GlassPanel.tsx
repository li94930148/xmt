import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';

export default function GlassPanel({ children, className = '', ...props }: ComponentPropsWithoutRef<'div'> & { children: ReactNode }) {
  return (
    <div
      className={twMerge(
        'min-w-0 rounded-panel border border-studio-border-soft bg-studio-surface-glass shadow-card backdrop-blur-xl',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
