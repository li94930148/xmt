import { Search } from 'lucide-react';
import type { InputHTMLAttributes } from 'react';
import { twMerge } from 'tailwind-merge';

export default function SearchBar({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={twMerge('relative block', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-studio-text-muted" />
      <input
        className="xmt-field min-h-10 py-2 pl-9 pr-3 text-sm leading-snug"
        {...props}
      />
    </label>
  );
}
