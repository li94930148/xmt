import type { ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';

export default function XMTCard({ children, className, ...props }: HTMLMotionProps<'div'> & { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      whileHover={reduceMotion ? undefined : { y: -2, transition: { duration: 0.16 } }}
      className={twMerge('rounded-card border border-studio-border-soft bg-studio-surface-glass shadow-card backdrop-blur-xl transition-[border-color,box-shadow] duration-200 hover:border-studio-border-active hover:shadow-glow-primary', className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}
