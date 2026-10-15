import { parseStoredBjt } from '@shared/time';

export type WorkflowScriptSourceCandidate = {
  id?: number | null;
  version?: string | null;
};

export type WorkflowScriptSourceVersionTime = {
  version_timestamp?: string | null;
  created_at?: string | null;
};

export function workflowScriptSourceTimestamp(source: WorkflowScriptSourceVersionTime | null | undefined) {
  const versionTimestamp = parseStoredBjt(source?.version_timestamp)?.getTime();
  if (versionTimestamp !== undefined && versionTimestamp !== null) return versionTimestamp;
  return parseStoredBjt(source?.created_at)?.getTime() ?? null;
}

export type WorkflowScriptSourceReferenceFields = {
  script_source_production_id?: number;
  script_source_version?: string;
};

export function workflowScriptSourceReference(
  scriptContent: string | null | undefined,
  storedSource: WorkflowScriptSourceCandidate | null | undefined,
  fallbackSource: WorkflowScriptSourceCandidate | null | undefined,
): WorkflowScriptSourceReferenceFields {
  if (storedSource?.id && storedSource.version) {
    return { script_source_production_id: storedSource.id, script_source_version: storedSource.version };
  }
  if (scriptContent === null || scriptContent === undefined) {
    if (fallbackSource?.id && fallbackSource.version) {
      return { script_source_production_id: fallbackSource.id, script_source_version: fallbackSource.version };
    }
  }
  return {};
}

export function workflowScriptSourceLabel(
  scriptContent: string | null | undefined,
  sourceVersion: string | null | undefined,
  fallbackVersion: string | null | undefined,
) {
  if (scriptContent !== null && scriptContent !== undefined) {
    return sourceVersion ? `本地衍生自创作 ${sourceVersion}` : '本地剧本来源未记录';
  }
  return fallbackVersion ? `引用创作稿 ${fallbackVersion}` : '暂无可引用创作稿';
}
