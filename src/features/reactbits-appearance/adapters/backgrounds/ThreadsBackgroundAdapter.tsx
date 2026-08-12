import Threads from '@/components/reactbits/backgrounds/Threads/Threads';
import type { BackgroundAdapterProps } from './types';

export default function ThreadsBackgroundAdapter({ intensity }: BackgroundAdapterProps) {
  const low = intensity === 'low';
  return <Threads color={[0.42, 0.55, 1]} amplitude={low ? 0.35 : intensity === 'high' ? 0.95 : 0.62} distance={low ? 0.6 : 1} enableMouseInteraction={!low} />;
}
