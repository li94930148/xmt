import { ArrowLeft, File, Pencil, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteResourceCenterResource, getResourceAudit, getResourceCenterResource, type ResourceDetailData } from '@/api/resourceCenter';
import { ConfirmModal, ErrorState, LoadingState } from '@/components/common';
import { GlassPanel, PageHeader, PageShell } from '@/components/studio';
import { usePermission } from '@/hooks/usePermission';

export default function ResourceDetail() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const [resource, setResource] = useState<ResourceDetailData | null>(null);
  const [audit, setAudit] = useState<Array<{ id: number; action: string; created_at: string }>>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { hasPermission } = usePermission();
  const canAudit = hasPermission('resource:audit');
  const load = () => { setState('loading'); void getResourceCenterResource(id).then(async (data) => { setResource(data); if (canAudit) setAudit((await getResourceAudit(id)).data); setState('ready'); }).catch(() => setState('error')); };
  useEffect(load, [id, canAudit]);
  if (state === 'loading') return <LoadingState type="page" />;
  if (state === 'error' || !resource) return <ErrorState variant="notFound" onRetry={load} />;
  return <PageShell>
    <PageHeader title={resource.title} actions={<><Link to="/asset-center/resources" className="rounded-button border border-studio-border-soft p-2.5 text-studio-text-secondary"><ArrowLeft className="h-4 w-4" /></Link>{hasPermission('resource:update') ? <><button disabled className="rounded-button border border-studio-border-soft px-4 py-2.5 text-sm text-studio-text-muted opacity-60"><Upload className="mr-2 inline h-4 w-4" />上传文件</button><button className="rounded-button border border-studio-border-soft px-4 py-2.5 text-sm text-studio-text-primary"><Pencil className="mr-2 inline h-4 w-4" />编辑</button></> : null}{hasPermission('resource:delete') ? <button onClick={() => setConfirmDelete(true)} className="rounded-button border border-red-500/30 px-4 py-2.5 text-sm text-red-400"><Trash2 className="mr-2 inline h-4 w-4" />删除</button> : null}</>} />
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4"><GlassPanel className="p-5"><div className="grid gap-4 text-sm sm:grid-cols-2"><div><span className="text-studio-text-muted">分类</span><p className="mt-1 text-studio-text-primary">{resource.category?.name || '—'}</p></div><div><span className="text-studio-text-muted">更新时间</span><p className="mt-1 text-studio-text-primary">{new Date(resource.updated_at).toLocaleString('zh-CN')}</p></div><div><span className="text-studio-text-muted">可见范围</span><p className="mt-1 text-studio-text-primary">{resource.visibility}</p></div><div><span className="text-studio-text-muted">状态</span><p className="mt-1 text-studio-text-primary">{resource.status}</p></div></div>{resource.summary ? <p className="mt-5 border-t border-studio-border-soft pt-5 text-sm leading-7 text-studio-text-secondary">{resource.summary}</p> : null}</GlassPanel><GlassPanel className="p-5"><h2 className="mb-4 font-semibold text-studio-text-primary">正文</h2><div className="max-h-[70vh] overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-studio-text-secondary">{resource.content_text || '—'}</div></GlassPanel></div>
      <div className="space-y-4"><GlassPanel className="p-5"><h2 className="font-semibold text-studio-text-primary">标签</h2><div className="mt-3 flex flex-wrap gap-2">{resource.tags.length ? resource.tags.map((tag) => <span key={tag.id} className="rounded-button bg-white/[0.06] px-2.5 py-1 text-xs text-studio-text-secondary">{tag.name}</span>) : <span className="text-sm text-studio-text-muted">—</span>}</div></GlassPanel><GlassPanel className="p-5"><h2 className="font-semibold text-studio-text-primary">文件</h2><div className="mt-3 space-y-2">{resource.files.length ? resource.files.map((file) => <div key={file.id} className="flex items-center gap-2 rounded-button bg-white/[0.04] p-3 text-sm text-studio-text-secondary"><File className="h-4 w-4" /><span className="truncate">{file.original_name}</span></div>) : <span className="text-sm text-studio-text-muted">—</span>}</div></GlassPanel><GlassPanel className="p-5"><h2 className="font-semibold text-studio-text-primary">关联内容</h2><div className="mt-3 space-y-2 text-sm text-studio-text-secondary">{resource.relations.length ? resource.relations.map((relation) => <div key={relation.id}>{relation.target_type} · {relation.target_id}</div>) : '—'}</div></GlassPanel><GlassPanel className="p-5"><h2 className="font-semibold text-studio-text-primary">审计记录</h2><div className="mt-3 space-y-2 text-sm text-studio-text-secondary">{audit.length ? audit.slice(0, 8).map((item) => <div key={item.id} className="flex justify-between gap-2"><span>{item.action}</span><span>{new Date(item.created_at).toLocaleDateString('zh-CN')}</span></div>) : resource.audit_summary?.total ? <div className="flex justify-between"><span>{resource.audit_summary.last_action || '记录'}</span><span>{resource.audit_summary.total}</span></div> : '—'}</div></GlassPanel></div>
    </div>
    <ConfirmModal open={confirmDelete} title="删除资料" description={resource.title} variant="danger" confirmText="删除" onCancel={() => setConfirmDelete(false)} onConfirm={async () => { await deleteResourceCenterResource(resource.id); navigate('/asset-center/resources'); }} />
  </PageShell>;
}
