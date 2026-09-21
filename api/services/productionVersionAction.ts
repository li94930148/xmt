export type ProductionVersionAction = 'minor' | 'major' | 'none';

/** A version is created only by an explicit version command. */
export function resolveProductionVersionAction(value: unknown): ProductionVersionAction {
  return value === 'major' || value === 'minor' ? value : 'none';
}
