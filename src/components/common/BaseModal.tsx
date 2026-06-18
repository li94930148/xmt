import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useThemeStyles } from '../../hooks/useThemeStyles';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

interface BaseModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  closeOnOverlayClick?: boolean;
  showCloseButton?: boolean;
  className?: string;
}

const sizeClassMap: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export default function BaseModal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnOverlayClick = true,
  showCloseButton = true,
  className = '',
}: BaseModalProps) {
  const styles = useThemeStyles();

  if (!open) {
    return null;
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 py-6 ${styles.overlay}`}
      onClick={(event) => {
        if (!closeOnOverlayClick) {
          return;
        }
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={`w-full ${sizeClassMap[size]} ${styles.modal} ${className}`.trim()}>
        {title || description || showCloseButton ? (
          <div className={`flex items-start justify-between gap-4 border-b px-6 py-5 ${styles.border}`}>
            <div className="min-w-0 flex-1">
              {title ? <h2 className={`text-xl font-bold ${styles.textPrimary}`}>{title}</h2> : null}
              {description ? <p className={`mt-2 text-sm leading-6 ${styles.textSecondary}`}>{description}</p> : null}
            </div>

            {showCloseButton ? (
              <button
                type="button"
                onClick={onClose}
                className={`rounded-lg p-2 transition-colors ${styles.hoverBg}`}
                aria-label="关闭弹窗"
              >
                <X className={`h-5 w-5 ${styles.textMuted}`} />
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>

        {footer ? <div className={`border-t px-6 py-4 ${styles.border}`}>{footer}</div> : null}
      </div>
    </div>
  );
}
