import Aurora from '@/components/reactbits/backgrounds/Aurora/Aurora';
import type { BackgroundAdapterProps } from './types';

export default function AuroraBackgroundAdapter({ intensity }: BackgroundAdapterProps) {
  const low = intensity === 'low';
  return <Aurora colorStops={['#5c7cfa', '#22d3ee', '#a78bfa']} amplitude={low ? 0.45 : intensity === 'high' ? 1.2 : 0.8} blend={low ? 0.28 : 0.5} speed={low ? 0.25 : intensity === 'high' ? 0.85 : 0.55} />;
}
