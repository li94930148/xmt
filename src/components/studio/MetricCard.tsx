import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import XMTCard from '../../design-system/components/XMTCard';
import { AnimatedNumber } from '../../design-system';
import { useAppStore } from '../../store';

export default function MetricCard({
  title,
  value,
  unit,
  icon: Icon,
  tone = 'primary',
  trend,
}: {
  title: string;
  value: ReactNode;
  unit?: string;
  icon: LucideIcon;
  tone?: 'primary' | 'cyan' | 'violet' | 'coral' | 'amber' | 'success';
  trend?: { label: string; up?: boolean };
}) {
  const isDark = useAppStore((state) => state.theme === 'dark');
  const darkToneMap = {
    primary: 'from-studio-primary/95 to-studio-violet/85 shadow-studio-primary/25',
    cyan: 'from-studio-cyan/95 to-studio-primary/85 shadow-studio-cyan/20',
    violet: 'from-studio-violet/95 to-studio-primary/85 shadow-studio-violet/20',
    coral: 'from-studio-coral/95 to-studio-violet/80 shadow-studio-coral/20',
    amber: 'from-studio-amber/95 to-studio-coral/80 shadow-studio-amber/20',
    success: 'from-studio-success/95 to-studio-cyan/85 shadow-studio-success/20',
  };
  const lightToneMap = {
    primary: 'from-studio-primary-contrast to-studio-violet-contrast shadow-studio-primary/25',
    cyan: 'from-studio-cyan-contrast to-studio-primary-contrast shadow-studio-cyan/20',
    violet: 'from-studio-violet-contrast to-studio-primary-contrast shadow-studio-violet/20',
    coral: 'from-studio-coral-contrast to-studio-violet-contrast shadow-studio-coral/20',
    amber: 'from-studio-amber-contrast to-studio-coral-contrast shadow-studio-amber/20',
    success: 'from-studio-success-contrast to-studio-cyan-contrast shadow-studio-success/20',
  };
  const toneClass = (isDark ? darkToneMap : lightToneMap)[tone];

  return (
    <XMTCard className="p-5">
      <div className="relative z-[1] flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-studio-text-secondary">{title}</p>
          <div className="mt-3 flex flex-wrap items-baseline gap-2">
            <p className="xmt-data-number break-words text-3xl font-semibold leading-tight tracking-tight text-studio-text-primary">
              {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
            </p>
            {unit ? <span className="text-xs font-medium leading-snug text-studio-text-secondary">{unit}</span> : null}
          </div>
          {trend ? (
            <div className="mt-3 flex items-center gap-1 text-xs font-medium text-studio-text-secondary">
              {trend.up ? (
                <ArrowUpRight className="h-3.5 w-3.5 text-studio-success" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5 text-studio-coral" />
              )}
              <span>{trend.label}</span>
            </div>
          ) : null}
        </div>
        <div
          data-testid="metric-card-icon"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br ${toneClass} shadow-lg ring-1 ring-inset ring-white/15`}
        >
          <Icon className={`h-5 w-5 ${isDark ? 'text-studio-app-bg' : 'text-white'}`} />
        </div>
      </div>
    </XMTCard>
  );
}
