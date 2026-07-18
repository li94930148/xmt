import type {
  AggregateDisposeResult,
  ContentEditorSaveStrategy,
  GracefulDisposeReason,
  ManualSaveResult,
} from '../contracts/contentEditorAdapter';
import type { ManualSaveController } from './ManualSaveController';

export function shouldScheduleRuntimeAutosave(strategy: ContentEditorSaveStrategy): boolean {
  return strategy === 'autosave';
}

export function dispatchManualSave(
  strategy: ContentEditorSaveStrategy,
  controller: ManualSaveController,
  content: string,
  revision: number,
): Promise<ManualSaveResult> {
  if (strategy !== 'manual') return Promise.resolve({ status: 'cancelled', revision });
  return controller.manualSave(content, revision);
}

export function createNotApplicableDisposeResult(
  reason: GracefulDisposeReason,
  latestRevision: number,
  persistedRevision: number,
): AggregateDisposeResult {
  return {
    outcome: 'not_applicable',
    reason,
    durability: {
      id: 'autosave',
      role: 'durability',
      status: 'skipped',
      detail: 'not_applicable',
    },
    bestEffort: [],
    latestRevision,
    persistedRevision,
    degraded: false,
  };
}
