import { twMerge } from 'tailwind-merge';

export type StageItem = {
  label: string;
  state?: 'done' | 'active' | 'pending' | 'blocked';
};

export default function StageProgress({ stages, className = '' }: { stages: StageItem[]; className?: string }) {
  return (
    <div className={twMerge('flex flex-nowrap items-start gap-1', className)}>
      {stages.map((stage, index) => {
        const state = stage.state || 'pending';
        const dotClass =
          state === 'done'
            ? 'bg-studio-success'
            : state === 'active'
              ? 'bg-studio-cyan shadow-glow-cyan'
              : state === 'blocked'
                ? 'bg-studio-coral'
                : 'bg-studio-surface-soft';

        return (
          <div key={`${stage.label}-${index}`} className="flex min-w-[1.75rem] flex-1 items-center gap-1">
            <div className="flex w-5 shrink-0 flex-col items-center gap-1">
              <span className={twMerge('h-2.5 w-2.5 rounded-full ring-4 ring-white/[0.04]', dotClass)} />
              <span className="max-w-20 whitespace-nowrap text-center text-[10px] font-medium leading-snug text-studio-text-muted">{stage.label}</span>
            </div>
            {index < stages.length - 1 ? <span className="h-px flex-1 bg-studio-border-soft" /> : null}
          </div>
        );
      })}
    </div>
  );
}
