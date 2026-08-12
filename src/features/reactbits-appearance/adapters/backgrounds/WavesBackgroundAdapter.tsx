import Waves from '@/components/reactbits/backgrounds/Waves/Waves';
import type { BackgroundAdapterProps } from './types';

export default function WavesBackgroundAdapter({ intensity }: BackgroundAdapterProps) {
  const low = intensity === 'low';
  return <Waves lineColor="#60a5fa" backgroundColor="transparent" waveSpeedX={low ? 0.004 : 0.012} waveSpeedY={low ? 0.002 : 0.006} waveAmpX={low ? 12 : 28} waveAmpY={low ? 8 : 16} />;
}
