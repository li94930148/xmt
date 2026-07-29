import type { TopicStatus, User } from '@shared/types';
import type {
  AuditTopicInput,
  CreateTopicInput,
  TopicQuery,
  TransitionTopicInput,
  UpdateTopicInput,
} from '@shared/schema/topics.schema';

export type TopicActor = Pick<User, 'id' | 'role'>;

export type TopicRecord = Record<string, unknown> & {
  id: number;
  title: string;
  status: TopicStatus;
  creator_id: number | null;
  assignee_id: number | null;
  outline?: string | null;
  outline_markdown?: string | null;
  outline_json?: string | null;
};

export type TopicHistoryRecord = Record<string, unknown>;

export type TopicPage = {
  topics: TopicRecord[];
  total: number;
  page: number;
  limit: number;
};

export type TopicDetail = TopicRecord & { history: TopicHistoryRecord[] };

export type TopicPersistencePatch = {
  title?: unknown;
  description?: unknown;
  outline?: unknown;
  outlineMarkdown?: unknown;
  outlineJson?: unknown;
  platform?: unknown;
  deadline?: unknown;
  assignee_id?: unknown;
  status?: TopicStatus;
};

export type LegacyCreateTopicInput = CreateTopicInput & Record<string, unknown>;
export type LegacyUpdateTopicInput = TopicPersistencePatch & Record<string, unknown>;
export type { AuditTopicInput, CreateTopicInput, TopicQuery, TransitionTopicInput, UpdateTopicInput };

export type TopicServiceErrorCode =
  | 'TOPIC_NOT_FOUND'
  | 'TOPIC_FORBIDDEN'
  | 'TOPIC_INVALID_INPUT'
  | 'TOPIC_INVALID_TRANSITION';

export class TopicServiceError extends Error {
  constructor(
    public readonly code: TopicServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TopicServiceError';
  }
}
