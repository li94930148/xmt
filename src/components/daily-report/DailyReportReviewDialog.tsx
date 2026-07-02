import { useState } from 'react';
import type { DailyReport } from '../../api/dailyReports';
import { ActionButton } from '../studio';

type DailyReportReviewDialogProps = {
  report: DailyReport | null;
  loading: boolean;
  onClose: () => void;
  onReview: (action: 'approve' | 'reject', comment: string) => void;
};

export default function DailyReportReviewDialog({ report, loading, onClose, onReview }: DailyReportReviewDialogProps) {
  const [comment, setComment] = useState('');

  if (!report) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-panel border border-studio-border-soft bg-studio-surface p-5 shadow-2xl">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-studio-text-primary">审核日报</h2>
          <p className="mt-1 text-sm text-studio-text-muted">
            {report.userName || report.username || `用户 ${report.userId}`} · {report.reportDate}
          </p>
        </div>
        <div className="mb-4 max-h-72 overflow-y-auto rounded-card border border-studio-border-soft bg-white/[0.04] p-4">
          <p className="whitespace-pre-wrap text-sm leading-6 text-studio-text-primary">
            {report.manualSummaryMd || report.items.map((item) => item.contentMd).filter(Boolean).join('\n\n') || '暂无内容'}
          </p>
        </div>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={4}
          className="w-full rounded-card border border-studio-border-soft bg-white/[0.04] px-4 py-3 text-sm text-studio-text-primary outline-none focus:border-studio-border-active"
          placeholder="填写审核意见，可留空"
        />
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <ActionButton onClick={onClose}>取消</ActionButton>
          <ActionButton onClick={() => onReview('reject', comment)} disabled={loading} className="border-studio-coral/35 text-[#FFC2CC] hover:bg-studio-coral/10">
            退回修改
          </ActionButton>
          <ActionButton onClick={() => onReview('approve', comment)} disabled={loading} variant="primary">
            审核通过
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
