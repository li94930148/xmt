import { ExternalLink, Link2, Search, Trash2 } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { addTopicResource, getTopicResources, removeTopicResource, type TopicResource } from '@/api/topics';
import { searchResourceCenter } from '@/api/resourceCenter';
import { BaseModal, ConfirmModal, ErrorState, LoadingState } from '@/components/common';
import { EmptyState, SearchBar } from '@/components/studio';
import { useAppStore } from '@/store';

const libraryNames: Record<TopicResource['library_type'], string> = {
  project: '项目资料库',
  content_archive: '内容档案库',
  knowledge: '知识库',
  media: '素材归档库',
};

type SearchResult = TopicResource & { snippet: string };

export default function TopicResourcesPanel({ topicId, canManage }: { topicId: number; canManage: boolean }) {
  const [items, setItems] = useState<TopicResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [removing, setRemoving] = useState<TopicResource | null>(null);
  const appStore = useAppStore();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try { setItems(await getTopicResources(topicId)); }
    catch { setLoadError(true); }
    finally { setLoading(false); }
  }, [topicId]);

  useEffect(() => { void load(); }, [load]);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    const term = keyword.trim();
    if (!term) return;
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
      appStore.addNotification({ title: '搜索失败', message: (error as Error).message, type: 'error' });
    } finally { setSearching(false); }
  };

  const add = async (resource: SearchResult) => {
    setAddingId(resource.id);
    try {
      await addTopicResource(topicId, resource.id);
      await load();
      setResults((current) => current.filter((item) => item.id !== resource.id));
      appStore.addNotification({ title: '关联成功', message: resource.title, type: 'success' });
    } catch (error) {
      appStore.addNotification({ title: '关联失败', message: (error as Error).message, type: 'error' });
    } finally { setAddingId(null); }
  };

  return (
    <>
      <div className="mb-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm text-gray-400">关联资料</h3>
          {canManage ? <button type="button" onClick={() => setShowPicker(true)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-700"><Link2 className="h-4 w-4" />关联资料</button> : null}
        </div>
        {loading ? <LoadingState type="table" rows={3} /> : loadError ? <ErrorState onRetry={() => void load()} /> : items.length === 0 ? <EmptyState title="暂无关联资料" /> : (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <div className="divide-y divide-white/10">
              {items.map((item) => <div key={item.id} className="grid items-center gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(0,1fr)_130px_160px_auto]"><Link to={`/asset-center/resources/${item.id}`} className="truncate font-medium text-gray-100 hover:text-blue-400">{item.title}</Link><span className="text-gray-400">{libraryNames[item.library_type]}</span><span className="truncate text-gray-400">{item.category?.name || '—'}</span><div className="flex justify-end gap-1"><Link aria-label="查看资料" to={`/asset-center/resources/${item.id}`} className="rounded-lg p-2 text-gray-400 hover:bg-white/5 hover:text-blue-400"><ExternalLink className="h-4 w-4" /></Link>{canManage ? <button type="button" aria-label="解除关联" onClick={() => setRemoving(item)} className="rounded-lg p-2 text-gray-400 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-4 w-4" /></button> : null}</div></div>)}
            </div>
          </div>
        )}
      </div>

      <BaseModal open={showPicker} onClose={() => setShowPicker(false)} title="关联资料" size="lg">
        <form onSubmit={search} className="flex gap-3"><SearchBar value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索资料" className="flex-1" /><button type="submit" className="rounded-lg bg-blue-600 px-4 text-sm text-white hover:bg-blue-700"><Search className="mr-2 inline h-4 w-4" />搜索</button></form>
        <div className="mt-4 max-h-[440px] space-y-2 overflow-y-auto">
          {searching ? <LoadingState type="inline" /> : results.length ? results.map((result) => <div key={result.id} className="flex items-start gap-3 rounded-xl border border-white/10 p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-gray-100">{result.title}</p><p className="mt-1 text-xs text-gray-400">{libraryNames[result.library_type]} · {result.category?.name || '—'}</p><p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-500">{result.snippet}</p></div><button type="button" disabled={addingId === result.id} onClick={() => void add(result)} className="rounded-lg border border-blue-500/40 px-3 py-1.5 text-xs text-blue-400 disabled:opacity-50">{addingId === result.id ? '关联中' : '关联'}</button></div>) : keyword ? <EmptyState title="暂无资料" /> : null}
        </div>
      </BaseModal>

      <ConfirmModal open={!!removing} title="解除关联" description={removing?.title} confirmText="解除" variant="danger" onCancel={() => setRemoving(null)} onConfirm={async () => { if (!removing) return; try { await removeTopicResource(topicId, removing.id); setRemoving(null); await load(); } catch (error) { appStore.addNotification({ title: '解除失败', message: (error as Error).message, type: 'error' }); } }} />
    </>
  );
}
