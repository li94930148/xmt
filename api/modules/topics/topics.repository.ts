import type { TopicStatus } from '@shared/types';
import type { TopicPage, TopicPersistencePatch, TopicRecord } from './topics.types';

export interface TopicTransaction {
  createTopic(input: CreateTopicRecord): Promise<number>;
  updateTopic(id: number | string, patch: TopicPersistencePatch): Promise<void>;
  addHistory(input: TopicHistoryWrite): Promise<void>;
  addActivity(input: TopicActivityWrite): Promise<void>;
  productionExists(topicId: number | string): Promise<boolean>;
  createInitialProduction(input: InitialProductionRecord): Promise<void>;
  shootingExists(topicId: number | string): Promise<boolean>;
  createInitialShooting(input: InitialShootingRecord): Promise<void>;
  publishingExists(topicId: number | string): Promise<boolean>;
  createInitialPublishing(input: InitialPublishingRecord): Promise<void>;
}
export type TopicListFilter = {
  status?: unknown;
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
  withTransaction<T>(work: (tx: TopicTransaction) => Promise<T>): Promise<T>;
  updateTopic(id: number | string, patch: TopicPersistencePatch): Promise<void>;
  deleteLegacyRelations(topicId: number | string): Promise<void>;
  deleteTopic(topicId: number | string): Promise<void>;
}

export function isTopicStatus(value: unknown): value is TopicStatus {
  return typeof value === 'string';
}
