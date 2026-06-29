import type { ComponentPropsWithoutRef, ReactNode } from 'react';

export default function AppShell({
  children,
  className = '',
  ...props
}: ComponentPropsWithoutRef<'div'> & { children: ReactNode }) {
  return (
    <div className={`studio-grid-bg min-h-screen bg-studio-app-bg text-studio-text-primary ${className}`} {...props}>
      {children}
    </div>
  );
}
