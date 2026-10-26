import { ArrowLeft, ArrowUpRight, FileText, Layers3, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { addContentTopicDimension, CONTENT_ASSET_DIMENSION_LABELS, getContentTopicAssets, isTopicDimensionWriteOutcomeUnknown, reconcileContentTopicDimensionMutation, removeContentTopicDimension, type ContentAssetDimensionType, type ContentTopicAsset, type ContentTopicDimension, type ContentTopicDimensionCoverage, type LibraryType, type TopicDimensionMutationIntent } from '@/api/resourceCenter';
import { ErrorState, LoadingState } from '@/components/common';
import { EmptySearch, EmptyState, GlassPanel, PageHeader, PageShell, SearchBar, StatusPill } from '@/components/studio';
import { useDebounce } from '@/hooks/useDebounce';
import { getPlatformLabel } from '@/platform/platform-labels';
import { getResourceDetailPath } from '@/platform/resource-navigation';
import { useAuthStore } from '@/store';

const statusLabels: Record<string, string> = {
  pending: '待审核', approved: '已通过', rejected: '已驳回', production: '创作中',
  shooting: '成片制作', publishing: '发布中', completed: '已完成',
};
const metricSourceLabels: Record<string, string> = {
  douyin_official_export: '抖音官方', manual: '手工补充', douyin_creator_collection: '运营采集',
  douyin_legacy_current: '旧版抖音数据', legacy_analytics: '旧选题级数据', unavailable: '未录入',
};
const resourceLibraryLabels: Record<LibraryType, string> = {
  project: '项目资料库', content_archive: '内容档案库', knowledge: '知识库', media: '素材归档库',
};
const emptyDimensionCoverage: ContentTopicDimensionCoverage = {
  visible_topics_total: 0,
  registered_topic_counts: { city: 0, person: 0, project: 0 },
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

type PendingCardDimensionMutation =
  | { kind: 'add'; type: ContentAssetDimensionType; value: string }
  | { kind: 'remove'; dimensionId: number; type: ContentAssetDimensionType; value: string };

type StoredPendingCardDimensionMutation = { userId: number; topicId: number; mutation: PendingCardDimensionMutation };
const pendingDimensionStoragePrefix = 'xmt:content-topic-dimension-pending:v1:user:';

function pendingDimensionStorageKey(userId: number, topicId: number) {
  return `${pendingDimensionStoragePrefix}${userId}:topic:${topicId}`;
}

function parsePendingDimensionMutation(value: unknown): PendingCardDimensionMutation | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === 'add'
    && (candidate.type === 'city' || candidate.type === 'person' || candidate.type === 'project')
    && typeof candidate.value === 'string' && candidate.value.trim()) {
    return { kind: 'add', type: candidate.type, value: candidate.value };
  }
  if (candidate.kind === 'remove'
    && Number.isInteger(candidate.dimensionId) && Number(candidate.dimensionId) > 0
    && (candidate.type === 'city' || candidate.type === 'person' || candidate.type === 'project')
    && typeof candidate.value === 'string') {
    return { kind: 'remove', dimensionId: Number(candidate.dimensionId), type: candidate.type, value: candidate.value };
  }
  return null;
}

function loadPendingCardDimensionMutations(userId: number | undefined): Record<string, PendingCardDimensionMutation> {
  if (!Number.isInteger(userId) || Number(userId) <= 0 || typeof window === 'undefined') return {};
  const prefix = `${pendingDimensionStoragePrefix}${userId}:topic:`;
  const pending: Record<string, PendingCardDimensionMutation> = {};
  try {
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const topicId = Number(key.slice(prefix.length));
      if (!Number.isInteger(topicId) || topicId <= 0) continue;
      const stored = JSON.parse(window.sessionStorage.getItem(key) || 'null') as Partial<StoredPendingCardDimensionMutation> | null;
      const mutation = parsePendingDimensionMutation(stored?.mutation);
      if (stored?.userId === userId && stored?.topicId === topicId && mutation) pending[key] = mutation;
    }
  } catch {
    return pending;
  }
  return pending;
}

