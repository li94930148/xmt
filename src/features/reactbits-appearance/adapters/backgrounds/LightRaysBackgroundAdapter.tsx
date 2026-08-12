import LightRays from '@/components/reactbits/backgrounds/LightRays/LightRays';
import type { BackgroundAdapterProps } from './types';

export default function LightRaysBackgroundAdapter({ intensity }: BackgroundAdapterProps) {
  const low = intensity === 'low';
  return <LightRays raysOrigin="top-center" raysColor="#60a5fa" raysSpeed={low ? 0.15 : 0.5} lightSpread={low ? 0.55 : 0.8} rayLength={low ? 1.1 : 1.5} pulsating={!low} followMouse={!low} mouseInfluence={low ? 0 : 0.08} noiseAmount={0.05} distortion={0.05} />;
}
