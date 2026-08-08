import { lazy } from 'react';
export const backgroundRegistry = {
  aurora: lazy(() => import('@/components/reactbits/backgrounds/Aurora/Aurora')),
  'dark-veil': lazy(() => import('@/components/reactbits/backgrounds/DarkVeil/DarkVeil')),
  silk: lazy(() => import('@/components/reactbits/backgrounds/Silk/Silk')),
  threads: lazy(() => import('@/components/reactbits/backgrounds/Threads/Threads')),
  'dot-grid': lazy(() => import('@/components/reactbits/backgrounds/DotGrid/DotGrid')),
  'light-rays': lazy(() => import('@/components/reactbits/backgrounds/LightRays/LightRays')),
  orb: lazy(() => import('@/components/reactbits/backgrounds/Orb/Orb')),
  'grid-motion': lazy(() => import('@/components/reactbits/backgrounds/GridMotion/GridMotion')),
  waves: lazy(() => import('@/components/reactbits/backgrounds/Waves/Waves')),
  particles: lazy(() => import('@/components/reactbits/backgrounds/Particles/Particles')),
} as const;
export const textRegistry = {
  'split-text': lazy(() => import('@/components/reactbits/text/SplitText/SplitText')), 'blur-text': lazy(() => import('@/components/reactbits/text/BlurText/BlurText')), 'gradient-text': lazy(() => import('@/components/reactbits/text/GradientText/GradientText')), 'shiny-text': lazy(() => import('@/components/reactbits/text/ShinyText/ShinyText')), 'rotating-text': lazy(() => import('@/components/reactbits/text/RotatingText/RotatingText')), 'decrypted-text': lazy(() => import('@/components/reactbits/text/DecryptedText/DecryptedText')), 'text-type': lazy(() => import('@/components/reactbits/text/TextType/TextType')), 'true-focus': lazy(() => import('@/components/reactbits/text/TrueFocus/TrueFocus')), 'scroll-reveal': lazy(() => import('@/components/reactbits/text/ScrollReveal/ScrollReveal')), 'count-up': lazy(() => import('@/components/reactbits/text/CountUp/CountUp')),
} as const;
export const revealRegistry = { 'animated-content': lazy(() => import('@/components/reactbits/animations/AnimatedContent/AnimatedContent')), 'fade-content': lazy(() => import('@/components/reactbits/animations/FadeContent/FadeContent')), 'gradual-blur': lazy(() => import('@/components/reactbits/animations/GradualBlur/GradualBlur')), 'pixel-transition': lazy(() => import('@/components/reactbits/animations/PixelTransition/PixelTransition')) } as const;
