import type { ReactNode } from 'react';
import { useEffectiveReactBitsAppearanceConfig } from '../ReactBitsAppearancePreviewContext';

export type NavigationSemantic = 'page-tabs' | 'analytics-dimensions' | 'creator-sections' | 'workflow-tabs' | 'settings-tabs' | 'home-tools';
export function ReactBitsNavigationSlot({ semantic, children, className = '', 'aria-label': ariaLabel }: { semantic: NavigationSemantic; children: ReactNode; className?: string; 'aria-label'?: string }) {
  const config = useEffectiveReactBitsAppearanceConfig();
  const dock = semantic === 'home-tools' && config.navigation.component === 'dock';
  const pill = semantic !== 'home-tools' && config.navigation.component === 'pill-nav';
  return <nav aria-label={ariaLabel} data-reactbits-navigation={`${semantic}:${dock ? 'dock' : pill ? 'pill-nav' : 'standard'}`} className={`${className} ${dock ? 'rounded-2xl border border-white/15 bg-slate-950/70 p-2 shadow-xl' : pill ? 'rounded-full border border-studio-border-soft bg-studio-surface/80 p-1.5' : ''}`}>{children}</nav>;
}
