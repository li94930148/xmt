import DotGrid from '@/components/reactbits/backgrounds/DotGrid/DotGrid';
import type { BackgroundAdapterProps } from './types';

export default function DotGridBackgroundAdapter({ intensity }: BackgroundAdapterProps) {
  const low = intensity === 'low';
  return <DotGrid dotSize={low ? 3 : 4} gap={low ? 30 : 24} baseColor="#334155" activeColor="#60a5fa" proximity={low ? 80 : 140} shockStrength={low ? 1.5 : 3} returnDuration={low ? 0.7 : 1.2} />;
}
