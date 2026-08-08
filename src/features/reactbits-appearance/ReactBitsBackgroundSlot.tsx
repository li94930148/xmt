import { Suspense } from 'react';
import { backgroundRegistry } from './componentRegistry';
import { useEffectiveReactBitsAppearanceConfig } from './ReactBitsAppearancePreviewContext';
import type { AppearancePage } from './types';
export function ReactBitsBackgroundSlot({ page, className = '', fallbackClassName = '' }: { page: AppearancePage; className?: string; fallbackClassName?: string }) {
  const config = useEffectiveReactBitsAppearanceConfig();
  const component = config.background.component;
  const disabled = config.motionMode === 'off' || !config.applyTo[page] || component === 'none' || (page === 'editor');
  if (disabled || typeof window === 'undefined' || !window.WebGLRenderingContext) return <div aria-hidden className={`absolute inset-0 ${fallbackClassName}`} />;
  const Background = backgroundRegistry[component as keyof typeof backgroundRegistry];
  const low = config.motionMode === 'reduced' || config.background.intensity === 'low' || window.innerWidth < 640;
  return <Suspense fallback={<div aria-hidden className={`absolute inset-0 ${fallbackClassName}`} />}><div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}><Background {...({ amplitude: low ? 0.45 : 0.9, speed: low ? 0.25 : 0.7, particleCount: low ? 40 : 120, color: '#6b8cff', colors: ['#5c7cfa', '#22d3ee', '#a78bfa'], items: ['XMT', '协作', '创作', '洞察'] } as any)} /></div></Suspense>;
}
