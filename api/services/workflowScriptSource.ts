import { queryOne } from '../database/utils';

export type WorkflowScriptSourceReference = {
  productionId: number;
  version: string;
};

export type WorkflowScriptSourceReferenceParse =
  | { kind: 'omitted' }
  | { kind: 'invalid' }
  | { kind: 'valid'; reference: WorkflowScriptSourceReference };

export type WorkflowScriptSourceProduction = {
  id: number;
  version: string;
  content: string;
  content_markdown?: string | null;
  status: string;
  created_at: string;
  version_timestamp: string;
  operator_name?: string | null;
};

export function parseWorkflowScriptSourceReference(body: Record<string, unknown>): WorkflowScriptSourceReferenceParse {
  const idValue = body.script_source_production_id;
  const versionValue = body.script_source_version;
  if (idValue === undefined && versionValue === undefined) return { kind: 'omitted' };

  const productionId = Number(idValue);
  const version = typeof versionValue === 'string' ? versionValue.trim() : '';
  if (!Number.isSafeInteger(productionId) || productionId <= 0 || !version || version.length > 64) {
    return { kind: 'invalid' };
  }
  return { kind: 'valid', reference: { productionId, version } };
}

export async function isApprovedWorkflowScriptSource(topicId: number, reference: WorkflowScriptSourceReference) {
  const row = await queryOne<{ found: number }>(
    `SELECT 1 AS found
     FROM production p
     WHERE p.id=? AND p.topic_id=? AND (
       (p.version=? AND p.status='approved')
       OR EXISTS (
         SELECT 1 FROM production_history ph
         WHERE ph.production_id=p.id AND ph.version=? AND ph.status='approved'
       )
     )
     LIMIT 1`,
    [reference.productionId, topicId, reference.version, reference.version],
  );
  return Boolean(row);
}

export async function getApprovedWorkflowScriptSource(topicId: number, reference: WorkflowScriptSourceReference) {
  return queryOne<WorkflowScriptSourceProduction>(
    `SELECT p.id,
            CASE WHEN p.version=? THEN p.version ELSE ph.version END AS version,
            CASE WHEN p.version=? THEN p.content ELSE ph.content END AS content,
            CASE WHEN p.version=? THEN p.content_markdown ELSE ph.content_markdown END AS content_markdown,
            CASE WHEN p.version=? THEN p.status ELSE ph.status END AS status,
            CASE WHEN p.version=? THEN p.created_at ELSE ph.created_at END AS created_at,
            CASE WHEN p.version=? THEN COALESCE(p.updated_at,p.created_at) ELSE ph.created_at END AS version_timestamp,
            u.name AS operator_name
     FROM production p
     LEFT JOIN production_history ph ON ph.production_id=p.id AND ph.version=?
     LEFT JOIN users u ON u.id=CASE WHEN p.version=? THEN p.operator_id ELSE ph.operator_id END
     WHERE p.id=? AND p.topic_id=? AND (
       (p.version=? AND p.status='approved')
       OR (ph.version=? AND ph.status='approved')
     )
     LIMIT 1`,
    [
      reference.version,
      reference.version,
      reference.version,
      reference.version,
      reference.version,
      reference.version,
      reference.version,
      reference.version,
      reference.productionId,
      topicId,
      reference.version,
      reference.version,
    ],
  );
}
