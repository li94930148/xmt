import { useThemeStyles } from '../hooks/useThemeStyles';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  total: number;
  limit: number;
  onChange: (page: number) => void;
}

export default function Pagination({ page, total, limit, onChange }: PaginationProps) {
  const styles = useThemeStyles();
  const totalPages = Math.ceil(total / limit) || 1;

  if (total <= limit) return null;

  return (
    <div className={`flex items-center justify-between px-4 py-3 border-t ${styles.divider}`}>
      <span className={`text-xs ${styles.textMuted}`}>
        共 {total} 条，第 {page}/{totalPages} 页
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(1)}
          disabled={page <= 1}
          className={`p-1.5 rounded-lg transition-colors ${styles.hoverBg} disabled:opacity-30 disabled:cursor-not-allowed`}
          title="首页"
        >
          <ChevronsLeft className={`w-4 h-4 ${styles.textMuted}`} />
        </button>
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className={`p-1.5 rounded-lg transition-colors ${styles.hoverBg} disabled:opacity-30 disabled:cursor-not-allowed`}
          title="上一页"
        >
          <ChevronLeft className={`w-4 h-4 ${styles.textMuted}`} />
        </button>

        {/* 页码按钮 */}
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          let pageNum: number;
          if (totalPages <= 5) {
            pageNum = i + 1;
          } else if (page <= 3) {
            pageNum = i + 1;
          } else if (page >= totalPages - 2) {
            pageNum = totalPages - 4 + i;
          } else {
            pageNum = page - 2 + i;
          }
          return (
            <button
              key={pageNum}
              onClick={() => onChange(pageNum)}
              className={`w-8 h-8 rounded-lg text-xs font-medium transition-all duration-200 ${
                pageNum === page
                  ? 'bg-[#5c7cfa] text-white shadow-sm shadow-[#5c7cfa]/20'
                  : `${styles.textMuted} ${styles.hoverBg}`
              }`}
            >
              {pageNum}
            </button>
          );
        })}

        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          className={`p-1.5 rounded-lg transition-colors ${styles.hoverBg} disabled:opacity-30 disabled:cursor-not-allowed`}
          title="下一页"
        >
          <ChevronRight className={`w-4 h-4 ${styles.textMuted}`} />
        </button>
        <button
          onClick={() => onChange(totalPages)}
          disabled={page >= totalPages}
          className={`p-1.5 rounded-lg transition-colors ${styles.hoverBg} disabled:opacity-30 disabled:cursor-not-allowed`}
          title="末页"
        >
          <ChevronsRight className={`w-4 h-4 ${styles.textMuted}`} />
        </button>
      </div>
    </div>
  );
}
