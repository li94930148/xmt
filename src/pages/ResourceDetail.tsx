import { ArrowLeft, File, Pencil, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { deleteResourceCenterResource, getResourceAudit, getResourceCenterResource, type ResourceDetailData } from '@/api/resourceCenter';
import { ConfirmModal, ErrorState, LoadingState } from '@/components/common';
import { GlassPanel, PageHeader, PageShell } from '@/components/studio';
import { usePermission } from '@/hooks/usePermission';
import { formatBeijingDate, formatBeijingTime } from '@/lib/utils';
import { useAppStore } from '@/store';
import { resourceStatusLabel, resourceVisibilityLabel } from '@/components/resource-center/resourceLabels';

export default function ResourceDetail() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as { confirmedCreatedTitle?: unknown } | null;
  const [confirmedCreatedTitle] = useState(typeof routeState?.confirmedCreatedTitle === 'string' ? routeState.confirmedCreatedTitle : null);
  const [resource, setResource] = useState<ResourceDetailData | null>(null);
  const [audit, setAudit] = useState<Array<{ id: number; action: string; created_at: string }>>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteLockRef = useRef(false);
  const addNotification = useAppStore((store) => store.addNotification);
  const { hasPermission } = usePermission();
  const canAudit = hasPermission('resource:audit');
  const load = useCallback(async () => {
    setState('loading');
    setLoadError(null);
    try {
      const data = await getResourceCenterResource(id);
      setResource(data);
      if (canAudit) setAudit((await getResourceAudit(id)).data);
      setState('ready');
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : '资料详情暂时无法读取');
      setState('error');
    }
  }, [id, canAudit]);
  useEffect(() => { void load(); }, [load]);
  const handleDelete = async () => {
    if (!resource || deleteLockRef.current) return;
    deleteLockRef.current = true;
    setDeleting(true);
    try {
      await deleteResourceCenterResource(resource.id);
      setConfirmDelete(false);
      addNotification({ title: '删除成功', message: `资料「${resource.title}」已删除`, type: 'success' });
      navigate('/asset-center/resources');
    } catch (cause) {
      addNotification({ title: '删除失败', message: cause instanceof Error ? cause.message : '资料未删除，请重试', type: 'error' });
    } finally {
      deleteLockRef.current = false;
      setDeleting(false);
    }
  };
  if (state === 'loading') return <LoadingState type="page" />;
  if (state === 'error' || !resource) return <PageShell>
    {confirmedCreatedTitle ? <div role="alert" className="mb-4 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast">服务端已确认资料「{confirmedCreatedTitle}」创建成功，但详情暂时无法读取；请重新加载详情，不要重复创建。</div> : null}
    <ErrorState title="资料详情暂时无法读取" description={`${loadError || '读取请求暂时失败'}。${confirmedCreatedTitle ? '请重新加载详情；资料已创建，不要重复创建。' : '请重新加载详情后重试。'}`} actionText="重新加载详情" onRetry={() => void load()} />
  </PageShell>;
  return <PageShell>
    <PageHeader title={resource.title} actions={<><Link to="/asset-center/resources" className="rounded-button border border-studio-border-soft p-2.5 text-studio-text-secondary"><ArrowLeft className="h-4 w-4" /></Link>{hasPermission('resource:update') ? <><button disabled className="rounded-button border border-studio-border-soft px-4 py-2.5 text-sm text-studio-text-muted opacity-60"><Upload className="mr-2 inline h-4 w-4" />上传文件</button><button className="rounded-button border border-studio-border-soft px-4 py-2.5 text-sm text-studio-text-primary"><Pencil className="mr-2 inline h-4 w-4" />编辑</button></> : null}{hasPermission('resource:delete') ? <button onClick={() => setConfirmDelete(true)} className="rounded-button border border-studio-coral/30 px-4 py-2.5 text-sm text-studio-coral-contrast"><Trash2 className="mr-2 inline h-4 w-4" />删除</button> : null}</>} />
    {confirmedCreatedTitle ? <p role="status" className="text-sm text-studio-success-contrast">资料「{confirmedCreatedTitle}」已创建。</p> : null}
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4"><GlassPanel className="p-5"><div className="grid gap-4 text-sm sm:grid-cols-2"><div><span className="text-studio-text-muted">分类</span><p className="mt-1 text-studio-text-primary">{resource.category?.name || '—'}</p></div><div><span className="text-studio-text-muted">更新时间</span><p className="mt-1 text-studio-text-primary">{formatBeijingTime(resource.updated_at)}</p></div><div><span className="text-studio-text-muted">可见范围</span><p className="mt-1 text-studio-text-primary">{resourceVisibilityLabel(resource.visibility)}</p></div><div><span className="text-studio-text-muted">状态</span><p className="mt-1 text-studio-text-primary">{resourceStatusLabel(resource.status)}</p></div></div>{resource.summary ? <p className="mt-5 border-t border-studio-border-soft pt-5 text-sm leading-7 text-studio-text-secondary">{resource.summary}</p> : null}</GlassPanel><GlassPanel className="p-5"><h2 className="mb-4 font-semibold text-studio-text-primary">正文</h2><div className="max-h-[70vh] overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-studio-text-secondary">{resource.content_text || '—'}</div></GlassPanel></div>
      <div className="space-y-4"><GlassPanel className="p-5"><h2 className="font-semibold text-studio-text-primary">标签</h2><div className="mt-3 flex flex-wrap gap-2">{resource.tags.length ? resource.tags.map((tag) => <span key={tag.id} className="rounded-button bg-studio-surface-elevated px-2.5 py-1 text-xs text-studio-text-secondary">{tag.name}</span>) : <span className="text-sm text-studio-text-muted">—</span>}</div></GlassPanel><GlassPanel className="p-5"><h2 className="font-semibold text-studio-text-primary">文件</h2><div className="mt-3 space-y-2">{resource.files.length ? resource.files.map((file) => <div key={file.id} className="flex items-center gap-2 rounded-button bg-studio-surface-soft p-3 text-sm text-studio-text-secondary"><File className="h-4 w-4" /><span className="truncate">{file.original_name}</span></div>) : <span className="text-sm text-studio-text-muted">—</span>}</div></GlassPanel><GlassPanel className="p-5"><h2 className="font-semibold text-studio-text-primary">关联内容</h2><div className="mt-3 space-y-2 text-sm text-studio-text-secondary">{resource.relations.length ? resource.relations.map((relation) => <div key={relation.id}>{relation.target_type} · {relation.target_id}</div>) : '—'}</div></GlassPanel><GlassPanel className="p-5"><h2 className="font-semibold text-studio-text-primary">审计记录</h2><div className="mt-3 space-y-2 text-sm text-studio-text-secondary">{audit.length ? audit.slice(0, 8).map((item) => <div key={item.id} className="flex justify-between gap-2"><span>{item.action}</span><span>{formatBeijingDate(item.created_at)}</span></div>) : resource.audit_summary?.total ? <div className="flex justify-between"><span>{resource.audit_summary.last_action || '记录'}</span><span>{resource.audit_summary.total}</span></div> : '—'}</div></GlassPanel></div>
    </div>
    <ConfirmModal open={confirmDelete} title="删除资料" description={resource.title} variant="danger" confirmText="删除" loading={deleting} onCancel={() => setConfirmDelete(false)} onConfirm={handleDelete} />
  </PageShell>;
}
