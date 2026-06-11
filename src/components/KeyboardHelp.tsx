import { useThemeStyles } from '../hooks/useThemeStyles';
import { X } from 'lucide-react';

interface KeyboardHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

const shortcuts = [
  { keys: ['Ctrl', 'K'], description: '打开全局搜索' },
  { keys: ['?'], description: '显示快捷键帮助' },
  { keys: ['ESC'], description: '关闭弹窗 / 取消操作' },
];

export default function KeyboardHelp({ isOpen, onClose }: KeyboardHelpProps) {
  const styles = useThemeStyles();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" onClick={onClose}>
      <div
        className={`${styles.modal} w-full max-w-md mx-4 p-6 animate-in fade-in zoom-in-95 duration-150`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className={`text-lg font-bold ${styles.textPrimary}`}>键盘快捷键</h2>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg ${styles.hoverBg} transition-colors`}
          >
            <X className={`w-4 h-4 ${styles.textMuted}`} />
          </button>
        </div>

        <div className="space-y-3">
          {shortcuts.map((shortcut, index) => (
            <div
              key={index}
              className={`flex items-center justify-between py-2.5 px-3 rounded-lg ${
                styles.isDark ? 'bg-[#1e2030]' : 'bg-[#f8f9fa]'
              }`}
            >
              <span className={`text-sm ${styles.textPrimary}`}>{shortcut.description}</span>
              <div className="flex items-center gap-1">
                {shortcut.keys.map((key, ki) => (
                  <span key={ki}>
                    <kbd
                      className={`px-2 py-1 text-xs font-mono rounded-md ${styles.bgTertiary} ${styles.textSecondary} border ${styles.border}`}
                    >
                      {key}
                    </kbd>
                    {ki < shortcut.keys.length - 1 && (
                      <span className={`mx-0.5 text-xs ${styles.textMuted}`}>+</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className={`text-xs ${styles.textMuted} mt-4 text-center`}>
          在任意页面按下对应快捷键即可触发
        </p>
      </div>
    </div>
  );
}
