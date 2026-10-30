import type { TopicStatus } from '@shared/types';
import { createHash } from 'node:crypto';
import { getTransitionText, isValidAuditAction, isValidTransition, STATUS_TEXT } from '../../utils/workflow';
import type { TopicPolicy } from './topics.policy';
import type { CreatorTopicSuggestionLinkRecord, TopicRepository } from './topics.repository';
import {
  TopicServiceError,
  type AuditTopicInput,
  type LegacyCreateTopicInput,
  type LegacyUpdateTopicInput,
  type TopicActor,
  type TopicDetail,
  type TopicPage,
  type TopicRecord,
  type TopicStageRecord,
  type TransitionTopicInput,
} from './topics.types';
import { mapLegacyCreateInput, mapLegacyUpdateInput } from './topics.mapper';
import { listWorkflowDocumentVersions } from '../../services/workflowDocumentVersions';
import { getPublishingCompletionOutcome, getPublishingCompletionReason } from './publishing-completion';
import { apiLogger } from '../../observability/logger.js';

const STAGE_RECORD_LABEL: Record<TopicStageRecord, string> = {
  production: '创作稿',
  shooting: '成片制作',
  publishing: '发布',
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => item === undefined ? 'null' : stableJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function topicCreateRequestFingerprint(input: LegacyCreateTopicInput) {
  return createHash('sha256').update(stableJson({
    title: input.title,
    description: input.description ?? '',
    outline: input.outline ?? null,
    outlineMarkdown: input.outlineMarkdown ?? null,
    outlineJson: input.outlineJson ?? null,
    platform: input.platform ?? '',
    deadline: input.deadline ?? '',
    assignee_id: input.assignee_id ?? null,
    creator_suggestion_source: input.creator_suggestion_source ?? null,
  })).digest('hex');
}

function assertTopicCreateRequestMatches(
  existing: { actorId: number; topicId: number; requestFingerprint: string },
  actorId: number,
  requestFingerprint: string,
) {
  if (Number(existing.actorId) !== actorId || existing.requestFingerprint !== requestFingerprint) {
    throw new TopicServiceError('TOPIC_CREATE_REQUEST_CONFLICT', '选题请求编号已用于其他账号或内容，请先核实原请求状态。');
  }
  return Number(existing.topicId);
}

function currentStageRecord(status: TopicStatus): TopicStageRecord | null {
  if (status === 'approved' || status === 'production') return 'production';
  if (status === 'shooting') return 'shooting';
  if (status === 'publishing') return 'publishing';
  return null;
}

function toTopicDetail(topic: TopicRecord, history: Record<string, unknown>[]): TopicDetail {
  const {
    has_production_record: hasProductionRecord,
    has_shooting_record: hasShootingRecord,
    has_publishing_record: hasPublishingRecord,
    ...topicFields
  } = topic;
  return {
    ...topicFields,
    stage_record_presence: {
      production: Boolean(hasProductionRecord),
      shooting: Boolean(hasShootingRecord),
      publishing: Boolean(hasPublishingRecord),
    },
    history,
  };
}

function warnOptionalTopicEffect(operation: string, error: unknown) {
  apiLogger.warn({
    module: 'topics',
    operation,
    error: { code: 'TOPIC_OPTIONAL_EFFECT_FAILED', name: error instanceof Error ? error.name : 'UnknownError' },
  }, 'api.topics.optional_effect_failed');
}

export type TopicMessage = {
  userId: number;
  title: string;
  content: string;
  type: 'info' | 'success' | 'warning' | 'error';
  link: string;
};

export type PersistedTopicMessage = TopicMessage & { id: number };

export type TopicServiceDependencies = {
  repository: TopicRepository;
  policy: TopicPolicy;
  resolveCreatorTopicSuggestionSource?: (actor: TopicActor, source: NonNullable<LegacyCreateTopicInput['creator_suggestion_source']>) => Promise<CreatorTopicSuggestionLinkRecord>;
  notify(message: TopicMessage): void;
  pushNotification?(message: PersistedTopicMessage): void;
  broadcast(room: string, event: string, data: unknown): void;
};

export class TopicService {
  constructor(private readonly dependencies: TopicServiceDependencies) {}

  async listTopics(actor: TopicActor, query: { status?: unknown; topic_filter?: 'mine' | 'active'; search?: unknown; page: number; limit: number }): Promise<TopicPage> {
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
    return toTopicDetail(topic, history);
  }

  async getOutlineVersions(actor: TopicActor, id: number | string) {
    const topic = await this.dependencies.repository.findById(id);
    if (!topic) throw new TopicServiceError('TOPIC_NOT_FOUND', '选题不存在');
    if (!this.dependencies.policy.canViewTopic(actor, topic)) {
      throw new TopicServiceError('TOPIC_FORBIDDEN', '无权限查看此选题');
    }
    return listWorkflowDocumentVersions('topic_outline', id);
  }

  async getTopicCreateRequestStatus(actor: TopicActor, clientRequestId: string) {
    const existing = await this.dependencies.repository.findTopicCreateRequest(clientRequestId);
    if (!existing || Number(existing.actorId) !== Number(actor.id)) return { state: 'not_found' as const };
    return { state: 'created' as const, topicId: Number(existing.topicId) };
  }

  async createTopic(actor: TopicActor, input: LegacyCreateTopicInput, clientRequestId?: string) {
    if (!input.title) throw new TopicServiceError('TOPIC_INVALID_INPUT', '选题标题不能为空');

    const normalizedRequestId = clientRequestId?.trim().toLowerCase();
    const requestFingerprint = normalizedRequestId ? topicCreateRequestFingerprint(input) : undefined;
    if (normalizedRequestId && requestFingerprint) {
      const existing = await this.dependencies.repository.findTopicCreateRequest(normalizedRequestId);
      if (existing) {
        return { topicId: assertTopicCreateRequestMatches(existing, Number(actor.id), requestFingerprint) };
      }
    }

    let suggestionAttribution: CreatorTopicSuggestionLinkRecord | undefined;
    if (input.creator_suggestion_source) {
      const source = input.creator_suggestion_source;
      const marker = `【创作数据参考 ${source.account_uid}/${source.suggestion_id}】`;
      if (!String(input.description ?? '').includes(marker)) {
        throw new TopicServiceError('TOPIC_INVALID_INPUT', '提交内容未包含已选用的创作建议依据');
      }
      if (!this.dependencies.resolveCreatorTopicSuggestionSource) {
        throw new TopicServiceError('TOPIC_INVALID_INPUT', '创作建议来源暂不可核验，请移除来源后重试');
      }
      suggestionAttribution = await this.dependencies.resolveCreatorTopicSuggestionSource(actor, source);
    }

    let directors: number[] = [];
    try {
      directors = await this.dependencies.repository.findDirectorIds();
    } catch (error) {
      warnOptionalTopicEffect('topic.created.notify_recipients_read_failed', error);
    }

    const created = await this.dependencies.repository.withTransaction(async (tx) => {
      if (normalizedRequestId && requestFingerprint) {
        const existing = await tx.findTopicCreateRequest(normalizedRequestId);
        if (existing) {
          return {
            topicId: assertTopicCreateRequestMatches(existing, Number(actor.id), requestFingerprint),
            replayed: true,
          };
        }
      }
      const createdTopicId = await tx.createTopic(mapLegacyCreateInput(input, actor.id));
      if (suggestionAttribution) await tx.linkCreatorTopicSuggestion(createdTopicId, suggestionAttribution);
      await tx.addHistory({ topicId: createdTopicId, action: 'created', comment: '创建选题', operatorId: actor.id });
      await tx.addActivity({ userId: actor.id, action: 'create', target: 'topic', detail: `创建选题: ${input.title}` });
      if (normalizedRequestId && requestFingerprint) {
        await tx.recordTopicCreateRequest({
          clientRequestId: normalizedRequestId,
          actorId: Number(actor.id),
          topicId: createdTopicId,
          requestFingerprint,
        });
      }
      const topic = await tx.findDetailById(createdTopicId);
      if (!topic) throw new TopicServiceError('TOPIC_NOT_FOUND', '选题不存在');
      const history = await tx.findHistory(createdTopicId);
      return { topicId: createdTopicId, topic: toTopicDetail(topic, history), replayed: false };
    });

    if ('replayed' in created && created.replayed) return { topicId: created.topicId };

    this.dependencies.notify({
      userId: actor.id,
      title: '选题提交通知',
      content: `您提交的选题「${input.title}」已成功提交，请等待审核`,
      type: 'info',
      link: `/topics/${created.topicId}`,
    });

    for (const userId of directors) {
      this.dependencies.notify({
        userId,
        title: '新选题待审核',
        content: `有新的选题「${input.title}」需要审核`,
        type: 'warning',
        link: `/topics/${created.topicId}`,
      });
    }

    this.dependencies.broadcast('topics', 'topic:created', created.topic);
    return { topicId: created.topicId };
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
    const updatedTopic = await this.dependencies.repository.withTransaction(async (tx) => {
      if (input.version_action === 'minor' || input.version_action === 'major') {
        if (input.outline === undefined || typeof input.expected_content !== 'string') {
          throw new TopicServiceError('TOPIC_INVALID_INPUT', '创建选题版本时必须提供当前大纲和预期原稿');
        }
        const versionResult = await tx.recordTopicOutlineVersion({
          id,
          nextContent: input.outline === null ? null : String(input.outline),
          expectedContent: input.expected_content,
          action: input.version_action,
          operatorId: actor.id,
        });
        if (!versionResult.ok) {
          throw new TopicServiceError(
            'TOPIC_VERSION_CONFLICT',
            '大纲已被其他协作者修改，请刷新后核对再创建版本',
          );
        }
      }
      await tx.updateTopic(id, patch);
      const detail = await tx.findDetailById(id);
      if (!detail) throw new TopicServiceError('TOPIC_NOT_FOUND', '选题不存在');
      return detail;
    });
    this.dependencies.broadcast('topics', 'topic:updated', updatedTopic);
  }

  async deleteTopic(_actor: TopicActor, id: number | string) {
    const topic = await this.dependencies.repository.findById(id);
    if (!topic) throw new TopicServiceError('TOPIC_NOT_FOUND', '选题不存在');
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

    const statusText = input.status === 'approved' ? '审核通过' : '审核驳回';
    const auditNotifications: TopicMessage[] = [{
      userId: Number(topic.creator_id),
      title: `选题${statusText}`,
      content: `您的选题「${topic.title}」已${statusText}${input.comment ? `，备注：${input.comment}` : ''}`,
      type: input.status === 'approved' ? 'success' : 'error',
      link: `/topics/${id}`,
    }];
    if (input.assignee_id) {
      auditNotifications.push({
        userId: input.assignee_id,
        title: '新任务指派',
        content: `您被指派负责选题「${topic.title}」`,
        type: 'info',
        link: `/topics/${id}`,
      });
    }

    const auditResult = await this.dependencies.repository.withTransaction(async (tx) => {
      const updated = await tx.updateTopicIfStatus(id, oldStatus, {
        status: input.status,
        ...(input.assignee_id ? { assignee_id: input.assignee_id } : {}),
      });
      if (!updated) {
        throw new TopicServiceError('TOPIC_STAGE_CONFLICT', '选题状态已变化，请刷新后重新审核。');
      }
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
          originOutlineSnapshot: String(topic.outline || ''),
          operatorId: input.assignee_id || Number(topic.creator_id),
        });
      }
      const detail = await tx.findDetailById(id);
      if (!detail) throw new TopicServiceError('TOPIC_NOT_FOUND', '选题不存在');
      const persistedNotifications: PersistedTopicMessage[] = [];
      for (const notification of auditNotifications) {
        persistedNotifications.push({ ...notification, id: await tx.addMessage(notification) });
      }
      return { topic: detail, notifications: persistedNotifications };
    });

    for (const notification of auditResult.notifications) {
      try {
        this.dependencies.pushNotification?.(notification);
      } catch (error) {
        warnOptionalTopicEffect('topic.audit_notification_push_failed', error);
      }
    }
    this.dependencies.broadcast('topics', 'topic:audited', {
      id: String(id),
      status: input.status,
      assignee_id: input.assignee_id,
      topic: auditResult.topic,
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

    const participants = await this.dependencies.repository.findParticipantIds(topic.creator_id, topic.assignee_id);
    let resultingStatus = input.status;
    await this.dependencies.repository.withTransaction(async (tx) => {
      const completionOutcome = input.status === 'completed'
        ? getPublishingCompletionOutcome(await tx.publishingStatuses(id))
        : null;
      if (input.status === 'completed' && !completionOutcome) {
        throw new TopicServiceError('TOPIC_INVALID_TRANSITION', '仍有发布任务待处理，或没有可完成的发布记录');
      }

      const updated = await tx.updateTopicIfStatus(id, topic.status, { status: input.status });
      if (!updated) {
        throw new TopicServiceError('TOPIC_STAGE_CONFLICT', '选题状态已变化，请刷新后重试。');
      }
      const requiredSourceStage = topic.status === 'production'
        ? 'production'
        : topic.status === 'shooting'
          ? 'shooting'
          : null;
      if (requiredSourceStage) {
        const sourceExists = requiredSourceStage === 'production'
          ? await tx.productionExists(id)
          : await tx.shootingExists(id);
        if (!sourceExists) {
          throw new TopicServiceError(
            'TOPIC_INVALID_TRANSITION',
            `当前阶段缺少${STAGE_RECORD_LABEL[requiredSourceStage]}记录，请先补齐后再推进。`,
          );
        }
      }
      await tx.addHistory({
        topicId: id,
        action: `status_${input.status}`,
        comment: completionOutcome ? getPublishingCompletionReason(completionOutcome) : getTransitionText(topic.status, input.status),
        operatorId: actor.id,
      });
      await tx.addActivity({
        userId: actor.id,
        action: 'status_change',
        target: 'topic',
        detail: completionOutcome
          ? `选题 ${id} 状态变更为已完成：${getPublishingCompletionReason(completionOutcome)}`
          : `选题 ${id} 状态变更为 ${input.status}`,
      });
      await this.createStageRecord(tx, id, input.status, topic, actor.id);

      if (input.status === 'publishing' && await tx.advancePublishingTopic(id, actor.id)) {
        resultingStatus = 'completed';
      }
    });

    for (const userId of participants) {
      this.dependencies.notify({
        userId,
        title: '状态变更通知',
        content: `选题「${topic.title}」的状态已变更为${STATUS_TEXT[resultingStatus]}`,
        type: 'info',
        link: `/topics/${id}`,
      });
    }
  }

  async repairCurrentStageRecord(actor: TopicActor, id: number | string) {
    const topic = await this.dependencies.repository.findById(id);
    if (!topic) throw new TopicServiceError('TOPIC_NOT_FOUND', '选题不存在');
    if (!this.dependencies.policy.canEditTopic(actor, topic)) {
      throw new TopicServiceError('TOPIC_FORBIDDEN', '无权限补齐此选题的阶段记录');
    }

    const expectedStage = currentStageRecord(topic.status);
    if (!expectedStage) {
      const message = topic.status === 'completed'
        ? '选题已完成但缺少发布记录，请先核对发布历史，不能自动补建。'
        : '当前选题阶段无需补建阶段记录。';
      throw new TopicServiceError('TOPIC_STAGE_NOT_REPAIRABLE', message);
    }

    const repair = await this.dependencies.repository.withTransaction(async (tx) => {
      const currentTopic = await tx.getTopicForStageRecordRepair(id);
      if (!currentTopic) throw new TopicServiceError('TOPIC_NOT_FOUND', '选题不存在');
      if (!this.dependencies.policy.canEditTopic(actor, currentTopic)) {
        throw new TopicServiceError('TOPIC_FORBIDDEN', '无权限补齐此选题的阶段记录');
      }
      if (currentTopic.status !== topic.status || currentStageRecord(currentTopic.status) !== expectedStage) {
        throw new TopicServiceError('TOPIC_STAGE_CONFLICT', '选题阶段已变化，请刷新页面后重试。');
      }

      const exists = expectedStage === 'production'
        ? await tx.productionExists(id)
        : expectedStage === 'shooting'
          ? await tx.shootingExists(id)
          : await tx.publishingExists(id);
      if (exists) return { created: false as const, topicDetail: null };

      if (expectedStage === 'production') {
        await tx.createInitialProduction({
          topicId: id,
          content: String(currentTopic.outline || ''),
          contentMarkdown: String(currentTopic.outline_markdown || currentTopic.outline || ''),
          contentJson: String(currentTopic.outline_json || currentTopic.outline || ''),
          originOutlineSnapshot: String(currentTopic.outline || ''),
          operatorId: actor.id,
        });
      } else if (expectedStage === 'shooting') {
        await tx.createInitialShooting({ topicId: id, operatorId: actor.id });
      } else {
        await tx.createInitialPublishing({ topicId: id, operatorId: actor.id });
      }

      const stageLabel = STAGE_RECORD_LABEL[expectedStage];
      const comment = `选题处于「${STATUS_TEXT[currentTopic.status]}」阶段但缺少${stageLabel}记录，已补建；选题阶段未变更`;
      await tx.addHistory({ topicId: id, action: 'stage_record_repaired', comment, operatorId: actor.id });
      await tx.addActivity({
        userId: actor.id,
        action: 'stage_record_repaired',
        target: 'topic',
        detail: `选题「${currentTopic.title}」补齐${stageLabel}记录；阶段仍为${STATUS_TEXT[currentTopic.status]}`,
      });
      const detail = await tx.findDetailById(id);
      if (!detail) throw new TopicServiceError('TOPIC_NOT_FOUND', '选题不存在');
      const history = await tx.findHistory(id);
      return { created: true as const, topicDetail: toTopicDetail(detail, history) };
    });

    if (repair.created) {
      this.dependencies.broadcast('topics', 'topic:updated', repair.topicDetail);
    }
    return { stage: expectedStage, created: repair.created };
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
        originOutlineSnapshot: String(topic.outline || ''),
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
