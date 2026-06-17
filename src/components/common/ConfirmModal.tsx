import type { ReactNode } from 'react';
import { AlertTriangle, ShieldAlert, Trash2 } from 'lucide-react';
import BaseModal from './BaseModal';
import { useThemeStyles } from '../../hooks/useThemeStyles';

type ConfirmVariant = 'danger' | 'warning' | 'default';

interface ConfirmModalProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  className?: string;
}

const variantConfig: Record<ConfirmVariant, { icon: typeof Trash2; iconClass: string; buttonClass: string }> = {
  danger: {
    icon: Trash2,
    iconClass: 'bg-red-500/15 text-red-400',
    buttonClass: 'bg-red-600 hover:bg-red-700 text-white',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'bg-amber-500/15 text-amber-400',
    buttonClass: 'bg-amber-500 hover:bg-amber-400 text-black',
  },
  default: {
    icon: ShieldAlert,
    iconClass: 'bg-brand-500/15 text-brand-500',
    buttonClass: 'bg-brand-500 hover:bg-brand-400 text-white',
  },
};

export default function ConfirmModal({
  open,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'default',
  loading = false,
  onConfirm,
  onCancel,
  className = '',
}: ConfirmModalProps) {
  const styles = useThemeStyles();
  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <BaseModal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      className={className}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm ${styles.buttonSecondary}`}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={loading}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm transition-colors disabled:opacity-60 ${config.buttonClass}`}
          >
            {loading ? '处理中...' : confirmText}
          </button>
        </div>
      }
    >
      <div className="flex items-start gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${config.iconClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className={`text-sm leading-6 ${styles.textSecondary}`}>
          {description || '请确认是否继续执行该操作。'}
        </div>
      </div>
    </BaseModal>
  );
}
