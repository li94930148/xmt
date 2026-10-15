import { ArrowRight, Sparkles, X } from 'lucide-react';
import { changelog } from '../data/changelog';

interface UpdateNotificationProps {
  onClose: () => void;
  onGoToChangelog: () => void;
}

export default function UpdateNotification({ onClose, onGoToChangelog }: UpdateNotificationProps) {
  const latestVersion = changelog[0];
  if (!latestVersion) return null;

  return (
    <aside
      role="status"
      aria-label="版本更新提示"
      aria-live="polite"
      className="studio-sheen rounded-card border border-studio-border-soft bg-studio-surface-glass shadow-card backdrop-blur-xl"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-studio-primary-soft text-studio-primary-contrast">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-studio-text-muted">
              版本更新 <span className="ml-1 text-studio-text-secondary">v{latestVersion.version}</span>
            </p>
            <p className="truncate text-sm font-medium text-studio-text-primary">{latestVersion.title}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onGoToChangelog();
            }}
            className="xmt-btn xmt-btn-secondary px-3 py-2 text-xs"
          >
            查看更新说明
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-button text-studio-text-muted transition-colors hover:bg-studio-surface-soft hover:text-studio-text-primary"
            aria-label="关闭更新提示"
            title="关闭更新提示"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
}
