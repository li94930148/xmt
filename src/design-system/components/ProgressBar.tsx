export default function ProgressBar({ value, tone = 'primary', label }: { value: number; tone?: 'primary' | 'success' | 'warning'; label?: string }) {
  const safeValue = Math.min(100, Math.max(0, value));
  return (
    <div className="space-y-2">
      {label ? <div className="flex justify-between text-xs text-studio-text-muted"><span>{label}</span><span className="xmt-data-number">{safeValue}%</span></div> : null}
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]" role="progressbar" aria-valuenow={safeValue} aria-valuemin={0} aria-valuemax={100}>
        <div className={`xmt-progress-fill h-full rounded-full bg-${tone === 'success' ? 'studio-success' : tone === 'warning' ? 'studio-amber' : 'studio-cyan'}`} style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}
