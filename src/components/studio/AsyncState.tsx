import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, FileText, RefreshCw, Search } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import ActionButton from './ActionButton';
import StudioEmptyState from './EmptyState';
import { StudioSkeletonList, StudioSkeletonTable } from './Skeleton';

export type LoadingVariant = 'card' | 'table' | 'list' | 'inline';

export function LoadingState({
  variant = 'card',
  rows = 5,
  cols = 4,
  label = '加载中…',
}: {
  variant?: LoadingVariant;
  rows?: number;
  cols?: number;
  label?: string;
}) {
  if (variant === 'inline') {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-studio-text-muted" role="status" aria-live="polite">
        <RefreshCw className="h-4 w-4 animate-spin text-studio-primary" />
        {label}
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" aria-label={label} className="space-y-3">
      {variant === 'table' ? <StudioSkeletonTable rows={rows} cols={cols} /> : null}
      {variant === 'list' ? <StudioSkeletonList rows={rows} /> : null}
      {variant === 'card' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="rounded-card border border-studio-border-soft bg-studio-surface-glass p-5">
              <div className="skeleton-shimmer h-3 w-1/3 rounded-full bg-studio-surface-soft/80" />
              <div className="skeleton-shimmer mt-4 h-8 w-1/2 rounded-full bg-studio-surface-soft/80" />
              <div className="skeleton-shimmer mt-4 h-3 w-2/3 rounded-full bg-studio-surface-soft/80" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ErrorState({
  title = '加载失败',
  description,
  onRetry,
  className = '',
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={twMerge(
        'flex flex-col items-center justify-center rounded-panel border border-studio-coral/30 bg-studio-coral/[0.08] px-6 py-12 text-center',
        className,
      )}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-card border border-studio-coral/30 bg-studio-coral/12 text-studio-coral-contrast">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold tracking-tight text-studio-text-primary">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-sm leading-relaxed text-studio-text-secondary">{description}</p> : null}
      {onRetry ? (
        <ActionButton type="button" onClick={onRetry} variant="secondary" className="mt-5">
          重试
        </ActionButton>
      ) : null}
    </div>
  );
}

export function EmptyTopics({ onAction }: { onAction?: () => void }) {
  return (
    <StudioEmptyState
      icon={FileText as LucideIcon}
      title="暂无选题"
      description="还没有提报任何选题，点击下方按钮开始创建第一个选题。"
      actionLabel="提报选题"
      onAction={onAction}
    />
  );
}

export function EmptyData({ onAction }: { onAction?: () => void }) {
  return (
    <StudioEmptyState
      icon={FileText as LucideIcon}
      title="暂无数据"
      description="当前没有可显示的数据，请稍后再试或刷新页面。"
      actionLabel="刷新页面"
      onAction={onAction || (() => window.location.reload())}
    />
  );
}

export function EmptySearch({ onAction }: { onAction?: () => void }) {
  return (
    <StudioEmptyState
      icon={Search as LucideIcon}
      title="未找到结果"
      description="没有找到匹配的搜索结果，试试其他关键词吧。"
      actionLabel="清除搜索"
      onAction={onAction}
    />
  );
}
