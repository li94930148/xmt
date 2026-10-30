import { ExternalLink, Link2, Search, Trash2 } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { addTopicResource, getTopicResources, removeTopicResource, TopicApiError, type TopicResource } from '@/api/topics';
import { searchResourceCenter } from '@/api/resourceCenter';
import { BaseModal, ConfirmModal, ErrorState, LoadingState } from '@/components/common';
import { EmptyState, SearchBar } from '@/components/studio';
import { getResourceDetailPath } from '@/platform/resource-navigation';
import { useAppStore, useAuthStore } from '@/store';
import { getUserFacingErrorMessage } from '@/lib/userFacingError';
import {
  clearTopicResourceRecovery,
  createTopicResourceRecoveryRequestId,
  persistTopicResourceRecovery,
  readTopicResourceRecoveries,
  type PendingTopicResourceRecovery,
  type TopicResourceRecoveryMutation,
} from './topicResourceRecovery';

const libraryNames: Record<TopicResource['library_type'], string> = {
  project: '项目资料库',
  content_archive: '内容档案库',
  knowledge: '知识库',
  media: '素材归档库',
};

type SearchResult = TopicResource & { snippet: string };
type TopicResourceRecoveryNotice = PendingTopicResourceRecovery & { message: string };

function needsTopicResourceReadback(error: unknown) {
  if (!(error instanceof TopicApiError)) return true;
  return error.status === 404 || error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500;
}

