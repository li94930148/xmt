import { ChevronDown, ChevronRight, Folder, FolderTree, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getResourceCategories, getResourceCenterResources, type ResourceCategory, type ResourceListItem } from '@/api/resourceCenter';
import { ErrorState, LoadingState } from '@/components/common';
import ResourceTable from '@/components/resource-center/ResourceTable';
import ResourceCreateModal from '@/components/resource-center/ResourceCreateModal';
import ResourceCategoryManagementModal from '@/components/resource-center/ResourceCategoryManagementModal';
import { GlassPanel, PageHeader, PageShell, SearchBar } from '@/components/studio';
import ActionButton from '@/components/studio/ActionButton';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';
import { getResourceDetailPath } from '@/platform/resource-navigation';
import { useAppStore } from '@/store';
import { useAuthStore } from '@/store';
import { readResourceCategoryMutationRecovery } from '@/utils/resourceCategoryMutationRecovery';

function CategoryBranch({ node, all, selected, expanded, onToggle, onSelect }: { node: ResourceCategory; all: ResourceCategory[]; selected?: number; expanded: Set<number>; onToggle: (id: number) => void; onSelect: (id: number) => void }) {
  const children = all.filter((item) => item.parent_id === node.id);
  const open = expanded.has(node.id);
  return <div><div className={`flex items-center rounded-button text-sm ${selected === node.id ? 'bg-studio-primary/15 text-studio-cyan-contrast' : 'text-studio-text-secondary hover:bg-studio-surface-soft'}`}>{children.length ? <button type="button" onClick={() => onToggle(node.id)} className="p-2" aria-label={`${open ? '收起' : '展开'} ${node.name}`}>{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button> : <span aria-hidden="true" className="block w-8 shrink-0" />}<button type="button" onClick={() => onSelect(node.id)} className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-2 text-left"><Folder className="h-4 w-4 shrink-0" /><span className="truncate">{node.name}</span><span className="ml-auto text-xs text-studio-text-secondary">{node.resource_count || ''}</span></button></div>{open && children.length ? <div className="ml-4 border-l border-studio-border-soft pl-2">{children.map((child) => <CategoryBranch key={child.id} node={child} all={all} selected={selected} expanded={expanded} onToggle={onToggle} onSelect={onSelect} />)}</div> : null}</div>;
}

export default function KnowledgeLibrary() {
  const [params, setParams] = useSearchParams();
  const selected = Number(params.get('category_id') || 0) || undefined;
  const [keyword, setKeyword] = useState('');
  const debounced = useDebounce(keyword, 350);
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [items, setItems] = useState<ResourceListItem[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [categoryLoading, setCategoryLoading] = useState(true);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);
  const latestRequest = useRef(0);
  const categoryRequestSequence = useRef(0);
  const { hasPermission } = usePermission();
  const addNotification = useAppStore((state) => state.addNotification);
  const actorId = useAuthStore((state) => state.user?.id);
  const navigate = useNavigate();
  const roots = useMemo(() => categories.filter((item) => item.parent_id === null || !categories.some((candidate) => candidate.id === item.parent_id)), [categories]);
  const loadCategories = useCallback(() => {
    const requestId = ++categoryRequestSequence.current;
    setCategoryLoading(true);
    setCategoryError(null);
    void getResourceCategories('knowledge').then((response) => {
      if (requestId !== categoryRequestSequence.current) return;
      setCategories(response.data);
      setExpanded((current) => current.size === 0
        ? new Set(response.data.filter((category) => category.parent_id === null).map((category) => category.id))
        : current);
    }).catch((cause: unknown) => {
      if (requestId === categoryRequestSequence.current) setCategoryError(cause instanceof Error ? cause.message : '分类目录暂时无法读取');
    }).finally(() => {
      if (requestId === categoryRequestSequence.current) setCategoryLoading(false);
    });
  }, []);
  const load = useCallback(() => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError(false);
    void getResourceCenterResources({ library_type: 'knowledge', category_id: selected, keyword: debounced || undefined, page: 1, page_size: 50 }).then((resourceResponse) => {
      if (requestId !== latestRequest.current) return;
      setItems(resourceResponse.data);
    }).catch(() => {
      if (requestId === latestRequest.current) setError(true);
    }).finally(() => {
      if (requestId === latestRequest.current) setLoading(false);
    });
  }, [selected, debounced]);
  // 分类目录与右侧资料独立读取；筛选变化只刷新资料结果。
  useEffect(() => {
    loadCategories();
    return () => { categoryRequestSequence.current += 1; };
  }, [loadCategories]);
  useEffect(() => {
    if (!actorId) return;
    const stored = readResourceCategoryMutationRecovery(Number(actorId));
    if (stored.state === 'valid' || stored.state === 'invalid') setManagingCategories(true);
  }, [actorId]);
  useEffect(() => {
    load();
    return () => { latestRequest.current += 1; };
  }, [load]);

  return <PageShell>
    <PageHeader title="知识库" actions={<>{hasPermission('resource:category_manage') ? <ActionButton type="button" disabled={categoryLoading || Boolean(categoryError)} title={categoryError ? '分类目录暂不可用，恢复后才能管理分类' : undefined} onClick={() => setManagingCategories(true)}><FolderTree className="mr-2 inline h-4 w-4" />分类管理</ActionButton> : null}{hasPermission('resource:create') ? <ActionButton type="button" variant="primary" onClick={() => setCreating(true)}><Plus className="mr-2 inline h-4 w-4" />新增资料</ActionButton> : null}</>} />
    <div className="grid min-h-0 gap-4 lg:min-h-[620px] lg:grid-cols-[280px_minmax(0,1fr)]">
      <GlassPanel className="min-w-0 p-3"><button type="button" onClick={() => { const next = new URLSearchParams(params); next.delete('category_id'); setParams(next); }} className={`mb-2 w-full rounded-button px-3 py-2 text-left text-sm ${!selected ? 'bg-studio-primary/15 text-studio-cyan-contrast' : 'text-studio-text-secondary hover:bg-studio-surface-soft'}`}>全部分类</button>{categoryLoading ? <p role="status" className="mb-2 px-3 py-2 text-sm text-studio-text-muted">正在读取分类目录…</p> : null}{categoryError ? <div role="alert" className="mb-3 flex min-w-0 flex-col gap-3 break-words rounded-button border border-studio-amber/25 bg-studio-amber/10 px-3 py-3 text-sm text-studio-amber-contrast"><p>分类目录暂不可用；右侧资料结果仍可查看。已有筛选条件会保留。{` ${categoryError}`}</p><ActionButton type="button" variant="secondary" onClick={loadCategories}>重新加载分类</ActionButton></div> : null}<div className="max-h-[680px] overflow-y-auto">{categories.length ? roots.map((root) => <CategoryBranch key={root.id} node={root} all={categories} selected={selected} expanded={expanded} onToggle={(id) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} onSelect={(id) => { const next = new URLSearchParams(params); next.set('category_id', String(id)); setParams(next); }} />) : null}</div></GlassPanel>
      <div className="min-w-0 space-y-4"><SearchBar value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索知识库" />{loading ? <LoadingState type="table" rows={8} /> : error ? <ErrorState onRetry={load} /> : <ResourceTable items={items} canEdit={hasPermission('resource:update')} canDelete={false} />}</div>
    </div>
    <ResourceCreateModal open={creating} libraryType="knowledge" categories={categories} onClose={() => setCreating(false)} onCreated={({ id, title, libraryType }) => {
      setCreating(false);
      addNotification({ title: '创建成功', message: `资料「${title}」已创建`, type: 'success' });
      navigate(getResourceDetailPath(id, libraryType), { state: { confirmedCreatedTitle: title } });
    }} />
    <ResourceCategoryManagementModal open={managingCategories} libraryType="knowledge" libraryName="知识库" categories={categories} onClose={() => setManagingCategories(false)} onCategoriesChange={setCategories} />
  </PageShell>;
}
