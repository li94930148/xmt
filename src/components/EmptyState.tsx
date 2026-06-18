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
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div
        className={`mb-6 flex h-20 w-20 items-center justify-center rounded-2xl ${
          styles.isDark ? 'bg-[#1e2030]' : 'bg-[#f1f3f5]'
        }`}
      >
        <ResolvedIcon className={`h-10 w-10 ${styles.textMuted}`} />
      </div>
      <h3 className={`mb-2 text-lg font-semibold ${styles.textPrimary}`}>{title}</h3>
      {description ? (
        <p className={`mb-6 max-w-sm text-sm ${styles.textSecondary}`}>{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <button
          onClick={onAction}
          className={`rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${styles.buttonPrimary}`}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function EmptyTopics({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={FileText}
      title="暂无选题"
      description="还没有提报任何选题，点击下方按钮开始创建第一个选题。"
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
      description="当前没有可显示的数据，请稍后再试或刷新页面。"
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
      description="没有找到匹配的搜索结果，试试其他关键词吧。"
      actionLabel="清除搜索"
      onAction={onAction}
    />
  );
}
