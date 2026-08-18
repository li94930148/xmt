import type { ReactNode } from 'react';
import SpotlightCard from '@/components/reactbits/components/SpotlightCard/SpotlightCard';
import GlassSurface from '@/components/reactbits/components/GlassSurface/GlassSurface';
import { useEffectiveReactBitsAppearanceConfig } from './ReactBitsAppearancePreviewContext';

export type CardSemantic = 'dashboard-metrics' | 'topic-card' | 'creator-profile' | 'content-highlight' | 'tool-panel' | 'ai-entry' | 'workflow-summary' | 'settings-panel' | 'report-card' | 'analytics-metric';
const warned = new Set<string>();
const safeSurface = (semantic: CardSemantic) => ['tool-panel', 'settings-panel', 'report-card'].includes(semantic) ? 'glass' : 'spotlight';

export function ReactBitsCardSlot({ children, semantic, className = '' }: { children: ReactNode; semantic: CardSemantic; className?: string }) {
  const config = useEffectiveReactBitsAppearanceConfig();
  if (config.motionMode === 'off') return <div className={className}>{children}</div>;
  const wanted = config.card.component;
  const supported = wanted === 'glass-surface' ? 'glass' : wanted === 'spotlight-card' ? 'spotlight' : safeSurface(semantic);
  if (import.meta.env.DEV && supported === safeSurface(semantic) && wanted !== 'spotlight-card' && wanted !== 'glass-surface' && !warned.has(`${wanted}:${semantic}`)) { warned.add(`${wanted}:${semantic}`); console.warn(`[React Bits] ${wanted} 不适用于 ${semantic}，已使用安全官方映射。`); }
  // GlassSurface centers its immediate children. Report cards contain several
  // stacked panels, so give that surface one full-width flow wrapper instead
  // of letting the panels become flex-row siblings on wide screens.
  if (supported === 'glass') return <GlassSurface className={className} width="100%" height="auto" borderRadius={16} backgroundOpacity={0.14}>{semantic === 'report-card' ? <div className={`w-full ${className}`}>{children}</div> : children}</GlassSurface>;
  return <SpotlightCard className={className} spotlightColor="rgba(77, 214, 255, 0.18)">{children}</SpotlightCard>;
}
