import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { DailyReport } from '../../api/dailyReports';
import { useModalLifecycle } from '../common/useModalLifecycle';

export default function DailyReportDetailDrawer({ report, onClose }: { report: DailyReport | null; onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const labelId = useId();
  useModalLifecycle(Boolean(report), overlayRef, onClose, true);

  if (!report) return null;
  const memberName = report.userName || report.username || `成员 ${report.userId}`;

  return createPortal((
    <div ref={overlayRef} className="fixed inset-0 z-modal" data-testid="daily-report-detail-overlay">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        data-testid="daily-report-detail-backdrop"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${labelId} ${titleId}`}
        tabIndex={-1}
        className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col border-l border-studio-border-soft bg-studio-surface text-studio-text-primary shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-studio-border-soft px-5 py-4">
          <div className="min-w-0">
            <p id={labelId} className="text-sm text-studio-text-muted">日报详情</p>
            <h2 id={titleId} className="mt-1 break-words text-xl font-semibold">{memberName}</h2>
            <p className="mt-2 text-sm text-studio-text-muted">{report.reportDate}</p>
          </div>
          <button
            type="button"
            data-modal-autofocus=""
            onClick={onClose}
            className="xmt-btn xmt-btn-ghost h-10 w-10 shrink-0 !p-0"
            aria-label="关闭日报详情"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {report.items.map((item) => (
            <section key={item.sectionKey} className="rounded-card border border-studio-border-soft bg-studio-surface-soft p-4">
              <h3 className="text-sm font-semibold">{item.title || item.sectionKey}</h3>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-studio-text-secondary">
                {item.contentMd || '未填写内容'}
              </p>
            </section>
          ))}
        </div>
      </aside>
    </div>
  ), document.body);
}
