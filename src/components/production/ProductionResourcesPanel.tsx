import { ExternalLink, Link2, Search, Trash2 } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { addProductionResource, getProductionResources, removeProductionResource, type ProductionResource } from '@/api/workflow';
import { searchResourceCenter } from '@/api/resourceCenter';
import { BaseModal, ConfirmModal, ErrorState, LoadingState } from '@/components/common';
import { EmptyState, GlassPanel, SearchBar } from '@/components/studio';
import { useAppStore } from '@/store';

const libraryNames: Record<ProductionResource['library_type'], string> = { project: '项目资料库', content_archive: '内容档案库', knowledge: '知识库', media: '素材归档库' };
type SearchResult = ProductionResource & { snippet: string };

export default function ProductionResourcesPanel({ productionId, canManage }: { productionId: number; canManage: boolean }) {
  const [items, setItems] = useState<ProductionResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [removing, setRemoving] = useState<ProductionResource | null>(null);
  const appStore = useAppStore();

  const load = useCallback(async () => {
    setLoading(true); setFailed(false);
    try { setItems(await getProductionResources(productionId)); } catch { setFailed(true); } finally { setLoading(false); }
  }, [productionId]);
  useEffect(() => { void load(); }, [load]);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    const term = keyword.trim();
    if (!term) return;
    setSearching(true);
    try {
      const matches = await searchResourceCenter({ keyword: term });
      const linkedIds = new Set(items.map((item) => item.id));
      setResults(matches.data.filter((item) => !linkedIds.has(item.resource_id)).map((item) => ({ id: item.resource_id, title: item.title, summary: item.summary, snippet: item.snippet.replace(/<\/?mark>/g, ''), library_type: item.library_type, category: item.category ? { id: item.category.id, name: item.category.name, path: item.category.path || undefined } : null })));
    } catch (error) {
      appStore.addNotification({ title: '搜索失败', message: (error as Error).message, type: 'error' });
    } finally { setSearching(false); }
  };

  const add = async (resource: SearchResult) => {
    setAddingId(resource.id);
    try {
      await addProductionResource(productionId, resource.id);
      await load();
      setResults((current) => current.filter((item) => item.id !== resource.id));
      appStore.addNotification({ title: '添加成功', message: resource.title, type: 'success' });
    } catch (error) {
      appStore.addNotification({ title: '添加失败', message: (error as Error).message, type: 'error' });
    } finally { setAddingId(null); }
  };

  return <>
    <GlassPanel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-studio-border-soft px-5 py-4"><h2 className="text-sm font-semibold text-studio-text-primary">参考资料</h2>{canManage ? <button type="button" onClick={() => setPickerOpen(true)} className="inline-flex items-center gap-2 rounded-button bg-studio-primary px-3 py-2 text-sm text-white"><Link2 className="h-4 w-4" />添加资料</button> : null}</div>
      <div className="p-4">{loading ? <LoadingState type="table" rows={2} /> : failed ? <ErrorState onRetry={() => void load()} /> : items.length === 0 ? <EmptyState title="暂无参考资料" /> : <div className="divide-y divide-studio-border-soft">{items.map((item) => <div key={item.id} className="grid items-center gap-3 py-3 text-sm md:grid-cols-[minmax(0,1fr)_130px_160px_auto]"><Link to={`/asset-center/resources/${item.id}`} className="truncate font-medium text-studio-text-primary hover:text-studio-cyan">{item.title}</Link><span className="text-studio-text-secondary">{libraryNames[item.library_type]}</span><span className="truncate text-studio-text-secondary">{item.category?.name || '—'}</span><div className="flex justify-end gap-1"><Link aria-label="查看资料" to={`/asset-center/resources/${item.id}`} className="rounded-button p-2 text-studio-text-muted hover:bg-white/[0.06] hover:text-studio-cyan"><ExternalLink className="h-4 w-4" /></Link>{canManage ? <button type="button" aria-label="解除关联" onClick={() => setRemoving(item)} className="rounded-button p-2 text-studio-text-muted hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-4 w-4" /></button> : null}</div></div>)}</div>}</div>
    </GlassPanel>
    <BaseModal open={pickerOpen} onClose={() => setPickerOpen(false)} title="添加参考资料" size="lg"><form onSubmit={search} className="flex gap-3"><SearchBar value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索资料" className="flex-1" /><button type="submit" className="rounded-button bg-studio-primary px-4 text-sm text-white"><Search className="mr-2 inline h-4 w-4" />搜索</button></form><div className="mt-4 max-h-[440px] space-y-2 overflow-y-auto">{searching ? <LoadingState type="inline" /> : results.length ? results.map((result) => <div key={result.id} className="flex items-start gap-3 rounded-card border border-studio-border-soft p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-studio-text-primary">{result.title}</p><p className="mt-1 text-xs text-studio-text-muted">{libraryNames[result.library_type]} · {result.category?.name || '—'}</p><p className="mt-2 line-clamp-2 text-xs leading-5 text-studio-text-secondary">{result.snippet}</p></div><button type="button" disabled={addingId === result.id} onClick={() => void add(result)} className="rounded-button border border-studio-border-active px-3 py-1.5 text-xs text-studio-cyan disabled:opacity-50">{addingId === result.id ? '添加中' : '添加'}</button></div>) : keyword ? <EmptyState title="暂无资料" /> : null}</div></BaseModal>
    <ConfirmModal open={!!removing} title="解除关联" description={removing?.title} confirmText="解除" variant="danger" onCancel={() => setRemoving(null)} onConfirm={async () => { if (!removing) return; try { await removeProductionResource(productionId, removing.id); setRemoving(null); await load(); } catch (error) { appStore.addNotification({ title: '解除失败', message: (error as Error).message, type: 'error' }); } }} />
  </>;
}
