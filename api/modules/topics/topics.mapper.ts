import type { CreateTopicRecord } from './topics.repository';
import type { LegacyCreateTopicInput, LegacyUpdateTopicInput, TopicPersistencePatch } from './topics.types';

export function mapLegacyCreateInput(input: LegacyCreateTopicInput, creatorId: number): CreateTopicRecord {
  const outline = input.outline || null;
  return {
    title: input.title,
    description: input.description,
    outline,
    outlineMarkdown: input.outlineMarkdown || input.outline || null,
    outlineJson: input.outlineJson || input.outline || null,
    platform: input.platform,
    deadline: input.deadline,
    creatorId,
    assigneeId: input.assignee_id || null,
  };
}
export function mapLegacyUpdateInput(input: LegacyUpdateTopicInput): TopicPersistencePatch {
  const patch: TopicPersistencePatch = {};
  if (input.title) patch.title = input.title;
  if (input.description) patch.description = input.description;
  if (input.outline !== undefined) {
    patch.outline = input.outline;
    patch.outlineMarkdown = input.outlineMarkdown || input.outline;
    patch.outlineJson = input.outlineJson || input.outline;
  }
  if (input.platform) patch.platform = input.platform;
  if (input.deadline) patch.deadline = input.deadline;
  if (input.assignee_id !== undefined && input.assignee_id !== null) patch.assignee_id = input.assignee_id;
  return patch;
}
