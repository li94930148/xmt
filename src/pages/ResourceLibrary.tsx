import { ChevronLeft, ChevronRight, FolderTree, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { deleteResourceCenterResource, getResourceCategories, getResourceCenterResource, getResourceCenterResources, type LibraryType, type ResourceCategory, type ResourceListItem } from '@/api/resourceCenter';
import { ConfirmModal, ErrorState, LoadingState } from '@/components/common';
import ResourceTable from '@/components/resource-center/ResourceTable';
import ResourceCreateModal from '@/components/resource-center/ResourceCreateModal';
import ResourceCategoryManagementModal from '@/components/resource-center/ResourceCategoryManagementModal';
import ActionButton from '@/components/studio/ActionButton';
import { PageHeader, PageShell, SearchBar } from '@/components/studio';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';
import { getResourceDetailPath } from '@/platform/resource-navigation';
import { useAppStore } from '@/store';
import { useAuthStore } from '@/store';
import { readResourceCategoryMutationRecovery } from '@/utils/resourceCategoryMutationRecovery';
import {
  clearResourceDeleteRecovery,
  createResourceDeleteRequestId,
  persistResourceDeleteRecovery,
  readResourceDeleteRecovery,
  type ResourceDeleteRecovery,
} from '@/utils/resourceDeleteRecovery';
import { getUserFacingErrorMessage } from '@/lib/userFacingError';

const names: Record<LibraryType, string> = { project: '项目资料库', content_archive: '内容档案库', knowledge: '知识库', media: '素材归档库' };

export default function ResourceLibrary({ fixedLibraryType }: { fixedLibraryType?: LibraryType }) {
  const [params, setParams] = useSearchParams();
  const type = fixedLibraryType || (params.get('library_type') as LibraryType) || 'project';
  const [keyword, setKeyword] = useState(params.get('keyword') || '');
  const debouncedKeyword = useDebounce(keyword, 350);
  const [items, setItems] = useState<ResourceListItem[]>([]);
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [categoryState, setCategoryState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loadedQueryKey, setLoadedQueryKey] = useState<string | null>(null);
  const [errorQueryKey, setErrorQueryKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<ResourceListItem | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [confirmedDeleteNotice, setConfirmedDeleteNotice] = useState<string | null>(null);
  const [deleteVerification, setDeleteVerification] = useState<{ target: Pick<ResourceListItem, 'id' | 'title' | 'library_type'>; message: string } | null>(null);
  const [deleteVerificationLoading, setDeleteVerificationLoading] = useState(false);
  const [deleteRecoveryState, setDeleteRecoveryState] = useState<'loading' | 'ready' | 'pending' | 'blocked'>('loading');
  const [deleteRecoveryError, setDeleteRecoveryError] = useState('');
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);
  const latestRequest = useRef(0);
  const categoryRequestSequence = useRef(0);
  const deleteLockRef = useRef(false);
  const deleteRecoveryRef = useRef<ResourceDeleteRecovery | null>(null);
  const currentLibraryTypeRef = useRef(type);
  currentLibraryTypeRef.current = type;
  const navigate = useNavigate();
  const page = Math.max(1, Number(params.get('page') || 1));
  const categoryId = Number(params.get('category_id') || 0) || undefined;
  const { hasPermission } = usePermission();
  const addNotification = useAppStore((state) => state.addNotification);
  const actorId = useAuthStore((state) => state.user?.id);
  const actorRole = useAuthStore((state) => state.user?.role);
  const token = useAuthStore((state) => state.token);
  const queryKey = JSON.stringify([actorId, actorRole, token, type, categoryId, debouncedKeyword, page]);
  const currentQueryResult = loadedQueryKey === queryKey && keyword === debouncedKeyword;
  const currentQueryFailed = errorQueryKey === queryKey && keyword === debouncedKeyword;
  const showCurrentPagination = currentQueryResult && !currentQueryFailed;

  const load = useCallback(async (): Promise<boolean> => {
    const requestId = ++latestRequest.current;
    const requestQueryKey = queryKey;
    setLoading(true);
    setErrorQueryKey(null);
    try {
      const resources = await getResourceCenterResources({ library_type: type, category_id: categoryId, keyword: debouncedKeyword || undefined, page, page_size: 20 });
      if (requestId !== latestRequest.current) return false;
      setItems(resources.data);
      setTotal(resources.pagination.total);
      setLoadedQueryKey(requestQueryKey);
      setConfirmedDeleteNotice(null);
      return true;
    } catch {
      if (requestId === latestRequest.current) setErrorQueryKey(requestQueryKey);
      return false;
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [type, categoryId, debouncedKeyword, page, queryKey]);
  const loadCategories = useCallback(async () => {
    const requestId = ++categoryRequestSequence.current;
    setCategoryState('loading');
    setCategoryError(null);
    setCategories([]);
    try {
      const response = await getResourceCategories(type);
      if (requestId !== categoryRequestSequence.current) return;
      setCategories(response.data);
      setCategoryState('ready');
    } catch (cause) {
      if (requestId !== categoryRequestSequence.current) return;
      setCategoryError(getUserFacingErrorMessage(cause, '分类暂时无法读取，请检查连接后重试。'));
      setCategoryState('error');
    }
  }, [type]);
  useEffect(() => {
    void load();
    return () => { latestRequest.current += 1; };
  }, [load]);
  useEffect(() => {
    void loadCategories();
    return () => { categoryRequestSequence.current += 1; };
  }, [loadCategories]);
  useEffect(() => {
    if (!actorId) return;
    const stored = readResourceCategoryMutationRecovery(Number(actorId));
    if (stored.state === 'valid' || stored.state === 'invalid') setManagingCategories(true);
  }, [actorId]);
  useEffect(() => {
    setDeleteNotice(null);
  }, [type]);
  const updateParam = (key: string, value?: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); if (key !== 'page') next.delete('page'); setParams(next); };
  const clearResourceFilters = () => {
    setKeyword('');
    const next = new URLSearchParams(params);
    next.delete('keyword');
    next.delete('category_id');
    next.delete('page');
    setParams(next);
  };
  const pages = Math.max(1, Math.ceil(total / 20));
  const verifyDeleteStatus = useCallback(async (
    target: Pick<ResourceListItem, 'id' | 'title' | 'library_type'>,
    operationError?: unknown,
    recovery: ResourceDeleteRecovery | null = deleteRecoveryRef.current,
  ) => {
    if (!recovery || recovery.actorId !== Number(actorId) || recovery.resourceId !== target.id) {
      setDeleteRecoveryState('blocked');
      setDeleteRecoveryError('资料删除恢复信息与当前账号或资料不匹配；删除操作保持锁定。');
      return 'unknown';
    }
    setDeleteVerificationLoading(true);
    setDeleteVerification({ target, message: '正在只读核实资料状态；请勿重复删除。' });
    try {
      const current = await getResourceCenterResource(target.id);
      if (Number(useAuthStore.getState().user?.id) !== recovery.actorId) return 'stale';
      if (current.id !== recovery.resourceId || current.library_type !== recovery.libraryType) throw new Error('资料详情与待核实的删除记录不匹配。');
      if (currentLibraryTypeRef.current === current.library_type) {
        setItems((items) => items.map((item) => item.id === current.id ? { ...item, status: current.status, title: current.title, updated_at: current.updated_at } : item));
      }
      if (current.status === 'deleted') {
        if (!clearResourceDeleteRecovery(recovery)) {
          setDeleteRecoveryState('pending');
          setDeleteVerification({ target, message: `服务器确认资料「${target.title}」已移入回收站，但本机恢复标记未能清除。请重试只读核实；标记清除前，资料删除保持锁定。` });
          return 'blocked';
        }
        deleteRecoveryRef.current = null;
        setDeleteRecoveryState('ready');
        setDeleteRecoveryError('');
        setDeleteVerification(null);
        setDeleteNotice(`已只读核实资料「${target.title}」已移入回收站；页面未重复发送删除请求。`);
        return 'deleted';
      }
      if (!clearResourceDeleteRecovery(recovery)) {
        setDeleteRecoveryState('pending');
        setDeleteVerification({ target, message: `资料「${target.title}」当前仍未移入回收站，但本机恢复标记未能清除。请重试只读核实；标记清除前，资料删除保持锁定。` });
        return 'blocked';
      }
      deleteRecoveryRef.current = null;
      setDeleteRecoveryState('ready');
      setDeleteRecoveryError('');
      setDeleteVerification(null);
      const operationMessage = operationError === undefined
        ? ''
        : ` ${getUserFacingErrorMessage(operationError, '上次删除请求未获服务器确认。')}`;
      setDeleteNotice(`已只读核实资料「${target.title}」仍未移入回收站，可以安全地重新确认删除。${operationMessage}`);
      return 'active';
    } catch (cause) {
      if (Number(useAuthStore.getState().user?.id) !== recovery.actorId) return 'stale';
      setDeleteRecoveryState('pending');
      setDeleteVerification({
        target,
        message: `${operationError === undefined ? '删除请求状态仍未明确' : getUserFacingErrorMessage(operationError, '删除请求未获服务器确认。')}；资料状态暂时无法读取（${getUserFacingErrorMessage(cause, '请检查连接后重试。')}）。请只读重试核实，不要重复删除。`,
      });
      return 'unknown';
    } finally {
      setDeleteVerificationLoading(false);
    }
  }, [actorId]);
  const reloadDeleteRecovery = useCallback(() => {
    const currentActorId = Number(actorId);
    if (!Number.isSafeInteger(currentActorId) || currentActorId <= 0) {
      deleteRecoveryRef.current = null;
      setDeleteRecoveryState('blocked');
      setDeleteRecoveryError('当前账号信息不可用，无法安全读取资料删除恢复状态；删除操作保持锁定。');
      return;
    }
    const stored = readResourceDeleteRecovery(currentActorId);
    if (stored.state === 'invalid' || stored.state === 'unavailable') {
      deleteRecoveryRef.current = null;
      setDeleteRecoveryState('blocked');
      setDeleteRecoveryError(stored.state === 'invalid'
        ? '本机存在无法识别的资料删除恢复信息。为避免覆盖未知结果，删除操作保持锁定。'
        : '当前浏览器无法安全读取资料删除恢复信息；恢复状态可读取前，删除操作保持锁定。');
      return;
    }
    if (stored.state === 'none') {
      deleteRecoveryRef.current = null;
      setDeleteRecoveryState('ready');
      setDeleteRecoveryError('');
      setDeleteVerification(null);
      return;
    }
    deleteRecoveryRef.current = stored.recovery;
    setDeleteRecoveryState('pending');
    setDeleteRecoveryError('');
    const target = { id: stored.recovery.resourceId, title: `资料 #${stored.recovery.resourceId}`, library_type: stored.recovery.libraryType };
    void verifyDeleteStatus(target, undefined, stored.recovery);
  }, [actorId, verifyDeleteStatus]);
  useEffect(() => {
    setDeleteRecoveryState('loading');
    setDeleteRecoveryError('');
    deleteRecoveryRef.current = null;
    reloadDeleteRecovery();
  }, [actorId, reloadDeleteRecovery]);
  const handleDelete = async () => {
    if (!deleting || deleteVerification || deleteRecoveryState !== 'ready' || deleteLockRef.current) return;
    const target = deleting;
    const currentActorId = Number(actorId);
    if (!Number.isSafeInteger(currentActorId) || currentActorId <= 0) return;
    deleteLockRef.current = true;
    setDeletingBusy(true);
    setDeleteNotice(null);
    let recovery: ResourceDeleteRecovery | null = null;
    let requestSent = false;
    try {
      recovery = {
        version: 1,
        actorId: currentActorId,
        resourceId: target.id,
        libraryType: target.library_type,
        requestId: createResourceDeleteRequestId(),
      };
      persistResourceDeleteRecovery(recovery);
      deleteRecoveryRef.current = recovery;
      setDeleteRecoveryState('pending');
      setDeleteVerification({ target, message: '删除请求已发送；若连接中断，将只读核实，不会自动重复发送。' });
      requestSent = true;
      await deleteResourceCenterResource(target.id);
      setDeleting(null);
      setItems((current) => current.map((item) => item.id === target.id ? { ...item, status: 'deleted' } : item));
      setConfirmedDeleteNotice(null);
      addNotification({ title: '删除成功', message: `资料「${target.title}」已删除`, type: 'success' });
      if (clearResourceDeleteRecovery(recovery)) {
        deleteRecoveryRef.current = null;
        setDeleteRecoveryState('ready');
        setDeleteVerification(null);
        if (!(await load())) setConfirmedDeleteNotice(`服务端已确认资料「${target.title}」已删除，但列表刷新失败；请重新加载列表确认，不要重复删除。`);
      } else {
        setDeleteVerification({ target, message: '服务端已确认删除，但本机恢复标记未能清除。请重试只读核实；恢复标记清除前，资料删除保持锁定。' });
        await verifyDeleteStatus(target, undefined, recovery);
      }
    } catch (cause) {
      setDeleting(null);
      if (requestSent && recovery) {
        await verifyDeleteStatus(target, cause, recovery);
      } else {
        const stored = readResourceDeleteRecovery(currentActorId);
        if (stored.state === 'valid') {
          deleteRecoveryRef.current = stored.recovery;
          setDeleteRecoveryState('pending');
          await verifyDeleteStatus({ id: stored.recovery.resourceId, title: `资料 #${stored.recovery.resourceId}`, library_type: stored.recovery.libraryType }, cause, stored.recovery);
        } else if (stored.state === 'none') {
          setDeleteRecoveryState('ready');
          setDeleteVerification(null);
          addNotification({ title: '删除前检查失败', message: getUserFacingErrorMessage(cause, '未能安全保存删除恢复信息，本次未发送删除请求。'), type: 'error' });
        } else {
          setDeleteRecoveryState('blocked');
          setDeleteRecoveryError('本机删除恢复信息暂时无法安全读取；本次未发送删除请求，资料删除保持锁定。');
        }
      }
    } finally {
      deleteLockRef.current = false;
      setDeletingBusy(false);
    }
  };

  return <PageShell>
    <PageHeader title={names[type]} actions={<>{hasPermission('resource:category_manage') ? <ActionButton type="button" disabled={categoryState !== 'ready'} title={categoryState === 'error' ? '分类目录暂不可用，恢复后才能管理分类' : undefined} onClick={() => setManagingCategories(true)}><FolderTree className="mr-2 inline h-4 w-4" />分类管理</ActionButton> : null}{hasPermission('resource:create') ? <ActionButton type="button" variant="primary" onClick={() => setCreating(true)}><Plus className="mr-2 inline h-4 w-4" />新增资料</ActionButton> : null}</>} />
    <div className="flex flex-col gap-3 lg:flex-row">
      <SearchBar value={keyword} onChange={(event) => { setKeyword(event.target.value); updateParam('keyword', event.target.value || undefined); }} placeholder="搜索资料" className="flex-1" />
      <select aria-label="资料分类" disabled={categoryState === 'loading'} value={categoryId || ''} onChange={(event) => updateParam('category_id', event.target.value || undefined)} className="min-h-10 rounded-button border border-studio-border-soft bg-studio-surface px-3 text-sm text-studio-text-primary"><option value="">全部分类</option>{categoryId && !categories.some((category) => category.id === categoryId) ? <option value={categoryId}>当前分类（名称待确认）</option> : null}{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
      {categoryState === 'error' ? <div role="alert" className="flex flex-col gap-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between"><span>分类暂时无法读取；资料列表仍可继续查看。{categoryError ? ` ${categoryError}` : ''}</span><ActionButton type="button" variant="secondary" onClick={() => void loadCategories()}>重新加载分类</ActionButton></div> : null}
    </div>
    {confirmedDeleteNotice ? <div role="alert" className="flex flex-col gap-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between"><span>{confirmedDeleteNotice}</span><ActionButton type="button" variant="secondary" disabled={loading} onClick={() => void load()}>{loading ? '正在重新加载…' : '重新加载列表'}</ActionButton></div> : null}
    {deleteRecoveryState === 'blocked' ? <div role="alert" className="my-3 flex flex-col gap-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between"><span>{deleteRecoveryError || '资料删除恢复状态不可用；删除操作保持锁定。'}</span><ActionButton type="button" variant="secondary" onClick={reloadDeleteRecovery}>重新读取恢复信息</ActionButton></div> : null}
    {deleteVerification ? <div role="alert" className="my-3 flex flex-col gap-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between"><span>{deleteVerification.message}</span><ActionButton type="button" variant="secondary" disabled={deleteVerificationLoading} onClick={() => void verifyDeleteStatus(deleteVerification.target)}>{deleteVerificationLoading ? '正在核实…' : '只读核实资料状态'}</ActionButton></div> : null}
    {deleteNotice ? <div role="status" className="my-3 rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-3 text-sm text-studio-text-secondary">{deleteNotice}</div> : null}
    {currentQueryFailed && !confirmedDeleteNotice ? <ErrorState onRetry={() => void load()} /> : loading || !currentQueryResult ? <LoadingState type="table" rows={8} /> : <ResourceTable items={items} canEdit={hasPermission('resource:update') && !deleteVerification && deleteRecoveryState === 'ready'} canDelete={hasPermission('resource:delete') && !deleteVerification && !confirmedDeleteNotice && deleteRecoveryState === 'ready'} onDelete={setDeleting} emptyState={keyword || categoryId ? { title: '没有符合条件的资料', description: '调整搜索内容或分类，或者清除筛选条件后重试。', actionLabel: '清除筛选', onAction: clearResourceFilters } : undefined} />}
    <div className="flex items-center justify-between text-sm text-studio-text-secondary"><span>共 {showCurrentPagination ? total.toLocaleString('zh-CN') : '—'} 条</span><div className="flex items-center gap-2"><button type="button" aria-label="上一页" disabled={!showCurrentPagination || loading || page <= 1} onClick={() => updateParam('page', String(page - 1))} className="xmt-btn xmt-btn-ghost h-10 w-10 min-w-10 shrink-0 !p-0 border-studio-border-soft disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><span>{showCurrentPagination ? page : '—'} / {showCurrentPagination ? pages : '—'}</span><button type="button" aria-label="下一页" disabled={!showCurrentPagination || loading || page >= pages} onClick={() => updateParam('page', String(page + 1))} className="xmt-btn xmt-btn-ghost h-10 w-10 min-w-10 shrink-0 !p-0 border-studio-border-soft disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div></div>
    <ConfirmModal open={!!deleting} title="删除资料" description={deleting?.title} variant="danger" confirmText="删除" loading={deletingBusy || deleteVerificationLoading || deleteRecoveryState !== 'ready'} onCancel={() => setDeleting(null)} onConfirm={handleDelete} />
    <ResourceCreateModal open={creating} libraryType={type} categories={categories} onClose={() => setCreating(false)} onCreated={({ id, title: createdTitle, libraryType: createdLibraryType }) => {
      setCreating(false);
      addNotification({ title: '创建成功', message: `资料「${createdTitle}」已创建`, type: 'success' });
      navigate(getResourceDetailPath(id, createdLibraryType), { state: { confirmedCreatedTitle: createdTitle } });
    }} />
    <ResourceCategoryManagementModal open={managingCategories} libraryType={type} libraryName={names[type]} categories={categories} onClose={() => setManagingCategories(false)} onCategoriesChange={setCategories} />
  </PageShell>;
}
