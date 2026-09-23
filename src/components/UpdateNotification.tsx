import { X, Sparkles, ArrowRight } from 'lucide-react';
import { changelog, getChangeTypeLabel, getChangeTypeColor } from '../data/changelog';

// 声明全局变量
declare const __APP_VERSION__: string;

interface UpdateNotificationProps {
  onClose: () => void;
  onGoToChangelog: () => void;
}

export default function UpdateNotification({ onClose, onGoToChangelog }: UpdateNotificationProps) {
  const latestVersion = changelog[0];
  if (!latestVersion) return null;

  const handleClose = () => onClose();

  return (
    <div
      className="xmt-overlay xmt-overlay-center z-[300]"
      onClick={handleClose}
    >

      {/* 弹窗内容 */}
      <div
        className="studio-sheen xmt-panel-enter relative w-full max-w-lg overflow-hidden rounded-panel border border-studio-border-soft bg-studio-surface-glass shadow-floating backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部装饰 */}
        <div className="relative h-36 overflow-hidden bg-gradient-to-br from-studio-primary via-studio-violet to-studio-cyan">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMjAgMjBjMC01LjUyMyA0LjQ3Ny0xMCAxMC0xMHYtMkMxNC40NzcgOCA4IDE0LjQ3OCA4IDIwaDEyem0tMTAgMTBjLTUuNTIzIDAtMTAtNC40NzctMTAtMTBoLTJjMCA2LjYyNyA1LjM3MyAxMiAxMiAxMnYtMnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30" />
          <div className="absolute bottom-4 left-6 flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75">系统更新 · System Update</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">
                v{latestVersion.version}
              </h2>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-white transition-colors hover:bg-white/25"
            aria-label="关闭更新提示"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="absolute right-14 top-5 rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-white/90 backdrop-blur-sm">
            {__APP_VERSION__ ? `当前 v${__APP_VERSION__}` : '已更新'}
          </div>
        </div>

        {/* 内容区域 */}
        <div className="p-6 max-h-[400px] overflow-y-auto">
          <h3 className="mb-2 text-lg font-semibold tracking-tight text-studio-text-primary">
            {latestVersion.title}
          </h3>
          <p className="mb-4 text-sm text-studio-text-muted">
            发布日期：{latestVersion.date}
          </p>

          {latestVersion.impactScope?.length ? (
            <div className="mb-5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-studio-text-muted">影响范围</p>
              <div className="flex flex-wrap gap-2">
                {latestVersion.impactScope.map((scope) => (
                  <span key={scope} className="rounded-full border border-studio-border-soft bg-studio-surface-soft/50 px-2.5 py-1 text-xs text-studio-text-secondary">
                    {scope}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

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
                <p className="flex-1 text-sm leading-relaxed text-studio-text-secondary">
                  {change.description}
                </p>
              </div>
            ))}
            {latestVersion.changes.length > 6 && (
              <p className="pl-2 text-sm text-studio-text-muted">
                ...还有 {latestVersion.changes.length - 6} 项更新
              </p>
            )}
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex gap-3 border-t border-studio-border-soft p-6">
          <button
            onClick={handleClose}
            className="xmt-btn xmt-btn-secondary flex-1 text-sm"
          >
            我知道了
          </button>
          <button
            onClick={() => {
              handleClose();
              onGoToChangelog();
            }}
            className="xmt-btn xmt-btn-primary flex-1 text-sm"
          >
            查看完整更新日志
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
