import { ChevronRight, FilePlus2, FileText } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProduction } from '@/api';
import { useAuthStore } from '@/store';
import type { Production } from '@/types';
import { STATUS_TEXT } from '@/constants';
import { usePermission } from '@/hooks/usePermission';
import AccessDeniedState from '@/components/AccessDeniedState';

export default function MobileProduction() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Production[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const previousUserIdRef = useRef(userId);
  const requestSequenceRef = useRef(0);
  const { permissions, loading: permissionsLoading } = usePermission();
  const canView = permissions.includes('*') || permissions.includes('production:view') || permissions.includes('production:update');
  const canEdit = permissions.includes('*') || permissions.includes('production:update');
  const load = useCallback(async () => {
    const requestId = ++requestSequenceRef.current;
    if (previousUserIdRef.current !== userId) {
      previousUserIdRef.current = userId;
      setItems([]);
      setError('');
      setLoading(true);
    }
    if (permissionsLoading) return;
    if (!canView) {
      if (requestId !== requestSequenceRef.current) return;
      setItems([]);
      setLoading(false);
      setError('当前账号没有查看创作稿件的权限。');
      return;
    }
    setLoading(true); setError('');
    try {
      const result = await getProduction();
      if (requestId === requestSequenceRef.current) setItems(result);
    } catch (reason) {
      if (requestId === requestSequenceRef.current) setError(reason instanceof Error ? reason.message : '加载创作失败');
    } finally {
      if (requestId === requestSequenceRef.current) setLoading(false);
    }
  }, [canView, permissionsLoading, userId]);
  useEffect(() => {
    void load();
    return () => { requestSequenceRef.current += 1; };
  }, [load]);
  if (!permissionsLoading && !canView) return <AccessDeniedState title="暂时无法查看创作稿件" description="请联系管理员分配创作查看权限。" />;
  return <div className="space-y-4">
    <div className="flex items-center justify-between"><div><p className="text-sm text-studio-text-muted">我的创作</p><h2 className="text-xl font-semibold">稿件与协作编辑</h2></div>{canEdit ? <button type="button" onClick={() => navigate('/production/content/new')} className="flex min-h-11 items-center gap-2 rounded-xl bg-studio-primary-button px-3 text-sm font-semibold text-white"><FilePlus2 className="h-4 w-4" />新建</button> : null}</div>
    <button type="button" disabled={loading || permissionsLoading} onClick={() => void load()} className="xmt-btn xmt-btn-secondary inline-flex min-h-11 items-center px-3 text-sm disabled:opacity-50">{loading || permissionsLoading ? '正在同步…' : error ? '重新加载创作列表' : '刷新创作列表'}</button>
    {error ? <p role="alert" className="text-sm text-studio-coral">{error}</p> : null}
    {error && items.length > 0 ? <p role="status" className="text-sm text-studio-text-secondary">仍显示上次成功读取的 {items.length} 条稿件；当前列表可能不是最新。</p> : null}
    {!loading && !error && items.length === 0 ? <div className="rounded-2xl border border-studio-border-soft p-8 text-center"><FileText className="mx-auto h-7 w-7 text-studio-text-muted" /><p className="mt-3 text-sm text-studio-text-secondary">还没有创作稿件</p></div> : null}
    <div className="space-y-2">{items.map((item) => <button key={item.id} type="button" onClick={() => navigate(`/production/content/${item.id}`)} className="flex w-full items-center gap-3 rounded-2xl border border-studio-border-soft bg-studio-surface p-4 text-left"><FileText className="h-5 w-5 shrink-0 text-studio-cyan" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{item.topic_title || `创作 #${item.id}`}</strong><small className="mt-1 block text-xs text-studio-text-muted">{item.version || 'v1.0'} · {STATUS_TEXT[item.status] || (item.status === 'draft' ? '草稿' : item.status === 'review' ? '审核中' : '状态待确认')}</small></span><ChevronRight className="h-5 w-5 text-studio-text-muted" /></button>)}</div>
  </div>;
}
