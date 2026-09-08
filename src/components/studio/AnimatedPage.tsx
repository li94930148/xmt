import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { pageVariants } from './motion';

export default function AnimatedPage({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div initial="initial" animate="animate" exit="exit" variants={pageVariants} className={className} data-page-transition="xmt-300ms">
      {children}
    </motion.div>
  );
}
