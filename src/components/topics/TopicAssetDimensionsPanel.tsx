import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, RefreshCw, X } from 'lucide-react';
import {
  addContentTopicDimension,
  CONTENT_ASSET_DIMENSION_LABELS,
  getContentTopicDimensions,
  isTopicDimensionWriteOutcomeUnknown,
  reconcileContentTopicDimensionMutation,
  removeContentTopicDimension,
  type ContentAssetDimensionType,
  type ContentTopicDimension,
  type TopicDimensionMutationIntent,
} from '@/api/resourceCenter';

const dimensionTypes = Object.keys(CONTENT_ASSET_DIMENSION_LABELS) as ContentAssetDimensionType[];
type PendingDimensionMutation = TopicDimensionMutationIntent | { kind: 'remove'; dimension: ContentTopicDimension };

export default function TopicAssetDimensionsPanel({ topicId, canManage }: { topicId: number; canManage: boolean }) {
  const [dimensions, setDimensions] = useState<ContentTopicDimension[]>([]);
  const [dimensionType, setDimensionType] = useState<ContentAssetDimensionType>('city');
  const [dimensionValue, setDimensionValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [pendingMutation, setPendingMutation] = useState<PendingDimensionMutation | null>(null);
  const [recoveryChecking, setRecoveryChecking] = useState(false);
  const mutationInFlightRef = useRef(false);
  const pendingMutationRef = useRef<PendingDimensionMutation | null>(null);
  const mutationLocked = saving || pendingMutation !== null;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await getContentTopicDimensions(topicId);
      setDimensions(response.data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '未知错误');
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => { void load(); }, [load]);

  const verifyMutationOutcome = useCallback(async (mutation: PendingDimensionMutation) => {
    setRecoveryChecking(true);
    setActionError(null);
    try {
      const intent: TopicDimensionMutationIntent = mutation.kind === 'remove' && 'dimension' in mutation
        ? { kind: 'remove', dimensionId: mutation.dimension.id }
        : mutation;
      const response = await reconcileContentTopicDimensionMutation(topicId, intent);
      setDimensions(response.data);
      pendingMutationRef.current = null;
      setPendingMutation(null);
      mutationInFlightRef.current = false;

      if (mutation.kind === 'add') {
        const label = CONTENT_ASSET_DIMENSION_LABELS[mutation.type];
        setActionNotice(response.targetPresent
          ? `只读核实发现当前已登记${label}“${mutation.value}”；无法确认是否由刚才的操作完成，列表已同步。`
          : `只读核实未发现${label}“${mutation.value}”；未自动重试，如仍需登记请再次点击“添加维度”。`);
      } else {
        setActionNotice(response.targetPresent
          ? '只读核实发现该维度仍存在；未自动重试，请再次点击“移除”后重试。'
          : '只读核实发现该维度当前已不存在，列表已同步；无法确认是否由刚才的操作移除。');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setActionError(`操作结果暂不明确；只读核实失败：${message}`);
    } finally {
      setRecoveryChecking(false);
    }
  }, [topicId]);

  const retainUnknownMutation = async (mutation: PendingDimensionMutation, error: unknown) => {
    if (!isTopicDimensionWriteOutcomeUnknown(error)) {
      setActionError(error instanceof Error ? error.message : '请求失败，请重试');
      return;
    }
    pendingMutationRef.current = mutation;
    setPendingMutation(mutation);
    const message = error instanceof Error ? error.message : '连接中断';
    setActionError(`操作结果暂不明确（${message}）；正在只读核实，未自动重放。`);
    await verifyMutationOutcome(mutation);
  };

  const addDimension = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = dimensionValue.trim();
    if (!value || mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    setSaving(true);
    setActionError(null);
    setActionNotice(null);
    try {
      const response = await addContentTopicDimension(topicId, dimensionType, value);
      const saved = response.data ?? { id: response.id, type: dimensionType, value };
      setDimensions((current) => current.some((item) => item.id === saved.id) ? current : [...current, saved]);
      setDimensionValue('');
      setActionNotice(`${CONTENT_ASSET_DIMENSION_LABELS[dimensionType]}“${value}”已登记。`);
    } catch (error) {
      await retainUnknownMutation({ kind: 'add', type: dimensionType, value }, error);
    } finally {
      setSaving(false);
      if (!pendingMutationRef.current) mutationInFlightRef.current = false;
    }
  };

  const removeDimension = async (dimension: ContentTopicDimension) => {
    if (mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    setSaving(true);
    setActionError(null);
    setActionNotice(null);
    try {
      await removeContentTopicDimension(topicId, dimension.id);
      setDimensions((current) => current.filter((item) => item.id !== dimension.id));
      setActionNotice('内容维度已移除。');
    } catch (error) {
      await retainUnknownMutation({ kind: 'remove', dimension }, error);
    } finally {
      setSaving(false);
      if (!pendingMutationRef.current) mutationInFlightRef.current = false;
    }
  };

  return (
    <section aria-labelledby={`topic-dimensions-heading-${topicId}`} className="mb-6 rounded-2xl border border-studio-border-soft bg-studio-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id={`topic-dimensions-heading-${topicId}`} className="text-sm font-semibold text-studio-text-primary">城市、人物与项目</h2>
          <p className="mt-1 text-xs leading-5 text-studio-text-secondary">明确登记后用于主题内容资产归类；不会自动关联历史资料。</p>
        </div>
        {!canManage ? <span className="text-xs text-studio-text-secondary">只读</span> : null}
      </div>

      {loading ? <p role="status" className="mt-3 text-sm text-studio-text-muted">正在读取内容维度…</p> : loadError ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-studio-danger">
          <p role="alert">内容维度读取失败：{loadError}</p>
          <button type="button" onClick={() => void load()} className="xmt-btn-secondary inline-flex min-h-9 items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5" />重试</button>
        </div>
      ) : (
        <>
          <div aria-label="已登记内容维度" className="mt-3 flex flex-wrap gap-2">
            {dimensions.map((dimension) => (
              <span key={dimension.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-studio-border-soft bg-studio-surface-soft px-2.5 py-1 text-xs text-studio-text-secondary">
                <span className="shrink-0 text-studio-text-secondary">{CONTENT_ASSET_DIMENSION_LABELS[dimension.type]}</span>
                <span className="min-w-0 break-all">{dimension.value}</span>
                {canManage ? (
                  <button
                    type="button"
                    disabled={mutationLocked}
                    aria-label={`移除${CONTENT_ASSET_DIMENSION_LABELS[dimension.type]}：${dimension.value}`}
                    onClick={() => void removeDimension(dimension)}
                    className="shrink-0 rounded-full text-studio-text-muted hover:text-studio-danger disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </span>
            ))}
            {!dimensions.length ? <span className="text-sm text-studio-text-secondary">暂未登记城市、人物或项目。</span> : null}
          </div>

          {canManage ? (
            <form onSubmit={(event) => void addDimension(event)} className="mt-3 grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)_auto]">
              <label className="sr-only" htmlFor={`topic-dimension-type-${topicId}`}>维度类型</label>
              <select
                id={`topic-dimension-type-${topicId}`}
                aria-label={`维度类型-${topicId}`}
                value={dimensionType}
                onChange={(event) => setDimensionType(event.target.value as ContentAssetDimensionType)}
                disabled={mutationLocked}
                className="xmt-field min-h-10 w-full"
              >
                {dimensionTypes.map((type) => <option key={type} value={type}>{CONTENT_ASSET_DIMENSION_LABELS[type]}</option>)}
              </select>
              <label className="sr-only" htmlFor={`topic-dimension-value-${topicId}`}>维度名称</label>
              <input
                id={`topic-dimension-value-${topicId}`}
                aria-label={`维度名称-${topicId}`}
                value={dimensionValue}
                onChange={(event) => setDimensionValue(event.target.value)}
                maxLength={80}
                disabled={mutationLocked}
                className="xmt-field min-h-10 min-w-0 w-full"
                placeholder={`登记${CONTENT_ASSET_DIMENSION_LABELS[dimensionType]}（最多 80 字）`}
              />
              <button type="submit" disabled={mutationLocked || !dimensionValue.trim()} className="xmt-btn-secondary inline-flex min-h-10 items-center justify-center gap-1.5 disabled:opacity-50">
                <Plus className="h-4 w-4" />{saving ? '保存中…' : pendingMutation ? '结果待核实' : '添加维度'}
              </button>
            </form>
          ) : null}
          {pendingMutation ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-studio-danger">
              <p role="alert">操作结果暂不明确；写入已锁定，不会自动重放。请先只读核实当前状态。</p>
              <button
                type="button"
                disabled={recoveryChecking}
                onClick={() => void verifyMutationOutcome(pendingMutation)}
                className="xmt-btn-secondary inline-flex min-h-9 items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />{recoveryChecking ? '核实中…' : '只读核实当前状态'}
              </button>
            </div>
          ) : null}
          {actionError ? <p role="alert" className="mt-2 text-xs text-studio-danger">{actionError}</p> : null}
          {actionNotice ? <p role="status" className="mt-2 text-xs text-studio-success-contrast">{actionNotice}</p> : null}
        </>
      )}
    </section>
  );
}
