import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import MotionCard from './MotionCard';

export default function MetricCard({
  title,
  value,
  unit,
  icon: Icon,
  tone = 'primary',
  trend,
}: {
  title: string;
  value: string | number;
  unit?: string;
  icon: LucideIcon;
  tone?: 'primary' | 'cyan' | 'violet' | 'coral' | 'amber' | 'success';
  trend?: { label: string; up?: boolean };
}) {
  const toneMap = {
    primary: 'from-studio-primary to-studio-violet shadow-studio-primary/25',
    cyan: 'from-studio-cyan to-studio-primary shadow-studio-cyan/20',
    violet: 'from-studio-violet to-studio-primary shadow-studio-violet/20',
    coral: 'from-studio-coral to-studio-violet shadow-studio-coral/20',
    amber: 'from-studio-amber to-studio-coral shadow-studio-amber/20',
    success: 'from-studio-success to-studio-cyan shadow-studio-success/20',
  };

  return (
    <MotionCard className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-studio-text-muted">{title}</p>
          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-3xl font-bold leading-none tracking-normal text-studio-text-primary">{value}</p>
            {unit ? <span className="text-xs font-medium text-studio-text-muted">{unit}</span> : null}
          </div>
          {trend ? (
            <div className="mt-3 flex items-center gap-1 text-xs font-medium text-studio-text-secondary">
              {trend.up ? <ArrowUpRight className="h-3.5 w-3.5 text-studio-success" /> : <ArrowDownRight className="h-3.5 w-3.5 text-studio-coral" />}
              <span>{trend.label}</span>
            </div>
          ) : null}
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br ${toneMap[tone]} shadow-lg`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </MotionCard>
  );
}
