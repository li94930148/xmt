import Silk from '@/components/reactbits/backgrounds/Silk/Silk';
import type { BackgroundAdapterProps } from './types';
import { createXmtSafeR3FEvents } from '../../createXmtSafeR3FEvents';

export default function SilkBackgroundAdapter({ intensity }: BackgroundAdapterProps) {
  const low = intensity === 'low';
  return <Silk color="#5c7cfa" speed={low ? 1.5 : intensity === 'high' ? 4 : 2.5} scale={low ? 0.8 : 1.15} noiseIntensity={low ? 0.8 : 1.25} rotation={0.1} canvasEvents={createXmtSafeR3FEvents} />;
}
