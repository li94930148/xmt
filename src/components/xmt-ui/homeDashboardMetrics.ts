import type { Production, Publishing, Topic } from '@/types';

const TOPIC_STAGE_SCORE: Record<string, number> = {
  pending: 0,
  rejected: 0,
  approved: 25,
  production: 45,
  shooting: 65,
  publishing: 80,
  completed: 100,
};

const isPublished = (status: string) => status === 'published' || status === 'completed';

export type HomeDashboardMetrics = {
  pendingTopics: number;
  inProduction: number;
  toPublish: number;
  completedContent: number;
  productionIndex: number;
};

export function buildHomeDashboardMetrics(
  topics: Topic[],
  productions: Production[],
  publishing: Publishing[],
): HomeDashboardMetrics {
  const stages = new Map<number, number>();
  const advance = (topicId: number, score: number) => {
    stages.set(topicId, Math.max(stages.get(topicId) || 0, score));
  };

  for (const topic of topics) advance(topic.id, TOPIC_STAGE_SCORE[topic.status] || 0);
  for (const item of productions) advance(item.topic_id, item.status === 'approved' ? 65 : 45);
  for (const item of publishing) advance(item.topic_id, isPublished(item.status) ? 100 : 80);

  const activeProductionTopics = new Set([
    ...topics.filter((topic) => topic.status === 'production').map((topic) => topic.id),
    ...productions.filter((item) => item.status !== 'approved').map((item) => item.topic_id),
  ]);
  const pendingPublishingTopics = new Set([
    ...topics.filter((topic) => topic.status === 'publishing').map((topic) => topic.id),
    ...publishing.filter((item) => !isPublished(item.status)).map((item) => item.topic_id),
  ]);
  const completedTopics = new Set([
    ...topics.filter((topic) => topic.status === 'completed').map((topic) => topic.id),
    ...productions.filter((item) => item.status === 'approved').map((item) => item.topic_id),
    ...publishing.filter((item) => isPublished(item.status)).map((item) => item.topic_id),
  ]);
  const totalStageScore = Array.from(stages.values()).reduce((sum, score) => sum + score, 0);

  return {
    pendingTopics: topics.filter((topic) => topic.status === 'pending').length,
    inProduction: activeProductionTopics.size,
    toPublish: pendingPublishingTopics.size,
    completedContent: completedTopics.size,
    productionIndex: stages.size ? Math.round(totalStageScore / stages.size) : 0,
  };
}
