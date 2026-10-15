type ProductionReference = { id: number };

export type TopicProductionHandoffDependencies = {
  advanceTopic: (topicId: number, status: 'production') => Promise<unknown>;
  listProductions: (topicId: number) => Promise<ProductionReference[]>;
  createDraft: (input: { topic_id: number; version: 'v1.0'; content: string; status: 'draft'; origin_type: 'topic_outline' }) => Promise<{ productionId: number }>;
};

export type TopicProductionHandoffResult = {
  productionId: number;
  created: boolean;
  advanced: boolean;
};

/**
 * Keep the Topic stage as the workflow source of truth. Advancing an approved
 * topic goes through the transactional Topic API before looking up its child
 * record, so an existing draft is reused and a missing one is created together
 * with the stage change. A production-stage topic with a legacy missing child
 * can still be repaired without changing its already-correct stage.
 */
export async function startOrResumeTopicProduction(
  topic: { id: number; status: string; outline?: string | null },
  dependencies: TopicProductionHandoffDependencies,
): Promise<TopicProductionHandoffResult> {
  const shouldAdvance = topic.status === 'approved';
  if (!shouldAdvance && topic.status !== 'production') {
    throw new Error('只有已通过或创作中的选题可以开始创作');
  }

  if (shouldAdvance) await dependencies.advanceTopic(topic.id, 'production');

  const existing = (await dependencies.listProductions(topic.id))[0];
  if (existing) {
    return { productionId: existing.id, created: false, advanced: shouldAdvance };
  }

  const created = await dependencies.createDraft({
    topic_id: topic.id,
    version: 'v1.0',
    content: topic.outline || '',
    status: 'draft',
    origin_type: 'topic_outline',
  });
  return { productionId: created.productionId, created: true, advanced: shouldAdvance };
}
