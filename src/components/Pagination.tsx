import ActionButton from './studio/ActionButton';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  total: number;
  limit: number;
  onChange: (page: number) => void;
}

export default function Pagination({ page, total, limit, onChange }: PaginationProps) {
  const totalPages = Math.ceil(total / limit) || 1;

  if (total <= limit) return null;

  return (
    <nav aria-label="分页" className="flex flex-col gap-2 border-t border-studio-border-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs text-studio-text-secondary">
        共 {total} 条，第 {page}/{totalPages} 页
      </span>
      <div role="group" aria-label="分页控制" className="flex w-full items-center justify-center gap-0 sm:w-auto sm:justify-end sm:gap-1">
        <ActionButton
          type="button"
          onClick={() => onChange(1)}
          disabled={page <= 1}
          variant="ghost"
          className="hidden h-10 w-10 min-h-10 min-w-10 flex-none p-0 text-studio-text-secondary sm:inline-flex"
          title="首页"
          aria-label="首页"
        >
          <ChevronsLeft className="h-4 w-4" />
        </ActionButton>
        <ActionButton
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          variant="ghost"
          className="h-10 w-10 min-h-10 min-w-10 flex-none p-0 text-studio-text-secondary"
          title="上一页"
          aria-label="上一页"
        >
          <ChevronLeft className="h-4 w-4" />
        </ActionButton>

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
            <ActionButton
              key={pageNum}
              onClick={() => onChange(pageNum)}
              type="button"
              variant={pageNum === page ? 'primary' : 'ghost'}
              aria-label={`第 ${pageNum} 页`}
              aria-current={pageNum === page ? 'page' : undefined}
              className={`h-10 w-10 min-h-10 min-w-10 flex-none p-0 text-xs xmt-data-number ${
                Math.abs(pageNum - page) > 1 ? 'hidden sm:inline-flex' : ''
              } ${
                pageNum === page
                  ? 'bg-studio-primary-button text-white shadow-sm shadow-studio-primary/25'
                  : 'text-studio-text-secondary'
              }`}
            >
              {pageNum}
            </ActionButton>
          );
        })}

        <ActionButton
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          variant="ghost"
          className="h-10 w-10 min-h-10 min-w-10 flex-none p-0 text-studio-text-secondary"
          title="下一页"
          aria-label="下一页"
        >
          <ChevronRight className="h-4 w-4" />
        </ActionButton>
        <ActionButton
          type="button"
          onClick={() => onChange(totalPages)}
          disabled={page >= totalPages}
          variant="ghost"
          className="hidden h-10 w-10 min-h-10 min-w-10 flex-none p-0 text-studio-text-secondary sm:inline-flex"
          title="末页"
          aria-label="末页"
        >
          <ChevronsRight className="h-4 w-4" />
        </ActionButton>
      </div>
    </nav>
  );
}
