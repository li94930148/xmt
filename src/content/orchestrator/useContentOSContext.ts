import { useMemo } from 'react';
import { orchestrateDocContext } from './contentOSOrchestrator';
import type { ContentOSContext } from './types';

export function useContentOSContext(docId: string, refreshKey = 0): ContentOSContext {
  return useMemo(() => orchestrateDocContext(docId), [docId, refreshKey]);
}
