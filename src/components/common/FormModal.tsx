import type { ReactNode } from 'react';
import BaseModal from './BaseModal';
import { useThemeStyles } from '../../hooks/useThemeStyles';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

interface FormModalProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  submitText?: string;
  cancelText?: string;
  loading?: boolean;
  size?: ModalSize;
  onSubmit?: () => void | Promise<void>;
  onCancel: () => void;
  className?: string;
}

export default function FormModal({
  open,
  title,
  description,
  children,
  footer,
  submitText = '保存',
  cancelText = '取消',
  loading = false,
  size = 'md',
  onSubmit,
  onCancel,
  className = '',
}: FormModalProps) {
  const styles = useThemeStyles();

  const resolvedFooter =
    footer ||
    (onSubmit ? (
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
          onClick={() => void onSubmit()}
          disabled={loading}
          className={`flex-1 rounded-xl px-4 py-2.5 text-sm ${styles.buttonPrimary} disabled:opacity-60`}
        >
          {loading ? '提交中...' : submitText}
        </button>
      </div>
    ) : undefined);

  return (
    <BaseModal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      footer={resolvedFooter}
      size={size}
      className={className}
    >
      {children}
    </BaseModal>
  );
}
