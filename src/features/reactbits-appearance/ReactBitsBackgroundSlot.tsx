import { Suspense } from 'react';
import { backgroundRegistry } from './componentRegistry';
import { useEffectiveReactBitsAppearanceConfig } from './ReactBitsAppearancePreviewContext';
import { ReactBitsSlotErrorBoundary } from './ReactBitsSlotErrorBoundary';
import type { AppearancePage } from './types';
export function ReactBitsBackgroundSlot({ page, className = '', fallbackClassName = '', previewMode = false, forceRender = false }: { page: AppearancePage; className?: string; fallbackClassName?: string; previewMode?: boolean; forceRender?: boolean }) {
  const config = useEffectiveReactBitsAppearanceConfig();
  const component = config.background.component;
  // DarkVeil's registry shader requires a WebGL program variant that is not
  // available in every Chromium/OGL combination. Preserve the official source,
  // but use the documented static background fallback rather than letting it
  // bubble into the application error boundary.
  const unsupportedWebGLPath = component === 'dark-veil';
  const disabled = config.motionMode === 'off' || (!forceRender && !config.applyTo[page]) || component === 'none' || (!previewMode && page === 'editor') || unsupportedWebGLPath || typeof window === 'undefined' || !window.WebGLRenderingContext;
  const shouldRenderDynamic = !disabled;
  const shouldRenderSilk = shouldRenderDynamic && component === 'silk';

  const Background = backgroundRegistry[component as keyof typeof backgroundRegistry];
  const SilkBackground = backgroundRegistry.silk;
  const low = config.motionMode === 'reduced' || config.background.intensity === 'low' || window.innerWidth < 640;
  const fallback = <div aria-hidden className={`absolute inset-0 ${fallbackClassName}`} />;
  const dynamicIntensity = low ? 'low' : config.background.intensity;
  return <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
    {fallback}
    {component === 'silk' && shouldRenderSilk && SilkBackground ? <ReactBitsSlotErrorBoundary componentName="silk" fallback={fallback}><Suspense fallback={fallback}><SilkBackground intensity={dynamicIntensity} /></Suspense></ReactBitsSlotErrorBoundary> : null}
    {component !== 'silk' && shouldRenderDynamic && Background ? <ReactBitsSlotErrorBoundary componentName={component} fallback={fallback}><Suspense fallback={fallback}><Background intensity={dynamicIntensity} /></Suspense></ReactBitsSlotErrorBoundary> : null}
  </div>;
}
