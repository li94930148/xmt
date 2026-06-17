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
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] ${styles.modal} px-5 py-3 flex items-center gap-4 shadow-2xl animate-in slide-in-from-bottom-4 duration-200`}
    >
      <div className="flex items-center gap-2">
        <CheckCircle className="w-4 h-4 text-[#5c7cfa]" />
        <span className={`text-sm font-medium ${styles.textPrimary}`}>
          已选择 <span className="text-[#5c7cfa]">{selectedCount}</span> 项
        </span>
      </div>

      <div className={`w-px h-5 ${styles.divider} border-l`} />

      {onBatchStatusChange && (
        <>
          <button
            onClick={() => onBatchStatusChange('approved')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg ${styles.buttonSuccess} transition-colors`}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            通过
          </button>
          <button
            onClick={() => onBatchStatusChange('rejected')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg ${styles.buttonDanger} transition-colors`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            驳回
          </button>
        </>
      )}

      {onBatchDelete && (
        <button
          onClick={onBatchDelete}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#ff6b6b]/10 text-[#ff6b6b] hover:bg-[#ff6b6b]/20 transition-colors`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          删除
        </button>
      )}

      <button
        onClick={onClearSelection}
        className={`p-1.5 rounded-lg ${styles.hoverBg} transition-colors`}
        title="取消选择"
      >
        <X className={`w-4 h-4 ${styles.textMuted}`} />
      </button>
    </div>
  );
}
