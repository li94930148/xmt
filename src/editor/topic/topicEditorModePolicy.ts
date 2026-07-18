/**
 * Topic editor mode is a page-level renderer policy. It intentionally has no
 * Runtime, permission, API, or persistence dependency.
 */
export type TopicEditorMode = 'runtime' | 'legacy';

/**
 * A named pilot cohort is still an explicit list of Topic IDs. It must not be
 * derived from user roles, workflow state, route parameters, or remote data.
 */
export type TopicEditorModeCohorts = Readonly<Record<string, readonly number[]>>;

/**
 * `runtime` is deliberately the only supported default. Legacy is an opt-in
 * fallback for an explicit, validated Topic ID scope.
 */
export interface TopicEditorModePolicy {
  readonly defaultMode: 'runtime';
  readonly legacyTopicIds?: readonly number[];
  readonly cohorts?: TopicEditorModeCohorts;
}

/** Default policy for future callers: no real Topic is opted into legacy. */
export const DEFAULT_TOPIC_EDITOR_MODE_POLICY: TopicEditorModePolicy = Object.freeze({
  defaultMode: 'runtime',
  legacyTopicIds: Object.freeze([]),
  cohorts: Object.freeze({}),
});

/**
 * A local development fixture may opt explicit test Topic IDs into the legacy
 * branch without changing the checked-in production policy. Invalid input is
 * deliberately ignored so the page remains runtime-first.
 */
export interface TopicEditorModeFixtureEnvironment {
  readonly development: boolean;
  readonly legacyFixtureTopicIds?: string | undefined;
}

export function resolveTopicEditorModeFixturePolicy(
  environment: TopicEditorModeFixtureEnvironment,
): TopicEditorModePolicy {
  if (!environment.development || !environment.legacyFixtureTopicIds?.trim()) {
    return DEFAULT_TOPIC_EDITOR_MODE_POLICY;
  }

  const ids = environment.legacyFixtureTopicIds
    .split(',')
    .map((value) => Number(value.trim()));

  if (!ids.length || !ids.every(isValidTopicId) || new Set(ids).size !== ids.length) {
    return DEFAULT_TOPIC_EDITOR_MODE_POLICY;
  }

  return Object.freeze({
    defaultMode: 'runtime' as const,
    legacyTopicIds: Object.freeze(ids),
    cohorts: Object.freeze({}),
  });
}

/** Production and ordinary development sessions both resolve to the empty policy. */
export function getCurrentTopicEditorModePolicy(): TopicEditorModePolicy {
  return resolveTopicEditorModeFixturePolicy({
    development: import.meta.env.DEV,
    legacyFixtureTopicIds: import.meta.env.VITE_TOPIC_LEGACY_FIXTURE_IDS,
  });
}

function isValidTopicId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function collectPolicyTopicIds(policy: unknown): readonly number[] | null {
  if (!policy || typeof policy !== 'object') return null;

  const candidate = policy as {
    defaultMode?: unknown;
    legacyTopicIds?: unknown;
    cohorts?: unknown;
  };

  if (candidate.defaultMode !== 'runtime') return null;

  const scopedIds: number[] = [];
  const addIds = (ids: unknown): boolean => {
    if (!Array.isArray(ids) || !ids.every(isValidTopicId)) return false;
    scopedIds.push(...ids);
    return true;
  };

  if (candidate.legacyTopicIds !== undefined && !addIds(candidate.legacyTopicIds)) return null;

  if (candidate.cohorts !== undefined) {
    if (!candidate.cohorts || typeof candidate.cohorts !== 'object' || Array.isArray(candidate.cohorts)) return null;
    for (const [name, ids] of Object.entries(candidate.cohorts as Record<string, unknown>)) {
      if (!name.trim() || !addIds(ids)) return null;
    }
  }

  const uniqueIds = new Set(scopedIds);
  return uniqueIds.size === scopedIds.length ? scopedIds : null;
}

/**
 * Resolves only a validated, explicit policy scope. Any malformed policy,
 * duplicate ID, invalid Topic ID, or absent policy fails safely to runtime.
 */
export function resolveTopicEditorMode(
  topicId: number,
  policy?: TopicEditorModePolicy | null,
): TopicEditorMode {
  if (!isValidTopicId(topicId)) return 'runtime';

  const scopedIds = collectPolicyTopicIds(policy);
  return scopedIds?.includes(topicId) ? 'legacy' : 'runtime';
}
