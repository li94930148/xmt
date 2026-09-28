import { useMemo } from 'react';
import { useAppStore } from '@/store';
import Aurora from '@/components/reactbits/backgrounds/Aurora/Aurora';
import type { BackgroundAdapterProps } from './types';

export default function AuroraBackgroundAdapter({ intensity }: BackgroundAdapterProps) {
  const low = intensity === 'low';
  const theme = useAppStore((state) => state.theme);
  const colorStops = useMemo(() => {
    const tokens = [
      { name: '--xmt-primary', fallback: '#6B8CFF' },
      { name: '--xmt-cyan', fallback: '#5CE1E6' },
      { name: '--xmt-violet', fallback: '#A78BFA' },
    ];
    return tokens.map(({ name, fallback }) => {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return /^#[\da-f]{6}$/i.test(value) ? value : fallback;
    });
  }, [theme]);

  return <Aurora colorStops={colorStops} amplitude={low ? 0.45 : intensity === 'high' ? 1.2 : 0.8} blend={low ? 0.28 : 0.5} speed={low ? 0.25 : intensity === 'high' ? 0.85 : 0.55} />;
}
