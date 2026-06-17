import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useThemeStyles } from '../../hooks/useThemeStyles';

type BackButtonConfig = {
  to?: string;
  onClick?: () => void;
  label?: string;
};

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  backButton?: boolean | BackButtonConfig;
  actions?: ReactNode;
  extra?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export default function PageHeader({
  title,
  description,
  backButton,
  actions,
  extra,
  children,
  className = '',
}: PageHeaderProps) {
  const styles = useThemeStyles();
  const navigate = useNavigate();

  const resolvedBackButton =
    backButton === true
      ? {}
      : backButton && typeof backButton === 'object'
        ? backButton
        : null;

  const handleBack = () => {
    if (!resolvedBackButton) {
      return;
    }

    if (resolvedBackButton.onClick) {
      resolvedBackButton.onClick();
      return;
    }

    if (resolvedBackButton.to) {
      navigate(resolvedBackButton.to);
      return;
    }

    navigate(-1);
  };

  return (
    <div className={`space-y-4 ${className}`.trim()}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            {resolvedBackButton && (
              <button
                type="button"
                onClick={handleBack}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${styles.buttonSecondary}`}
              >
                <ArrowLeft className="h-4 w-4" />
                <span>{resolvedBackButton.label || '返回'}</span>
              </button>
            )}
            <div className="min-w-0">
              <h1 className={styles.pageTitle}>{title}</h1>
              {description ? <p className={`${styles.subtitle} mt-1`}>{description}</p> : null}
            </div>
          </div>
          {extra ? <div className="mt-3">{extra}</div> : null}
        </div>

        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>

      {children ? <div>{children}</div> : null}
    </div>
  );
}
