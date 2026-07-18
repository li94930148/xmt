import type {
  ContentEditorAdapter,
  ContentEditorCapabilities,
  ContentEditorSaveContext,
} from '../contracts/contentEditorAdapter';

export interface ProductionEditorAdapterOptions {
  documentId: string;
  collaborationRoom: string;
  initialContent: string;
  readonly: boolean;
  capabilities: ContentEditorCapabilities;
  persist(content: string, context: ContentEditorSaveContext): Promise<void>;
}

/**
 * Maps already-resolved Production editor context onto the generic runtime
 * contract. Versioning, permissions, workflow, and API decisions stay with
 * the caller that supplies this context.
 */
export function createProductionEditorAdapter(
  options: ProductionEditorAdapterOptions,
): ContentEditorAdapter {
  return {
    documentId: options.documentId,
    collaborationRoom: options.collaborationRoom,
    initialContent: options.initialContent,
    readonly: options.readonly,
    capabilities: options.capabilities,
    persist: options.persist,
  };
}
