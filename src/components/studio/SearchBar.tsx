import { Search } from 'lucide-react';
import { useId, type InputHTMLAttributes } from 'react';
import { twMerge } from 'tailwind-merge';

export default function SearchBar({ className = '', id, name, 'aria-label': ariaLabel, placeholder, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const inputId = id || `xmt-search-${generatedId}`;
  const inputName = name || `search-${generatedId}`;
  const accessibleName = typeof ariaLabel === 'string' && ariaLabel.trim()
    ? ariaLabel
    : typeof placeholder === 'string' && placeholder.trim()
      ? placeholder
      : '搜索';

  return (
    <label htmlFor={inputId} className={twMerge('relative block', className)}>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-studio-text-muted" />
      <input
        id={inputId}
        name={inputName}
        className="xmt-field min-h-10 py-2 pl-9 pr-3 text-sm leading-snug"
        aria-label={accessibleName}
        placeholder={placeholder}
        {...props}
      />
    </label>
  );
}