function persistPendingCardDimensionMutation(userId: number | undefined, topicId: number, mutation: PendingCardDimensionMutation) {
  if (typeof userId !== 'number' || !Number.isInteger(userId) || userId <= 0 || typeof window === 'undefined') {
    throw new Error('当前账号尚未确认，无法安全保存恢复状态；本次没有发送维度操作。');
  }
  const key = pendingDimensionStorageKey(Number(userId), topicId);
  window.sessionStorage.setItem(key, JSON.stringify({ userId, topicId, mutation } satisfies StoredPendingCardDimensionMutation));
  const stored = JSON.parse(window.sessionStorage.getItem(key) || 'null') as Partial<StoredPendingCardDimensionMutation> | null;
  if (stored?.userId !== userId || stored?.topicId !== topicId || !parsePendingDimensionMutation(stored?.mutation)) {
    throw new Error('维度恢复信息未能保存；本次没有发送维度操作。');
  }
}

function clearPendingCardDimensionMutation(userId: number | undefined, topicId: number) {
  if (!Number.isInteger(userId) || Number(userId) <= 0 || typeof window === 'undefined') return;
  try { window.sessionStorage.removeItem(pendingDimensionStorageKey(Number(userId), topicId)); } catch { /* A stale marker is safe: the next page load will read-only verify it. */ }
}

