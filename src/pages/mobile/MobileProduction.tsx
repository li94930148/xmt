import { ChevronRight, FilePlus2, FileText } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProduction } from '@/api';
import type { Production } from '@/types';

export default function MobileProduction() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Production[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { setItems(await getProduction()); } catch (reason) { setError(reason instanceof Error ? reason.message : '加载创作失败'); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  return <div className="space-y-4">
    <div className="flex items-center justify-between"><div><p className="text-sm text-studio-text-muted">我的创作</p><h2 className="text-xl font-semibold">稿件与协作编辑</h2></div><button type="button" onClick={() => navigate('/production/content/new')} className="flex min-h-11 items-center gap-2 rounded-xl bg-studio-primary px-3 text-sm font-semibold text-white"><FilePlus2 className="h-4 w-4" />新建</button></div>
    <button type="button" onClick={() => void load()} className="min-h-11 text-sm text-studio-cyan">{loading ? '正在同步…' : '刷新创作列表'}</button>
    {error ? <p role="alert" className="text-sm text-studio-coral">{error}</p> : null}
    {!loading && !error && items.length === 0 ? <div className="rounded-2xl border border-studio-border-soft p-8 text-center"><FileText className="mx-auto h-7 w-7 text-studio-text-muted" /><p className="mt-3 text-sm text-studio-text-secondary">还没有创作稿件</p></div> : null}
    <div className="space-y-2">{items.map((item) => <button key={item.id} type="button" onClick={() => navigate(`/production/content/${item.id}`)} className="flex w-full items-center gap-3 rounded-2xl border border-studio-border-soft bg-studio-surface p-4 text-left"><FileText className="h-5 w-5 shrink-0 text-studio-cyan" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{item.topic_title || `创作 #${item.id}`}</strong><small className="mt-1 block text-xs text-studio-text-muted">{item.version || 'v1.0'} · {item.status}</small></span><ChevronRight className="h-5 w-5 text-studio-text-muted" /></button>)}</div>
  </div>;
}
