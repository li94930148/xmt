export interface ArchiveScriptSourceIdentity {
  topic_id: number;
  production_id: number;
  version: string;
}

export interface ArchiveScriptSourceReference {
  topic_id: number;
  production_id: number | null;
  version: string | null;
}

export function findUniqueArchiveScriptSourceSnapshot<T extends ArchiveScriptSourceIdentity>(
  snapshots: readonly T[],
  source: ArchiveScriptSourceReference,
) {
  const matches = snapshots.filter((snapshot) => snapshot.topic_id === source.topic_id
    && snapshot.production_id === source.production_id
    && snapshot.version === source.version);
  return matches.length === 1 ? matches[0] : undefined;
}
