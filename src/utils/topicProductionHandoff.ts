type ProductionReference = { id: number };

export type TopicProductionHandoffDependencies = {
  advanceTopic: (topicId: number, status: 'production') => Promise<unknown>;
  getTopicStatus: (topicId: number) => Promise<string>;
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

  let advanced = false;
  if (shouldAdvance) {
    let currentStatus: string;
    try {
      // A new explicit attempt first reconciles stale UI state. This also
      // prevents a retry from replaying the transition if the prior response
      // was lost after the server committed it.
      currentStatus = await dependencies.getTopicStatus(topic.id);
    } catch {
      throw new Error('暂时无法核实选题状态，未重复提交阶段推进，也未处理稿件。请稍后重新点击“开始创作”先核实状态。');
    }

    if (currentStatus === 'production') {
      advanced = true;
    } else if (currentStatus === 'approved') {
      try {
        await dependencies.advanceTopic(topic.id, 'production');
        advanced = true;
      } catch {
        // The request may have committed even though its response was lost.
        // Never replay it here: only a read can decide whether to continue.
        try {
          currentStatus = await dependencies.getTopicStatus(topic.id);
        } catch {
          throw new Error('阶段推进结果暂时无法确认。为避免重复提交，本次未继续处理稿件；请重新点击“开始创作”核实当前状态。');
        }

        if (currentStatus === 'production') {
          advanced = true;
        } else if (currentStatus === 'approved') {
          throw new Error('已核实选题仍处于“已通过”，阶段推进尚未生效，本次未创建或查找稿件。确认后可重新点击“开始创作”明确重试。');
        } else {
          throw new Error('选题状态已发生变化，本次未继续处理稿件。请刷新选题详情后再操作。');
        }
      }
    } else {
      throw new Error('选题状态已发生变化，本次未推进阶段或处理稿件。请刷新选题详情后再操作。');
    }
  }

  const existing = (await dependencies.listProductions(topic.id))[0];
  if (existing) {
    return { productionId: existing.id, created: false, advanced };
  }

  const created = await dependencies.createDraft({
    topic_id: topic.id,
    version: 'v1.0',
    content: topic.outline || '',
    status: 'draft',
    origin_type: 'topic_outline',
  });
  return { productionId: created.productionId, created: true, advanced };
}
