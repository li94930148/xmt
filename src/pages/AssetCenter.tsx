import { ArrowUpRight, BookOpen, FileText, FolderKanban, Images, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getResourceCenterResources, type LibraryType } from '@/api/resourceCenter';
import { ErrorState, LoadingState } from '@/components/common';
import { GlassPanel, PageHeader, PageShell } from '@/components/studio';

const libraries: Array<{ type: LibraryType; path: string; title: string; icon: typeof FolderKanban }> = [
  { type: 'project', path: '/asset-center/resources?library_type=project', title: '项目资料库', icon: FolderKanban },
  { type: 'content_archive', path: '/asset-center/resources?library_type=content_archive', title: '内容档案库', icon: FileText },
  { type: 'knowledge', path: '/asset-center/knowledge', title: '知识库', icon: BookOpen },
  { type: 'media', path: '/asset-center/resources?library_type=media', title: '素材归档库', icon: Images },
];

export default function AssetCenter() {
  const [counts, setCounts] = useState<Partial<Record<LibraryType, number>>>({});
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const load = () => {
    setState('loading');
    void Promise.all(libraries.map(({ type }) => getResourceCenterResources({ library_type: type, page: 1, page_size: 1 })))
      .then((responses) => {
        setCounts(Object.fromEntries(responses.map((response, index) => [libraries[index].type, response.pagination.total])));
        setState('ready');
      })
      .catch(() => setState('error'));
  };
  useEffect(load, []);

  return (
    <PageShell>
      <PageHeader title="资料中心" actions={<Link to="/asset-center/search" className="inline-flex items-center gap-2 rounded-button border border-studio-border-soft bg-white/[0.04] px-4 py-2.5 text-sm text-studio-text-primary hover:border-studio-border-active"><Search className="h-4 w-4" />搜索</Link>} />
      {state === 'loading' ? <LoadingState type="table" rows={2} /> : state === 'error' ? <ErrorState onRetry={load} /> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {libraries.map((library) => {
            const Icon = library.icon;
            return <Link key={library.type} to={library.path} className="group"><GlassPanel className="flex items-center gap-4 p-5 transition-colors group-hover:border-studio-border-active"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-studio-primary/12 text-studio-cyan"><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block font-semibold text-studio-text-primary">{library.title}</span><span className="mt-1 block text-2xl font-bold text-studio-text-primary">{(counts[library.type] || 0).toLocaleString('zh-CN')}</span></span><ArrowUpRight className="h-5 w-5 text-studio-text-muted group-hover:text-studio-cyan" /></GlassPanel></Link>;
          })}
        </div>
      )}
    </PageShell>
  );
}
