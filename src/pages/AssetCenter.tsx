import { AlertTriangle, ArrowUpRight, BookOpen, FileText, FolderKanban, Images, Layers3, RefreshCw, Search, Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getResourceCenterResources, type LibraryType } from '@/api/resourceCenter';
import { LoadingState } from '@/components/common';
import { ActionButton, GlassPanel, PageHeader, PageShell } from '@/components/studio';

const libraries: Array<{ type: LibraryType; path: string; title: string; icon: typeof FolderKanban }> = [
  { type: 'project', path: '/asset-center/resources?library_type=project', title: '项目资料库', icon: FolderKanban },
  { type: 'content_archive', path: '/asset-center/resources?library_type=content_archive', title: '内容档案库', icon: FileText },
  { type: 'knowledge', path: '/asset-center/knowledge', title: '知识库', icon: BookOpen },
  { type: 'media', path: '/asset-center/resources?library_type=media', title: '素材归档库', icon: Images },
];

export default function AssetCenter() {
  const [counts, setCounts] = useState<Partial<Record<LibraryType, number>>>({});
  const [failedTypes, setFailedTypes] = useState<LibraryType[]>([]);
  const [loading, setLoading] = useState(true);
  const requestSequenceRef = useRef(0);
  const load = useCallback(async () => {
    const requestSequence = ++requestSequenceRef.current;
    setLoading(true);
    const results = await Promise.allSettled(libraries.map(({ type }) => getResourceCenterResources({ library_type: type, page: 1, page_size: 1 })));
    if (requestSequence !== requestSequenceRef.current) return;

    const nextCounts: Partial<Record<LibraryType, number>> = {};
    const nextFailedTypes: LibraryType[] = [];
    results.forEach((result, index) => {
      const libraryType = libraries[index].type;
      if (result.status === 'fulfilled') nextCounts[libraryType] = result.value.pagination.total;
      else nextFailedTypes.push(libraryType);
    });
    setCounts(nextCounts);
    setFailedTypes(nextFailedTypes);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    return () => { requestSequenceRef.current += 1; };
  }, [load]);

  if (loading && !Object.keys(counts).length && !failedTypes.length) return <PageShell><PageHeader title="资料中心" /><LoadingState type="table" rows={2} /></PageShell>;

  const failedLabels = libraries.filter(({ type }) => failedTypes.includes(type)).map(({ title }) => title);

  return (
    <PageShell>
      <PageHeader title="资料中心" actions={<Link to="/asset-center/search" className="inline-flex items-center gap-2 rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2.5 text-sm text-studio-text-primary hover:border-studio-border-active"><Search className="h-4 w-4" />搜索</Link>} />
      {failedTypes.length > 0 ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-studio-coral/30 bg-studio-coral-soft px-4 py-3 text-sm text-studio-coral-contrast">
          <div className="flex min-w-0 items-start gap-2">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{failedTypes.length === libraries.length ? '资料中心暂时无法读取资料库计数' : `${failedLabels.join('、')}计数暂时无法读取；其他资料库仍可用。`}</p>
          </div>
          <ActionButton type="button" variant="secondary" onClick={() => void load()} disabled={loading} className="shrink-0">
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? '正在重试…' : '重试读取'}
          </ActionButton>
        </div>
      ) : loading ? <p role="status" className="text-sm text-studio-text-muted">正在更新资料库计数…</p> : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {libraries.map((library) => {
            const Icon = library.icon;
            const unavailable = failedTypes.includes(library.type);
            return <Link key={library.type} to={library.path} className="group"><GlassPanel className="flex items-center gap-4 p-5 transition-colors group-hover:border-studio-border-active"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-studio-primary/12 text-studio-cyan"><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block font-semibold text-studio-text-primary">{library.title}</span><span className={`mt-1 block ${unavailable ? 'text-sm font-medium text-studio-coral-contrast' : 'text-2xl font-bold text-studio-text-primary'}`}>{unavailable ? '暂不可用' : (counts[library.type] ?? 0).toLocaleString('zh-CN')}</span></span><ArrowUpRight className="h-5 w-5 text-studio-text-muted group-hover:text-studio-cyan" /></GlassPanel></Link>;
          })}
          <Link to="/asset-center/published-archives" className="group">
            <GlassPanel className="flex items-center gap-4 p-5 transition-colors group-hover:border-studio-border-active">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-studio-cyan/12 text-studio-cyan"><Send className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-studio-text-primary">发布归档</span>
                <span className="mt-1 block text-sm text-studio-text-secondary">按选题查看各平台发布快照与独立数据</span>
              </span>
              <ArrowUpRight className="h-5 w-5 text-studio-text-muted group-hover:text-studio-cyan" />
            </GlassPanel>
          </Link>
          <Link to="/asset-center/content-topics" className="group">
            <GlassPanel className="flex items-center gap-4 p-5 transition-colors group-hover:border-studio-border-active">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-studio-cyan/12 text-studio-cyan"><Layers3 className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-studio-text-primary">主题内容资产</span>
                <span className="mt-1 block text-sm text-studio-text-secondary">按选题串联稿件、资料与发布数据</span>
              </span>
              <ArrowUpRight className="h-5 w-5 text-studio-text-muted group-hover:text-studio-cyan" />
            </GlassPanel>
          </Link>
      </div>
    </PageShell>
  );
}
