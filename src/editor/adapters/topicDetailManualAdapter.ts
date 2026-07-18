import type {
  ContentEditorAdapter,
  ContentEditorSaveContext,
} from '../contracts/contentEditorAdapter';

export interface TopicDetailManualAdapterOptions {
  documentId: string;
  initialContent: string;
  readonly: boolean;
  /** D10-D2-A test seam; D10-D2-B will supply the page-owned aggregate save command. */
  persist(content: string, context: ContentEditorSaveContext): Promise<void>;
}

/**
 * Gives TopicDetail a manual Runtime context without owning Topic domain data.
 * It intentionally has no API or payload knowledge.
 */
export function createTopicDetailManualAdapter(
  options: TopicDetailManualAdapterOptions,
): ContentEditorAdapter {
  return {
    documentId: options.documentId,
    collaborationRoom: '',
    initialContent: options.initialContent,
    readonly: options.readonly,
    capabilities: {
      collaboration: false,
      manualSave: true,
      immersive: false,
      pageScroll: false,
    },
    saveStrategy: 'manual',
    persist: options.persist,
  };
}
