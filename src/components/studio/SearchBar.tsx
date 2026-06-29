import { Search } from 'lucide-react';
import type { InputHTMLAttributes } from 'react';
import { twMerge } from 'tailwind-merge';

export default function SearchBar({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={twMerge('relative block', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-studio-text-muted" />
      <input
        className="min-h-10 w-full rounded-button border border-studio-border-soft bg-white/[0.05] py-2 pl-9 pr-3 text-sm leading-snug text-studio-text-primary outline-none transition placeholder:text-studio-text-muted focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
        {...props}
      />
    </label>
  );
}
