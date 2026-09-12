export const DEFAULT_MATERIAL_WORKSPACE_HEIGHT = 360;
export const MIN_MATERIAL_WORKSPACE_HEIGHT = 240;

export function materialWorkspaceStorageKey(userId: number) {
  return `xmt:production-materials-height:v1:user:${userId}`;
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

export function buildMaterialInsertionHtml(contents: readonly string[]) {
  const nonEmpty = contents.map((content) => content.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return '';
  return `${INSERTION_GAP_HTML}${nonEmpty.join(INSERTION_GAP_HTML)}${INSERTION_GAP_HTML}`;
}
