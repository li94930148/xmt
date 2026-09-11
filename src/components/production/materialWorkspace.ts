export const DEFAULT_MATERIAL_WORKSPACE_HEIGHT = 360;
export const MIN_MATERIAL_WORKSPACE_HEIGHT = 240;

export function materialWorkspaceStorageKey(userId: number) {
  return `xmt:production-materials-height:v1:user:${userId}`;
}

export function clampMaterialWorkspaceHeight(value: number, viewportHeight: number) {
  const maximum = Math.max(MIN_MATERIAL_WORKSPACE_HEIGHT, Math.floor(viewportHeight * 0.75));
  return Math.min(maximum, Math.max(MIN_MATERIAL_WORKSPACE_HEIGHT, Math.round(value)));
}

export class LatestOnlySaveQueue<TInput, TResult> {
  private generation = 0;
  private disposed = false;

  dispose() {
    this.disposed = true;
    this.generation += 1;
  }

  async run(input: TInput, save: (input: TInput) => Promise<TResult>) {
    const generation = ++this.generation;
    const result = await save(input);
    return { result, current: !this.disposed && generation === this.generation };
  }
}
