import type { LucideIcon } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';

interface StatCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon: LucideIcon;
  color: string;
  change?: string;
  up?: boolean;
  onClick?: () => void;
}

/**
 * 统一的统计卡片组件
 */
export default function StatCard({ title, value, unit, icon: Icon, color, change, up, onClick }: StatCardProps) {
  const styles = useThemeStyles();

  return (
    <div
      className={`${styles.card} p-5 hover:shadow-soft-lg transition-all duration-300 hover:-translate-y-0.5 group ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className={`${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>{title}</p>
          <div className="flex items-baseline gap-2 mt-3">
            <p className={`text-3xl font-bold tracking-tight ${styles.textPrimary}`}>{value}</p>
            {unit && <span className={`text-xs font-medium ${styles.textMuted}`}>{unit}</span>}
          </div>
          {change && (
            <div className="flex items-center gap-1 mt-2">
              <span className={`text-xs font-medium ${up ? 'text-red-400' : 'text-green-400'}`}>
                {change}
              </span>
              <span className={`text-xs ${styles.textMuted}`}>vs 上月</span>
            </div>
          )}
        </div>
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon className="w-6 h-6" style={{ color }} />
        </div>
      </div>
    </div>
  );
}
