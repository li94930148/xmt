import type { ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';

export default function StudioPageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-studio-text-primary md:text-[28px] md:leading-tight">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-studio-text-secondary">{description}</p>
        ) : null}
      </div>
      {actions ? <div className={twMerge('flex flex-wrap items-center gap-2.5')}>{actions}</div> : null}
    </div>
  );
}
