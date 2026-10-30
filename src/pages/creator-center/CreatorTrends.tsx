import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, CalendarDays, Heart, Play, Users } from 'lucide-react';
import { getDouyinTrends, type DouyinTrendData } from '@/api/creatorCenter';
import { formatBeijingDate } from '@/lib/utils';
import { LineChart, LoadingState, PageHeader, Panel, formatNumber } from './shared';
import { getUserFacingErrorMessage } from '@/lib/userFacingError';

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
      if (currentRequestId === requestId.current) setError(getUserFacingErrorMessage(cause, '趋势暂时无法加载，请检查连接后重试。'));
    }
    finally {
      if (currentRequestId === requestId.current) setLoading(false);
    }
  }, [period]);
  useEffect(() => { void load(); }, [load]);
  const currentData = data?.period === period ? data : null;
  const incompleteOfficial90d = currentData?.period === '90d'
    && currentData.source === 'creator_official_daily_metrics'
    && currentData.data_status === 'partial';

  const dailyFlow = currentData?.metric_semantics === 'daily_flow';
  const snapshots = currentData?.snapshots ?? [];
  const fanValues = snapshots.flatMap(row => row.fans_count == null ? [] : [row.fans_count]);
  const definitions = [
    { label: '播放趋势', icon: Play, color: 'var(--xmt-cyan)', values: snapshots.map(row => row.play_count), dataPoints: snapshots.map(row => ({ label: formatBeijingDate(row.snapshot_date), value: row.play_count })), percent: false, available: true, cumulative: false },
    { label: '粉丝趋势', icon: Users, color: 'var(--xmt-success)', values: fanValues, dataPoints: snapshots.map(row => ({ label: formatBeijingDate(row.snapshot_date), value: row.fans_count })), percent: false, available: fanValues.length > 0, cumulative: true },
    { label: '互动趋势', icon: Heart, color: 'var(--xmt-coral)', values: snapshots.map(row => row.interaction_count), dataPoints: snapshots.map(row => ({ label: formatBeijingDate(row.snapshot_date), value: row.interaction_count })), percent: false, available: true, cumulative: false },
    { label: '日互动率', icon: Activity, color: 'var(--xmt-amber)', values: snapshots.map(row => row.tracked_interaction_rate), dataPoints: snapshots.map(row => ({ label: formatBeijingDate(row.snapshot_date), value: row.tracked_interaction_rate })), percent: true, available: true, cumulative: false },
    { label: '投稿数量', icon: CalendarDays, color: 'var(--xmt-violet)', values: snapshots.map(row => row.works_count), dataPoints: snapshots.map(row => ({ label: formatBeijingDate(row.snapshot_date), value: row.works_count })), percent: false, available: true, cumulative: false },
  ];
  const totalPlays = currentData?.snapshots.reduce((sum, row) => sum + row.play_count, 0) ?? 0;
  const officialInteractionRate = totalPlays > 0
    ? (currentData?.snapshots.reduce((sum, row) => sum + row.interaction_count, 0) ?? 0) / totalPlays
    : 0;

  return <div className="mx-auto max-w-[1500px] space-y-6 pb-12">
    <PageHeader title="数据趋势中心" description="账号关键指标变化" loading={loading} onRefresh={() => void load()} actions={<div role="group" aria-label="数据统计周期" className="flex rounded-lg border border-studio-border bg-studio-card p-1">{(['7d', '30d', '90d'] as Period[]).map(item => <button type="button" key={item} onClick={() => setPeriod(item)} disabled={loading} aria-pressed={period === item} className={`xmt-btn xmt-btn-ghost min-h-10 rounded-md border px-3 py-1.5 text-sm disabled:opacity-60 ${period === item ? 'border-studio-cyan bg-studio-surface-soft text-studio-cyan-contrast hover:bg-studio-surface-soft hover:text-studio-cyan-contrast' : 'border-transparent text-studio-text-secondary hover:border-studio-border-soft hover:bg-studio-surface-soft hover:text-studio-text-primary'}`}>{item.replace('d', ' 天')}</button>)}</div>} />
    {error ? <div role="alert" className="rounded-xl border border-studio-coral/30 bg-studio-coral/10 px-4 py-3 text-sm text-studio-coral-contrast">
      <p>{currentData ? '本次刷新失败，仍保留该周期最近一次成功读取的数据。' : '当前周期的数据暂时无法读取。'} {error}</p>
    </div> : null}
    {!currentData ? loading ? <LoadingState /> : <Panel title="趋势数据暂不可用"><p className="text-sm text-studio-text-secondary">请重新读取当前周期的数据。</p></Panel> : incompleteOfficial90d ? <Panel title="90 天趋势数据不完整"><p role="status" className="text-sm text-studio-text-secondary">近 90 天的官方逐日数据尚未覆盖完整连续日期或缺少有效指标，因此暂不展示趋势和周期合计。缺失日期不会按 0 计入。</p></Panel> : <>
    {loading ? <div aria-hidden="true" className="text-sm text-studio-text-secondary">正在重新读取…</div> : null}
    <section className="grid gap-6 lg:grid-cols-2">{definitions.map(({ label, icon: Icon, color, values, dataPoints, percent, available, cumulative }) => {
      if (!available) return <Panel key={label} title={label} description="暂无粉丝数据"><div role="status" aria-live="polite" aria-atomic="true" className="flex h-52 items-center justify-center text-sm text-studio-text-secondary">暂无数据</div></Panel>;
      const latest = values.at(-1) ?? 0;
      const first = values[0] ?? 0;
      const useFlowTotal = dailyFlow && !cumulative;
      const summary = useFlowTotal ? (percent ? officialInteractionRate : values.reduce((sum, value) => sum + value, 0)) : latest;
      const display = (value: number) => percent ? `${(value * 100).toFixed(2)}%` : formatNumber(value);
      return <Panel key={label} title={label} description={`周期内 ${values.length} 个日数据`}>
        <div className="mb-4 flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-studio-surface" style={{ color }}><Icon className="h-5 w-5" /></span><div className="text-right"><p className="text-2xl font-semibold">{display(summary)}</p>{useFlowTotal ? <p className="text-xs text-studio-text-secondary">周期合计</p> : <p className={`text-xs ${latest - first >= 0 ? 'text-studio-success-contrast' : 'text-studio-coral-contrast'}`}>周期变化 {latest - first >= 0 ? '+' : ''}{display(latest - first)}</p>}</div></div>
        <LineChart values={values} dataPoints={dataPoints} color={color} formatValue={display} ariaLabel={`${label}折线图，周期内 ${values.length} 个日数据`} />
      </Panel>;
    })}</section>
    <p className="text-xs text-studio-text-secondary">数据从 {currentData.snapshot_start_date || '首个成功同步日'} 开始。{currentData.note}</p>
    {currentData.snapshots.length < 2 ? <Panel title="数据积累中"><div className="flex items-start gap-3 text-sm text-studio-text-secondary"><Activity className="mt-0.5 h-4 w-4 shrink-0" /><p>至少需要 2 个真实日数据才能展示趋势。完成下一次数据采集后显示变化。</p></div></Panel> : null}
    </>}
  </div>;
}
