import type { Topic } from '../types';

export type TopicDetailFields = {
  assignee_id: number;
  deadline: string;
  platform: string;
};

export type TopicDetailParsedFields = {
  projectBackground: string;
  targetAudience: string;
};

export type TopicDetailAggregateDraft = {
  title: string;
  description: string;
  details: TopicDetailFields;
  outline: string;
  parsedFields: TopicDetailParsedFields;
};

export type TopicDetailUpdatePayload = {
  title: string;
  description: string;
  outline: string;
  platform: string;
  deadline: string;
  assignee_id: number;
};

function parseDescription(description: string): TopicDetailParsedFields {
  const backgroundMatch = description.match(/【项目背景】\n([\s\S]*?)(?=\n\n【|$)/);
  const audienceMatch = description.match(/【目标受众】\n([\s\S]*?)(?=\n\n【|$)/);
  return {
    projectBackground: backgroundMatch ? backgroundMatch[1].trim() : '',
    targetAudience: audienceMatch ? audienceMatch[1].trim() : '',
  };
}

export function buildTopicDetailDescription(fields: TopicDetailParsedFields): string {
  const parts: string[] = [];
  if (fields.projectBackground) parts.push(`【项目背景】\n${fields.projectBackground}`);
  if (fields.targetAudience) parts.push(`【目标受众】\n${fields.targetAudience}`);
  return parts.join('\n\n');
}

export function createTopicDetailDraft(topic: Topic): TopicDetailAggregateDraft {
  return {
    title: topic.title,
    description: topic.description || '',
    details: {
      assignee_id: topic.assignee_id,
      deadline: topic.deadline,
      platform: topic.platform,
    },
    outline: topic.outline || '',
    parsedFields: parseDescription(topic.description || ''),
  };
}

export function cloneTopicDetailDraft(draft: TopicDetailAggregateDraft): TopicDetailAggregateDraft {
  return {
    ...draft,
    details: { ...draft.details },
    parsedFields: { ...draft.parsedFields },
  };
}

export function topicDetailDraftEquals(
  left: TopicDetailAggregateDraft,
  right: TopicDetailAggregateDraft,
): boolean {
  return left.title === right.title
    && left.description === right.description
    && left.outline === right.outline
    && left.details.assignee_id === right.details.assignee_id
    && left.details.deadline === right.details.deadline
    && left.details.platform === right.details.platform
    && left.parsedFields.projectBackground === right.parsedFields.projectBackground
    && left.parsedFields.targetAudience === right.parsedFields.targetAudience;
}

/** Preserves TopicDetail's existing six-field PUT contract. */
export function buildTopicDetailUpdatePayload(
  draft: TopicDetailAggregateDraft,
): TopicDetailUpdatePayload {
  return {
    title: draft.title,
    description: buildTopicDetailDescription(draft.parsedFields),
    outline: draft.outline,
    platform: draft.details.platform,
    deadline: draft.details.deadline,
    assignee_id: draft.details.assignee_id,
  };
}

/** Shares one page-level aggregate save promise across all save entry points. */
export class TopicDetailAggregateSaveGate {
  private inFlight: Promise<void> | null = null;

  run(action: () => Promise<void>): Promise<void> {
    if (this.inFlight) return this.inFlight;
    const task = action().finally(() => {
      if (this.inFlight === task) this.inFlight = null;
    });
    this.inFlight = task;
    return task;
  }

  get isSaving(): boolean {
    return this.inFlight !== null;
  }
}
