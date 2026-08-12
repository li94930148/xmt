import { Suspense, useEffect, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { useAppStore } from '@/store';
import { textRegistry } from './componentRegistry';
import { useEffectiveReactBitsAppearanceConfig } from './ReactBitsAppearancePreviewContext';

type Semantic = 'brand-title' | 'page-title' | 'section-title' | 'metric' | 'ai-label' | 'empty-state';
const semanticClasses: Record<Semantic, string> = {
  'brand-title': 'block text-[clamp(1.75rem,9vw,3rem)] leading-[1.08] sm:text-[clamp(2rem,5vw,4.75rem)]',
  'page-title': 'block text-[clamp(1.5rem,3vw,2.5rem)] leading-[1.15]',
  'section-title': 'inline-block text-inherit leading-[1.2]',
  metric: 'inline-block tabular-nums leading-[1.1]',
  'ai-label': 'inline-block text-[clamp(0.875rem,2vw,1.25rem)] leading-[1.2]',
  'empty-state': 'inline-block max-w-full text-[min(1.5rem,6vw)] leading-[1.2]',
};

function useNarrowViewport() {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  useEffect(() => {
    const update = () => setNarrow(window.innerWidth < 640);
    window.addEventListener('resize', update, { passive: true });
    return () => window.removeEventListener('resize', update);
  }, []);
  return narrow;
}

export function ReactBitsTextSlot({ semantic, children, className = '', value, themeOverride }: { semantic: Semantic; children: string; className?: string; value?: number; themeOverride?: 'light' | 'dark' }) {
  const config = useEffectiveReactBitsAppearanceConfig();
  const appTheme = useAppStore((state) => state.theme);
  const theme = themeOverride ?? appTheme;
  const narrow = useNarrowViewport();
  const id = semantic === 'metric' ? config.numberText.component : config.headingText.component;
  const safeClassName = twMerge(semanticClasses[semantic], semantic === 'brand-title' && 'overflow-visible leading-[1.08]', className);
  const fallback = <span className={safeClassName}>{children}</span>;
  const canAnimate = id !== 'none' && config.motionMode !== 'off' && semantic !== 'section-title';
  const trueFocusAllowed = id === 'true-focus' && (semantic === 'brand-title' || semantic === 'ai-label') && !narrow;
  if (!canAnimate || (id === 'true-focus' && !trueFocusAllowed)) return fallback;
  const Component = textRegistry[id as keyof typeof textRegistry];
  const textColor = theme === 'light' ? '#0F172A' : '#E2E8F0';
  const props = id === 'count-up'
    ? { to: value ?? (Number(children.replace(/[^0-9.-]/g, '')) || 0), duration: config.motionMode === 'reduced' ? 0.4 : 1.1, className: safeClassName }
    : id === 'gradient-text'
      ? { children, className: safeClassName, colors: theme === 'light' ? ['#1D4ED8', '#0891B2', '#7C3AED'] : ['#67E8F9', '#A78BFA', '#F0ABFC'] }
      : id === 'shiny-text'
        ? { text: children, className: safeClassName, color: textColor, shineColor: theme === 'light' ? '#2563EB' : '#FFFFFF' }
        : id === 'rotating-text'
          ? { texts: [children], className: safeClassName, auto: false }
          : id === 'true-focus'
            ? { sentence: children, manualMode: config.motionMode === 'reduced', borderColor: theme === 'light' ? '#2563EB' : '#67E8F9', glowColor: theme === 'light' ? 'rgba(37,99,235,.45)' : 'rgba(103,232,249,.45)' }
            : id === 'scroll-reveal'
              ? { children, containerClassName: safeClassName, textClassName: safeClassName }
              : id === 'blur-text'
                ? { text: children, className: safeClassName, delay: 55, animateBy: 'words', direction: 'top' }
                : id === 'split-text'
                  ? { text: children, className: safeClassName, delay: 55, duration: 0.55, tag: 'span', textAlign: 'left' }
                  : id === 'decrypted-text'
                    // The official component applies className to every character;
                    // keep character spans inline and style only its parent wrapper.
                    ? { text: children, className: 'inline', parentClassName: safeClassName }
                  : { text: children, className: safeClassName };
  const safetyStyle = semantic === 'brand-title'
    ? { display: 'block', paddingTop: '0.08em', paddingBottom: '0.14em', marginBlock: 0 }
    : { paddingBlock: '0.12em', marginBlock: '-0.12em' };
  return <span className="reactbits-text-safe inline-block max-w-full min-w-0 overflow-visible align-baseline" style={safetyStyle}><Suspense fallback={fallback}><Component {...(props as any)} /></Suspense></span>;
}
