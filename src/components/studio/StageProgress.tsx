import { twMerge } from 'tailwind-merge';

export type StageItem = {
  label: string;
  state?: 'done' | 'active' | 'pending' | 'blocked';
};

export default function StageProgress({ stages, className = '' }: { stages: StageItem[]; className?: string }) {
  return (
    <div className={twMerge('flex flex-wrap items-start gap-2', className)}>
      {stages.map((stage, index) => {
        const state = stage.state || 'pending';
        const dotClass =
          state === 'done'
            ? 'bg-studio-success'
            : state === 'active'
              ? 'bg-studio-cyan shadow-glow-cyan'
              : state === 'blocked'
                ? 'bg-studio-coral'
                : 'bg-slate-600';

        return (
          <div key={`${stage.label}-${index}`} className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex min-w-0 flex-col items-center gap-1">
              <span className={twMerge('h-2.5 w-2.5 rounded-full ring-4 ring-white/[0.04]', dotClass)} />
              <span className="max-w-20 text-center text-[10px] font-medium leading-snug text-studio-text-muted">{stage.label}</span>
            </div>
            {index < stages.length - 1 ? <span className="h-px flex-1 bg-studio-border-soft" /> : null}
          </div>
        );
      })}
    </div>
  );
}
