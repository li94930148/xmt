import { useCallback, useEffect, useState } from 'react';
import { Activity, CalendarDays, Heart, Play, Users } from 'lucide-react';
import { getDouyinTrends, type DouyinTrendData } from '@/api/creatorCenter';
import { ErrorState, LineChart, LoadingState, PageHeader, Panel, formatNumber } from './shared';

type Period = '7d' | '30d' | '90d';

export default function CreatorTrends() {
  const [period, setPeriod] = useState<Period>('30d');
  const [data, setData] = useState<DouyinTrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setData(await getDouyinTrends(period)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '趋势加载失败'); }
    finally { setLoading(false); }
  }, [period]);
  useEffect(() => { void load(); }, [load]);
  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const dailyFlow = data.metric_semantics === 'daily_flow';
  const fanValues = data.snapshots.flatMap(row => row.fans_count == null ? [] : [row.fans_count]);
  const definitions = [
    { label: '播放趋势', icon: Play, color: 'rgb(6 182 212)', values: data.snapshots.map(row => row.play_count), percent: false, available: true, cumulative: false },
    { label: '粉丝趋势', icon: Users, color: 'rgb(16 185 129)', values: fanValues, percent: false, available: fanValues.length > 0, cumulative: true },
    { label: '互动趋势', icon: Heart, color: 'rgb(244 63 94)', values: data.snapshots.map(row => row.interaction_count), percent: false, available: true, cumulative: false },
    { label: '日互动率', icon: Activity, color: 'rgb(245 158 11)', values: data.snapshots.map(row => row.tracked_interaction_rate), percent: true, available: true, cumulative: false },
    { label: '投稿数量', icon: CalendarDays, color: 'rgb(139 92 246)', values: data.snapshots.map(row => row.works_count), percent: false, available: true, cumulative: false },
  ];
  const totalPlays = data.snapshots.reduce((sum, row) => sum + row.play_count, 0);
  const officialInteractionRate = totalPlays > 0
    ? data.snapshots.reduce((sum, row) => sum + row.interaction_count, 0) / totalPlays
    : 0;

  return <div className="mx-auto max-w-[1500px] space-y-6 pb-12">
    <PageHeader title="数据趋势中心" description="账号关键指标变化" actions={<div className="flex rounded-lg border border-studio-border bg-studio-card p-1">{(['7d', '30d', '90d'] as Period[]).map(item => <button type="button" key={item} onClick={() => setPeriod(item)} className={`rounded-md px-4 py-1.5 text-sm ${period === item ? 'bg-studio-cyan text-white' : 'text-studio-text-muted'}`}>{item.replace('d', ' 天')}</button>)}</div>} />
    {loading ? <div className="text-sm text-studio-text-muted">正在加载…</div> : null}
    <section className="grid gap-6 lg:grid-cols-2">{definitions.map(({ label, icon: Icon, color, values, percent, available, cumulative }) => {
      if (!available) return <Panel key={label} title={label} description="暂无粉丝数据"><div className="flex h-52 items-center justify-center text-sm text-studio-text-muted">暂无数据</div></Panel>;
      const latest = values.at(-1) ?? 0;
      const first = values[0] ?? 0;
      const useFlowTotal = dailyFlow && !cumulative;
      const summary = useFlowTotal ? (percent ? officialInteractionRate : values.reduce((sum, value) => sum + value, 0)) : latest;
      const display = (value: number) => percent ? `${(value * 100).toFixed(2)}%` : formatNumber(value);
      return <Panel key={label} title={label} description={`周期内 ${values.length} 个日数据`}>
        <div className="mb-4 flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-studio-surface" style={{ color }}><Icon className="h-5 w-5" /></span><div className="text-right"><p className="text-2xl font-semibold">{display(summary)}</p>{useFlowTotal ? <p className="text-xs text-studio-text-muted">周期合计</p> : <p className={`text-xs ${latest - first >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>周期变化 {latest - first >= 0 ? '+' : ''}{display(latest - first)}</p>}</div></div>
        <LineChart values={values} color={color} />
      </Panel>;
    })}</section>
    <p className="text-xs text-studio-text-muted">数据从 {data.snapshot_start_date || '首个成功同步日'} 开始。{data.note}</p>
    {data.snapshots.length < 2 ? <Panel title="数据积累中"><div className="flex items-start gap-3 text-sm text-studio-text-muted"><Activity className="mt-0.5 h-4 w-4 shrink-0" /><p>至少需要 2 个真实日数据才能展示趋势。完成下一次数据采集后显示变化。</p></div></Panel> : null}
  </div>;
}
