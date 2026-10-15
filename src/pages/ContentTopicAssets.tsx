import { ArrowLeft, ArrowUpRight, FileText, Layers3, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { addContentTopicDimension, CONTENT_ASSET_DIMENSION_LABELS, getContentTopicAssets, removeContentTopicDimension, type ContentAssetDimensionType, type ContentTopicAsset } from '@/api/resourceCenter';
import { ErrorState, LoadingState } from '@/components/common';
import { EmptySearch, EmptyState, GlassPanel, PageHeader, PageShell, SearchBar, StatusPill } from '@/components/studio';
import { PLATFORMS } from '@/constants';
import { useDebounce } from '@/hooks/useDebounce';

const statusLabels: Record<string, string> = {
  pending: '待审核', approved: '已通过', rejected: '已驳回', production: '创作中',
  shooting: '成片制作', publishing: '发布中', completed: '已完成',
};
const platformLabels = new Map(PLATFORMS.map(({ value, label }) => [value, label]));
const metricSourceLabels: Record<string, string> = {
  douyin_official_export: '抖音官方', manual: '手工补充', douyin_creator_collection: '运营采集',
  douyin_legacy_current: '旧版抖音数据', legacy_analytics: '旧选题级数据', unavailable: '未录入',
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

function TopicAssetCard({ item, analyticsVisible, onDimensionsChanged, onActionNotice }: { item: ContentTopicAsset; analyticsVisible: boolean; onDimensionsChanged: () => void; onActionNotice: (notice: string | null) => void }) {
  const [dimensionType, setDimensionType] = useState<ContentAssetDimensionType>('city');
  const [dimensionValue, setDimensionValue] = useState('');
  const [savingDimension, setSavingDimension] = useState(false);
  const [dimensionError, setDimensionError] = useState<string | null>(null);
  const metrics = item.latest_analytics;
  const latestMetricPlatform = metrics?.platform ? platformLabels.get(metrics.platform) || '其他平台' : '平台待确认';

  const addDimension = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dimensionValue.trim() || savingDimension) return;
    setSavingDimension(true);
    setDimensionError(null);
    onActionNotice(null);
    const value = dimensionValue.trim();
    try {
      await addContentTopicDimension(item.id, dimensionType, value);
      setDimensionValue('');
      onActionNotice(`${CONTENT_ASSET_DIMENSION_LABELS[dimensionType]}“${value}”已登记。`);
      onDimensionsChanged();
    } catch (error) {
      setDimensionError(error instanceof Error ? error.message : '登记失败，请重试');
    } finally {
      setSavingDimension(false);
    }
  };

  const removeDimension = async (dimensionId: number) => {
    if (savingDimension) return;
    setSavingDimension(true);
    setDimensionError(null);
    onActionNotice(null);
    try {
      await removeContentTopicDimension(item.id, dimensionId);
      onActionNotice('内容维度已移除。');
      onDimensionsChanged();
    } catch (error) {
      setDimensionError(error instanceof Error ? error.message : '移除失败，请重试');
    } finally {
      setSavingDimension(false);
    }
  };
  return (
    <GlassPanel className="studio-sheen p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/topics/${item.id}`} className="text-base font-semibold text-studio-text-primary hover:text-studio-primary-contrast">
            {item.title || `选题 ${item.id}`}
          </Link>
          <p className="mt-1 text-xs text-studio-text-secondary">{item.platform ? platformLabels.get(item.platform) || '其他平台' : '未指定平台'} · 更新于 {formatDate(item.updated_at)}</p>
        </div>
        <StatusPill tone={item.status === 'completed' ? 'success' : item.status === 'rejected' ? 'coral' : 'primary'}>
          {statusLabels[item.status] || '状态待确认'}
        </StatusPill>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['创作稿件', item.production_count],
          ['关联资料', item.resource_count],
          ['拍摄记录', item.shooting_count],
          ['发布记录', item.publishing_count],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-studio-border-soft bg-studio-surface-soft px-3 py-2.5">
            <span className="block text-xs text-studio-text-secondary">{label}</span>
            <span className="mt-1 block text-lg font-semibold tabular-nums text-studio-text-primary">{Number(value).toLocaleString('zh-CN')}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-studio-border-soft pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {item.dimensions.map((dimension) => (
            <span key={dimension.id} className="inline-flex items-center gap-1.5 rounded-full border border-studio-border-soft bg-studio-surface-soft px-2.5 py-1 text-xs text-studio-text-secondary">
              <span className="text-studio-text-secondary">{CONTENT_ASSET_DIMENSION_LABELS[dimension.type]}</span>{dimension.value}
              {item.can_manage_dimensions ? <button type="button" disabled={savingDimension} aria-label={`移除${CONTENT_ASSET_DIMENSION_LABELS[dimension.type]}：${dimension.value}`} onClick={() => void removeDimension(dimension.id)} className="rounded-full text-studio-text-muted hover:text-studio-danger disabled:opacity-40"><X className="h-3.5 w-3.5" /></button> : null}
            </span>
          ))}
          {!item.dimensions.length ? <span className="text-xs text-studio-text-secondary">尚未登记城市、人物或项目</span> : null}
        </div>
        {item.can_manage_dimensions ? (
          <form onSubmit={(event) => void addDimension(event)} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor={`dimension-type-${item.id}`}>维度类型</label>
            <select id={`dimension-type-${item.id}`} aria-label={`维度类型-${item.id}`} value={dimensionType} onChange={(event) => setDimensionType(event.target.value as ContentAssetDimensionType)} className="xmt-field min-h-10 sm:w-28">
              {(Object.entries(CONTENT_ASSET_DIMENSION_LABELS) as Array<[ContentAssetDimensionType, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <label className="sr-only" htmlFor={`dimension-value-${item.id}`}>维度名称</label>
            <input id={`dimension-value-${item.id}`} aria-label={`维度名称-${item.id}`} value={dimensionValue} onChange={(event) => setDimensionValue(event.target.value)} maxLength={80} className="xmt-field min-h-10 min-w-0 flex-1" placeholder={`登记${CONTENT_ASSET_DIMENSION_LABELS[dimensionType]}（最多 80 字）`} />
            <button type="submit" disabled={savingDimension || !dimensionValue.trim()} className="xmt-btn-secondary inline-flex min-h-10 items-center justify-center gap-1.5 disabled:opacity-50"><Plus className="h-4 w-4" />{savingDimension ? '保存中…' : '添加维度'}</button>
          </form>
        ) : null}
        {dimensionError ? <p role="alert" className="mt-2 text-xs text-studio-danger">{dimensionError}</p> : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-studio-border-soft pt-4 text-sm">
        {item.latest_production_id ? (
          <Link to={`/production/${item.latest_production_id}`} className="inline-flex items-center gap-2 text-studio-text-secondary hover:text-studio-primary-contrast">
            <FileText className="h-4 w-4" />
            最新稿件 {item.latest_production_version || ''} · {formatDate(item.latest_production_updated_at)}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        ) : <span className="text-studio-text-secondary">尚无创作稿件</span>}
        <Link to={`/topics/${item.id}`} className="inline-flex items-center gap-1 font-medium text-studio-primary-contrast">
          打开主题 <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {analyticsVisible ? (
        <div className="mt-3 rounded-xl border border-studio-border-soft bg-[var(--xmt-overlay-tint)] px-3 py-2.5 text-xs text-studio-text-secondary">
          {metrics ? <>
            <p><Link to={`/publishing/${metrics.publishing_id}`} className="font-medium text-studio-primary-contrast hover:underline">最近发布 · {latestMetricPlatform} · 记录 #{metrics.publishing_id} · {metrics.data_date ? formatDate(metrics.data_date) : '—'}</Link>：播放 {Number(metrics.views).toLocaleString('zh-CN')} · 点赞 {Number(metrics.likes).toLocaleString('zh-CN')} · 评论 {Number(metrics.comments).toLocaleString('zh-CN')}</p>
            <p className="mt-1 text-studio-text-secondary">来源：播放 {metricSourceLabels[metrics.sources.views] || '待确认'} · 点赞 {metricSourceLabels[metrics.sources.likes] || '待确认'} · 评论 {metricSourceLabels[metrics.sources.comments] || '待确认'}</p>
          </> : '暂无已发布作品数据'}
        </div>
      ) : null}
    </GlassPanel>
  );
}

export default function ContentTopicAssets() {
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebounce(keyword, 300);
  const [dimensionType, setDimensionType] = useState<ContentAssetDimensionType | ''>('');
  const [dimensionValue, setDimensionValue] = useState('');
  const [items, setItems] = useState<ContentTopicAsset[]>([]);
  const [availableDimensions, setAvailableDimensions] = useState<Array<{ dimension_type: ContentAssetDimensionType; value: string }>>([]);
  const [dimensionSummaries, setDimensionSummaries] = useState<Array<{ dimension_type: ContentAssetDimensionType; value: string; topic_count: number; production_count: number; resource_count: number; shooting_count: number; publishing_count: number }>>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [analyticsVisible, setAnalyticsVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const latestRequest = useRef(0);

  const load = useCallback(() => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setErrorMessage(null);
    void getContentTopicAssets({ keyword: debouncedKeyword || undefined, page, page_size: 12, dimension_type: dimensionType || undefined, dimension_value: dimensionValue || undefined })
      .then((response) => {
        if (requestId !== latestRequest.current) return;
        setItems(response.data);
        setAvailableDimensions(response.available_dimensions);
        setDimensionSummaries(response.dimension_summaries);
        setTotal(response.pagination.total);
        setTotalPages(Math.max(1, response.pagination.total_pages));
        setAnalyticsVisible(response.analytics_visible);
      })
      .catch((error: unknown) => {
        if (requestId === latestRequest.current) {
          setErrorMessage(error instanceof Error ? error.message : '未知错误');
        }
      })
      .finally(() => {
        if (requestId === latestRequest.current) setLoading(false);
      });
  }, [debouncedKeyword, dimensionType, dimensionValue, page]);

  useEffect(() => {
    load();
    return () => { latestRequest.current += 1; };
  }, [load]);

  const dimensionOptions = availableDimensions.filter((dimension) => !dimensionType || dimension.dimension_type === dimensionType);
  const featuredDimensionSummaries = [...dimensionSummaries]
    .sort((left, right) => Number(right.topic_count) - Number(left.topic_count) || left.dimension_type.localeCompare(right.dimension_type))
    .slice(0, 12);

  return (
    <PageShell>
      <PageHeader
        title="主题内容资产"
        description="按明确的选题关联汇总稿件、资料、拍摄、发布与数据；城市、人物和项目由选题负责人显式登记，不从历史文本推测。"
        actions={<Link to="/asset-center" className="xmt-btn-secondary inline-flex items-center gap-2"><ArrowLeft className="h-4 w-4" />返回资料中心</Link>}
      />
      <GlassPanel className="flex items-start gap-3 p-4 text-sm text-studio-text-secondary">
        <Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-studio-cyan" />
        <p>只统计当前账号有权查看的选题与资料。城市、人物、项目标签会记录登记人和时间；新维度仅用于后续查询与归类，不会自动改写历史资料关联。</p>
      </GlassPanel>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
          <SearchBar value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} placeholder="搜索主题名称" className="w-full sm:max-w-md" />
          <div className="flex min-w-0 gap-2">
            <select aria-label="按内容维度筛选" value={dimensionType} onChange={(event) => { setDimensionType(event.target.value as ContentAssetDimensionType | ''); setDimensionValue(''); setPage(1); }} className="xmt-field min-h-10 min-w-28">
              <option value="">全部维度</option>
              {(Object.entries(CONTENT_ASSET_DIMENSION_LABELS) as Array<[ContentAssetDimensionType, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select aria-label="按维度名称筛选" value={dimensionValue} onChange={(event) => { setDimensionValue(event.target.value); setPage(1); }} className="xmt-field min-h-10 min-w-32 flex-1 sm:max-w-52" disabled={!dimensionOptions.length}>
              <option value="">全部名称</option>
              {dimensionOptions.map((dimension) => <option key={`${dimension.dimension_type}:${dimension.value}`} value={dimension.value}>{dimension.value}</option>)}
            </select>
          </div>
        </div>
        <span className="text-sm text-studio-text-secondary">共 {total.toLocaleString('zh-CN')} 个可见主题</span>
      </div>
      {actionNotice ? <p role="status" className="text-sm text-studio-success-contrast">{actionNotice}</p> : null}
      {featuredDimensionSummaries.length ? (
        <section aria-label="内容维度汇总">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div><h2 className="text-base font-semibold text-studio-text-primary">城市 / 人物 / 项目汇总</h2><p className="mt-1 text-xs text-studio-text-secondary">基于可见选题与当前账号可访问的资料统计；点击维度查看对应主题。</p></div>
            <span className="text-xs text-studio-text-secondary">展示主题数最多的 12 项，筛选器可查全部</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {featuredDimensionSummaries.map((summary) => (
              <button key={`${summary.dimension_type}:${summary.value}`} type="button" aria-pressed={dimensionType === summary.dimension_type && dimensionValue === summary.value} onClick={() => { setDimensionType(summary.dimension_type); setDimensionValue(summary.value); setPage(1); }} className="studio-sheen rounded-2xl border border-studio-border-soft bg-studio-surface p-4 text-left transition-colors hover:border-studio-primary/40 aria-pressed:border-studio-primary/60">
                <div className="flex items-start justify-between gap-3"><span className="min-w-0 truncate text-sm font-semibold text-studio-text-primary">{summary.value}</span><span className="shrink-0 rounded-full border border-studio-border-soft px-2 py-0.5 text-[11px] text-studio-text-secondary">{CONTENT_ASSET_DIMENSION_LABELS[summary.dimension_type]}</span></div>
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-studio-text-secondary"><span>{Number(summary.topic_count).toLocaleString('zh-CN')} 个主题</span><span>{Number(summary.production_count).toLocaleString('zh-CN')} 篇稿件</span><span>{Number(summary.resource_count).toLocaleString('zh-CN')} 份资料</span><span>{Number(summary.shooting_count).toLocaleString('zh-CN')} 条拍摄</span><span>{Number(summary.publishing_count).toLocaleString('zh-CN')} 条发布</span></div>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {loading ? <LoadingState type="section" rows={6} /> : errorMessage ? <ErrorState description={`主题资产读取失败：${errorMessage}。现有内容没有被修改。`} onRetry={load} /> : items.length ? (
        <div className="grid gap-4 xl:grid-cols-2">{items.map((item) => <TopicAssetCard key={item.id} item={item} analyticsVisible={analyticsVisible} onDimensionsChanged={load} onActionNotice={setActionNotice} />)}</div>
      ) : keyword ? (
        <EmptySearch onAction={() => setKeyword('')} />
      ) : (
        <EmptyState icon={Layers3} title="暂无可见主题" description="完成的选题及其正式关联会在这里汇总；当前没有可展示的内容资产。" />
      )}
      {!loading && !errorMessage && total > 0 ? (
        <div className="flex items-center justify-between text-sm text-studio-text-secondary">
          <span>第 {page} / {totalPages} 页</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="xmt-btn-secondary disabled:opacity-40">上一页</button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="xmt-btn-secondary disabled:opacity-40">下一页</button>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
