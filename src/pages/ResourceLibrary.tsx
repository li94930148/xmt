import { ChevronLeft, ChevronRight, FolderTree, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { deleteResourceCenterResource, getResourceCategories, getResourceCenterResources, type LibraryType, type ResourceCategory, type ResourceListItem } from '@/api/resourceCenter';
import { ConfirmModal, ErrorState, LoadingState } from '@/components/common';
import ResourceTable from '@/components/resource-center/ResourceTable';
import { PageHeader, PageShell, SearchBar } from '@/components/studio';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';

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
  const page = Math.max(1, Number(params.get('page') || 1));
  const categoryId = Number(params.get('category_id') || 0) || undefined;
  const { hasPermission } = usePermission();

  const load = () => {
    setLoading(true); setError(false);
    void Promise.all([getResourceCenterResources({ library_type: type, category_id: categoryId, keyword: debouncedKeyword || undefined, page, page_size: 20 }), getResourceCategories(type)])
      .then(([resources, categoryResponse]) => { setItems(resources.data); setTotal(resources.pagination.total); setCategories(categoryResponse.data); })
      .catch(() => setError(true)).finally(() => setLoading(false));
  };
  useEffect(load, [type, categoryId, debouncedKeyword, page]);
  const updateParam = (key: string, value?: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); if (key !== 'page') next.delete('page'); setParams(next); };
  const pages = Math.max(1, Math.ceil(total / 20));

  return <PageShell>
    <PageHeader title={names[type]} actions={<>{hasPermission('resource:category_manage') ? <button className="rounded-button border border-studio-border-soft px-4 py-2.5 text-sm text-studio-text-primary"><FolderTree className="mr-2 inline h-4 w-4" />分类管理</button> : null}{hasPermission('resource:create') ? <button className="rounded-button bg-studio-primary px-4 py-2.5 text-sm font-medium text-white"><Plus className="mr-2 inline h-4 w-4" />新增资料</button> : null}</>} />
    <div className="flex flex-col gap-3 lg:flex-row">
      <SearchBar value={keyword} onChange={(event) => { setKeyword(event.target.value); updateParam('keyword', event.target.value || undefined); }} placeholder="搜索资料" className="flex-1" />
      <select value={categoryId || ''} onChange={(event) => updateParam('category_id', event.target.value || undefined)} className="min-h-10 rounded-button border border-studio-border-soft bg-studio-surface px-3 text-sm text-studio-text-primary"><option value="">全部分类</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
    </div>
    {loading ? <LoadingState type="table" rows={8} /> : error ? <ErrorState onRetry={load} /> : <ResourceTable items={items} canEdit={hasPermission('resource:update')} canDelete={hasPermission('resource:delete')} onDelete={setDeleting} />}
    <div className="flex items-center justify-between text-sm text-studio-text-secondary"><span>共 {total.toLocaleString('zh-CN')} 条</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => updateParam('page', String(page - 1))} className="rounded-button border border-studio-border-soft p-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><span>{page} / {pages}</span><button disabled={page >= pages} onClick={() => updateParam('page', String(page + 1))} className="rounded-button border border-studio-border-soft p-2 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div></div>
    <ConfirmModal open={!!deleting} title="删除资料" description={deleting?.title} variant="danger" confirmText="删除" onCancel={() => setDeleting(null)} onConfirm={async () => { if (!deleting) return; await deleteResourceCenterResource(deleting.id); setDeleting(null); load(); }} />
  </PageShell>;
}
