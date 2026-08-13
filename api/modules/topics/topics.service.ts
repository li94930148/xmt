import type { TopicStatus } from '@shared/types';
import { getTransitionText, isValidAuditAction, isValidTransition, STATUS_TEXT } from '../../utils/workflow';
import type { TopicPolicy } from './topics.policy';
import type { TopicRepository } from './topics.repository';
import {
  TopicServiceError,
  type AuditTopicInput,
  type LegacyCreateTopicInput,
  type LegacyUpdateTopicInput,
  type TopicActor,
  type TopicDetail,
  type TopicPage,
  type TransitionTopicInput,
} from './topics.types';
import { mapLegacyCreateInput, mapLegacyUpdateInput } from './topics.mapper';

export type TopicMessage = {
  userId: number;
  title: string;
  content: string;
  type: 'info' | 'success' | 'warning' | 'error';
  link: string;
};

export type TopicServiceDependencies = {
  repository: TopicRepository;
  policy: TopicPolicy;
  notify(message: TopicMessage): void;
  broadcast(room: string, event: string, data: unknown): void;
};

export class TopicService {
  constructor(private readonly dependencies: TopicServiceDependencies) {}

  async listTopics(actor: TopicActor, query: { status?: unknown; search?: unknown; page: number; limit: number }): Promise<TopicPage> {
    return this.dependencies.repository.list({
      ...query,
      actorId: actor.id,
      viewAll: this.dependencies.policy.canViewAll(actor),
    });
  }

  async getTopic(actor: TopicActor, id: number | string): Promise<TopicDetail> {
    const topic = await this.dependencies.repository.findDetailById(id);
    if (!topic) throw new TopicServiceError('TOPIC_NOT_FOUND', '选题不存在');
    if (!this.dependencies.policy.canViewTopic(actor, topic)) {
      throw new TopicServiceError('TOPIC_FORBIDDEN', '无权限查看此选题');
    }
    const history = await this.dependencies.repository.findHistory(id);
    return { ...topic, history };
  }

  async createTopic(actor: TopicActor, input: LegacyCreateTopicInput) {
    if (!input.title) throw new TopicServiceError('TOPIC_INVALID_INPUT', '选题标题不能为空');

    const topicId = await this.dependencies.repository.withTransaction(async (tx) => {
      const createdTopicId = await tx.createTopic(mapLegacyCreateInput(input, actor.id));
      await tx.addHistory({ topicId: createdTopicId, action: 'created', comment: '创建选题', operatorId: actor.id });
      await tx.addActivity({ userId: actor.id, action: 'create', target: 'topic', detail: `创建选题: ${input.title}` });
      return createdTopicId;
    });

    this.dependencies.notify({
      userId: actor.id,
      title: '选题提交通知',
      content: `您提交的选题「${input.title}」已成功提交，请等待审核`,
      type: 'info',
      link: `/topics/${topicId}`,
    });

    const directors = await this.dependencies.repository.findDirectorIds();
    for (const userId of directors) {
      this.dependencies.notify({
        userId,
        title: '新选题待审核',
        content: `有新的选题「${input.title}」需要审核`,
        type: 'warning',
        link: `/topics/${topicId}`,
      });
    }

    const topic = await this.dependencies.repository.findDetailById(topicId);
    this.dependencies.broadcast('topics', 'topic:created', topic);
    return { topicId };
  }

  async updateTopic(actor: TopicActor, id: number | string, input: LegacyUpdateTopicInput) {
    const topic = await this.dependencies.repository.findById(id);
    if (!topic) throw new TopicServiceError('TOPIC_NOT_FOUND', '选题不存在');
    if (!this.dependencies.policy.canEditTopic(actor, topic)) {
      throw new TopicServiceError('TOPIC_FORBIDDEN', '无权限修改此选题');
    }

    const patch = mapLegacyUpdateInput(input);
    if (Object.keys(patch).length === 0) {
      throw new TopicServiceError('TOPIC_INVALID_INPUT', '没有需要更新的字段');
    }
    await this.dependencies.repository.updateTopic(id, patch);
    const updatedTopic = await this.dependencies.repository.findDetailById(id);
    this.dependencies.broadcast('topics', 'topic:updated', updatedTopic);
  }

  async deleteTopic(_actor: TopicActor, id: number | string) {
    const topic = await this.dependencies.repository.findById(id);
    if (!topic) throw new TopicServiceError('TOPIC_NOT_FOUND', '选题不存在');
    await this.dependencies.repository.deleteLegacyRelations(id);
    await this.dependencies.repository.deleteTopic(id);
    this.dependencies.broadcast('topics', 'topic:deleted', { id: String(id) });
  }

