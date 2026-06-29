import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
};

export default function ActionButton({ children, className = '', variant = 'secondary', ...props }: ActionButtonProps) {
  const variants = {
    primary: 'border-studio-primary/40 bg-studio-primary text-white shadow-glow-primary hover:bg-[#6A91FF]',
    secondary: 'border-studio-border-soft bg-white/[0.06] text-studio-text-primary hover:border-studio-border-active hover:bg-white/[0.09]',
    ghost: 'border-transparent bg-transparent text-studio-text-secondary hover:bg-white/[0.06] hover:text-studio-text-primary',
  };

  return (
    <button
      className={twMerge(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-button border px-4 py-2.5 text-sm font-semibold leading-snug transition-all duration-200 hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
