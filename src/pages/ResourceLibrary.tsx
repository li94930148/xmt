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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [deleting, setDeleting] = useState<ResourceListItem | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [confirmedDeleteNotice, setConfirmedDeleteNotice] = useState<string | null>(null);
  const [deleteVerification, setDeleteVerification] = useState<{ target: ResourceListItem; message: string } | null>(null);
  const [deleteVerificationLoading, setDeleteVerificationLoading] = useState(false);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);
  const latestRequest = useRef(0);
  const categoryRequestSequence = useRef(0);
  const deleteLockRef = useRef(false);
  const currentLibraryTypeRef = useRef(type);
  currentLibraryTypeRef.current = type;
  const navigate = useNavigate();
  const page = Math.max(1, Number(params.get('page') || 1));
  const categoryId = Number(params.get('category_id') || 0) || undefined;
  const { hasPermission } = usePermission();
  const addNotification = useAppStore((state) => state.addNotification);
  const actorId = useAuthStore((state) => state.user?.id);

  const load = useCallback(async (): Promise<boolean> => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError(false);
    try {
      const resources = await getResourceCenterResources({ library_type: type, category_id: categoryId, keyword: debouncedKeyword || undefined, page, page_size: 20 });
      if (requestId !== latestRequest.current) return false;
      setItems(resources.data);
      setTotal(resources.pagination.total);
      setConfirmedDeleteNotice(null);
      return true;
    } catch {
      if (requestId === latestRequest.current) setError(true);
      return false;
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [type, categoryId, debouncedKeyword, page]);
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
      setCategoryError(cause instanceof Error ? cause.message : '分类暂时无法读取');
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
    setDeleteVerification(null);
    setDeleteVerificationLoading(false);
    setDeleteNotice(null);
  }, [type]);
  const updateParam = (key: string, value?: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); if (key !== 'page') next.delete('page'); setParams(next); };
  const pages = Math.max(1, Math.ceil(total / 20));
  const verifyDeleteStatus = useCallback(async (target: ResourceListItem, operationError?: unknown) => {
    setDeleteVerificationLoading(true);
    setDeleteVerification({ target, message: '正在只读核实资料状态；请勿重复删除。' });
    try {
      const current = await getResourceCenterResource(target.id);
      if (currentLibraryTypeRef.current !== target.library_type) return 'stale';
      setItems((items) => items.map((item) => item.id === current.id ? { ...item, status: current.status, title: current.title, updated_at: current.updated_at } : item));
      setDeleteVerification(null);
      if (current.status === 'deleted') {
        setDeleteNotice(`已只读核实资料「${target.title}」已移入回收站；页面未重复发送删除请求。`);
        return 'deleted';
      }
      setDeleteNotice(`已只读核实资料「${target.title}」仍未移入回收站，可以安全地重新确认删除。${operationError instanceof Error ? ` ${operationError.message}` : ''}`);
      return 'active';
    } catch (cause) {
      if (currentLibraryTypeRef.current !== target.library_type) return 'stale';
      setDeleteVerification({
        target,
        message: `删除请求未获确认${operationError instanceof Error ? `（${operationError.message}）` : ''}，资料状态也暂时无法读取。请只读重试核实，不要重复删除。${cause instanceof Error ? ` ${cause.message}` : ''}`,
      });
      return 'unknown';
    } finally {
      setDeleteVerificationLoading(false);
    }
  }, []);
  const handleDelete = async () => {
    if (!deleting || deleteVerification || deleteLockRef.current) return;
    const target = deleting;
    deleteLockRef.current = true;
    setDeletingBusy(true);
    setDeleteNotice(null);
    try {
      await deleteResourceCenterResource(target.id);
      setDeleting(null);
      setItems((current) => current.map((item) => item.id === target.id ? { ...item, status: 'deleted' } : item));
      setConfirmedDeleteNotice(null);
      addNotification({ title: '删除成功', message: `资料「${target.title}」已删除`, type: 'success' });
      if (!(await load())) {
        setConfirmedDeleteNotice(`服务端已确认资料「${target.title}」已删除，但列表刷新失败；请重新加载列表确认，不要重复删除。`);
      }
    } catch (cause) {
      setDeleting(null);
      await verifyDeleteStatus(target, cause);
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
    {deleteVerification ? <div role="alert" className="my-3 flex flex-col gap-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between"><span>{deleteVerification.message}</span><ActionButton type="button" variant="secondary" disabled={deleteVerificationLoading} onClick={() => void verifyDeleteStatus(deleteVerification.target)}>{deleteVerificationLoading ? '正在核实…' : '只读核实资料状态'}</ActionButton></div> : null}
    {deleteNotice ? <div role="status" className="my-3 rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-3 text-sm text-studio-text-secondary">{deleteNotice}</div> : null}
    {loading ? <LoadingState type="table" rows={8} /> : error && !confirmedDeleteNotice ? <ErrorState onRetry={() => void load()} /> : <ResourceTable items={items} canEdit={hasPermission('resource:update') && !deleteVerification} canDelete={hasPermission('resource:delete') && !deleteVerification && !confirmedDeleteNotice} onDelete={setDeleting} />}
    <div className="flex items-center justify-between text-sm text-studio-text-secondary"><span>共 {total.toLocaleString('zh-CN')} 条</span><div className="flex items-center gap-2"><button type="button" aria-label="上一页" disabled={page <= 1} onClick={() => updateParam('page', String(page - 1))} className="xmt-btn xmt-btn-ghost h-10 w-10 min-w-10 shrink-0 !p-0 border-studio-border-soft disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><span>{page} / {pages}</span><button type="button" aria-label="下一页" disabled={page >= pages} onClick={() => updateParam('page', String(page + 1))} className="xmt-btn xmt-btn-ghost h-10 w-10 min-w-10 shrink-0 !p-0 border-studio-border-soft disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div></div>
    <ConfirmModal open={!!deleting} title="删除资料" description={deleting?.title} variant="danger" confirmText="删除" loading={deletingBusy || deleteVerificationLoading} onCancel={() => setDeleting(null)} onConfirm={handleDelete} />
    <ResourceCreateModal open={creating} libraryType={type} categories={categories} onClose={() => setCreating(false)} onCreated={({ id, title: createdTitle, libraryType: createdLibraryType }) => {
      setCreating(false);
      addNotification({ title: '创建成功', message: `资料「${createdTitle}」已创建`, type: 'success' });
      navigate(getResourceDetailPath(id, createdLibraryType), { state: { confirmedCreatedTitle: createdTitle } });
    }} />
    <ResourceCategoryManagementModal open={managingCategories} libraryType={type} libraryName={names[type]} categories={categories} onClose={() => setManagingCategories(false)} onCategoriesChange={setCategories} />
  </PageShell>;
}
