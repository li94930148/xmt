import { lazy } from 'react';
export const backgroundRegistry = {
  aurora: lazy(() => import('./adapters/backgrounds/AuroraBackgroundAdapter')),
  'dark-veil': lazy(() => import('./adapters/backgrounds/DarkVeilBackgroundAdapter')),
  silk: lazy(() => import('./adapters/backgrounds/SilkBackgroundAdapter')),
  threads: lazy(() => import('./adapters/backgrounds/ThreadsBackgroundAdapter')),
  'dot-grid': lazy(() => import('./adapters/backgrounds/DotGridBackgroundAdapter')),
  'light-rays': lazy(() => import('./adapters/backgrounds/LightRaysBackgroundAdapter')),
  orb: lazy(() => import('./adapters/backgrounds/OrbBackgroundAdapter')),
  'grid-motion': lazy(() => import('./adapters/backgrounds/GridMotionBackgroundAdapter')),
  waves: lazy(() => import('./adapters/backgrounds/WavesBackgroundAdapter')),
  particles: lazy(() => import('./adapters/backgrounds/ParticlesBackgroundAdapter')),
} as const;
export const textRegistry = {
  'split-text': lazy(() => import('@/components/reactbits/text/SplitText/SplitText')), 'blur-text': lazy(() => import('@/components/reactbits/text/BlurText/BlurText')), 'gradient-text': lazy(() => import('@/components/reactbits/text/GradientText/GradientText')), 'shiny-text': lazy(() => import('@/components/reactbits/text/ShinyText/ShinyText')), 'rotating-text': lazy(() => import('@/components/reactbits/text/RotatingText/RotatingText')), 'decrypted-text': lazy(() => import('@/components/reactbits/text/DecryptedText/DecryptedText')), 'text-type': lazy(() => import('@/components/reactbits/text/TextType/TextType')), 'true-focus': lazy(() => import('@/components/reactbits/text/TrueFocus/TrueFocus')), 'scroll-reveal': lazy(() => import('@/components/reactbits/text/ScrollReveal/ScrollReveal')), 'count-up': lazy(() => import('@/components/reactbits/text/CountUp/CountUp')),
} as const;
export const revealRegistry = { 'animated-content': lazy(() => import('@/components/reactbits/animations/AnimatedContent/AnimatedContent')), 'fade-content': lazy(() => import('@/components/reactbits/animations/FadeContent/FadeContent')), 'gradual-blur': lazy(() => import('@/components/reactbits/animations/GradualBlur/GradualBlur')), 'pixel-transition': lazy(() => import('@/components/reactbits/animations/PixelTransition/PixelTransition')) } as const;
