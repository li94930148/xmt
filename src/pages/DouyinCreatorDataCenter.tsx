import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Activity, ArrowLeft, Clock3, Eye, Heart, MessageCircle, MousePointer2, Play, RefreshCw, Sparkles, Users } from 'lucide-react';
import { getCreatorCenterData, type CreatorCenterData, type CreatorTrend } from '@/api/creatorCenter';

type JsonRecord = Record<string, unknown>;
const asRecord = (value: unknown): JsonRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
const num = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
const formatNumber = (value: unknown) => new Intl.NumberFormat('zh-CN', { notation: num(value) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(num(value));
const formatDate = (value: unknown) => value ? new Date(String(value)).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export default function DouyinCreatorDataCenter() {
  const { contentId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<CreatorCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { setData(await getCreatorCenterData()); } catch (cause) { setError(cause instanceof Error ? cause.message : '数据加载失败'); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const selected = data?.works.find((work) => String(work.id ?? work.item_id) === contentId);
  if (contentId && selected) return <ContentAnalysis work={selected} trends={(data?.trends || []).filter((trend) => trend.content_id === Number(selected.id))} onBack={() => navigate('/analytics/creator-center')} />;

  const metrics = asRecord(data?.account?.metrics || data?.dashboard);
  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-12">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 text-sm font-medium text-studio-cyan">Creator Data Center</p>
          <h1 className="text-3xl font-semibold tracking-tight text-studio-text">创作者数据中心</h1>
          <p className="mt-2 text-sm text-studio-text-muted">自有数据链路 · 最近同步 {formatDate(data?.account?.snapshot_time)}</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-studio-border bg-studio-card px-4 text-sm font-medium transition hover:border-studio-cyan/60 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新数据
        </button>
      </header>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">{error}</div>}
      {!loading && !error && !data?.account && <EmptyState />}
      {data?.account && <>
        <AccountHeader account={data.account} />
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="粉丝" value={metrics.fans_count ?? data.account.fans_count} icon={Users} accent="cyan" />
          <MetricCard label="播放" value={metrics.play_count} icon={Play} accent="blue" />
          <MetricCard label="互动" value={metrics.interaction_count} icon={Heart} accent="rose" />
          <MetricCard label="主页访问" value={metrics.profile_visit_count} icon={MousePointer2} accent="violet" />
        </section>
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)]">
          <Panel title="增长趋势" description="最近 90 次账号数据快照">
            <LineChart values={[...(data.history || [])].reverse().map((item) => num(item.fans_count))} />
          </Panel>
          <Panel title="粉丝画像" description="年龄、性别与地域概况">
            <PortraitSummary fans={data.fans} />
          </Panel>
        </section>
        <InsightSummary insights={data.insights || {}} />
        <WorksTable works={data.works} onSelect={(work) => navigate(`/analytics/creator-center/work/${String(work.id ?? work.item_id)}`)} />
        <HistoryTable history={data.history} />
      </>}
    </div>
  );
}

function AccountHeader({ account }: { account: JsonRecord }) {
  return <section className="flex items-center gap-4 rounded-2xl border border-studio-border bg-gradient-to-r from-studio-card to-studio-surface p-5">
    {account.avatar ? <img src={String(account.avatar)} alt="账号头像" className="h-14 w-14 rounded-full object-cover ring-2 ring-studio-cyan/30" /> : <div className="grid h-14 w-14 place-items-center rounded-full bg-studio-cyan/10 text-studio-cyan"><Sparkles className="h-6 w-6" /></div>}
    <div className="min-w-0"><h2 className="truncate text-lg font-semibold">{String(account.nickname || account.account_name || '抖音账号')}</h2><p className="mt-1 text-sm text-studio-text-muted">抖音号 {String(account.account_id || account.platform_uid || '—')}</p></div>
    <span className="ml-auto rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-500">数据已入仓</span>
  </section>;
}

const accents = { cyan: 'bg-cyan-500/10 text-cyan-500', blue: 'bg-blue-500/10 text-blue-500', rose: 'bg-rose-500/10 text-rose-500', violet: 'bg-violet-500/10 text-violet-500' };
function MetricCard({ label, value, icon: Icon, accent }: { label: string; value: unknown; icon: typeof Users; accent: keyof typeof accents }) {
  return <article className="rounded-2xl border border-studio-border bg-studio-card p-5"><div className="flex items-center justify-between"><span className="text-sm text-studio-text-muted">{label}</span><span className={`grid h-9 w-9 place-items-center rounded-xl ${accents[accent]}`}><Icon className="h-4 w-4" /></span></div><p className="mt-5 text-3xl font-semibold tracking-tight">{typeof value === 'string' ? value : formatNumber(value)}</p></article>;
}
function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-studio-border bg-studio-card p-5"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-xs text-studio-text-muted">{description}</p><div className="mt-5">{children}</div></section>; }