function TopicAssetCard({ item, analyticsVisible, userId, pendingMutation, onPendingMutationChange, onDimensionsChanged, onActionNotice }: { item: ContentTopicAsset; analyticsVisible: boolean; userId?: number; pendingMutation: PendingCardDimensionMutation | null; onPendingMutationChange: (userId: number | undefined, topicId: number, mutation: PendingCardDimensionMutation | null) => void; onDimensionsChanged: () => void; onActionNotice: (notice: string | null) => void }) {
  const [dimensionType, setDimensionType] = useState<ContentAssetDimensionType>('city');
  const [dimensionValue, setDimensionValue] = useState('');
  const [savingDimension, setSavingDimension] = useState(false);
  const [dimensionError, setDimensionError] = useState<string | null>(null);
  const [recoveryChecking, setRecoveryChecking] = useState(false);
  const mutationInFlightRef = useRef(false);
  const pendingMutationRef = useRef<PendingCardDimensionMutation | null>(pendingMutation);
  const mutationLocked = savingDimension || pendingMutation !== null;
  const metrics = item.latest_analytics;
  const latestMetricPlatform = getPlatformLabel(metrics?.platform) || '平台待确认';

  useEffect(() => { pendingMutationRef.current = pendingMutation; }, [pendingMutation]);

  const verifyMutationOutcome = useCallback(async (mutation: PendingCardDimensionMutation) => {
    setRecoveryChecking(true);
    setDimensionError(null);
    try {
      const intent: TopicDimensionMutationIntent = mutation.kind === 'add'
        ? mutation
        : { kind: 'remove', dimensionId: mutation.dimensionId };
      const response = await reconcileContentTopicDimensionMutation(item.id, intent);
      clearPendingCardDimensionMutation(userId, item.id);
      pendingMutationRef.current = null;
      onPendingMutationChange(userId, item.id, null);
      mutationInFlightRef.current = false;
      onDimensionsChanged();

      if (mutation.kind === 'add') {
        const label = CONTENT_ASSET_DIMENSION_LABELS[mutation.type];
        onActionNotice(response.targetPresent
          ? `只读核实发现当前已登记${label}“${mutation.value}”；无法确认是否由刚才的操作完成，列表已同步。`
          : `只读核实未发现${label}“${mutation.value}”；未自动重试，如仍需登记请再次点击“添加维度”。`);
      } else {
        onActionNotice(response.targetPresent
          ? '只读核实发现该维度仍存在；未自动重试，请再次点击“移除”后重试。'
          : '只读核实发现该维度当前已不存在，列表已同步；无法确认是否由刚才的操作移除。');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setDimensionError(`操作结果暂不明确；只读核实失败：${message}`);
    } finally {
      setRecoveryChecking(false);
    }
  }, [item.id, onActionNotice, onDimensionsChanged, onPendingMutationChange, userId]);

  const handleMutationFailure = async (mutation: PendingCardDimensionMutation, error: unknown) => {
    if (!isTopicDimensionWriteOutcomeUnknown(error)) {
      clearPendingCardDimensionMutation(userId, item.id);
      pendingMutationRef.current = null;
      onPendingMutationChange(userId, item.id, null);
      setDimensionError(error instanceof Error ? error.message : '请求失败，请重试');
      return;
    }
    pendingMutationRef.current = mutation;
    onPendingMutationChange(userId, item.id, mutation);
    const message = error instanceof Error ? error.message : '连接中断';
    setDimensionError(`操作结果暂不明确（${message}）；正在只读核实，未自动重放。`);
    await verifyMutationOutcome(mutation);
  };

  const addDimension = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = dimensionValue.trim();
    if (!value || mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    setSavingDimension(true);
    setDimensionError(null);
    onActionNotice(null);
    const mutation: PendingCardDimensionMutation = { kind: 'add', type: dimensionType, value };
    try {
      persistPendingCardDimensionMutation(userId, item.id, mutation);
      pendingMutationRef.current = mutation;
      onPendingMutationChange(userId, item.id, mutation);
    } catch (error) {
      setDimensionError(error instanceof Error ? error.message : '恢复信息保存失败，本次没有发送维度操作');
      mutationInFlightRef.current = false;
      setSavingDimension(false);
      return;
    }
    try {
      await addContentTopicDimension(item.id, dimensionType, value);
      clearPendingCardDimensionMutation(userId, item.id);
      pendingMutationRef.current = null;
      onPendingMutationChange(userId, item.id, null);
      setDimensionValue('');
      onActionNotice(`${CONTENT_ASSET_DIMENSION_LABELS[dimensionType]}“${value}”已登记。`);
      onDimensionsChanged();
    } catch (error) {
      await handleMutationFailure({ kind: 'add', type: dimensionType, value }, error);
    } finally {
      if (!pendingMutationRef.current) mutationInFlightRef.current = false;
      setSavingDimension(false);
    }
  };

  const removeDimension = async (dimension: ContentTopicDimension) => {
    if (mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    setSavingDimension(true);
    setDimensionError(null);
    onActionNotice(null);
    const mutation: PendingCardDimensionMutation = { kind: 'remove', dimensionId: dimension.id, type: dimension.type, value: dimension.value };
    try {
      persistPendingCardDimensionMutation(userId, item.id, mutation);
      pendingMutationRef.current = mutation;
      onPendingMutationChange(userId, item.id, mutation);
    } catch (error) {
      setDimensionError(error instanceof Error ? error.message : '恢复信息保存失败，本次没有发送维度操作');
      mutationInFlightRef.current = false;
      setSavingDimension(false);
      return;
    }
    try {
      await removeContentTopicDimension(item.id, dimension.id);
      clearPendingCardDimensionMutation(userId, item.id);
      pendingMutationRef.current = null;
      onPendingMutationChange(userId, item.id, null);
      onActionNotice('内容维度已移除。');
      onDimensionsChanged();
    } catch (error) {
      await handleMutationFailure({ kind: 'remove', dimensionId: dimension.id, type: dimension.type, value: dimension.value }, error);
    } finally {
      if (!pendingMutationRef.current) mutationInFlightRef.current = false;
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
          <p className="mt-1 text-xs text-studio-text-secondary">{getPlatformLabel(item.platform) || '未指定平台'} · 更新于 {formatDate(item.updated_at)}</p>
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
        <p className="text-xs font-medium text-studio-text-secondary">当前可访问的关联资料</p>
        {item.linked_resources.length ? (
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {item.linked_resources.map((resource) => (
              <li key={resource.id} className="min-w-0 max-w-full">
                <Link
                  to={getResourceDetailPath(resource.id, resource.library_type)}
                  className="break-words text-studio-primary-contrast hover:underline"
                >
                  {resource.title}
                </Link>
                <span className="ml-1.5 text-xs text-studio-text-secondary">{resourceLibraryLabels[resource.library_type]} · {formatDate(resource.updated_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-studio-text-secondary">暂无当前账号可访问的关联资料</p>
        )}
      </div>

      {item.referenced_resources.length ? (
        <div className="mt-4 border-t border-studio-border-soft pt-4">
          <p className="text-xs font-medium text-studio-text-secondary">当前稿件正文引用</p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {item.referenced_resources.map((resource) => (
              <li key={resource.id} className="min-w-0 max-w-full">
                <Link
                  to={getResourceDetailPath(resource.id, resource.library_type)}
                  className="break-words text-studio-primary-contrast hover:underline"
                >
                  {resource.title}
                </Link>
                <span className="ml-1.5 text-xs text-studio-text-secondary">{resourceLibraryLabels[resource.library_type]} · {formatDate(resource.updated_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 border-t border-studio-border-soft pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {item.dimensions.map((dimension) => (
            <span key={dimension.id} className="inline-flex items-center gap-1.5 rounded-full border border-studio-border-soft bg-studio-surface-soft px-2.5 py-1 text-xs text-studio-text-secondary">
              <span className="text-studio-text-secondary">{CONTENT_ASSET_DIMENSION_LABELS[dimension.type]}</span>{dimension.value}
              {item.can_manage_dimensions ? <button type="button" disabled={mutationLocked} aria-label={`移除${CONTENT_ASSET_DIMENSION_LABELS[dimension.type]}：${dimension.value}`} onClick={() => void removeDimension(dimension)} className="rounded-full text-studio-text-muted hover:text-studio-danger disabled:opacity-40"><X className="h-3.5 w-3.5" /></button> : null}
            </span>
          ))}
          {!item.dimensions.length ? <span className="text-xs text-studio-text-secondary">尚未登记城市、人物或项目</span> : null}
        </div>
        {item.can_manage_dimensions ? (
          <form onSubmit={(event) => void addDimension(event)} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor={`dimension-type-${item.id}`}>维度类型</label>
            <select id={`dimension-type-${item.id}`} aria-label={`维度类型-${item.id}`} value={dimensionType} onChange={(event) => setDimensionType(event.target.value as ContentAssetDimensionType)} disabled={mutationLocked} className="xmt-field min-h-10 sm:w-28">
              {(Object.entries(CONTENT_ASSET_DIMENSION_LABELS) as Array<[ContentAssetDimensionType, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <label className="sr-only" htmlFor={`dimension-value-${item.id}`}>维度名称</label>
            <input id={`dimension-value-${item.id}`} aria-label={`维度名称-${item.id}`} value={dimensionValue} onChange={(event) => setDimensionValue(event.target.value)} maxLength={80} disabled={mutationLocked} className="xmt-field min-h-10 min-w-0 flex-1" placeholder={`登记${CONTENT_ASSET_DIMENSION_LABELS[dimensionType]}（最多 80 字）`} />
            <button type="submit" disabled={mutationLocked || !dimensionValue.trim()} className="xmt-btn-secondary inline-flex min-h-10 items-center justify-center gap-1.5 disabled:opacity-50"><Plus className="h-4 w-4" />{savingDimension ? '保存中…' : pendingMutation ? '结果待核实' : '添加维度'}</button>
          </form>
        ) : null}
        {dimensionError ? <p role="alert" className="mt-2 text-xs text-studio-danger">{dimensionError}</p> : null}
        {pendingMutation ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-studio-danger">
            <p role="alert">操作结果暂不明确；写入已锁定，不会自动重放。请先只读核实当前状态。</p>
            <button type="button" disabled={recoveryChecking} onClick={() => void verifyMutationOutcome(pendingMutation)} className="xmt-btn-secondary inline-flex min-h-9 items-center gap-1.5 disabled:opacity-50">
              {recoveryChecking ? '核实中…' : '只读核实当前状态'}
            </button>
          </div>
        ) : null}
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
  const userId = useAuthStore((state) => state.user?.id);
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebounce(keyword, 300);
  const [dimensionType, setDimensionType] = useState<ContentAssetDimensionType | ''>('');
  const [dimensionValue, setDimensionValue] = useState('');
  const [items, setItems] = useState<ContentTopicAsset[]>([]);
  const [availableDimensions, setAvailableDimensions] = useState<Array<{ dimension_type: ContentAssetDimensionType; value: string }>>([]);
  const [dimensionSummaries, setDimensionSummaries] = useState<Array<{ dimension_type: ContentAssetDimensionType; value: string; topic_count: number; production_count: number; resource_count: number; shooting_count: number; publishing_count: number }>>([]);
  const [dimensionCoverage, setDimensionCoverage] = useState<ContentTopicDimensionCoverage>(emptyDimensionCoverage);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [analyticsVisible, setAnalyticsVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [pendingDimensionMutations, setPendingDimensionMutations] = useState<Record<string, PendingCardDimensionMutation>>(
    () => loadPendingCardDimensionMutations(userId),
  );
  const latestRequest = useRef(0);

  useLayoutEffect(() => {
    setPendingDimensionMutations(loadPendingCardDimensionMutations(userId));
    setDimensionCoverage(emptyDimensionCoverage);
  }, [userId]);

  const handlePendingDimensionMutationChange = useCallback((ownerUserId: number | undefined, topicId: number, mutation: PendingCardDimensionMutation | null) => {
    if (!Number.isInteger(ownerUserId) || Number(ownerUserId) <= 0) return;
    const key = pendingDimensionStorageKey(Number(ownerUserId), topicId);
    setPendingDimensionMutations((current) => {
      if (mutation) return { ...current, [key]: mutation };
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const load = useCallback(() => {
    const requestId = ++latestRequest.current;
    const isCurrentRequest = () => requestId === latestRequest.current && useAuthStore.getState().user?.id === userId;
    setLoading(true);
    setErrorMessage(null);
    void getContentTopicAssets({ keyword: debouncedKeyword || undefined, page, page_size: 12, dimension_type: dimensionType || undefined, dimension_value: dimensionValue || undefined })
      .then((response) => {
        if (!isCurrentRequest()) return;
        setItems(response.data);
        setAvailableDimensions(response.available_dimensions);
        setDimensionSummaries(response.dimension_summaries);
        setDimensionCoverage(response.dimension_coverage);
        setTotal(response.pagination.total);
        setTotalPages(Math.max(1, response.pagination.total_pages));
        setAnalyticsVisible(response.analytics_visible);
      })
      .catch((error: unknown) => {
        if (isCurrentRequest()) {
          setErrorMessage(error instanceof Error ? error.message : '未知错误');
        }
      })
      .finally(() => {
        if (isCurrentRequest()) setLoading(false);
      });
  }, [debouncedKeyword, dimensionType, dimensionValue, page, userId]);

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
      {dimensionCoverage.visible_topics_total > 0 ? (
        <section aria-label="内容维度登记范围" className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-studio-text-primary">已明确登记的选题数</h2>
            <p className="mt-1 text-xs text-studio-text-secondary">按当前账号可查看的全部选题统计；仅表示存在显式登记，不代表每个选题都必须登记。</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {(Object.entries(CONTENT_ASSET_DIMENSION_LABELS) as Array<[ContentAssetDimensionType, string]>).map(([type, label]) => (
              <article key={type} className="studio-sheen rounded-2xl border border-studio-border-soft bg-studio-surface p-4">
                <h3 className="text-sm font-semibold text-studio-text-primary">{label}</h3>
                <p className="mt-2 text-sm text-studio-text-secondary">
                  <span className="xmt-data-number text-lg font-semibold text-studio-primary-contrast">{Number(dimensionCoverage.registered_topic_counts[type]).toLocaleString('zh-CN')}</span>
                  {' / '}{Number(dimensionCoverage.visible_topics_total).toLocaleString('zh-CN')} 个当前可见选题已登记
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
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
        <div className="grid gap-4 xl:grid-cols-2">{items.map((item) => <TopicAssetCard key={item.id} item={item} analyticsVisible={analyticsVisible} userId={userId} pendingMutation={userId ? pendingDimensionMutations[pendingDimensionStorageKey(userId, item.id)] ?? null : null} onPendingMutationChange={handlePendingDimensionMutationChange} onDimensionsChanged={load} onActionNotice={setActionNotice} />)}</div>
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
