import { useThemeStyles } from '../hooks/useThemeStyles';
import { LucideIcon, Search, Database, FileText } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const styles = useThemeStyles();
  const ResolvedIcon = Icon || FileText;

  return (
    <div className={`flex flex-col items-center justify-center py-16 px-4 text-center`}>
      <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-6 ${
        styles.isDark ? 'bg-[#1e2030]' : 'bg-[#f1f3f5]'
      }`}>
        <ResolvedIcon className={`w-10 h-10 ${styles.textMuted}`} />
      </div>
      <h3 className={`text-lg font-semibold ${styles.textPrimary} mb-2`}>{title}</h3>
      {description && (
        <p className={`text-sm ${styles.textSecondary} max-w-sm mb-6`}>{description}</p>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className={`px-5 py-2.5 ${styles.buttonPrimary} rounded-xl text-sm font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]`}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// 预设变体
export function EmptyTopics({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={FileText}
      title="暂无选题"
      description="还没有提报任何选题，点击下方按钮开始创建第一个选题吧"
      actionLabel="提报选题"
      onAction={onAction}
    />
  );
}

export function EmptyData({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={Database}
      title="暂无数据"
      description="当前没有可显示的数据，请稍后再试或刷新页面"
      actionLabel="刷新页面"
      onAction={onAction || (() => window.location.reload())}
    />
  );
}

export function EmptySearch({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={Search}
      title="未找到结果"
      description="没有找到匹配的搜索结果，试试其他关键词吧"
      actionLabel="清除搜索"
      onAction={onAction}
    />
  );
}
