import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { pageVariants } from './motion';

export default function AnimatedPage({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div initial="initial" animate="animate" exit="exit" variants={pageVariants} className={className}>
      {children}
    </motion.div>
  );
}
