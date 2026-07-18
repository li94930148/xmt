import type {
  ContentEditorAdapter,
  ContentEditorCapabilities,
  ContentEditorSaveContext,
} from '../contracts/contentEditorAdapter';

export interface ShootingEditorAdapterOptions {
  documentId: string;
  collaborationRoom: string;
  initialContent: string;
  readonly: boolean;
  capabilities: ContentEditorCapabilities;
  persist(content: string, context: ContentEditorSaveContext): Promise<void>;
}

/**
 * Maps already-resolved Shooting editor context onto the generic runtime
 * contract. Workflow, Publishing, permissions, and Production references
 * remain owned by the caller that supplies this context.
 */
export function createShootingEditorAdapter(
  options: ShootingEditorAdapterOptions,
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
