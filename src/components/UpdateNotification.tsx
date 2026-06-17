import { useState, useEffect } from 'react';
import { X, Sparkles, ArrowRight } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { changelog, getChangeTypeLabel, getChangeTypeColor } from '../data/changelog';

// 声明全局变量
declare const __APP_VERSION__: string;

interface UpdateNotificationProps {
  onClose: () => void;
  onGoToChangelog: () => void;
}

export default function UpdateNotification({ onClose, onGoToChangelog }: UpdateNotificationProps) {
  const styles = useThemeStyles();
  const [isVisible, setIsVisible] = useState(false);

  // 动画效果
  useEffect(() => {
    setTimeout(() => setIsVisible(true), 100);
  }, []);

  const latestVersion = changelog[0];
  if (!latestVersion) return null;

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  return (
    <div
      className={`fixed inset-0 z-[300] flex items-center justify-center p-4 transition-all duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={handleClose}
    >
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* 弹窗内容 */}
      <div
        className={`relative w-full max-w-lg ${styles.card} rounded-2xl shadow-2xl overflow-hidden transform transition-all duration-300 ${
          isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部装饰 */}
        <div className="relative h-32 bg-gradient-to-br from-[#5c7cfa] to-[#748ffc] overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMjAgMjBjMC01LjUyMyA0LjQ3Ny0xMCAxMC0xMHYtMkMxNC40NzcgOCA4IDE0LjQ3OCA4IDIwaDEyem0tMTAgMTBjLTUuNTIzIDAtMTAtNC40NzctMTAtMTBoLTJjMCA2LjYyNyA1LjM3MyAxMiAxMiAxMnYtMnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30" />
          <div className="absolute bottom-4 left-6 flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-white/80 text-sm font-medium">系统更新</p>
              <h2 className="text-white text-2xl font-bold">v{latestVersion.version}</h2>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center hover:bg-white/30 transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="p-6 max-h-[400px] overflow-y-auto">
          <h3 className={`text-lg font-semibold ${styles.textPrimary} mb-2`}>
            {latestVersion.title}
          </h3>
          <p className={`text-sm ${styles.textMuted} mb-4`}>
            发布日期：{latestVersion.date}
          </p>

          {/* 更新内容列表 */}
          <div className="space-y-3">
            {latestVersion.changes.slice(0, 6).map((change, index) => (
              <div key={index} className="flex items-start gap-3">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getChangeTypeColor(
                    change.type
                  )}`}
                >
                  {getChangeTypeLabel(change.type)}
                </span>
                <p className={`text-sm ${styles.textSecondary} flex-1`}>
                  {change.description}
                </p>
              </div>
            ))}
            {latestVersion.changes.length > 6 && (
              <p className={`text-sm ${styles.textMuted} pl-2`}>
                ...还有 {latestVersion.changes.length - 6} 项更新
              </p>
            )}
          </div>
        </div>

        {/* 底部按钮 */}
        <div className={`p-6 border-t ${styles.border} flex gap-3`}>
          <button
            onClick={handleClose}
            className={`flex-1 px-4 py-2.5 rounded-xl ${styles.buttonSecondary} text-sm font-medium transition-colors`}
          >
            我知道了
          </button>
          <button
            onClick={() => {
              handleClose();
              onGoToChangelog();
            }}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[#5c7cfa] text-white text-sm font-medium hover:bg-[#4263eb] transition-colors flex items-center justify-center gap-2"
          >
            查看完整更新日志
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
