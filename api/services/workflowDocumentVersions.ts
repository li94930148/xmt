import { beijingNow, queryAll } from '../database/utils';

export type WorkflowDocumentType = 'topic_outline' | 'shooting_script' | 'publishing_script';
export type WorkflowDocumentVersionAction = 'minor' | 'major';

export type WorkflowDocumentVersionRow = {
  id: number;
  document_type: WorkflowDocumentType;
  document_id: string;
  version: string;
  content: string;
  change_type: 'baseline' | WorkflowDocumentVersionAction;
  is_baseline: number;
  operator_id: number | null;
  operator_name: string | null;
  source_production_id: number | null;
  source_production_version: string | null;
  created_at: string | null;
};

type VersionTransaction = {
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  queryAll<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<number>;
  executeInsert(sql: string, params?: unknown[]): Promise<number>;
};

type WorkflowDocumentVersionDeleteExecutor = {
  execute(sql: string, params?: unknown[]): Promise<unknown>;
};

export type RecordWorkflowDocumentVersionInput = {
  documentType: WorkflowDocumentType;
  documentId: number | string;
  currentContent: string | null | undefined;
  nextContent: string;
  expectedContent: string;
  action: WorkflowDocumentVersionAction;
  operatorId: number | null | undefined;
  sourceProductionId?: number | null;
  sourceProductionVersion?: string | null;
};

export type RecordWorkflowDocumentVersionResult =
  | { ok: true; version: string }
  | { ok: false; reason: 'stale' };

type ExistingVersion = { version: string; is_baseline: number };

function nextVersion(existing: string | null, action: WorkflowDocumentVersionAction) {
  const match = existing?.match(/^v(\d+)\.(\d+)$/);
  if (!match) return 'v1.0';
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return action === 'major' ? `v${major + 1}.0` : `v${major}.${minor + 1}`;
}

export async function recordWorkflowDocumentVersion(
  tx: VersionTransaction,
  input: RecordWorkflowDocumentVersionInput,
): Promise<RecordWorkflowDocumentVersionResult> {
  const currentContent = input.currentContent ?? '';
  if (currentContent !== input.expectedContent) return { ok: false, reason: 'stale' };

  const key = [input.documentType, String(input.documentId)];
  const existing = await tx.queryAll<ExistingVersion>(
    `SELECT version,is_baseline FROM workflow_document_versions
     WHERE document_type=? AND document_id=? ORDER BY id ASC`,
    key,
  );
  const latestExplicit = [...existing].reverse().find((row) => Number(row.is_baseline) === 0)?.version ?? null;
  const now = beijingNow();

  if (existing.length === 0) {
    await tx.executeInsert(
      `INSERT INTO workflow_document_versions (
        document_type,document_id,version,content,change_type,is_baseline,operator_id,created_at
      ) VALUES (?,?, 'baseline', ?, 'baseline', 1, NULL, NULL)`,
      [input.documentType, String(input.documentId), currentContent],
    );
  }

  const version = nextVersion(latestExplicit, input.action);
  await tx.executeInsert(
    `INSERT INTO workflow_document_versions (
      document_type,document_id,version,content,change_type,is_baseline,operator_id,
      source_production_id,source_production_version,created_at
    ) VALUES (?,?,?,?,?,0,?,?,?,?)`,
    [
      input.documentType,
      String(input.documentId),
      version,
      input.nextContent,
      input.action,
      input.operatorId ?? null,
      input.sourceProductionId ?? null,
      input.sourceProductionVersion ?? null,
      now,
    ],
  );
  return { ok: true, version };
}

export async function listWorkflowDocumentVersions(documentType: WorkflowDocumentType, documentId: number | string) {
  return queryAll<WorkflowDocumentVersionRow>(
    `SELECT v.*,u.name AS operator_name
     FROM workflow_document_versions v
     LEFT JOIN users u ON u.id=v.operator_id
     WHERE v.document_type=? AND v.document_id=?
     ORDER BY v.is_baseline DESC,v.id DESC`,
    [documentType, String(documentId)],
  );
}

export async function deleteWorkflowDocumentVersionsForDocument(
  tx: WorkflowDocumentVersionDeleteExecutor,
  documentType: WorkflowDocumentType,
  documentId: number | string,
) {
  await tx.execute(
    'DELETE FROM workflow_document_versions WHERE document_type=? AND document_id=?',
    [documentType, String(documentId)],
  );
}

export async function deleteWorkflowDocumentVersionsForTopic(
  tx: WorkflowDocumentVersionDeleteExecutor,
  topicId: number | string,
) {
  await tx.execute(
    "DELETE FROM workflow_document_versions WHERE document_type='topic_outline' AND document_id=?",
    [String(topicId)],
  );
  await tx.execute(
    `DELETE FROM workflow_document_versions
     WHERE document_type='shooting_script'
       AND document_id IN (SELECT id FROM shooting WHERE topic_id=?)`,
    [topicId],
  );
  await tx.execute(
    `DELETE FROM workflow_document_versions
     WHERE document_type='publishing_script'
       AND document_id IN (SELECT id FROM publishing WHERE topic_id=?)`,
    [topicId],
  );
}
