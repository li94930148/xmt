import type { ReactNode } from 'react';
import SpotlightCard from '@/components/reactbits/components/SpotlightCard/SpotlightCard';
import GlassSurface from '@/components/reactbits/components/GlassSurface/GlassSurface';
import { useEffectiveReactBitsAppearanceConfig } from './ReactBitsAppearancePreviewContext';

/** Business adapter for the selected official React Bits card treatment. */
export function ReactBitsCardSlot({ children, className = '' }: { children: ReactNode; className?: string }) {
  const config = useEffectiveReactBitsAppearanceConfig();
  if (config.motionMode === 'off' || config.card.component === 'standard') return <div className={className}>{children}</div>;
  if (config.card.component === 'spotlight-card') return <SpotlightCard className={className} spotlightColor="rgba(77, 214, 255, 0.18)">{children}</SpotlightCard>;
  if (config.card.component === 'glass-surface') return <GlassSurface className={className} borderRadius={16} backgroundOpacity={0.14}>{children}</GlassSurface>;
  return <div className={className}>{children}</div>;
}
