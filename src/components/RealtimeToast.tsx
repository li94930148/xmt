import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { notifyDesktop } from '../utils/notification';

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

  // 同时触发桌面通知
  const textContent = typeof item.message === 'string' ? item.message : '';
  notifyDesktop({
    title: typeof item.title === 'string' ? item.title : '新通知',
    body: textContent,
    tag: id,
  });
}

export default function RealtimeToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const styles = useThemeStyles();

  useEffect(() => {
    toastListener = (item) => {
      setToasts((prev) => [...prev, item]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== item.id));
      }, 4000);
    };
    return () => { toastListener = null; };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border pointer-events-auto
            animate-slide-in ${styles.bgSecondary} ${styles.border}`}
        >
          {toast.icon && <span className="flex-shrink-0">{toast.icon}</span>}
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-medium ${styles.textPrimary} truncate`}>{toast.title}</p>
            <p className={`text-xs ${styles.textMuted} truncate`}>{toast.message}</p>
          </div>
          <button
            onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
            className={`flex-shrink-0 ${styles.textMuted} hover:${styles.textPrimary}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
