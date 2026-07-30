import { Search } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { searchResourceCenter, type ResourceCategory } from '@/api/resourceCenter';
import { ErrorState, LoadingState } from '@/components/common';
import { EmptyState, GlassPanel, PageHeader, PageShell, SearchBar } from '@/components/studio';

type Result = { resource_id: number; title: string; summary: string | null; snippet: string; category?: ResourceCategory | null };

export default function ResourceSearch() {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const search = async (event?: FormEvent) => { event?.preventDefault(); if (!keyword.trim()) return; setState('loading'); try { const response = await searchResourceCenter({ keyword: keyword.trim() }); setResults(response.data); setState('ready'); } catch { setState('error'); } };
  return <PageShell><PageHeader title="资料搜索" /><form onSubmit={search} className="flex gap-3"><SearchBar autoFocus value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="输入关键词" className="flex-1" /><button className="rounded-button bg-studio-primary px-5 text-sm font-medium text-white"><Search className="mr-2 inline h-4 w-4" />搜索</button></form>{state === 'loading' ? <LoadingState type="table" rows={8} /> : state === 'error' ? <ErrorState onRetry={() => void search()} /> : state === 'ready' && !results.length ? <EmptyState title="未找到资料" /> : <div className="space-y-3">{results.map((result) => <Link key={result.resource_id} to={`/asset-center/resources/${result.resource_id}`}><GlassPanel className="mb-3 p-5 transition-colors hover:border-studio-border-active"><div className="flex items-center justify-between gap-4"><h2 className="font-semibold text-studio-text-primary">{result.title}</h2><span className="text-xs text-studio-text-muted">{result.category?.name || '—'}</span></div><p className="mt-2 line-clamp-3 text-sm leading-6 text-studio-text-secondary">{result.snippet.replace(/<\/?mark>/g, '')}</p></GlassPanel></Link>)}</div>}</PageShell>;
}
