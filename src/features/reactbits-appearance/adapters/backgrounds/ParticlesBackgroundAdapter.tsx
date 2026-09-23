import Particles from '@/components/reactbits/backgrounds/Particles/Particles';
import type { BackgroundAdapterProps } from './types';

export default function ParticlesBackgroundAdapter({ intensity }: BackgroundAdapterProps) {
  const low = intensity === 'low';
  return <Particles particleCount={low ? 36 : intensity === 'high' ? 140 : 80} particleSpread={low ? 6 : 10} speed={low ? 0.03 : 0.1} particleColors={['var(--xmt-primary)', 'var(--xmt-cyan)', 'var(--xmt-violet)']} moveParticlesOnHover={!low} alphaParticles particleBaseSize={low ? 50 : 90} disableRotation={low} pixelRatio={1} />;
}
