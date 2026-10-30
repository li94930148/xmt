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
  confirmDisabled?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  className?: string;
}

const variantConfig: Record<ConfirmVariant, { icon: typeof Trash2; iconClass: string; buttonClass: string }> = {
  danger: {
    icon: Trash2,
    iconClass: 'border border-studio-border-soft bg-studio-coral-soft text-studio-coral-contrast',
    buttonClass: 'xmt-btn xmt-btn-danger',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'border border-studio-border-soft bg-studio-amber-soft text-studio-amber-contrast',
    buttonClass: 'xmt-btn xmt-btn-warning',
  },
  default: {
    icon: ShieldAlert,
    iconClass: 'border border-studio-border-soft bg-studio-primary-soft text-studio-primary-contrast',
    buttonClass: 'xmt-btn xmt-btn-primary',
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
  confirmDisabled = false,
  onConfirm,
  onCancel,
  className = '',
}: ConfirmModalProps) {
  const styles = useThemeStyles();
  const config = variantConfig[variant];
  const Icon = config.icon;
  const handleCancel = () => {
    if (!loading) onCancel();
  };

  return (
    <BaseModal
      open={open}
      onClose={handleCancel}
      title={title}
      size="sm"
      className={className}
      closeOnOverlayClick={!loading}
      closeOnEscape={!loading}
      showCloseButton={!loading}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm disabled:opacity-60 ${styles.buttonSecondary}`}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={loading || confirmDisabled}
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
