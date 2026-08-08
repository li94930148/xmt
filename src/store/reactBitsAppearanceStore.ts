import { create } from 'zustand';
import { defaultReactBitsAppearanceConfig, parseReactBitsAppearanceConfig, REACT_BITS_APPEARANCE_KEY, type ReactBitsAppearanceConfig } from '@/features/reactbits-appearance/types';
import { reactBitsPresets } from '@/features/reactbits-appearance/presets';

type Store = { config: ReactBitsAppearanceConfig; draftConfig: ReactBitsAppearanceConfig; setDraftField: (path: string, value: unknown) => void; applyPreset: (id: string) => void; save: () => void; reset: () => void; importConfig: (raw: string) => boolean; exportConfig: () => string; hydrate: () => void; applyReducedMotionFallback: (reduced: boolean) => void };
const clone = (value: ReactBitsAppearanceConfig) => JSON.parse(JSON.stringify(value)) as ReactBitsAppearanceConfig;
const setPath = (config: ReactBitsAppearanceConfig, path: string, value: unknown) => { const next = clone(config) as Record<string, any>; const keys = path.split('.'); let cursor: Record<string, any> = next; keys.slice(0, -1).forEach((key) => { cursor = cursor[key]; }); cursor[keys.at(-1)!] = value; return next as ReactBitsAppearanceConfig; };
export const useReactBitsAppearanceStore = create<Store>((set, get) => ({
  config: clone(defaultReactBitsAppearanceConfig), draftConfig: clone(defaultReactBitsAppearanceConfig),
  setDraftField: (path, value) => set((state) => ({ draftConfig: setPath(state.draftConfig, path, value) })),
  applyPreset: (id) => { const found = reactBitsPresets.find((item) => item.id === id); if (found) set({ draftConfig: clone(found.config) }); },
  save: () => { const config = clone(get().draftConfig); localStorage.setItem(REACT_BITS_APPEARANCE_KEY, JSON.stringify(config)); set({ config }); },
  reset: () => set({ draftConfig: clone(defaultReactBitsAppearanceConfig) }),
  importConfig: (raw) => { try { const parsed = parseReactBitsAppearanceConfig(JSON.parse(raw)); if (!parsed) return false; set({ draftConfig: parsed }); return true; } catch { return false; } },
  exportConfig: () => JSON.stringify(get().draftConfig, null, 2),
  hydrate: () => { try { const parsed = parseReactBitsAppearanceConfig(JSON.parse(localStorage.getItem(REACT_BITS_APPEARANCE_KEY) || 'null')); if (parsed) set({ config: parsed, draftConfig: clone(parsed) }); } catch {} },
  applyReducedMotionFallback: (reduced) => { if (reduced) set((state) => ({ config: { ...state.config, motionMode: state.config.motionMode === 'off' ? 'off' : 'reduced' } })); },
}));
