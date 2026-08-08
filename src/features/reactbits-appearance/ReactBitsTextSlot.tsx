import { Suspense } from 'react';
import { textRegistry } from './componentRegistry';
import { useEffectiveReactBitsAppearanceConfig } from './ReactBitsAppearancePreviewContext';
export function ReactBitsTextSlot({ semantic, children, className = '', value }: { semantic: 'brand-title' | 'page-title' | 'section-title' | 'metric' | 'ai-label' | 'empty-state'; children: string; className?: string; value?: number }) {
  const config = useEffectiveReactBitsAppearanceConfig();
  const id = semantic === 'metric' ? config.numberText.component : config.headingText.component;
  if (id === 'none' || config.motionMode === 'off' || semantic === 'section-title') return <span className={className}>{children}</span>;
  const Component = textRegistry[id as keyof typeof textRegistry];
  const props = id === 'count-up'
    ? { to: value ?? (Number(children.replace(/[^0-9.-]/g, '')) || 0), duration: config.motionMode === 'reduced' ? 0.4 : 1.1, className }
    : id === 'gradient-text'
      ? { children, className, colors: ['#67e8f9', '#a78bfa', '#f0abfc'] }
      : id === 'rotating-text'
        ? { texts: [children], className, auto: false }
        : id === 'true-focus'
          ? { sentence: children, manualMode: config.motionMode === 'reduced' }
          : id === 'scroll-reveal'
            ? { children, containerClassName: className }
            : id === 'blur-text'
              ? { text: children, className, delay: 55, animateBy: 'words', direction: 'top' }
              : id === 'split-text'
                ? { text: children, className, delay: 55, duration: 0.55 }
                : { text: children, className };
  return <Suspense fallback={<span className={className}>{children}</span>}><Component {...(props as any)} /></Suspense>;
}
