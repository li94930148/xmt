import { useThemeStyles } from '../hooks/useThemeStyles';
import { Trash2, X, CheckCircle, RotateCcw } from 'lucide-react';

interface BatchActionsProps {
  selectedCount: number;
  onBatchDelete?: () => void;
  onBatchStatusChange?: (status: 'approved' | 'rejected') => void;
  onClearSelection: () => void;
}

export default function BatchActions({
  selectedCount,
  onBatchDelete,
  onBatchStatusChange,
  onClearSelection,
}: BatchActionsProps) {
  const styles = useThemeStyles();

  if (selectedCount === 0) return null;

  return (
    <div
      className={`fixed bottom-6 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-4 px-5 py-3 shadow-2xl animate-in slide-in-from-bottom-4 duration-200 ${styles.modal}`}
    >
      <div className="flex items-center gap-2">
        <CheckCircle className="w-4 h-4 text-[#5c7cfa]" />
        <span className={`text-sm font-medium ${styles.textPrimary}`}>
          已选择 <span className="text-[#5c7cfa]">{selectedCount}</span> 项
        </span>
      </div>

      <div className={`w-px h-5 border-l ${styles.divider}`} />

      {onBatchStatusChange ? (
        <>
          <button
            onClick={() => onBatchStatusChange('approved')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${styles.buttonSuccess}`}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            通过
          </button>
          <button
            onClick={() => onBatchStatusChange('rejected')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${styles.buttonDanger}`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            驳回
          </button>
        </>
      ) : null}

      {onBatchDelete ? (
        <button
          onClick={onBatchDelete}
          className="flex items-center gap-1.5 rounded-lg bg-[#ff6b6b]/10 px-3 py-1.5 text-xs font-medium text-[#ff6b6b] transition-colors hover:bg-[#ff6b6b]/20"
        >
          <Trash2 className="w-3.5 h-3.5" />
          删除
        </button>
      ) : null}

      <button
        onClick={onClearSelection}
        className={`rounded-lg p-1.5 transition-colors ${styles.hoverBg}`}
        title="取消选择"
      >
        <X className={`w-4 h-4 ${styles.textMuted}`} />
      </button>
    </div>
  );
}