function LineChart({ values }: { values: number[] }) {
  const safe = values.length > 1 ? values : [values[0] || 0, values[0] || 0]; const min = Math.min(...safe); const max = Math.max(...safe); const range = max - min || 1;
  const points = safe.map((value, index) => `${(index / (safe.length - 1)) * 100},${94 - ((value - min) / range) * 78}`).join(' ');
  return <div className="h-52"><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible" role="img" aria-label="数据趋势折线图"><defs><linearGradient id="creatorArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgb(6 182 212)" stopOpacity=".3"/><stop offset="1" stopColor="rgb(6 182 212)" stopOpacity="0"/></linearGradient></defs><path d={`M ${points} L 100 100 L 0 100 Z`} fill="url(#creatorArea)"/><polyline points={points} fill="none" stroke="rgb(6 182 212)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round"/></svg></div>;
}

function distribution(value: unknown) { const source = asRecord(value); return Object.entries(source).map(([label, amount]) => ({ label, amount: num(asRecord(amount).value ?? amount) })).sort((a, b) => b.amount - a.amount).slice(0, 4); }
function PortraitSummary({ fans }: { fans: JsonRecord | null }) { const groups = [{ title: '年龄', data: distribution(fans?.age) }, { title: '性别', data: distribution(fans?.gender) }, { title: '地区', data: distribution(fans?.province || fans?.city) }]; return <div className="space-y-5">{groups.map((group) => <div key={group.title}><div className="mb-2 flex justify-between text-xs"><span className="font-medium">{group.title}</span><span className="text-studio-text-muted">{group.data[0]?.label || '暂无数据'}</span></div><div className="flex h-2 overflow-hidden rounded-full bg-studio-surface">{group.data.map((item, index) => <span key={item.label} style={{ width: `${Math.max(5, item.amount)}%`, opacity: 1 - index * .17 }} className="bg-studio-cyan" title={`${item.label} ${item.amount}`} />)}</div></div>)}</div>; }

function InsightSummary({ insights }: { insights: Record<string, Record<string, unknown>> }) { const weekly=asRecord(insights.weekly),content=asRecord(insights.content),monthly=asRecord(insights.monthly); const high=Array.isArray(content.high_performers)?content.high_performers:[]; const tags=Array.isArray(content.common_tags)?content.common_tags:[]; return <Panel title="自动运营洞察" description="仅基于已入仓数据自动计算"><div className="grid gap-4 md:grid-cols-3"><div className="rounded-xl bg-studio-surface p-4"><p className="text-xs text-studio-text-muted">近 7 天账号趋势</p><p className="mt-3 text-sm">播放增长 <b>{formatNumber(weekly.play_growth)}</b></p><p className="mt-2 text-sm">粉丝增长 <b>{formatNumber(weekly.fans_growth)}</b></p><p className="mt-2 text-sm">互动变化 <b>{formatNumber(weekly.interaction_change)}</b></p></div><div className="rounded-xl bg-studio-surface p-4"><p className="text-xs text-studio-text-muted">高表现作品</p>{high.slice(0,3).map((item,index)=><p key={index} className="mt-3 truncate text-sm">{String(asRecord(item).title||'未命名作品')}</p>)}{!high.length?<p className="mt-3 text-sm text-studio-text-muted">等待更多作品快照</p>:null}</div><div className="rounded-xl bg-studio-surface p-4"><p className="text-xs text-studio-text-muted">共同标签与核心画像</p><div className="mt-3 flex flex-wrap gap-2">{tags.slice(0,5).map((item,index)=><span key={index} className="rounded-md bg-studio-card px-2 py-1 text-xs">{String(Array.isArray(item)?item[0]:'')}</span>)}</div><p className="mt-3 text-xs text-studio-text-muted">月度画像维度 {Object.keys(asRecord(monthly.portrait)).length} 项</p></div></div></Panel>; }

function WorksTable({ works, onSelect }: { works: JsonRecord[]; onSelect: (work: JsonRecord) => void }) { return <Panel title="作品库" description={`已入仓 ${works.length} 条内容资产`}><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-studio-border text-xs text-studio-text-muted"><tr><th className="pb-3 font-medium">作品</th><th className="pb-3 font-medium">发布时间</th><th className="pb-3 text-right font-medium">播放</th><th className="pb-3 text-right font-medium">点赞</th><th className="pb-3 text-right font-medium">评论</th><th className="pb-3 text-right font-medium">分享</th><th className="pb-3 text-right font-medium">收藏</th></tr></thead><tbody className="[content-visibility:auto]">{works.map((work) => <tr key={String(work.id ?? work.item_id)} onClick={() => onSelect(work)} className="cursor-pointer border-b border-studio-border/70 transition last:border-0 hover:bg-studio-surface"><td className="py-3 pr-6"><div className="flex items-center gap-3">{work.cover_url || work.cover ? <img src={String(work.cover_url || work.cover)} alt="" className="h-12 w-20 rounded-lg object-cover" loading="lazy"/> : <div className="grid h-12 w-20 place-items-center rounded-lg bg-studio-surface"><Play className="h-4 w-4 text-studio-text-muted"/></div>}<span className="max-w-md truncate font-medium">{String(work.title || '未命名作品')}</span></div></td><td className="whitespace-nowrap py-3 text-studio-text-muted">{formatDate(work.publish_time || work.published_at)}</td>{[work.play_count, work.like_count, work.comment_count, work.share_count, work.favorite_count].map((value, i) => <td key={i} className="py-3 text-right tabular-nums">{formatNumber(value)}</td>)}</tr>)}</tbody></table></div></Panel>; }

function HistoryTable({ history }: { history: CreatorCenterData['history'] }) { return <Panel title="历史复盘" description="每日账号经营数据快照"><div className="divide-y divide-studio-border">{history.slice(0, 14).map((row, index) => <div key={`${row.snapshot_time}-${index}`} className="grid grid-cols-[1fr_repeat(4,minmax(72px,auto))] gap-4 py-3 text-sm"><span className="text-studio-text-muted">{formatDate(row.snapshot_time)}</span><span>粉丝 {formatNumber(row.fans_count)}</span><span>播放 {formatNumber(row.play_count)}</span><span>互动 {formatNumber(row.interaction_count)}</span><span>访问 {formatNumber(row.profile_visit_count)}</span></div>)}</div></Panel>; }

function ContentAnalysis({ work, trends, onBack }: { work: JsonRecord; trends: CreatorTrend[]; onBack: () => void }) { const play=trends.filter(item=>item.metric_name.includes('play')).map(item=>item.metric_value); const interaction=trends.filter(item=>/like|comment|share|interaction/.test(item.metric_name)).map(item=>item.metric_value); const raw=asRecord(work.raw); const tags=Array.isArray(raw.tags)?raw.tags.map(String):String(work.title||'').match(/#[^#\s]+/g)||[]; const score=num(work.play_count)+num(work.like_count)*5+num(work.comment_count)*10+num(work.share_count)*15; const rating=score>=100000?'S':score>=30000?'A':score>=10000?'B':'C'; return <div className="mx-auto max-w-[1280px] space-y-6 pb-12"><button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-studio-text-muted hover:text-studio-text"><ArrowLeft className="h-4 w-4"/>返回作品库</button><header className="flex flex-col gap-5 rounded-2xl border border-studio-border bg-studio-card p-5 sm:flex-row sm:items-center">{work.cover_url||work.cover?<img src={String(work.cover_url||work.cover)} alt="作品封面" className="h-32 w-52 rounded-xl object-cover"/>:<div className="grid h-32 w-52 place-items-center rounded-xl bg-studio-surface"><Play className="h-7 w-7 text-studio-text-muted"/></div>}<div className="min-w-0 flex-1"><div className="flex items-start gap-3"><h1 className="text-2xl font-semibold">{String(work.title||'作品分析')}</h1><span className="rounded-lg bg-studio-cyan/10 px-2.5 py-1 text-sm font-bold text-studio-cyan">{rating} 级</span></div><p className="mt-2 text-sm text-studio-text-muted">发布于 {formatDate(work.publish_time||work.published_at)}</p><div className="mt-3 flex flex-wrap gap-2">{tags.map(tag=><span key={tag} className="rounded-md bg-studio-surface px-2 py-1 text-xs">{tag}</span>)}</div></div></header><section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><MetricCard label="播放" value={work.play_count} icon={Play} accent="cyan"/><MetricCard label="点赞" value={work.like_count} icon={Heart} accent="rose"/><MetricCard label="评论" value={work.comment_count} icon={MessageCircle} accent="violet"/><MetricCard label="分享" value={work.share_count} icon={Activity} accent="blue"/><MetricCard label="收藏" value={work.favorite_count} icon={Sparkles} accent="cyan"/></section><section className="grid gap-6 lg:grid-cols-2"><Panel title="播放趋势" description="采集到的作品播放快照"><LineChart values={play}/></Panel><Panel title="互动趋势" description="点赞、评论与分享变化"><LineChart values={interaction}/></Panel></section><Panel title="表现分析" description="基于播放与互动数据计算"><div className="grid gap-4 sm:grid-cols-3"><div className="rounded-xl bg-studio-surface p-4"><p className="text-xs text-studio-text-muted">发布时间</p><p className="mt-2 font-medium">{formatDate(work.publish_time||work.published_at)}</p></div><div className="rounded-xl bg-studio-surface p-4"><p className="text-xs text-studio-text-muted">标签数量</p><p className="mt-2 font-medium">{tags.length}</p></div><div className="rounded-xl bg-studio-surface p-4"><p className="text-xs text-studio-text-muted">综合表现评级</p><p className="mt-2 font-medium">{rating} 级 · {formatNumber(score)} 分</p></div></div></Panel><Panel title="来源分析" description="保留真实采集原始字段，供后续解析"><SourceAnalysis work={work}/></Panel></div>; }
function SourceAnalysis({ work }: { work: JsonRecord }) { const source = asRecord(asRecord(work.metric_raw).traffic || asRecord(work.raw).traffic || asRecord(work.detail).traffic); const items = distribution(source); return items.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{items.map((item) => <div key={item.label} className="rounded-xl bg-studio-surface p-4"><p className="text-sm text-studio-text-muted">{item.label}</p><p className="mt-2 text-xl font-semibold">{formatNumber(item.amount)}</p></div>)}</div> : <p className="py-8 text-center text-sm text-studio-text-muted">本次快照暂未解析到来源维度，原始数据已安全入仓。</p>; }
function EmptyState() { return <div className="grid min-h-[420px] place-items-center rounded-2xl border border-dashed border-studio-border bg-studio-card"><div className="max-w-sm text-center"><Eye className="mx-auto h-9 w-9 text-studio-text-muted"/><h2 className="mt-4 font-semibold">等待首个真实数据快照</h2><p className="mt-2 text-sm leading-6 text-studio-text-muted">请在 Creator Agent 完成抖音登录并执行同步。数据将经 AES/HMAC 安全上传后显示在这里。</p></div></div>; }
