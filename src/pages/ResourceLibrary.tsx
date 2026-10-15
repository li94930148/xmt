import { ChevronLeft, ChevronRight, FolderTree, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { deleteResourceCenterResource, getResourceCategories, getResourceCenterResources, type LibraryType, type ResourceCategory, type ResourceListItem } from '@/api/resourceCenter';
import { ConfirmModal, ErrorState, LoadingState } from '@/components/common';
import ResourceTable from '@/components/resource-center/ResourceTable';
import ResourceCreateModal from '@/components/resource-center/ResourceCreateModal';
import ResourceCategoryManagementModal from '@/components/resource-center/ResourceCategoryManagementModal';
import ActionButton from '@/components/studio/ActionButton';
import { PageHeader, PageShell, SearchBar } from '@/components/studio';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';
import { useAppStore } from '@/store';

const names: Record<LibraryType, string> = { project: '项目资料库', content_archive: '内容档案库', knowledge: '知识库', media: '素材归档库' };

export default function ResourceLibrary({ fixedLibraryType }: { fixedLibraryType?: LibraryType }) {
  const [params, setParams] = useSearchParams();
  const type = fixedLibraryType || (params.get('library_type') as LibraryType) || 'project';
  const [keyword, setKeyword] = useState(params.get('keyword') || '');
  const debouncedKeyword = useDebounce(keyword, 350);
  const [items, setItems] = useState<ResourceListItem[]>([]);
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [deleting, setDeleting] = useState<ResourceListItem | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [confirmedDeleteNotice, setConfirmedDeleteNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);
  const latestRequest = useRef(0);
  const deleteLockRef = useRef(false);
  const navigate = useNavigate();
  const page = Math.max(1, Number(params.get('page') || 1));
  const categoryId = Number(params.get('category_id') || 0) || undefined;
  const { hasPermission } = usePermission();
  const addNotification = useAppStore((state) => state.addNotification);

  const load = useCallback(async (): Promise<boolean> => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError(false);
    try {
      const [resources, categoryResponse] = await Promise.all([
        getResourceCenterResources({ library_type: type, category_id: categoryId, keyword: debouncedKeyword || undefined, page, page_size: 20 }),
        getResourceCategories(type),
      ]);
      if (requestId !== latestRequest.current) return false;
      setItems(resources.data);
      setTotal(resources.pagination.total);
      setCategories(categoryResponse.data);
      setConfirmedDeleteNotice(null);
      return true;
    } catch {
      if (requestId === latestRequest.current) setError(true);
      return false;
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [type, categoryId, debouncedKeyword, page]);
  useEffect(() => {
    void load();
    return () => { latestRequest.current += 1; };
  }, [load]);
  const updateParam = (key: string, value?: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); if (key !== 'page') next.delete('page'); setParams(next); };
  const pages = Math.max(1, Math.ceil(total / 20));
  const handleDelete = async () => {
    if (!deleting || deleteLockRef.current) return;
    const target = deleting;
    deleteLockRef.current = true;
    setDeletingBusy(true);
    try {
      await deleteResourceCenterResource(target.id);
      setDeleting(null);
      setItems((current) => current.filter((item) => item.id !== target.id));
      setTotal((current) => Math.max(0, current - 1));
      setConfirmedDeleteNotice(null);
      addNotification({ title: '删除成功', message: `资料「${target.title}」已删除`, type: 'success' });
      if (!(await load())) {
        setConfirmedDeleteNotice(`服务端已确认资料「${target.title}」已删除，但列表刷新失败；请重新加载列表确认，不要重复删除。`);
      }
    } catch (cause) {
      addNotification({ title: '删除失败', message: cause instanceof Error ? cause.message : '资料未删除，请重试', type: 'error' });
    } finally {
      deleteLockRef.current = false;
      setDeletingBusy(false);
    }
  };

  return <PageShell>
    <PageHeader title={names[type]} actions={<>{hasPermission('resource:category_manage') ? <ActionButton type="button" onClick={() => setManagingCategories(true)}><FolderTree className="mr-2 inline h-4 w-4" />分类管理</ActionButton> : null}{hasPermission('resource:create') ? <ActionButton type="button" variant="primary" onClick={() => setCreating(true)}><Plus className="mr-2 inline h-4 w-4" />新增资料</ActionButton> : null}</>} />
    <div className="flex flex-col gap-3 lg:flex-row">
      <SearchBar value={keyword} onChange={(event) => { setKeyword(event.target.value); updateParam('keyword', event.target.value || undefined); }} placeholder="搜索资料" className="flex-1" />
      <select value={categoryId || ''} onChange={(event) => updateParam('category_id', event.target.value || undefined)} className="min-h-10 rounded-button border border-studio-border-soft bg-studio-surface px-3 text-sm text-studio-text-primary"><option value="">全部分类</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
    </div>
    {confirmedDeleteNotice ? <div role="alert" className="flex flex-col gap-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between"><span>{confirmedDeleteNotice}</span><ActionButton type="button" variant="secondary" disabled={loading} onClick={() => void load()}>{loading ? '正在重新加载…' : '重新加载列表'}</ActionButton></div> : null}
    {loading ? <LoadingState type="table" rows={8} /> : error && !confirmedDeleteNotice ? <ErrorState onRetry={() => void load()} /> : <ResourceTable items={items} canEdit={hasPermission('resource:update')} canDelete={hasPermission('resource:delete') && !confirmedDeleteNotice} onDelete={setDeleting} />}
    <div className="flex items-center justify-between text-sm text-studio-text-secondary"><span>共 {total.toLocaleString('zh-CN')} 条</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => updateParam('page', String(page - 1))} className="rounded-button border border-studio-border-soft p-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><span>{page} / {pages}</span><button disabled={page >= pages} onClick={() => updateParam('page', String(page + 1))} className="rounded-button border border-studio-border-soft p-2 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div></div>
    <ConfirmModal open={!!deleting} title="删除资料" description={deleting?.title} variant="danger" confirmText="删除" loading={deletingBusy} onCancel={() => setDeleting(null)} onConfirm={handleDelete} />
    <ResourceCreateModal open={creating} libraryType={type} categories={categories} onClose={() => setCreating(false)} onCreated={({ id, title: createdTitle }) => {
      setCreating(false);
      addNotification({ title: '创建成功', message: `资料「${createdTitle}」已创建`, type: 'success' });
      navigate(`/asset-center/resources/${id}`, { state: { confirmedCreatedTitle: createdTitle } });
    }} />
    <ResourceCategoryManagementModal open={managingCategories} libraryType={type} libraryName={names[type]} categories={categories} onClose={() => setManagingCategories(false)} onCategoriesChange={setCategories} />
  </PageShell>;
}
