import type { ReactNode } from 'react';
import { AlertTriangle, FileQuestion, RefreshCw, ShieldAlert } from 'lucide-react';
import { useThemeStyles } from '../../hooks/useThemeStyles';
import AccessDeniedState from '../AccessDeniedState';

type ErrorVariant = 'error' | 'warning' | 'permission' | 'notFound';

interface ErrorStateProps {
  title?: ReactNode;
  description?: ReactNode;
  actionText?: string;
  onRetry?: () => void;
  variant?: ErrorVariant;
  className?: string;
}

const variantMap: Record<
  Exclude<ErrorVariant, 'permission'>,
  { icon: typeof AlertTriangle; iconClass: string; defaultTitle: string; defaultDescription: string }
> = {
  error: {
    icon: AlertTriangle,
    iconClass: 'bg-red-500/15 text-red-400',
    defaultTitle: '加载失败',
    defaultDescription: '当前内容暂时无法显示，请稍后重试。',
  },
  warning: {
    icon: ShieldAlert,
    iconClass: 'bg-amber-500/15 text-amber-400',
    defaultTitle: '暂时不可用',
    defaultDescription: '当前操作没有成功完成，请检查条件后重试。',
  },
  notFound: {
    icon: FileQuestion,
    iconClass: 'bg-slate-500/15 text-slate-300',
    defaultTitle: '未找到内容',
    defaultDescription: '你要查看的数据不存在，或已经被移除。',
  },
};

export default function ErrorState({
  title,
  description,
  actionText = '重试',
  onRetry,
  variant = 'error',
  className = '',
}: ErrorStateProps) {
  const styles = useThemeStyles();

  if (variant === 'permission') {
    return (
      <div className={className}>
        <AccessDeniedState
          title={typeof title === 'string' ? title : undefined}
          description={typeof description === 'string' ? description : undefined}
        />
      </div>
    );
  }

  const config = variantMap[variant];
  const Icon = config.icon;

  return (
    <div className={`flex min-h-[320px] items-center justify-center px-4 py-10 ${className}`.trim()}>
      <div className={`w-full max-w-xl rounded-[28px] p-8 text-center ${styles.card}`}>
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-3xl ${config.iconClass}`}>
          <Icon className="h-7 w-7" />
        </div>
        <h2 className={`mt-5 text-xl font-semibold ${styles.textPrimary}`}>
          {title || config.defaultTitle}
        </h2>
        <p className={`mx-auto mt-3 max-w-md text-sm leading-7 ${styles.textSecondary}`}>
          {description || config.defaultDescription}
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={`mx-auto mt-6 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm ${styles.buttonPrimary}`}
          >
            <RefreshCw className="h-4 w-4" />
            {actionText}
          </button>
        ) : null}
      </div>
    </div>
  );
}
