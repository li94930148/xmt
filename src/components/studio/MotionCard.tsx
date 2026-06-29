import type { ReactNode } from 'react';
import type { HTMLMotionProps } from 'framer-motion';
import { motion, useReducedMotion } from 'framer-motion';
import { twMerge } from 'tailwind-merge';
import { cardHover } from './motion';

type MotionCardProps = HTMLMotionProps<'div'> & {
  children: ReactNode;
  glow?: boolean;
};

export default function MotionCard({ children, className = '', glow = false, ...props }: MotionCardProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      whileHover={reduceMotion ? undefined : cardHover}
      className={twMerge(
        'rounded-card border border-studio-border-soft bg-studio-surface-glass shadow-card backdrop-blur-xl transition-[border-color,box-shadow,background-color] duration-200 hover:border-studio-border-active hover:shadow-glow-primary',
        glow ? 'shadow-glow-cyan' : '',
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
