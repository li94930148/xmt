import type { CreateTopicInput } from '../../shared/schema/topics.schema.js';
import { userHasPermission } from '../middleware/permissions.js';
import { getDouyinDashboard } from './douyinDataCenter.js';
import { resolveViewScope } from './creatorDataVisibility.js';
import { TopicServiceError, type TopicActor } from '../modules/topics/topics.types.js';
import type { CreatorTopicSuggestionLinkRecord } from '../modules/topics/topics.repository.js';

type Source = NonNullable<CreateTopicInput['creator_suggestion_source']>;

/** Re-resolve the account scope and current evidence immediately before topic creation. */
export async function resolveCreatorTopicSuggestionAttribution(
  actor: TopicActor,
  source: Source,
): Promise<CreatorTopicSuggestionLinkRecord> {
  if (!await userHasPermission(actor.id, 'creator:data:view')) {
    throw new TopicServiceError('TOPIC_FORBIDDEN', '当前账号无权读取该创作建议来源');
  }
  const scope = await resolveViewScope(actor.role, 'douyin', source.account_uid);
  if (!scope) throw new TopicServiceError('TOPIC_FORBIDDEN', '该抖音账号不在当前查看范围内');

  const dashboard = await getDouyinDashboard(scope.id);
  const item = dashboard?.topic_suggestions?.items.find(candidate => (
    candidate.id === source.suggestion_id && candidate.evidence_id === source.evidence_id
  ));
  if (!item) {
    throw new TopicServiceError('TOPIC_SUGGESTION_STALE', '创作建议样本已更新，请刷新依据后再提交选题');
  }

  return {
    creatorAccountId: scope.id,
    userId: actor.id,
    suggestionId: item.id,
    evidenceId: item.evidence_id,
    sampleCount: item.sample_count,
    baselineCount: item.baseline_count,
    medianPlays: item.median_plays,
    baselineMedianPlays: item.baseline_median_plays,
    playRatio: item.play_ratio,
  };
}
