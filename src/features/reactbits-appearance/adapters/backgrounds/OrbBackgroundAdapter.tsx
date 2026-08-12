import Orb from '@/components/reactbits/backgrounds/Orb/Orb';
import type { BackgroundAdapterProps } from './types';

export default function OrbBackgroundAdapter({ intensity }: BackgroundAdapterProps) {
  const low = intensity === 'low';
  return <Orb hue={220} hoverIntensity={low ? 0.05 : 0.18} rotateOnHover={!low} backgroundColor="#020617" />;
}
