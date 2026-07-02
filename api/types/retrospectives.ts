export type RetroTemplateCategory = 'weekly' | 'project' | 'channel' | 'topic' | 'daily' | 'custom';
export type RetroTemplateStatus = 'active' | 'disabled';
export type RetrospectiveScopeType = 'team' | 'project' | 'topic' | 'channel' | 'user' | 'daily_report' | 'custom';
export type RetrospectiveStatus = 'draft' | 'published' | 'archived';
export type RetroActionStatus = 'todo' | 'doing' | 'done' | 'cancelled';

export type CreateRetroTemplateInput = {
  name?: string;
  category?: RetroTemplateCategory;
  description?: string;
  schemaJson?: Record<string, unknown>;
  metricBindingsJson?: Record<string, unknown>;
};

export type RetrospectiveListFilters = {
  status?: RetrospectiveStatus;
  category?: RetroTemplateCategory;
  start?: string;
  end?: string;
  ownerId?: number;
};

export type CreateRetrospectiveInput = {
  templateId?: number | null;
  title?: string;
  scopeType?: RetrospectiveScopeType;
  scopeId?: number | null;
  periodStart?: string;
  periodEnd?: string;
  ownerId?: number | null;
};

export type UpdateRetrospectiveInput = {
  title?: string;
  summaryMd?: string;
  version?: number;
};

export type GenerateSnapshotInput = {
  mode?: 'replace';
};

export type CreateRetroActionInput = {
  title?: string;
  descriptionMd?: string;
  ownerId?: number | null;
  dueDate?: string | null;
};

export type UpdateRetroActionInput = {
  title?: string;
  descriptionMd?: string;
  ownerId?: number | null;
  dueDate?: string | null;
  status?: RetroActionStatus;
  resultMd?: string;
};
