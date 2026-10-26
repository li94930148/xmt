import { ArrowLeft, File, Pencil, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { deleteResourceCenterResource, getResourceAudit, getResourceCenterResource, type ResourceCategory, type ResourceDetailData, type UpdateResourceCenterResourceInput } from '@/api/resourceCenter';
import { ConfirmModal, ErrorState, LoadingState } from '@/components/common';
import ActionButton from '@/components/studio/ActionButton';
import { GlassPanel, PageHeader, PageShell } from '@/components/studio';
import ResourceEditModal from '@/components/resource-center/ResourceEditModal';
import { InvalidLegacyPublishedArchiveNotice, LegacyPublishedArchiveSnapshotView } from '@/components/resource-center/ArchiveSnapshotView';
import { parseLegacyPublishedArchive } from '@/components/resource-center/parseLegacyPublishedArchive';
import { usePermission } from '@/hooks/usePermission';
import { formatBeijingDate, formatBeijingTime } from '@/lib/utils';
import { getResourceLibraryPath } from '@/platform/resource-navigation';
import { useAppStore, useAuthStore } from '@/store';
import { readResourceUpdateRecovery, type ResourceUpdateRecovery } from '@/utils/resourceUpdateRecovery';
import { resourceStatusLabel, resourceVisibilityLabel } from '@/components/resource-center/resourceLabels';

export default function ResourceDetail() {
  const id = Number(useParams().id);
  const currentResourceIdRef = useRef(id);
  currentResourceIdRef.current = id;
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as { confirmedCreatedTitle?: unknown } | null;
  const [confirmedCreatedTitle] = useState(typeof routeState?.confirmedCreatedTitle === 'string' ? routeState.confirmedCreatedTitle : null);
  const [resource, setResource] = useState<ResourceDetailData | null>(null);
  const [audit, setAudit] = useState<Array<{ id: number; action: string; created_at: string }>>([]);
  const [auditState, setAuditState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [auditError, setAuditError] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteVerification, setDeleteVerification] = useState<{ resource: Pick<ResourceDetailData, 'id' | 'title' | 'library_type'>; message: string } | null>(null);
  const [deleteVerificationLoading, setDeleteVerificationLoading] = useState(false);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [resourceRefreshError, setResourceRefreshError] = useState<string | null>(null);
  const deleteLockRef = useRef(false);
  const loadSequenceRef = useRef(0);
  const recoveryRouteRef = useRef<string | null>(null);
  const detailRefreshSequenceRef = useRef(0);
  const auditSequenceRef = useRef(0);
  useEffect(() => {
    setDeleteVerification(null);
    setDeleteVerificationLoading(false);
    setDeleteNotice(null);
    setConfirmDelete(false);
  }, [id]);
  const addNotification = useAppStore((store) => store.addNotification);
  const actorId = useAuthStore((store) => store.user?.id);
  const { hasPermission } = usePermission();
  const canAudit = hasPermission('resource:audit');
  const canUpdate = hasPermission('resource:update');
  const [pendingUpdateRecovery, setPendingUpdateRecovery] = useState<{ actorId: number; recovery: ResourceUpdateRecovery } | null>(null);
  const [unreadableUpdateRecovery, setUnreadableUpdateRecovery] = useState(false);
  const legacyArchive = useMemo(() => resource ? parseLegacyPublishedArchive({
    libraryType: resource.library_type,
    sourceType: resource.source_type,
    filePath: resource.file_path,
    content: resource.content,
  }) : { kind: 'not-archive' as const }, [resource]);
  const loadAudit = useCallback(async () => {
    const requestId = ++auditSequenceRef.current;
    setAuditState('loading');
    setAuditError(null);
    try {
      const response = await getResourceAudit(id);
      if (requestId !== auditSequenceRef.current || currentResourceIdRef.current !== id) return;
      setAudit(response.data);
      setAuditState('ready');
    } catch (cause) {
      if (requestId !== auditSequenceRef.current || currentResourceIdRef.current !== id) return;
      setAuditError(cause instanceof Error ? cause.message : '审计记录暂时无法读取');
      setAuditState('error');
    }
  }, [id]);
  const load = useCallback(async () => {
    const requestActorId = actorId ?? null;
    const requestId = ++loadSequenceRef.current;
    detailRefreshSequenceRef.current += 1;
    auditSequenceRef.current += 1;
    setState('loading');
    setLoadError(null);
    setResource(null);
    setAudit([]);
    setAuditState(canAudit ? 'loading' : 'ready');
    setAuditError(null);
    try {
      const data = await getResourceCenterResource(id);
      if (requestId !== loadSequenceRef.current || currentResourceIdRef.current !== id || (useAuthStore.getState().user?.id ?? null) !== requestActorId) return;
      setResource(data);
      setState('ready');
      if (canAudit) await loadAudit();
    } catch (cause) {
      if (requestId !== loadSequenceRef.current || currentResourceIdRef.current !== id || (useAuthStore.getState().user?.id ?? null) !== requestActorId) return;
      setLoadError(cause instanceof Error ? cause.message : '资料详情暂时无法读取');
      setState('error');
    }
  }, [actorId, id, canAudit, loadAudit]);

  const refreshResourceAfterUpdate = useCallback(async () => {
    const requestId = ++detailRefreshSequenceRef.current;
    setResourceRefreshError(null);
    try {
      const fresh = await getResourceCenterResource(id);
      if (requestId !== detailRefreshSequenceRef.current || currentResourceIdRef.current !== id) return;
      setResource(fresh);
    } catch {
      if (requestId !== detailRefreshSequenceRef.current || currentResourceIdRef.current !== id) return;
      setResourceRefreshError('服务端已确认保存，但详情刷新失败；当前内容已保留，请稍后只重试读取，不要重复保存。');
    }
  }, [id]);

  const handleResourceUpdated = useCallback((input: UpdateResourceCenterResourceInput, category: ResourceCategory | null) => {
    detailRefreshSequenceRef.current += 1;
    setResource((current) => current?.id === id ? { ...current, ...input, category } : current);
    setEditOpen(false);
    setResourceRefreshError(null);
    addNotification({ title: '资料已保存', message: '服务端已确认更新，正在同步详情。', type: 'success' });
    void refreshResourceAfterUpdate();
    if (canAudit) void loadAudit();
  }, [addNotification, canAudit, id, loadAudit, refreshResourceAfterUpdate]);
  const handleRecoveredResourceUpdate = useCallback(() => {
    setEditOpen(false);
    setResourceRefreshError(null);
    addNotification({ title: '资料保存状态已核实', message: '服务器已确认更新完成，正在重新读取资料。', type: 'success' });
    void refreshResourceAfterUpdate();
    if (canAudit) void loadAudit();
  }, [addNotification, canAudit, loadAudit, refreshResourceAfterUpdate]);
  const verifyDeleteStatus = useCallback(async (target: Pick<ResourceDetailData, 'id' | 'title' | 'library_type'>, operationError?: unknown) => {
    setDeleteVerificationLoading(true);
    setDeleteVerification({ resource: target, message: '正在只读核实资料状态；请勿重复删除。' });
    try {
      const current = await getResourceCenterResource(target.id);
      if (currentResourceIdRef.current !== target.id) return 'stale';
      setResource(current);
      setDeleteVerification(null);
      if (current.status === 'deleted') {
        addNotification({ title: '删除状态已核实', message: `资料「${target.title}」已移入回收站`, type: 'success' });
        navigate(getResourceLibraryPath(target.library_type));
        return 'deleted';
      } else {
        setDeleteNotice(`已只读核实资料「${target.title}」仍未移入回收站，可以安全地重新确认删除。${operationError instanceof Error ? ` ${operationError.message}` : ''}`);
        return 'active';
      }
    } catch (cause) {
      if (currentResourceIdRef.current !== target.id) return 'stale';
      setDeleteVerification({
        resource: target,
        message: `删除请求未获确认${operationError instanceof Error ? `（${operationError.message}）` : ''}，资料状态也暂时无法读取。请只读重试核实，不要重复删除。${cause instanceof Error ? ` ${cause.message}` : ''}`,
      });
      return 'unknown';
    } finally {
      setDeleteVerificationLoading(false);
    }
  }, [addNotification, navigate]);
  useEffect(() => {
    void load();
    return () => {
      loadSequenceRef.current += 1;
      auditSequenceRef.current += 1;
    };
  }, [load]);
  useEffect(() => { setEditOpen(false); }, [actorId]);
  useEffect(() => {
    if (!actorId || !Number.isSafeInteger(Number(actorId)) || Number(actorId) <= 0) {
      setPendingUpdateRecovery(null);
      setUnreadableUpdateRecovery(false);
      return;
    }
    const result = readResourceUpdateRecovery(Number(actorId));
    setPendingUpdateRecovery(result.state === 'valid' ? { actorId: Number(actorId), recovery: result.recovery } : null);
    setUnreadableUpdateRecovery(result.state === 'invalid' || result.state === 'unavailable');
  }, [actorId, editOpen, id, state]);
  useEffect(() => {
    if (!canUpdate) setEditOpen(false);
  }, [canUpdate]);
  useEffect(() => {
    if (!resource || resource.id !== id || !actorId || !canUpdate) return;
    const result = readResourceUpdateRecovery(Number(actorId));
    if (result.state !== 'valid') return;
    const marker = result.recovery;
    if (marker.resourceId !== resource.id) {
      const markerKey = `${marker.actorId}:${marker.resourceId}:${marker.requestId}`;
      if (recoveryRouteRef.current === markerKey) return;
      recoveryRouteRef.current = markerKey;
      navigate(`/asset-center/resources/${marker.resourceId}?library_type=${encodeURIComponent(marker.libraryType)}`, { replace: true });
      return;
    }
    recoveryRouteRef.current = null;
    setEditOpen(true);
  }, [actorId, canUpdate, id, navigate, resource]);
  useEffect(() => {
    if (!resource || resource.id !== id) return;
    const params = new URLSearchParams(location.search);
    if (params.get('library_type') === resource.library_type) return;
    params.set('library_type', resource.library_type);
    navigate(`${location.pathname}?${params.toString()}`, { replace: true, state: location.state });
  }, [id, location.pathname, location.search, location.state, navigate, resource]);
  const handleDelete = async () => {
    if (!resource || resource.status === 'deleted' || deleteVerification || deleteLockRef.current) return;
    deleteLockRef.current = true;
    setDeleting(true);
    setDeleteNotice(null);
    try {
      await deleteResourceCenterResource(resource.id);
      setConfirmDelete(false);
      addNotification({ title: '删除成功', message: `资料「${resource.title}」已删除`, type: 'success' });
      navigate(getResourceLibraryPath(resource.library_type));
    } catch (cause) {
      setConfirmDelete(false);
      await verifyDeleteStatus({ id: resource.id, title: resource.title, library_type: resource.library_type }, cause);
    } finally {
      deleteLockRef.current = false;
      setDeleting(false);
    }
  };
  if (state === 'loading' || (resource && resource.id !== id)) return <LoadingState type="page" />;
  if (state === 'error' || !resource) return <PageShell>
    {confirmedCreatedTitle ? <div role="alert" className="mb-4 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast">服务端已确认资料「{confirmedCreatedTitle}」创建成功，但详情暂时无法读取；请重新加载详情，不要重复创建。</div> : null}
    {pendingUpdateRecovery?.actorId === Number(actorId) ? <div role="alert" className="mb-4 flex flex-col gap-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between"><span>资料「{pendingUpdateRecovery.recovery.resourceId}」仍有一次更新结果待核实。详情当前无法读取；请先打开目标资料并只读核实，不要重复保存。</span><ActionButton type="button" variant="secondary" onClick={() => pendingUpdateRecovery.recovery.resourceId === id ? void load() : navigate(`/asset-center/resources/${pendingUpdateRecovery.recovery.resourceId}?library_type=${encodeURIComponent(pendingUpdateRecovery.recovery.libraryType)}`, { replace: true })}>{pendingUpdateRecovery.recovery.resourceId === id ? '重新读取详情' : '打开待核实资料'}</ActionButton></div> : null}
    {unreadableUpdateRecovery ? <div role="alert" className="mb-4 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast">本机资料更新恢复信息暂时无法读取。请勿重复提交编辑；恢复存储可用后先核实待处理结果。</div> : null}
    <ErrorState title="资料详情暂时无法读取" description={`${loadError || '读取请求暂时失败'}。${confirmedCreatedTitle ? '请重新加载详情；资料已创建，不要重复创建。' : '请重新加载详情后重试。'}`} actionText="重新加载详情" onRetry={() => void load()} />
  </PageShell>;
  return <PageShell>
    <PageHeader title={resource.title} actions={<><Link aria-label="返回所属资料库" to={getResourceLibraryPath(resource.library_type)} className="rounded-button border border-studio-border-soft p-2.5 text-studio-text-secondary"><ArrowLeft className="h-4 w-4" /></Link>{hasPermission('resource:update') ? <><ActionButton type="button" disabled title="真实文件存储与上传流程尚未接入"><Upload className="mr-2 inline h-4 w-4" />上传文件（暂未开放）</ActionButton>{resource.status !== 'deleted' ? <ActionButton type="button" disabled={Boolean(deleteVerification)} onClick={() => setEditOpen(true)}><Pencil className="mr-2 inline h-4 w-4" />编辑</ActionButton> : null}</> : null}{hasPermission('resource:delete') && resource.status !== 'deleted' ? <ActionButton type="button" variant="danger" disabled={Boolean(deleteVerification)} onClick={() => setConfirmDelete(true)}><Trash2 className="mr-2 inline h-4 w-4" />删除</ActionButton> : null}</>} />
    {confirmedCreatedTitle ? <p role="status" className="text-sm text-studio-success-contrast">资料「{confirmedCreatedTitle}」已创建。</p> : null}
    {resource.status === 'deleted' ? <div role="status" className="my-4 rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-3 text-sm text-studio-text-secondary">{resourceStatusLabel(resource.status)}，此资料仅供查看，不能再次编辑或删除。</div> : null}
    {deleteVerification ? <div role="alert" className="my-4 flex flex-col gap-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between"><span>{deleteVerification.message}</span><ActionButton type="button" variant="secondary" disabled={deleteVerificationLoading} onClick={() => void verifyDeleteStatus(deleteVerification.resource)}>{deleteVerificationLoading ? '正在核实…' : '只读核实资料状态'}</ActionButton></div> : null}
    {deleteNotice ? <div role="status" className="my-4 rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-3 text-sm text-studio-text-secondary">{deleteNotice}</div> : null}
    {resourceRefreshError ? <div role="alert" className="my-4 flex flex-col gap-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between"><span>{resourceRefreshError}</span><ActionButton type="button" onClick={() => void refreshResourceAfterUpdate()}>只重试读取详情</ActionButton></div> : null}
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4"><GlassPanel className="p-5"><div className="grid gap-4 text-sm sm:grid-cols-2"><div><span className="text-studio-text-muted">分类</span><p className="mt-1 text-studio-text-primary">{resource.category?.name || '—'}</p></div><div><span className="text-studio-text-muted">更新时间</span><p className="mt-1 text-studio-text-primary">{formatBeijingTime(resource.updated_at)}</p></div><div><span className="text-studio-text-muted">可见范围</span><p className="mt-1 text-studio-text-primary">{resourceVisibilityLabel(resource.visibility)}</p></div><div><span className="text-studio-text-muted">状态</span><p className="mt-1 text-studio-text-primary">{resourceStatusLabel(resource.status)}</p></div></div>{resource.summary ? <p className="mt-5 border-t border-studio-border-soft pt-5 text-sm leading-7 text-studio-text-secondary">{resource.summary}</p> : null}</GlassPanel>{legacyArchive.kind === 'archive' ? <LegacyPublishedArchiveSnapshotView snapshot={legacyArchive.snapshot} /> : legacyArchive.kind === 'invalid' ? <InvalidLegacyPublishedArchiveNotice /> : <GlassPanel className="p-5"><h2 className="mb-4 font-semibold text-studio-text-primary">正文</h2><div className="max-h-[70vh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7 text-studio-text-secondary">{resource.content_text || '—'}</div></GlassPanel>}</div>
      <div className="space-y-4"><GlassPanel className="p-5"><h2 className="font-semibold text-studio-text-primary">标签</h2><div className="mt-3 flex flex-wrap gap-2">{resource.tags.length ? resource.tags.map((tag) => <span key={tag.id} className="rounded-button bg-studio-surface-elevated px-2.5 py-1 text-xs text-studio-text-secondary">{tag.name}</span>) : <span className="text-sm text-studio-text-muted">—</span>}</div></GlassPanel><GlassPanel className="p-5"><h2 className="font-semibold text-studio-text-primary">文件</h2><div className="mt-3 space-y-2">{resource.files.length ? resource.files.map((file) => <div key={file.id} className="flex items-center gap-2 rounded-button bg-studio-surface-soft p-3 text-sm text-studio-text-secondary"><File className="h-4 w-4" /><span className="truncate">{file.original_name}</span></div>) : <span className="text-sm text-studio-text-muted">—</span>}</div></GlassPanel><GlassPanel className="p-5"><h2 className="font-semibold text-studio-text-primary">关联内容</h2><div className="mt-3 space-y-2 text-sm text-studio-text-secondary">{resource.relations.length ? resource.relations.map((relation) => <div key={relation.id}>{relation.target_type} · {relation.target_id}</div>) : '—'}</div></GlassPanel><GlassPanel className="p-5"><h2 className="font-semibold text-studio-text-primary">审计记录</h2>{auditState === 'loading' ? <p role="status" className="mt-3 text-sm text-studio-text-muted">正在加载审计记录…</p> : auditState === 'error' ? <div role="alert" className="mt-3 space-y-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 p-3 text-sm text-studio-amber-contrast"><p>审计记录暂时无法读取，详情仍可正常查看；记录可能不完整。{auditError ? ` ${auditError}` : ''}</p><ActionButton type="button" variant="secondary" onClick={() => void loadAudit()}>重新加载审计记录</ActionButton></div> : <div className="mt-3 space-y-2 text-sm text-studio-text-secondary">{audit.length ? audit.slice(0, 8).map((item) => <div key={item.id} className="flex justify-between gap-2"><span>{item.action}</span><span>{formatBeijingDate(item.created_at)}</span></div>) : resource.audit_summary?.total ? <div className="flex justify-between"><span>{resource.audit_summary.last_action || '记录'}</span><span>{resource.audit_summary.total}</span></div> : '—'}</div>}</GlassPanel></div>
    </div>
    <ResourceEditModal open={editOpen} resource={resource} onClose={() => setEditOpen(false)} onUpdated={handleResourceUpdated} onRecovered={handleRecoveredResourceUpdate} />
    <ConfirmModal open={confirmDelete} title="删除资料" description={resource.title} variant="danger" confirmText="删除" loading={deleting || deleteVerificationLoading} onCancel={() => setConfirmDelete(false)} onConfirm={handleDelete} />
  </PageShell>;
}
