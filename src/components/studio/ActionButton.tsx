import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ReactBitsButtonSlot, type ReactBitsButtonVariant } from '@/features/reactbits-appearance/ReactBitsButtonSlot';

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ReactBitsButtonVariant;
};

export default function ActionButton({ children, className = '', variant = 'secondary', ...props }: ActionButtonProps) {
  return <ReactBitsButtonSlot className={className} variant={variant} {...props}>{children}</ReactBitsButtonSlot>;
}
