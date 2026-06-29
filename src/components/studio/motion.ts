import type { TargetAndTransition, Variants } from 'framer-motion';

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.18, ease: 'easeOut' } },
  exit: { opacity: 0, y: 8, transition: { duration: 0.12, ease: 'easeIn' } },
};

export const cardHover: TargetAndTransition = {
  y: -2,
  transition: { duration: 0.16, ease: 'easeOut' },
};
