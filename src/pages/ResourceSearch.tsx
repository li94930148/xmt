import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getResourceCategories, searchResourceCenter, type LibraryType, type ResourceCategory, type ResourceSearchSort } from '@/api/resourceCenter';
import { ErrorState, LoadingState } from '@/components/common';
import { ActionButton, EmptyState, GlassPanel, PageHeader, PageShell, SearchBar } from '@/components/studio';
import { ResourceSearchSnippet } from '@/components/resource-center/ResourceSearchSnippet';
import { getResourceDetailPath } from '@/platform/resource-navigation';

type Result = { resource_id: number; title: string; summary: string | null; snippet: string; library_type: LibraryType; category?: ResourceCategory | null };
type SearchFilters = { library_type?: LibraryType; category_id?: number; tag?: string; sort: ResourceSearchSort };

const libraryLabels: Record<LibraryType, string> = {
  project: '项目资料库',
  content_archive: '内容档案库',
  knowledge: '知识库',
  media: '素材归档库',
};

const libraryOptions: LibraryType[] = ['project', 'content_archive', 'knowledge', 'media'];

export default function ResourceSearch() {
  const [keyword, setKeyword] = useState('');
  const [libraryType, setLibraryType] = useState<LibraryType | ''>('');
  const [categoryId, setCategoryId] = useState('');
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState<ResourceSearchSort>('relevance');
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [categoryState, setCategoryState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [categoryRetry, setCategoryRetry] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const latestRequest = useRef(0);
  const searchInFlight = useRef(false);

  useEffect(() => () => { latestRequest.current += 1; }, []);

  useEffect(() => {
    let active = true;
    setCategories([]);
    setCategoryState('loading');
    getResourceCategories(libraryType || undefined)
      .then((response) => {
        if (!active) return;
        setCategories(response.data);
        setCategoryState('ready');
      })
      .catch(() => {
        if (!active) return;
        setCategories([]);
        setCategoryState('error');
      });
    return () => { active = false; };
  }, [libraryType, categoryRetry]);

  const invalidateSearch = () => {
    latestRequest.current += 1;
    searchInFlight.current = false;
    setResults([]);
    setState('idle');
  };

  const searchWithFilters = async (query: string, filters: SearchFilters) => {
    if (!query) {
      latestRequest.current += 1;
      searchInFlight.current = false;
      setResults([]);
      setState('idle');
      return;
    }
    if (searchInFlight.current) return;
    searchInFlight.current = true;
    const requestId = ++latestRequest.current;
    setState('loading');
    try {
      const response = await searchResourceCenter({ keyword: query, ...filters });
      if (requestId !== latestRequest.current) return;
      setResults(response.data);
      setState('ready');
    } catch {
      if (requestId === latestRequest.current) setState('error');
    } finally {
      if (requestId === latestRequest.current) searchInFlight.current = false;
    }
  };

  const search = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    await searchWithFilters(keyword.trim(), {
      library_type: libraryType || undefined,
      category_id: Number(categoryId) || undefined,
      tag: tag.trim() || undefined,
      sort,
    });
  };

  const hasFilters = Boolean(libraryType || categoryId || tag.trim() || sort !== 'relevance');
  const resetFiltersAndSearch = () => {
    setLibraryType('');
    setCategoryId('');
    setTag('');
    setSort('relevance');
    void searchWithFilters(keyword.trim(), { sort: 'relevance' });
  };

  return (
    <PageShell>
      <PageHeader title="资料搜索" />
      <form onSubmit={search} aria-busy={state === 'loading'} className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row">
          <SearchBar
            aria-label="搜索资料关键词"
            autoFocus
            value={keyword}
            onChange={(event) => { setKeyword(event.target.value); invalidateSearch(); }}
            placeholder="输入关键词"
            className="flex-1"
          />
          <ActionButton type="submit" variant="primary" className="px-5" disabled={state === 'loading'}>
            <Search className="h-4 w-4" />{state === 'loading' ? '搜索中…' : '搜索'}
          </ActionButton>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1 text-xs text-studio-text-secondary">
            资料库
            <select
              value={libraryType}
              onChange={(event) => {
                setLibraryType(event.target.value as LibraryType | '');
                setCategoryId('');
                invalidateSearch();
              }}
              className="xmt-field min-h-10 px-3 py-2 text-sm"
            >
              <option value="">全部资料库</option>
              {libraryOptions.map((type) => <option key={type} value={type}>{libraryLabels[type]}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-studio-text-secondary">
            分类
            <select
              value={categoryId}
              disabled={categoryState !== 'ready'}
              onChange={(event) => { setCategoryId(event.target.value); invalidateSearch(); }}
              className="xmt-field min-h-10 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">全部分类</option>
              {categories.map((category) => {
                const categoryName = category.path || category.name;
                const optionName = libraryType ? categoryName : `${libraryLabels[category.library_type]} · ${categoryName}`;
                return <option key={category.id} value={category.id}>{optionName}</option>;
              })}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-studio-text-secondary">
            标签
            <input
              aria-label="按标签筛选"
              type="text"
              value={tag}
              onChange={(event) => { setTag(event.target.value); invalidateSearch(); }}
              placeholder="输入完整标签名"
              className="xmt-field min-h-10 px-3 py-2 text-sm"
            />
          </label>
          <label className="grid gap-1 text-xs text-studio-text-secondary">
            排序
            <select
              value={sort}
              onChange={(event) => { setSort(event.target.value as ResourceSearchSort); invalidateSearch(); }}
              className="xmt-field min-h-10 px-3 py-2 text-sm"
            >
              <option value="relevance">最相关</option>
              <option value="updated_desc">最近更新</option>
              <option value="title_asc">标题升序</option>
            </select>
          </label>
        </div>
      </form>
      {categoryState === 'error' ? (
        <div role="alert" className="flex flex-col gap-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between">
          <span>分类暂时无法读取；其他筛选和搜索仍可继续使用。</span>
          <ActionButton type="button" variant="secondary" onClick={() => setCategoryRetry((value) => value + 1)}>重新加载分类</ActionButton>
        </div>
      ) : null}
      {state === 'loading' ? <LoadingState type="table" rows={8} /> : null}
      {state === 'error' ? <ErrorState onRetry={() => void search()} /> : null}
      {state === 'ready' && results.length === 0 ? (
        <EmptyState
          title="未找到资料"
          description="试试缩短关键词，或调整资料库、分类和标签条件。"
          actionLabel={hasFilters ? '清除筛选条件并重新搜索' : undefined}
          onAction={hasFilters ? resetFiltersAndSearch : undefined}
        />
      ) : null}
      {state === 'ready' && results.length > 0 ? (
        <div className="space-y-3">
          {results.map((result) => (
            <Link key={result.resource_id} to={getResourceDetailPath(result.resource_id, result.library_type)}>
              <GlassPanel className="mb-3 p-5 transition-colors hover:border-studio-border-active">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="font-semibold text-studio-text-primary">{result.title}</h2>
                  <span className="text-xs text-studio-text-secondary">{result.category?.name || '—'}</span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-studio-text-secondary">
                  <ResourceSearchSnippet snippet={result.snippet} />
                </p>
              </GlassPanel>
            </Link>
          ))}
        </div>
      ) : null}
    </PageShell>
  );
}
