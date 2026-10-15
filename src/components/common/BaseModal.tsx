import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
  closeOnEscape?: boolean;
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
  closeOnEscape = false,
  showCloseButton = true,
  className = '',
}: BaseModalProps) {
  const styles = useThemeStyles();
  const titleId = useId();

  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscapeKey);
    return () => window.removeEventListener('keydown', handleEscapeKey);
  }, [closeOnEscape, onClose, open]);

  if (!open) {
    return null;
  }

  return createPortal((
    <div
      className="xmt-overlay xmt-overlay-center px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : '对话框'}
      onClick={(event) => {
        if (!closeOnOverlayClick) {
          return;
        }
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={`studio-sheen xmt-panel-enter w-full ${sizeClassMap[size]} ${styles.modal} ${className}`.trim()}>
        {title || description || showCloseButton ? (
          <div className={`flex items-start justify-between gap-4 border-b px-6 py-5 ${styles.border}`}>
            <div className="min-w-0 flex-1">
              {title ? <h2 id={titleId} className={`text-xl font-bold ${styles.textPrimary}`}>{title}</h2> : null}
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

        <div className="max-h-[min(70vh,calc(100dvh-12rem))] overflow-y-auto px-6 py-5">{children}</div>

        {footer ? <div className={`border-t px-6 py-4 ${styles.border}`}>{footer}</div> : null}
      </div>
    </div>
  ), document.body);
}
