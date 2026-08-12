import DarkVeil from '@/components/reactbits/backgrounds/DarkVeil/DarkVeil';
import type { BackgroundAdapterProps } from './types';

export default function DarkVeilBackgroundAdapter({ intensity }: BackgroundAdapterProps) {
  const low = intensity === 'low';
  return <DarkVeil hueShift={218} speed={low ? 0.2 : 0.45} noiseIntensity={low ? 0.04 : 0.1} scanlineIntensity={0} warpAmount={low ? 0.12 : 0.25} resolutionScale={low ? 0.7 : 1} />;
}
