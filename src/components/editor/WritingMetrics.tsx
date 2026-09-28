import { useState } from 'react';
import { estimatedReadingMinutes, MAX_WRITING_GOAL, parseWritingGoal } from './writingMetricUtils';

interface WritingMetricsProps {
  count: number;
  readOnly: boolean;
  storageKey?: string;
}

function readStoredGoal(storageKey?: string): number | null {
  if (!storageKey) return null;
  try {
    return parseWritingGoal(localStorage.getItem(storageKey) || '');
  } catch {
    return null;
  }
}

export default function WritingMetrics({ count, readOnly, storageKey }: WritingMetricsProps) {
  const [goal, setGoal] = useState<number | null>(() => readStoredGoal(storageKey));
  const readingMinutes = estimatedReadingMinutes(count);
  const progress = goal ? Math.min(100, Math.round((count / goal) * 100)) : 0;

  const updateGoal = (value: string) => {
    const nextGoal = parseWritingGoal(value);
    setGoal(nextGoal);
    if (!storageKey) return;
    try {
      if (nextGoal === null) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, String(nextGoal));
    } catch {
      // 浏览器禁用本机存储时仍允许设置当前页目标。
    }
  };

  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-[var(--editor-muted)]">
      <span aria-label={`当前字数 ${count}`}>字数 {count}</span>
      <label className="inline-flex items-center gap-1.5">
        <span>目标</span>
        <input
          type="number"
          min="1"
          max={MAX_WRITING_GOAL}
          step="1"
          inputMode="numeric"
          value={goal ?? ''}
          disabled={readOnly}
          onChange={(event) => updateGoal(event.target.value)}
          aria-label="目标字数"
          placeholder="未设置"
          title={storageKey ? '只在当前设备和账号保存' : '仅在当前页面有效'}
          className="xmt-field w-24 min-w-0 py-1 text-xs"
        />
      </label>
      {goal !== null && (
        <span role="progressbar" aria-label="写作目标进度" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-studio-surface-elevated">
            <span className="block h-full rounded-full bg-studio-primary" style={{ width: `${progress}%` }} />
          </span>
          <span>{progress}%</span>
        </span>
      )}
      <span title="按每分钟约 300 字估算">预计阅读 {readingMinutes} 分钟</span>
    </div>
  );
}
