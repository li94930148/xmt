import { useEffect, useRef, useState } from 'react';
import { autosaveReport, type SaveDailyReportDraftPayload } from '../../api/dailyReports';

export default function DailyReportAutoSave({ payload, enabled = true }: { payload: SaveDailyReportDraftPayload; enabled?: boolean }) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const latest = useRef(payload);
  latest.current = payload;
  useEffect(() => {
    if (!enabled || !payload.reportDate) return;
    setState('saving');
    const timer = window.setTimeout(() => {
      void autosaveReport(latest.current).then((result) => setState(result.saved ? 'saved' : 'idle')).catch(() => setState('idle'));
    }, 30_000);
    return () => window.clearTimeout(timer);
  }, [enabled, payload.reportDate, payload.manualSummaryMd, payload.riskLevel, JSON.stringify(payload.items)]);
  return <span className="text-xs text-studio-text-muted" aria-live="polite">{state === 'saving' ? '保存中...' : state === 'saved' ? '已保存' : '自动保存已开启'}</span>;
}
