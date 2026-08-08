import { useEffect, type ReactNode } from 'react';
import { useReactBitsAppearanceStore } from '@/store/reactBitsAppearanceStore';

export function ReactBitsAppearanceProvider({ children }: { children: ReactNode }) {
  const hydrate = useReactBitsAppearanceStore((state) => state.hydrate);
  const applyReducedMotionFallback = useReactBitsAppearanceStore((state) => state.applyReducedMotionFallback);
  const config = useReactBitsAppearanceStore((state) => state.config);
  useEffect(() => {
    hydrate();
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => applyReducedMotionFallback(media.matches);
    update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update);
  }, [applyReducedMotionFallback, hydrate]);
  useEffect(() => { document.documentElement.dataset.reactbitsPreset = config.presetId; document.documentElement.dataset.reactbitsMotion = config.motionMode; }, [config.motionMode, config.presetId]);
  return <>{children}</>;
}