export default function TopicResourcesPanel({ topicId, canManage }: { topicId: number; canManage: boolean }) {
  const actorId = useAuthStore((state) => Number(state.user?.id) || 0);
  const recoveryScope = `${actorId}:${topicId}`;
  const [recoveryBootstrap] = useState(() => actorId > 0 && Number.isSafeInteger(topicId) && topicId > 0
    ? { scope: recoveryScope, result: readTopicResourceRecoveries(actorId, topicId) }
    : { scope: recoveryScope, result: { state: 'unavailable' as const, recoveries: [] } });
  const bootstrapRecords = recoveryBootstrap.result.state === 'valid' ? recoveryBootstrap.result.recoveries : [];
  const [items, setItems] = useState<TopicResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [removing, setRemoving] = useState<TopicResource | null>(null);
  const [mutating, setMutating] = useState(false);
  const [pendingRecoveries, setPendingRecoveries] = useState<TopicResourceRecoveryNotice[]>(() => bootstrapRecords.map((recovery) => ({
    ...recovery,
    message: `「${recovery.resource.title}」的${recovery.mutation === 'link' ? '关联' : '解除关联'}结果仍待核实；只读核实前不会重复写入。`,
  })));
  const isSearchingRef = useRef(false);
  const isMutatingRef = useRef(false);
  const pendingRecoveriesRef = useRef(new Map<number, TopicResourceRecoveryNotice>(pendingRecoveries.map((recovery) => [recovery.resource.id, recovery])));
  const [recoveryStorage, setRecoveryStorage] = useState(() => ({
    scope: recoveryBootstrap.scope,
    ready: recoveryBootstrap.result.state === 'none' || recoveryBootstrap.result.state === 'valid',
    message: recoveryBootstrap.result.state === 'invalid'
      ? '本机资料关联恢复记录格式异常；为避免重复操作，关联和解除功能已暂停。请重新读取当前选题。'
      : recoveryBootstrap.result.state === 'unavailable'
        ? '本机资料关联恢复记录暂不可读取；为避免重复操作，关联和解除功能已暂停。请检查浏览器存储后重新读取。'
        : '',
  }));
  const addNotification = useAppStore((state) => state.addNotification);
  const recoveryStorageReady = actorId > 0 && recoveryStorage.scope === recoveryScope && recoveryStorage.ready;

  const applyRecoveryRead = useCallback((scope: string, result: ReturnType<typeof readTopicResourceRecoveries>) => {
    const records = result.state === 'valid' ? result.recoveries : [];
    const next = new Map<number, TopicResourceRecoveryNotice>(records.map((recovery) => [recovery.resource.id, {
      ...recovery,
      message: `「${recovery.resource.title}」的${recovery.mutation === 'link' ? '关联' : '解除关联'}结果仍待核实；只读核实前不会重复写入。`,
    }]));
    pendingRecoveriesRef.current = next;
    setPendingRecoveries(Array.from(next.values()));
    setRecoveryStorage({
      scope,
      ready: result.state === 'none' || result.state === 'valid',
      message: result.state === 'invalid'
        ? '本机资料关联恢复记录格式异常；为避免重复操作，关联和解除功能已暂停。请重新读取当前选题。'
        : result.state === 'unavailable'
          ? '本机资料关联恢复记录暂不可读取；为避免重复操作，关联和解除功能已暂停。请检查浏览器存储后重新读取。'
          : '',
    });
    return records;
  }, []);

  const setPendingRecovery = useCallback((entry: TopicResourceRecoveryNotice | null, resourceId: number) => {
    const next = new Map(pendingRecoveriesRef.current);
    if (entry) next.set(resourceId, entry);
    else next.delete(resourceId);
    pendingRecoveriesRef.current = next;
    setPendingRecoveries(Array.from(next.values()));
  }, []);

  const reconcileMutation = useCallback((recovery: PendingTopicResourceRecovery, currentItems: TopicResource[], mutationError?: unknown) => {
    if (Number(useAuthStore.getState().user?.id) !== recovery.actorId || recovery.topicId !== topicId) return;
    const { resource, mutation } = recovery;
    const isLinked = currentItems.some((item) => item.id === resource.id);
    const applied = mutation === 'link' ? isLinked : !isLinked;
    setItems(currentItems);
    if (isLinked) setResults((current) => current.filter((item) => item.id !== resource.id));
    if (mutation === 'unlink') setRemoving(null);

    if (!clearTopicResourceRecovery(recovery)) {
      const message = applied
        ? `服务器已确认「${resource.title}」的${mutation === 'link' ? '关联' : '解除关联'}，但本机恢复记录未能核实清除；操作仍保持锁定，请只读重新核实。`
        : `服务器已确认「${resource.title}」的${mutation === 'link' ? '关联' : '解除关联'}没有变化，但本机恢复记录未能核实清除；操作仍保持锁定，请只读重新核实。`;
      setPendingRecovery({ ...recovery, message }, resource.id);
      addNotification({ title: '关联状态待处理', message, type: 'error' });
      return;
    }
    setPendingRecovery(null, resource.id);

    if (applied) {
      addNotification({
        title: mutation === 'link' ? '关联已确认' : '解除关联已确认',
        message: resource.title,
        type: 'success',
      });
      return;
    }

    const operation = mutation === 'link' ? '关联' : '解除关联';
    const reason = mutationError
      ? getUserFacingErrorMessage(mutationError, `${operation}未完成。`)
      : `${operation}未完成。`;
    addNotification({
      title: `${operation}未变更`,
      message: `${reason}服务端已确认资料关系没有变化；如需继续，请检查后手动重试。`,
      type: 'error',
    });
  }, [addNotification, setPendingRecovery, topicId]);

  const verifyPendingRecovery = useCallback(async (resourceId: number) => {
    const recovery = pendingRecoveriesRef.current.get(resourceId);
    if (!recovery || isMutatingRef.current) return;
    isMutatingRef.current = true;
    setMutating(true);
    setPendingRecovery({ ...recovery, message: `正在只读核实「${recovery.resource.title}」的关联状态；核实期间不会重复写入。` }, resourceId);
    try {
      reconcileMutation(recovery, await getTopicResources(topicId));
    } catch (error) {
      const message = getUserFacingErrorMessage(error, '暂时无法读取资料关联状态');
      setPendingRecovery({
        ...recovery,
        message: `「${recovery.resource.title}」的${recovery.mutation === 'link' ? '关联' : '解除关联'}结果仍待核实。${message}请只读核实后再继续。`,
      }, resourceId);
      setShowPicker(false);
      setRemoving(null);
    } finally {
      isMutatingRef.current = false;
      setMutating(false);
    }
  }, [reconcileMutation, setPendingRecovery, topicId]);

  const handleMutationFailure = useCallback(async (recovery: PendingTopicResourceRecovery, error: unknown) => {
    const { resource, mutation } = recovery;
    if (!needsTopicResourceReadback(error)) {
      const operation = mutation === 'link' ? '关联失败' : '解除失败';
      const fallback = mutation === 'link' ? '关联资料失败，请检查权限或资源状态后重试。' : '解除资料关联失败，请稍后重试。';
      if (!clearTopicResourceRecovery(recovery)) {
        setPendingRecovery({
          ...recovery,
          message: `${getUserFacingErrorMessage(error, fallback)}服务器已拒绝本次操作，但本机恢复记录未能核实清除；关联仍保持锁定，请只读核实。`,
        }, resource.id);
        return;
      }
      addNotification({ title: operation, message: getUserFacingErrorMessage(error, fallback), type: 'error' });
      return;
    }

    setPendingRecovery({
      ...recovery,
      message: `正在只读核实「${resource.title}」的${mutation === 'link' ? '关联' : '解除关联'}结果；核实期间不会重复写入。`,
    }, resource.id);
    try {
      reconcileMutation(recovery, await getTopicResources(topicId), error);
    } catch (readError) {
      const message = getUserFacingErrorMessage(readError, '暂时无法读取资料关联状态');
      setPendingRecovery({
        ...recovery,
        message: `「${resource.title}」的${mutation === 'link' ? '关联' : '解除关联'}结果仍待核实。${message}请只读核实后再继续。`,
      }, resource.id);
      setShowPicker(false);
      setRemoving(null);
    }
  }, [addNotification, reconcileMutation, setPendingRecovery, topicId]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const storedRecoveries = actorId > 0
      ? applyRecoveryRead(recoveryScope, readTopicResourceRecoveries(actorId, topicId))
      : applyRecoveryRead(recoveryScope, { state: 'unavailable' });
    try {
      const currentItems = await getTopicResources(topicId);
      if (Number(useAuthStore.getState().user?.id) !== actorId) return;
      setItems(currentItems);
      for (const recovery of storedRecoveries) reconcileMutation(recovery, currentItems);
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  }, [actorId, applyRecoveryRead, reconcileMutation, recoveryScope, topicId]);

  useEffect(() => { void load(); }, [load]);

  const createRecoverySnapshot = (resource: Pick<TopicResource, 'id' | 'title'>, mutation: TopicResourceRecoveryMutation) => {
    if (!recoveryStorageReady) {
      addNotification({ title: '关联未发送', message: recoveryStorage.message || '当前账号的本机恢复记录尚未核实；关联和解除操作已暂停。', type: 'error' });
      return null;
    }
    try {
      const recovery: PendingTopicResourceRecovery = {
        version: 1,
        actorId,
        topicId,
        requestId: createTopicResourceRecoveryRequestId(),
        resource: { id: resource.id, title: resource.title },
        mutation,
      };
      if (persistTopicResourceRecovery(recovery)) return recovery;
      const stored = readTopicResourceRecoveries(actorId, topicId);
      applyRecoveryRead(recoveryScope, stored);
      addNotification({
        title: '关联未发送',
        message: stored.state === 'valid' && stored.recoveries.some((entry) => entry.resource.id === resource.id)
          ? `「${resource.title}」已有一次操作仍待核实；本次没有发送。请先只读核实。`
          : '本机恢复记录无法完整保存并核对；本次没有发送资料关联请求。请检查浏览器存储后重试。',
        type: 'error',
      });
      return null;
    } catch (error) {
      addNotification({ title: '关联未发送', message: getUserFacingErrorMessage(error, '本机恢复编号无法创建；本次没有发送资料关联请求。'), type: 'error' });
      return null;
    }
  };

  const completeConfirmedMutation = (
    recovery: PendingTopicResourceRecovery,
    nextItems: TopicResource[],
    successMessage: string,
  ) => {
    const { resource } = recovery;
    setItems(nextItems);
    if (recovery.mutation === 'link') setResults((current) => current.filter((item) => item.id !== resource.id));
    if (recovery.mutation === 'unlink') setRemoving(null);
    if (!clearTopicResourceRecovery(recovery)) {
      const message = `服务器已确认「${resource.title}」的${recovery.mutation === 'link' ? '关联' : '解除关联'}，但本机恢复记录未能核实清除；该资料仍保持锁定，请只读重新核实。`;
      setPendingRecovery({ ...recovery, message }, resource.id);
      addNotification({ title: '关联状态待处理', message, type: 'error' });
      return;
    }
    setPendingRecovery(null, resource.id);
    addNotification({
      title: recovery.mutation === 'link' ? '关联成功' : '解除关联成功',
      message: successMessage,
      type: 'success',
    });
  };

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (isSearchingRef.current) return;
    const term = keyword.trim();
    if (!term) return;
    isSearchingRef.current = true;
    setSearching(true);
    try {
      const matches = await searchResourceCenter({ keyword: term });
      const linkedIds = new Set(items.map((item) => item.id));
      setResults(matches.data.filter((item) => !linkedIds.has(item.resource_id)).map((item) => {
        return {
          id: item.resource_id,
          title: item.title,
          summary: item.summary,
          snippet: item.snippet.replace(/<\/?mark>/g, ''),
          library_type: item.library_type,
          category: item.category ? { id: item.category.id, name: item.category.name, path: item.category.path || undefined } : null,
        };
      }));
    } catch (error) {
      addNotification({ title: '搜索失败', message: getUserFacingErrorMessage(error, '暂时无法搜索资料，请稍后重试。'), type: 'error' });
    } finally {
      isSearchingRef.current = false;
      setSearching(false);
    }
  };

  const add = async (resource: SearchResult) => {
    if (!recoveryStorageReady || isMutatingRef.current || pendingRecoveriesRef.current.has(resource.id)) return;
    isMutatingRef.current = true;
    setMutating(true);
    setAddingId(resource.id);
    let recovery: PendingTopicResourceRecovery | null = null;
    try {
      recovery = createRecoverySnapshot(resource, 'link');
      if (!recovery) return;
      await addTopicResource(topicId, resource.id);
      if (Number(useAuthStore.getState().user?.id) !== actorId) return;
      const nextItems = items.some((item) => item.id === resource.id) ? items : [...items, {
        id: resource.id,
        title: resource.title,
        summary: resource.summary,
        library_type: resource.library_type,
        category: resource.category,
      }];
      completeConfirmedMutation(recovery, nextItems, resource.title);
    } catch (error) {
      if (recovery) await handleMutationFailure(recovery, error);
    } finally {
      isMutatingRef.current = false;
      setMutating(false);
      setAddingId(null);
    }
  };

  const remove = async () => {
    if (!removing || !recoveryStorageReady || isMutatingRef.current || pendingRecoveriesRef.current.has(removing.id)) return;
    const target = removing;
    isMutatingRef.current = true;
    setMutating(true);
    let recovery: PendingTopicResourceRecovery | null = null;
    try {
      recovery = createRecoverySnapshot(target, 'unlink');
      if (!recovery) return;
      await removeTopicResource(topicId, target.id);
      if (Number(useAuthStore.getState().user?.id) !== actorId) return;
      completeConfirmedMutation(recovery, items.filter((item) => item.id !== target.id), `已解除与「${target.title}」的关联`);
    } catch (error) {
      if (recovery) await handleMutationFailure(recovery, error);
    } finally {
      isMutatingRef.current = false;
      setMutating(false);
    }
  };

  return (
    <>
      <div className="mb-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm text-studio-text-secondary">关联资料</h2>
          {canManage ? <button type="button" disabled={loading || loadError || mutating || !recoveryStorageReady} onClick={() => setShowPicker(true)} className="xmt-btn xmt-btn-primary" aria-busy={mutating}><Link2 className="h-4 w-4" />关联资料</button> : null}
        </div>
        {!recoveryStorageReady ? <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-studio-border-soft bg-studio-surface-soft p-3 text-sm text-studio-text-primary">
          <p>{recoveryStorage.scope === recoveryScope && recoveryStorage.message
            ? recoveryStorage.message
            : '正在核实当前账号的本机资料关联恢复记录；核实完成前不会发送关联或解除请求。'}</p>
          <button type="button" disabled={loading || mutating} onClick={() => void load()} className="xmt-btn xmt-btn-secondary min-h-10 shrink-0">重新读取当前选题</button>
        </div> : null}
        {pendingRecoveries.map((recovery) => <div key={recovery.resource.id} role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-studio-border-soft bg-studio-surface-soft p-3 text-sm text-studio-text-primary">
          <p className="min-w-0 flex-1">{recovery.message}</p>
          <button type="button" disabled={mutating} onClick={() => void verifyPendingRecovery(recovery.resource.id)} className="xmt-btn xmt-btn-secondary min-h-10 shrink-0" aria-label={`只读核实资料关联状态：${recovery.resource.title}`} aria-busy={mutating}>
            {mutating ? '核实中…' : '只读核实关联状态'}
          </button>
        </div>)}
        {loading ? <LoadingState type="table" rows={3} /> : loadError ? <ErrorState onRetry={() => void load()} /> : items.length === 0 ? <EmptyState title="暂无关联资料" /> : (
          <div className="overflow-hidden rounded-xl border border-studio-border-soft">
            <div className="divide-y divide-studio-border-soft">
              {items.map((item) => <div key={item.id} className="grid items-center gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(0,1fr)_130px_160px_auto]"><Link to={getResourceDetailPath(item.id, item.library_type)} className="truncate font-medium text-studio-text-primary hover:text-studio-primary-contrast">{item.title}</Link><span className="text-studio-text-secondary">{libraryNames[item.library_type]}</span><span className="truncate text-studio-text-secondary">{item.category?.name || '—'}</span><div className="flex justify-end gap-1"><Link aria-label={`查看资料：${item.title}`} to={getResourceDetailPath(item.id, item.library_type)} className="xmt-btn xmt-btn-ghost h-10 w-10 min-w-10 p-0 text-studio-text-secondary hover:text-studio-primary-contrast"><ExternalLink className="h-4 w-4" /></Link>{canManage ? <button type="button" aria-label={`解除与「${item.title}」的关联`} disabled={mutating || !recoveryStorageReady || pendingRecoveriesRef.current.has(item.id)} onClick={() => setRemoving(item)} className="xmt-btn xmt-btn-ghost h-10 w-10 min-w-10 p-0 text-studio-text-secondary hover:bg-studio-coral/10 hover:text-studio-coral-contrast disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="h-4 w-4" /></button> : null}</div></div>)}
            </div>
          </div>
        )}
      </div>

      <BaseModal open={showPicker} onClose={() => setShowPicker(false)} title="关联资料" size="lg" closeOnEscape>
        <form onSubmit={search} className="flex gap-3" aria-busy={searching}><SearchBar value={keyword} onChange={(event) => setKeyword(event.target.value)} aria-label="搜索资料" placeholder="搜索资料" className="flex-1" disabled={searching} /><button type="submit" disabled={searching} className="xmt-btn xmt-btn-primary disabled:cursor-wait"><Search className="h-4 w-4" />{searching ? '搜索中…' : '搜索'}</button></form>
        <div className="mt-4 max-h-[440px] space-y-2 overflow-y-auto">
          {searching ? <LoadingState type="inline" /> : results.length ? results.map((result) => <div key={result.id} className="flex items-start gap-3 rounded-xl border border-studio-border-soft p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-studio-text-primary">{result.title}</p><p className="mt-1 text-xs text-studio-text-secondary">{libraryNames[result.library_type]} · {result.category?.name || '—'}</p><p className="mt-2 line-clamp-2 text-xs leading-5 text-studio-text-muted">{result.snippet}</p></div><button type="button" aria-label={`${pendingRecoveriesRef.current.has(result.id) ? '等待核实关联' : addingId === result.id ? '正在关联' : '关联资料'}：${result.title}`} aria-busy={addingId === result.id || pendingRecoveriesRef.current.has(result.id)} disabled={mutating || !recoveryStorageReady || pendingRecoveriesRef.current.has(result.id)} onClick={() => void add(result)} className="xmt-btn xmt-btn-secondary min-h-10 shrink-0 border-studio-primary/40 px-3 py-1.5 text-xs text-studio-primary-contrast disabled:opacity-50">{addingId === result.id ? '关联中' : pendingRecoveriesRef.current.has(result.id) ? '待核实' : '关联'}</button></div>) : keyword ? <EmptyState title="暂无资料" /> : null}
        </div>
      </BaseModal>

      <ConfirmModal open={!!removing} title="解除关联" description={removing?.title} confirmText="解除" variant="danger" loading={mutating} onCancel={() => { if (!isMutatingRef.current) setRemoving(null); }} onConfirm={remove} />
    </>
  );
}
