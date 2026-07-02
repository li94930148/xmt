import { X } from 'lucide-react';
import type { DailyReport } from '../../api/dailyReports';
import { ActionButton } from '../studio';
import { DailyReportRiskPill, DailyReportStatusPill } from './DailyReportStatusPill';

type DailyReportDetailDrawerProps = {
  report: DailyReport | null;
  sections: Array<{ key: string; title: string }>;
  canReview: boolean;
  onClose: () => void;
  onReview: (report: DailyReport) => void;
};

function getSourceRows(report: DailyReport) {
  const sources = report.autoSummary?.sources;
  return Array.isArray(sources) ? sources as Array<Record<string, unknown>> : [];
}

function formatName(report: DailyReport) {
  return report.userName || report.username || `User ${report.userId}`;
}

export default function DailyReportDetailDrawer({
  report,
  sections,
  canReview,
  onClose,
  onReview,
}: DailyReportDetailDrawerProps) {
  if (!report) {
    return null;
  }

  const sources = getSourceRows(report);

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close detail drawer"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-3xl flex-col border-l border-studio-border-soft bg-studio-surface text-studio-text-primary shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-studio-border-soft px-5 py-4">
          <div>
            <p className="text-sm text-studio-text-muted">Daily report detail</p>
            <h2 className="mt-1 text-xl font-semibold">{formatName(report)}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-studio-text-secondary">{report.reportDate}</span>
              <DailyReportStatusPill status={report.status} />
              <DailyReportRiskPill risk={report.riskLevel} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-button border border-studio-border-soft p-2 text-studio-text-muted transition hover:bg-white/[0.06] hover:text-studio-text-primary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <Info label="Submitted" value={report.submittedAt || '-'} />
            <Info label="Reviewed" value={report.reviewedAt || '-'} />
            <Info label="Reviewer" value={report.reviewerName || report.reviewerUsername || (report.reviewedBy ? `#${report.reviewedBy}` : '-')} />
            <Info label="Review comment" value={report.reviewComment || '-'} />
          </div>

          <section className="mt-5 rounded-card border border-studio-border-soft bg-white/[0.035] p-4">
            <h3 className="text-sm font-semibold text-studio-text-primary">Manual summary</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-studio-text-secondary">
              {report.manualSummaryMd || '-'}
            </p>
          </section>

          <div className="mt-5 space-y-4">
            {sections.map((section) => {
              const item = report.items.find((entry) => entry.sectionKey === section.key);
              return (
                <section key={section.key} className="rounded-card border border-studio-border-soft bg-white/[0.035] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-studio-text-primary">{section.title}</h3>
                    {item?.sourceType ? (
                      <span className="rounded-full border border-studio-border-soft px-2 py-1 text-xs text-studio-text-muted">
                        {item.sourceType} #{item.sourceId || '-'}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-studio-text-secondary">
                    {item?.contentMd || '-'}
                  </p>
                </section>
              );
            })}
          </div>

          <section className="mt-5 rounded-card border border-studio-border-soft bg-white/[0.035] p-4">
            <h3 className="text-sm font-semibold text-studio-text-primary">Auto sources</h3>
            {sources.length === 0 ? (
              <p className="mt-2 text-sm text-studio-text-muted">No auto sources recorded.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {sources.map((source, index) => (
                  <div key={`${String(source.sourceType || 'source')}-${String(source.sourceId || index)}`} className="rounded-card border border-studio-border-soft p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-studio-text-primary">{String(source.title || 'Untitled source')}</span>
                      <span className="text-xs text-studio-text-muted">{String(source.sourceType || 'unknown')} #{String(source.sourceId || '-')}</span>
                    </div>
                    {source.updatedAt ? (
                      <p className="mt-1 text-xs text-studio-text-muted">Updated: {String(source.updatedAt)}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-studio-border-soft px-5 py-4">
          <ActionButton onClick={onClose}>Close</ActionButton>
          {canReview && report.status === 'submitted' ? (
            <ActionButton variant="primary" onClick={() => onReview(report)}>
              Review
            </ActionButton>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-studio-border-soft bg-white/[0.035] p-3">
      <p className="text-xs text-studio-text-muted">{label}</p>
      <p className="mt-1 break-words text-sm text-studio-text-secondary">{value}</p>
    </div>
  );
}
