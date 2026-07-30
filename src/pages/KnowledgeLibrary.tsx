import { ChevronDown, ChevronRight, Folder, FolderTree, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getResourceCategories, getResourceCenterResources, type ResourceCategory, type ResourceListItem } from '@/api/resourceCenter';
import { ErrorState, LoadingState } from '@/components/common';
import ResourceTable from '@/components/resource-center/ResourceTable';
import { GlassPanel, PageHeader, PageShell, SearchBar } from '@/components/studio';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';

function CategoryBranch({ node, all, selected, expanded, onToggle, onSelect }: { node: ResourceCategory; all: ResourceCategory[]; selected?: number; expanded: Set<number>; onToggle: (id: number) => void; onSelect: (id: number) => void }) {
  const children = all.filter((item) => item.parent_id === node.id);
  const open = expanded.has(node.id);
  return <div><div className={`flex items-center rounded-button text-sm ${selected === node.id ? 'bg-studio-primary/15 text-studio-cyan' : 'text-studio-text-secondary hover:bg-white/[0.04]'}`}><button type="button" onClick={() => onToggle(node.id)} className="p-2" aria-label={open ? '收起' : '展开'}>{children.length ? open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" /> : <span className="block w-4" />}</button><button type="button" onClick={() => onSelect(node.id)} className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-2 text-left"><Folder className="h-4 w-4 shrink-0" /><span className="truncate">{node.name}</span><span className="ml-auto text-xs text-studio-text-muted">{node.resource_count || ''}</span></button></div>{open && children.length ? <div className="ml-4 border-l border-studio-border-soft pl-2">{children.map((child) => <CategoryBranch key={child.id} node={child} all={all} selected={selected} expanded={expanded} onToggle={onToggle} onSelect={onSelect} />)}</div> : null}</div>;
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
  const [error, setError] = useState(false);
  const { hasPermission } = usePermission();
  const roots = useMemo(() => categories.filter((item) => item.parent_id === null || !categories.some((candidate) => candidate.id === item.parent_id)), [categories]);
  const load = () => { setLoading(true); setError(false); void Promise.all([getResourceCategories('knowledge'), getResourceCenterResources({ library_type: 'knowledge', category_id: selected, keyword: debounced || undefined, page: 1, page_size: 50 })]).then(([categoryResponse, resourceResponse]) => { setCategories(categoryResponse.data); setItems(resourceResponse.data); if (expanded.size === 0) setExpanded(new Set(categoryResponse.data.filter((category) => category.parent_id === null).map((category) => category.id))); }).catch(() => setError(true)).finally(() => setLoading(false)); };
  // 分类或关键词变化时刷新右侧资料。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [selected, debounced]);

  return <PageShell>
    <PageHeader title="知识库" actions={<>{hasPermission('resource:category_manage') ? <button className="rounded-button border border-studio-border-soft px-4 py-2.5 text-sm text-studio-text-primary"><FolderTree className="mr-2 inline h-4 w-4" />分类管理</button> : null}{hasPermission('resource:create') ? <button className="rounded-button bg-studio-primary px-4 py-2.5 text-sm font-medium text-white"><Plus className="mr-2 inline h-4 w-4" />新增资料</button> : null}</>} />
    <div className="grid min-h-[620px] gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <GlassPanel className="p-3"><button type="button" onClick={() => { const next = new URLSearchParams(params); next.delete('category_id'); setParams(next); }} className={`mb-2 w-full rounded-button px-3 py-2 text-left text-sm ${!selected ? 'bg-studio-primary/15 text-studio-cyan' : 'text-studio-text-secondary hover:bg-white/[0.04]'}`}>全部分类</button><div className="max-h-[680px] overflow-y-auto">{categories.length ? roots.map((root) => <CategoryBranch key={root.id} node={root} all={categories} selected={selected} expanded={expanded} onToggle={(id) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} onSelect={(id) => { const next = new URLSearchParams(params); next.set('category_id', String(id)); setParams(next); }} />) : null}</div></GlassPanel>
      <div className="min-w-0 space-y-4"><SearchBar value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索知识库" />{loading ? <LoadingState type="table" rows={8} /> : error ? <ErrorState onRetry={load} /> : <ResourceTable items={items} canEdit={hasPermission('resource:update')} canDelete={false} />}</div>
    </div>
  </PageShell>;
}
