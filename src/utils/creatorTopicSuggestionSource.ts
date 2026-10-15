export type CreatorTopicSuggestionSource = {
  account_uid: string;
  suggestion_id: string;
  evidence_id: string;
};

/** Only submit provenance when the user included its reference marker in the draft. */
export function creatorTopicSuggestionSourceFromDraft(search: string, projectBackground: string): CreatorTopicSuggestionSource | undefined {
  const params = new URLSearchParams(search);
  const accountUid = params.get('creatorAccount') || '';
  const suggestionId = params.get('creatorSuggestion') || '';
  const evidenceId = params.get('creatorEvidence') || '';
  if (!accountUid || accountUid.length > 256 || !/^[a-f0-9]{20}$/.test(suggestionId) || !/^[a-f0-9]{32}$/.test(evidenceId)) {
    return undefined;
  }
  const marker = `【创作数据参考 ${accountUid}/${suggestionId}】`;
  if (!projectBackground.includes(marker)) return undefined;
  return { account_uid: accountUid, suggestion_id: suggestionId, evidence_id: evidenceId };
}
