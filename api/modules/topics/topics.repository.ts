import type { TopicStatus } from '@shared/types';
import type { TopicContentPatch, TopicPage, TopicPersistencePatch, TopicRecord } from './topics.types';
import type { PublishingCompletionOutcome } from './publishing-completion';
import type { RecordWorkflowDocumentVersionResult, WorkflowDocumentVersionAction } from '../../services/workflowDocumentVersions';

export interface TopicTransaction {
  createTopic(input: CreateTopicRecord): Promise<number>;
  findTopicCreateRequest(clientRequestId: string): Promise<TopicCreateRequestRecord | null>;
  recordTopicCreateRequest(input: TopicCreateRequestRecord): Promise<void>;
  linkCreatorTopicSuggestion(topicId: number, input: CreatorTopicSuggestionLinkRecord): Promise<void>;
  findDetailById(id: number | string): Promise<TopicRecord | null>;
  findHistory(id: number | string): Promise<Record<string, unknown>[]>;
  updateTopic(id: number | string, patch: TopicContentPatch): Promise<void>;
  recordTopicOutlineVersion(input: {
    id: number | string;
    nextContent: string | null;
    expectedContent: string;
    action: WorkflowDocumentVersionAction;
    operatorId: number;
  }): Promise<RecordWorkflowDocumentVersionResult>;
  updateTopicIfStatus(id: number | string, expectedStatus: TopicStatus, patch: TopicPersistencePatch): Promise<boolean>;
  addHistory(input: TopicHistoryWrite): Promise<void>;
  addActivity(input: TopicActivityWrite): Promise<void>;
  productionExists(topicId: number | string): Promise<boolean>;
  createInitialProduction(input: InitialProductionRecord): Promise<void>;
  shootingExists(topicId: number | string): Promise<boolean>;
  createInitialShooting(input: InitialShootingRecord): Promise<void>;
  publishingExists(topicId: number | string): Promise<boolean>;
  publishingStatuses(topicId: number | string): Promise<string[]>;
  advancePublishingTopic(topicId: number | string, operatorId: number): Promise<PublishingCompletionOutcome | null>;
  createInitialPublishing(input: InitialPublishingRecord): Promise<void>;
  getTopicForStageRecordRepair(id: number | string): Promise<TopicRecord | null>;
}
export type CreatorTopicSuggestionLinkRecord = {
  creatorAccountId: number;
  userId: number;
  suggestionId: string;
  evidenceId: string;
  sampleCount: number;
  baselineCount: number;
  medianPlays: number;
  baselineMedianPlays: number;
  playRatio: number;
};
export type TopicCreateRequestRecord = {
  clientRequestId: string;
  actorId: number;
  topicId: number;
  requestFingerprint: string;
};
export type TopicListFilter = {
  status?: unknown;
  topic_filter?: 'mine' | 'active';
  search?: unknown;
  page: number;
  limit: number;
  actorId: number;
  viewAll: boolean;
};

export type CreateTopicRecord = {
  title: unknown;
  description: unknown;
  outline: unknown;
  outlineMarkdown: unknown;
  outlineJson: unknown;
  platform: unknown;
  deadline: unknown;
  creatorId: number;
  assigneeId: unknown;
};

export type TopicHistoryWrite = {
  topicId: number | string;
  action: string;
  comment: unknown;
  operatorId: number;
};

export type TopicActivityWrite = {
  userId: number;
  action: string;
  target: string;
  detail: string;
};

export type InitialProductionRecord = {
  topicId: number | string;
  content: string;
  contentMarkdown: string;
  contentJson: string;
  originOutlineSnapshot: string;
  operatorId: number;
};

export type InitialShootingRecord = { topicId: number | string; operatorId: number };
export type InitialPublishingRecord = { topicId: number | string; operatorId: number };

export interface TopicRepository {
  list(filter: TopicListFilter): Promise<TopicPage>;
  findById(id: number | string): Promise<TopicRecord | null>;
  findDetailById(id: number | string): Promise<TopicRecord | null>;
  findHistory(topicId: number | string): Promise<Record<string, unknown>[]>;
  findDirectorIds(): Promise<number[]>;
  findParticipantIds(creatorId: unknown, assigneeId: unknown): Promise<number[]>;
  findTopicCreateRequest(clientRequestId: string): Promise<TopicCreateRequestRecord | null>;
  withTransaction<T>(work: (tx: TopicTransaction) => Promise<T>): Promise<T>;
  updateTopic(id: number | string, patch: TopicContentPatch): Promise<void>;
  deleteTopic(topicId: number | string): Promise<void>;
}

export function isTopicStatus(value: unknown): value is TopicStatus {
  return typeof value === 'string';
}
