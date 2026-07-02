export type DailyReportStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'archived';

export type DailyReportRiskLevel = 'normal' | 'warning' | 'blocked';

export type DailyReportSection = {
  key: string;
  title: string;
};

export type DailyReportItemInput = {
  sectionKey: string;
  title?: string;
  contentMd?: string;
  sourceType?: string;
  sourceId?: number | null;
  sortOrder?: number;
  meta?: Record<string, unknown> | null;
};

export type SaveDailyReportDraftInput = {
  reportDate?: string;
  version?: number;
  templateId?: number | null;
  manualSummaryMd?: string;
  riskLevel?: DailyReportRiskLevel;
  items?: DailyReportItemInput[];
};

export type ReviewDailyReportInput = {
  action: 'approve' | 'reject';
  comment?: string;
};

export type DailyReportListFilters = {
  reportDate?: string;
  status?: DailyReportStatus;
  userId?: number;
  start?: string;
  end?: string;
};
