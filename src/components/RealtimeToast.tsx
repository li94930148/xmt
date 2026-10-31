import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';

interface ToastItem {
  id: string;
  title: string;
  message: string;
  icon?: React.ReactNode;
}

let toastListener: ((item: ToastItem) => void) | null = null;

/** 全局触发 Toast（任何地方调用即可） */
export function showRealtimeToast(item: Omit<ToastItem, 'id'>) {
  const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  toastListener?.({ ...item, id });
}

export default function RealtimeToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [announcement, setAnnouncement] = useState<ToastItem | null>(null);
  const styles = useThemeStyles();

  useEffect(() => {
    toastListener = (item) => {
      setToasts((prev) => [...prev, item]);
      setAnnouncement(item);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== item.id));
      }, 4000);
    };
    return () => { toastListener = null; };
  }, []);

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement ? <span key={announcement.id}>{announcement.title}。{announcement.message}</span> : null}
      </div>
      {toasts.length > 0 ? (
        <div className="pointer-events-none fixed bottom-4 right-4 z-notification space-y-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg
                animate-slide-in ${styles.bgSecondary} ${styles.border}`}
            >
              {toast.icon && <span className="flex-shrink-0">{toast.icon}</span>}
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-medium ${styles.textPrimary}`}>{toast.title}</p>
                <p className={`truncate text-xs ${styles.textMuted}`}>{toast.message}</p>
              </div>
              <button
                type="button"
                aria-label={`关闭通知：${toast.title}`}
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className={`xmt-btn xmt-btn-ghost h-10 w-10 flex-shrink-0 p-0 ${styles.focusRing}`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
