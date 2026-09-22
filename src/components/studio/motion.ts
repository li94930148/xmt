import type { TargetAndTransition, Variants } from 'motion/react';

export const easeOutExpo = [0.22, 1, 0.36, 1] as const;

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: easeOutExpo },
  },
  exit: {
    opacity: 0,
    y: 6,
    transition: { duration: 0.14, ease: 'easeIn' },
  },
};

export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.045, delayChildren: 0.04 },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: easeOutExpo },
  },
};

export const cardHover: TargetAndTransition = {
  y: -2,
  transition: { duration: 0.2, ease: easeOutExpo },
};

export const modalVariants: Variants = {
  initial: { opacity: 0, y: 10, scale: 0.985 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.22, ease: easeOutExpo },
  },
  exit: {
    opacity: 0,
    y: 6,
    scale: 0.99,
    transition: { duration: 0.14, ease: 'easeIn' },
  },
};
