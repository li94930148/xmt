import { createContext, useContext, type ReactNode } from 'react';
import { useReactBitsAppearanceStore } from '@/store/reactBitsAppearanceStore';
import type { ReactBitsAppearanceConfig } from './types';

const PreviewContext = createContext<ReactBitsAppearanceConfig | null>(null);

/** Keeps draft-only preview choices inside the settings panel until Save. */
export function ReactBitsAppearancePreviewProvider({ config, children }: { config: ReactBitsAppearanceConfig; children: ReactNode }) {
  return <PreviewContext.Provider value={config}>{children}</PreviewContext.Provider>;
}

export function useEffectiveReactBitsAppearanceConfig() {
  const preview = useContext(PreviewContext);
  const persisted = useReactBitsAppearanceStore((state) => state.config);
  return preview ?? persisted;
}
