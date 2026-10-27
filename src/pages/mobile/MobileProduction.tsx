import { ChevronRight, FilePlus2, FileText } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProduction } from '@/api';
import { useAuthStore } from '@/store';
import type { Production } from '@/types';
import { STATUS_TEXT } from '@/constants';
import { usePermission } from '@/hooks/usePermission';
import AccessDeniedState from '@/components/AccessDeniedState';
import Pagination from '@/components/Pagination';

const PAGE_SIZE = 20;

export default function MobileProduction() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Production[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const pageRef = useRef(page);
  pageRef.current = page;
  const [loadedPage, setLoadedPage] = useState<number | null>(null);
  const [loadedUserId, setLoadedUserId] = useState<typeof userId>(null);
  const [total, setTotal] = useState(0);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const previousUserIdRef = useRef(userId);
  const requestSequenceRef = useRef(0);
  const { permissions, loading: permissionsLoading } = usePermission();
  const canView = permissions.includes('*') || permissions.includes('production:view') || permissions.includes('production:update');
  const canEdit = permissions.includes('*') || permissions.includes('production:update');
  const load = useCallback(async (requestedPage?: number) => {
    const requestId = ++requestSequenceRef.current;
    const accountChanged = previousUserIdRef.current !== userId;
    if (accountChanged) {
      previousUserIdRef.current = userId;
      setItems([]);
      setTotal(0);
      setLoadedPage(null);
      setLoadedUserId(null);
      setError('');
      setLoading(true);
      setPage(1);
      if (requestedPage !== 1) return;
    }
    if (permissionsLoading) return;
    if (!canView) {
      if (requestId !== requestSequenceRef.current) return;
      setItems([]);
      setTotal(0);
      setLoadedPage(null);
      setLoadedUserId(null);
      setLoading(false);
      setError('当前账号没有查看创作稿件的权限。');
      return;
    }
    setLoading(true); setError('');
    try {
      let targetPage = requestedPage ?? pageRef.current;
      let result = await getProduction({ page: targetPage, limit: PAGE_SIZE });
      for (let correction = 0; targetPage > Math.max(1, Math.ceil(result.total / PAGE_SIZE)); correction += 1) {
        if (correction >= 2) throw new Error('创作列表变化较快，请重新加载');
        targetPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
        result = await getProduction({ page: targetPage, limit: PAGE_SIZE });
      }
      if (requestId === requestSequenceRef.current) {
        setItems(result.data);
        setTotal(result.total);
        setLoadedPage(targetPage);
        setLoadedUserId(userId);
        if (targetPage !== pageRef.current) setPage(targetPage);
      }
    } catch (reason) {
      if (requestId === requestSequenceRef.current) setError(reason instanceof Error ? reason.message : '加载创作失败');
    } finally {
      if (requestId === requestSequenceRef.current) setLoading(false);
    }
  }, [canView, permissionsLoading, userId]);
  useEffect(() => {
    if (canView && loadedPage === page && loadedUserId === userId) return;
    void load(page);
    return () => { requestSequenceRef.current += 1; };
  }, [canView, load, loadedPage, loadedUserId, page, permissionsLoading, userId]);
  const liveStatus = loading && canView && !permissionsLoading
    ? `正在读取第 ${page} 页的创作稿件。`
    : error || loadedPage !== page || loadedUserId !== userId
      ? ''
      : items.length === 0
        ? `第 ${loadedPage} 页读取完成，目前没有创作稿件。`
        : `第 ${loadedPage} 页已加载 ${items.length} 条稿件，共 ${total} 条。`;
  if (!permissionsLoading && !canView) return <AccessDeniedState title="暂时无法查看创作稿件" description="请联系管理员分配创作查看权限。" />;
  return <div className="space-y-4">
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{liveStatus}</p>
    <div className="flex items-center justify-between"><div><p className="text-sm text-studio-text-muted">我的创作</p><h2 className="text-xl font-semibold">稿件与协作编辑</h2></div>{canEdit ? <button type="button" onClick={() => navigate('/production/content/new')} className="xmt-btn xmt-btn-primary min-h-11 px-3 text-sm font-semibold text-white"><FilePlus2 className="h-4 w-4" />新建</button> : null}</div>
    <button type="button" disabled={loading || permissionsLoading} onClick={() => void load()} className="xmt-btn xmt-btn-secondary inline-flex min-h-11 items-center px-3 text-sm disabled:opacity-50">{loading || permissionsLoading ? '正在同步…' : error ? '重新加载创作列表' : '刷新创作列表'}</button>
    {error ? <p role="alert" className="text-sm text-studio-coral-contrast">{error}</p> : null}
    {error && items.length > 0 ? <p role="status" className="text-sm text-studio-text-secondary">仍显示上次成功读取的第 {loadedPage} 页 {items.length} 条稿件；当前列表可能不是最新。</p> : null}
    {!loading && !error && items.length === 0 ? <div className="rounded-2xl border border-studio-border-soft p-8 text-center"><FileText className="mx-auto h-7 w-7 text-studio-text-muted" /><p className="mt-3 text-sm text-studio-text-secondary">还没有创作稿件</p></div> : null}
    <div className="space-y-2">{items.map((item) => <button key={item.id} type="button" onClick={() => navigate(`/production/content/${item.id}`)} className="xmt-card flex w-full items-center gap-3 bg-studio-surface p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-studio-primary"><FileText className="h-5 w-5 shrink-0 text-studio-cyan" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{item.topic_title || `创作 #${item.id}`}</strong><small className="mt-1 block text-xs text-studio-text-muted">{item.version || 'v1.0'} · {STATUS_TEXT[item.status] || (item.status === 'draft' ? '草稿' : item.status === 'review' ? '审核中' : '状态待确认')}</small></span><ChevronRight className="h-5 w-5 text-studio-text-muted" /></button>)}</div>
    <Pagination page={page} total={total} limit={PAGE_SIZE} onChange={setPage} />
  </div>;
}
