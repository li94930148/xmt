import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, CalendarDays, Heart, Play, Users } from 'lucide-react';
import { getDouyinTrends, type DouyinTrendData } from '@/api/creatorCenter';
import { LineChart, LoadingState, PageHeader, Panel, formatNumber } from './shared';

type Period = '7d' | '30d' | '90d';

export default function CreatorTrends() {
  const [period, setPeriod] = useState<Period>('30d');
  const [data, setData] = useState<DouyinTrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const load = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const nextData = await getDouyinTrends(period);
      if (currentRequestId === requestId.current) setData(nextData);
    }
    catch (cause) {
      if (currentRequestId === requestId.current) setError(cause instanceof Error ? cause.message : '趋势加载失败');
    }
    finally {
      if (currentRequestId === requestId.current) setLoading(false);
    }
  }, [period]);
  useEffect(() => { void load(); }, [load]);
  const currentData = data?.period === period ? data : null;

  const dailyFlow = currentData?.metric_semantics === 'daily_flow';
  const fanValues = currentData?.snapshots.flatMap(row => row.fans_count == null ? [] : [row.fans_count]) ?? [];
  const definitions = [
    { label: '播放趋势', icon: Play, color: 'rgb(6 182 212)', values: currentData?.snapshots.map(row => row.play_count) ?? [], percent: false, available: true, cumulative: false },
    { label: '粉丝趋势', icon: Users, color: 'rgb(16 185 129)', values: fanValues, percent: false, available: fanValues.length > 0, cumulative: true },
    { label: '互动趋势', icon: Heart, color: 'rgb(244 63 94)', values: currentData?.snapshots.map(row => row.interaction_count) ?? [], percent: false, available: true, cumulative: false },
    { label: '日互动率', icon: Activity, color: 'rgb(245 158 11)', values: currentData?.snapshots.map(row => row.tracked_interaction_rate) ?? [], percent: true, available: true, cumulative: false },
    { label: '投稿数量', icon: CalendarDays, color: 'rgb(139 92 246)', values: currentData?.snapshots.map(row => row.works_count) ?? [], percent: false, available: true, cumulative: false },
  ];
  const totalPlays = currentData?.snapshots.reduce((sum, row) => sum + row.play_count, 0) ?? 0;
  const officialInteractionRate = totalPlays > 0
    ? (currentData?.snapshots.reduce((sum, row) => sum + row.interaction_count, 0) ?? 0) / totalPlays
    : 0;

  return <div className="mx-auto max-w-[1500px] space-y-6 pb-12">
    <PageHeader title="数据趋势中心" description="账号关键指标变化" loading={loading} onRefresh={() => void load()} actions={<div className="flex rounded-lg border border-studio-border bg-studio-card p-1">{(['7d', '30d', '90d'] as Period[]).map(item => <button type="button" key={item} onClick={() => setPeriod(item)} disabled={loading} aria-pressed={period === item} className={`rounded-md border px-4 py-1.5 text-sm disabled:opacity-60 ${period === item ? 'border-studio-cyan bg-studio-surface-soft text-studio-cyan-contrast' : 'border-transparent text-studio-text-muted'}`}>{item.replace('d', ' 天')}</button>)}</div>} />
    {error ? <div role="alert" className="rounded-xl border border-studio-coral/30 bg-studio-coral/10 px-4 py-3 text-sm text-studio-coral-contrast">
      <p>{currentData ? '本次刷新失败，仍保留该周期最近一次成功读取的数据。' : '当前周期的数据暂时无法读取。'} {error}</p>
    </div> : null}
    {!currentData ? loading ? <LoadingState /> : <Panel title="趋势数据暂不可用"><p className="text-sm text-studio-text-muted">请重新读取当前周期的数据。</p></Panel> : <>
    {loading ? <div role="status" className="text-sm text-studio-text-muted">正在重新读取…</div> : null}
    <section className="grid gap-6 lg:grid-cols-2">{definitions.map(({ label, icon: Icon, color, values, percent, available, cumulative }) => {
      if (!available) return <Panel key={label} title={label} description="暂无粉丝数据"><div className="flex h-52 items-center justify-center text-sm text-studio-text-muted">暂无数据</div></Panel>;
      const latest = values.at(-1) ?? 0;
      const first = values[0] ?? 0;
      const useFlowTotal = dailyFlow && !cumulative;
      const summary = useFlowTotal ? (percent ? officialInteractionRate : values.reduce((sum, value) => sum + value, 0)) : latest;
      const display = (value: number) => percent ? `${(value * 100).toFixed(2)}%` : formatNumber(value);
      return <Panel key={label} title={label} description={`周期内 ${values.length} 个日数据`}>
        <div className="mb-4 flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-studio-surface" style={{ color }}><Icon className="h-5 w-5" /></span><div className="text-right"><p className="text-2xl font-semibold">{display(summary)}</p>{useFlowTotal ? <p className="text-xs text-studio-text-muted">周期合计</p> : <p className={`text-xs ${latest - first >= 0 ? 'text-studio-success-contrast' : 'text-studio-coral-contrast'}`}>周期变化 {latest - first >= 0 ? '+' : ''}{display(latest - first)}</p>}</div></div>
        <LineChart values={values} color={color} />
      </Panel>;
    })}</section>
    <p className="text-xs text-studio-text-muted">数据从 {currentData.snapshot_start_date || '首个成功同步日'} 开始。{currentData.note}</p>
    {currentData.snapshots.length < 2 ? <Panel title="数据积累中"><div className="flex items-start gap-3 text-sm text-studio-text-muted"><Activity className="mt-0.5 h-4 w-4 shrink-0" /><p>至少需要 2 个真实日数据才能展示趋势。完成下一次数据采集后显示变化。</p></div></Panel> : null}
    </>}
  </div>;
}
