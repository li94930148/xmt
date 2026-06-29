export function StudioSkeletonLine({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={`skeleton-shimmer rounded-full bg-white/[0.06] ${className}`} />;
}

export function StudioSkeletonCard() {
  return (
    <div className="rounded-card border border-studio-border-soft bg-studio-surface-glass p-5">
      <div className="flex items-center gap-3">
        <StudioSkeletonLine className="h-11 w-11 rounded-[14px]" />
        <div className="flex-1 space-y-2">
          <StudioSkeletonLine className="h-3 w-1/2" />
          <StudioSkeletonLine className="h-4 w-2/3" />
        </div>
      </div>
      <div className="mt-5 space-y-2">
        <StudioSkeletonLine className="h-3 w-full" />
        <StudioSkeletonLine className="h-3 w-5/6" />
      </div>
    </div>
  );
}