  async auditTopic(actor: TopicActor, id: number | string, input: AuditTopicInput) {
    const topic = await this.dependencies.repository.findById(id);
    if (!topic) throw new TopicServiceError('TOPIC_NOT_FOUND', '选题不存在');
    const oldStatus = topic.status;
    if (!isValidAuditAction(oldStatus, input.status)) {
      throw new TopicServiceError('TOPIC_INVALID_TRANSITION', `当前状态「${STATUS_TEXT[oldStatus]}」不允许执行审核操作`);
    }

    await this.dependencies.repository.withTransaction(async (tx) => {
      await tx.updateTopic(id, { status: input.status, ...(input.assignee_id ? { assignee_id: input.assignee_id } : {}) });
      await tx.addHistory({
        topicId: id,
        action: input.status === 'approved' ? 'approved' : 'rejected',
        comment: input.comment,
        operatorId: actor.id,
      });
      await tx.addActivity({
        userId: actor.id,
        action: 'audit',
        target: 'topic',
        detail: `审核选题 ${id}: ${input.status === 'approved' ? '通过' : '驳回'}`,
      });
      if (input.status === 'approved' && !(await tx.productionExists(id))) {
        await tx.createInitialProduction({
          topicId: id,
          content: String(topic.outline || ''),
          contentMarkdown: String(topic.outline_markdown || topic.outline || ''),
          contentJson: String(topic.outline_json || topic.outline || ''),
          operatorId: input.assignee_id || Number(topic.creator_id),
        });
      }
    });

    const statusText = input.status === 'approved' ? '审核通过' : '审核驳回';
    this.dependencies.notify({
      userId: Number(topic.creator_id),
      title: `选题${statusText}`,
      content: `您的选题「${topic.title}」已${statusText}${input.comment ? `，备注：${input.comment}` : ''}`,
      type: input.status === 'approved' ? 'success' : 'error',
      link: `/topics/${id}`,
    });
    if (input.assignee_id) {
      this.dependencies.notify({
        userId: input.assignee_id,
        title: '新任务指派',
        content: `您被指派负责选题「${topic.title}」`,
        type: 'info',
        link: `/topics/${id}`,
      });
    }
    const auditedTopic = await this.dependencies.repository.findById(id);
    this.dependencies.broadcast('topics', 'topic:audited', {
      id: String(id),
      status: input.status,
      assignee_id: input.assignee_id,
      topic: auditedTopic,
    });
  }

  async transitionTopic(actor: TopicActor, id: number | string, input: TransitionTopicInput) {
    const topic = await this.dependencies.repository.findById(id);
    if (!topic) throw new TopicServiceError('TOPIC_NOT_FOUND', '选题不存在');
    if (!this.dependencies.policy.canEditTopic(actor, topic)) {
      throw new TopicServiceError('TOPIC_FORBIDDEN', '无权限修改此选题状态');
    }
    if (topic.status === 'pending') {
      throw new TopicServiceError('TOPIC_INVALID_TRANSITION', '待审核选题只能通过审核操作变更状态');
    }
    if (!isValidTransition(topic.status, input.status)) {
      throw new TopicServiceError(
        'TOPIC_INVALID_TRANSITION',
        `不允许从「${STATUS_TEXT[topic.status]}」变更为「${STATUS_TEXT[input.status]}」`,
      );
    }

    await this.dependencies.repository.withTransaction(async (tx) => {
      await tx.updateTopic(id, { status: input.status });
      await tx.addHistory({
        topicId: id,
        action: `status_${input.status}`,
        comment: getTransitionText(topic.status, input.status),
        operatorId: actor.id,
      });
      await tx.addActivity({
        userId: actor.id,
        action: 'status_change',
        target: 'topic',
        detail: `选题 ${id} 状态变更为 ${input.status}`,
      });
      await this.createStageRecord(tx, id, input.status, topic, actor.id);
    });

    const participants = await this.dependencies.repository.findParticipantIds(topic.creator_id, topic.assignee_id);
    for (const userId of participants) {
      this.dependencies.notify({
        userId,
        title: '状态变更通知',
        content: `选题「${topic.title}」的状态已变更为${STATUS_TEXT[input.status]}`,
        type: 'info',
        link: `/topics/${id}`,
      });
    }
  }

  private async createStageRecord(
    tx: Parameters<Parameters<TopicRepository['withTransaction']>[0]>[0],
    id: number | string,
    status: TopicStatus,
    topic: Awaited<ReturnType<TopicRepository['findById']>> & {},
    operatorId: number,
  ) {
    if (status === 'production' && !(await tx.productionExists(id))) {
      await tx.createInitialProduction({
        topicId: id,
        content: String(topic.outline || ''),
        contentMarkdown: String(topic.outline_markdown || topic.outline || ''),
        contentJson: String(topic.outline_json || topic.outline || ''),
        operatorId,
      });
    }
    if (status === 'shooting' && !(await tx.shootingExists(id))) {
      await tx.createInitialShooting({ topicId: id, operatorId });
    }
    if (status === 'publishing' && !(await tx.publishingExists(id))) {
      await tx.createInitialPublishing({ topicId: id, operatorId });
    }
  }
}
