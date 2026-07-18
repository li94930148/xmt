import {
  resolveTopicEditorMode,
  type TopicEditorMode,
  type TopicEditorModePolicy,
} from '../editor/topic/topicEditorModePolicy';

export type TopicDetailContentEditorMode = 'rich' | 'legacy';

/**
 * Page-level renderer choice for TopicDetail. Both branches retain the page's
 * aggregate draft and save owner; only runtime has a manual-save handle.
 */
export interface TopicDetailEditorBranch {
  readonly topicEditorMode: TopicEditorMode;
  readonly contentEditorMode: TopicDetailContentEditorMode;
  readonly usesRuntimeManualSave: boolean;
  readonly readonly: boolean;
  readonly saveOwner: 'page-aggregate';
}

export function resolveTopicDetailEditorBranch(
  topicId: number,
  readonly: boolean,
  policy?: TopicEditorModePolicy | null,
): TopicDetailEditorBranch {
  const topicEditorMode = resolveTopicEditorMode(topicId, policy);
  const usesRuntimeManualSave = topicEditorMode === 'runtime';

  return Object.freeze({
    topicEditorMode,
    contentEditorMode: usesRuntimeManualSave ? 'rich' : 'legacy',
    usesRuntimeManualSave,
    readonly,
    saveOwner: 'page-aggregate',
  });
}
