import { buildResourceReferenceHtml, type ResourceReference } from './resourceReference';
import { userSafeDraftKey } from '@/platform/safe-draft';

export const DEFAULT_MATERIAL_WORKSPACE_HEIGHT = 360;
export const MIN_MATERIAL_WORKSPACE_HEIGHT = 240;

export function materialWorkspaceStorageKey(userId: number) {
  return `xmt:production-materials-height:v1:user:${userId}`;
}

export type ProductionMaterialRecoveryDraft = {
  version: 1;
  productionId: number;
  contentHtml: string;
  baselineContentHtml: string;
  baselineRevision: number;
};

export function productionMaterialDraftStorageKey(userId: number, productionId: number) {
  return userSafeDraftKey(userId, `production-material:${productionId}:v1`);
}

export function isProductionMaterialRecoveryDraft(value: unknown, productionId: number): value is ProductionMaterialRecoveryDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Record<string, unknown>;
  return draft.version === 1
    && draft.productionId === productionId
    && typeof draft.contentHtml === 'string'
    && typeof draft.baselineContentHtml === 'string'
    && Number.isSafeInteger(draft.baselineRevision)
    && Number(draft.baselineRevision) >= 0;
}

export function clampMaterialWorkspaceHeight(value: number, viewportHeight: number) {
  const maximum = Math.max(MIN_MATERIAL_WORKSPACE_HEIGHT, Math.floor(viewportHeight * 0.75));
  return Math.min(maximum, Math.max(MIN_MATERIAL_WORKSPACE_HEIGHT, Math.round(value)));
}

export function canPersistMaterialDraft(canManage: boolean) {
  return canManage;
}

// One empty paragraph represents two text newlines without an oversized visual gap.
const INSERTION_GAP_HTML = '<p><br></p>';

export function buildMaterialInsertionHtml(resources: readonly ResourceReference[]) {
  const nonEmpty = resources.map((resource) => buildResourceReferenceHtml(resource)).filter(Boolean);
  if (nonEmpty.length === 0) return '';
  return `${INSERTION_GAP_HTML}${nonEmpty.join(INSERTION_GAP_HTML)}${INSERTION_GAP_HTML}`;
}
