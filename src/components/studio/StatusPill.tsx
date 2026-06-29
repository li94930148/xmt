import { twMerge } from 'tailwind-merge';

export type StatusTone = 'primary' | 'cyan' | 'violet' | 'coral' | 'amber' | 'success' | 'muted';

const toneClass: Record<StatusTone, string> = {
  primary: 'border-studio-primary/35 bg-studio-primary/12 text-[#BFD0FF]',
  cyan: 'border-studio-cyan/35 bg-studio-cyan/12 text-[#A5F3FC]',
  violet: 'border-studio-violet/35 bg-studio-violet/12 text-[#DDD6FE]',
  coral: 'border-studio-coral/35 bg-studio-coral/12 text-[#FFC2CC]',
  amber: 'border-studio-amber/35 bg-studio-amber/12 text-[#FDE7B2]',
  success: 'border-studio-success/35 bg-studio-success/12 text-[#B8F7E3]',
  muted: 'border-studio-border-soft bg-white/[0.04] text-studio-text-secondary',
};

export default function StatusPill({ children, tone = 'muted', className = '' }: { children: React.ReactNode; tone?: StatusTone; className?: string }) {
  return (
    <span className={twMerge('inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-snug', toneClass[tone], className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_10px_currentColor]" />
      {children}
    </span>
  );
}
