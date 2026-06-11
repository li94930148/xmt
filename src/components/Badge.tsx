import { STATUS_COLORS, STATUS_TEXT, ACHIEVEMENT_RARITIES } from '../constants';

interface StatusBadgeProps {
  status: string;
  showDot?: boolean;
  className?: string;
}

/**
 * 统一的状态标签组件
 */
export function StatusBadge({ status, showDot = true, className = '' }: StatusBadgeProps) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.pending;
  const label = STATUS_TEXT[status] || status;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${color.bg} ${color.text} ${color.border} border ${className}`}>
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />}
      {label}
    </span>
  );
}

interface RarityBadgeProps {
  rarity: string;
  className?: string;
}

/**
 * 成就稀有度标签
 */
export function RarityBadge({ rarity, className = '' }: RarityBadgeProps) {
  const config = ACHIEVEMENT_RARITIES.find(r => r.value === rarity) || ACHIEVEMENT_RARITIES[0];

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${config.bg} ${config.color} ${config.border} ${className}`}>
      {config.label}
    </span>
  );
}

interface PointBadgeProps {
  points: number;
  className?: string;
}

/**
 * 积分标签
 */
export function PointBadge({ points, className = '' }: PointBadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 ${className}`}>
      {points} 积分
    </span>
  );
}
