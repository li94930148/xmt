import type { ReactNode } from 'react';

export default function AppShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`studio-grid-bg min-h-screen bg-studio-app-bg text-studio-text-primary ${className}`}>
      {children}
    </div>
  );
}
