import GridMotion from '@/components/reactbits/backgrounds/GridMotion/GridMotion';
import type { BackgroundAdapterProps } from './types';

export default function GridMotionBackgroundAdapter(_: BackgroundAdapterProps) {
  return <GridMotion items={['XMT', '协作', '创作', '洞察']} gradientColor="rgba(79,70,229,0.42)" />;
}
