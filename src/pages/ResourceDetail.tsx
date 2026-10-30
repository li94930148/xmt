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
import { getUserFacingErrorMessage } from '@/lib/userFacingError';
import { getResourceLibraryPath } from '@/platform/resource-navigation';
import { useAppStore, useAuthStore } from '@/store';
import { readResourceUpdateRecovery, type ResourceUpdateRecovery } from '@/utils/resourceUpdateRecovery';
import {
  clearResourceDeleteRecovery,
  createResourceDeleteRequestId,
  persistResourceDeleteRecovery,
  readResourceDeleteRecovery,
  type ResourceDeleteRecovery,
} from '@/utils/resourceDeleteRecovery';
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
  const [deleteRecoveryState, setDeleteRecoveryState] = useState<'loading' | 'ready' | 'pending' | 'blocked'>('loading');
  const [deleteRecoveryError, setDeleteRecoveryError] = useState('');
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [resourceRefreshError, setResourceRefreshError] = useState<string | null>(null);
  const deleteLockRef = useRef(false);
  const deleteRecoveryRef = useRef<ResourceDeleteRecovery | null>(null);
  const loadSequenceRef = useRef(0);
  const recoveryRouteRef = useRef<string | null>(null);
  const detailRefreshSequenceRef = useRef(0);
  const auditSequenceRef = useRef(0);
  useEffect(() => {
    setDeleteNotice(null);
    setConfirmDelete(false);
  }, [id]);
  const addNotification = useAppStore((store) => store.addNotification);
  const actorId = useAuthStore((store) => store.user?.id);
  const { hasPermission } = usePermission();
  const canAudit = hasPermission('resource:audit');
  const canUpdate = hasPermission('resource:update');
  const canViewProduction = hasPermission('production:view');
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
      setAuditError(getUserFacingErrorMessage(cause, '审计记录暂时无法读取，请检查连接后重试。'));
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
      setLoadError(getUserFacingErrorMessage(cause, '资料详情暂时无法读取，请检查连接后重试。'));
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
  const verifyDeleteStatus = useCallback(async (
    target: Pick<ResourceDetailData, 'id' | 'title' | 'library_type'>,
    operationError?: unknown,
    recovery: ResourceDeleteRecovery | null = deleteRecoveryRef.current,
  ) => {
    if (!recovery || recovery.actorId !== Number(actorId) || recovery.resourceId !== target.id) {
      setDeleteRecoveryState('blocked');
      setDeleteRecoveryError('资料删除恢复信息与当前账号或资料不匹配；删除操作保持锁定。');
      return 'unknown';
    }
    setDeleteVerificationLoading(true);
    setDeleteVerification({ resource: target, message: '正在只读核实资料状态；请勿重复删除。' });
    try {
      const current = await getResourceCenterResource(target.id);
      if (Number(useAuthStore.getState().user?.id) !== recovery.actorId) return 'stale';
      if (current.id !== recovery.resourceId || current.library_type !== recovery.libraryType) throw new Error('资料详情与待核实的删除记录不匹配。');
      if (currentResourceIdRef.current === target.id) setResource(current);
      if (current.status === 'deleted') {
        if (!clearResourceDeleteRecovery(recovery)) {
          setDeleteRecoveryState('pending');
          setDeleteVerification({ resource: target, message: `服务器确认资料「${target.title}」已移入回收站，但本机恢复标记未能清除。请重试只读核实；标记清除前，资料删除保持锁定。` });
          return 'blocked';
        }
        deleteRecoveryRef.current = null;
        setDeleteRecoveryState('ready');
        setDeleteRecoveryError('');
        setDeleteVerification(null);
        addNotification({ title: '删除状态已核实', message: `资料「${target.title}」已移入回收站`, type: 'success' });
        navigate(getResourceLibraryPath(target.library_type));
        return 'deleted';
      } else {
        if (!clearResourceDeleteRecovery(recovery)) {
          setDeleteRecoveryState('pending');
          setDeleteVerification({ resource: target, message: `资料「${target.title}」当前仍未移入回收站，但本机恢复标记未能清除。请重试只读核实；标记清除前，资料删除保持锁定。` });
          return 'blocked';
        }
        deleteRecoveryRef.current = null;
        setDeleteRecoveryState('ready');
        setDeleteRecoveryError('');
        setDeleteVerification(null);
        const operationMessage = operationError === undefined
          ? ''
          : ` ${getUserFacingErrorMessage(operationError, '删除请求未获服务器确认。')}`;
        setDeleteNotice(`已只读核实资料「${target.title}」仍未移入回收站，可以安全地重新确认删除。${operationMessage}`);
        return 'active';
      }
    } catch (cause) {
      if (Number(useAuthStore.getState().user?.id) !== recovery.actorId) return 'stale';
      setDeleteRecoveryState('pending');
      const operationMessage = operationError === undefined
        ? '删除请求状态仍未明确'
        : getUserFacingErrorMessage(operationError, '删除请求未获服务器确认');
      const verificationMessage = getUserFacingErrorMessage(cause, '资料状态暂时无法读取，请检查连接后只读重试。');
      setDeleteVerification({
        resource: target,
        message: `${operationMessage}；${verificationMessage}请只读重试核实，不要重复删除。`,
      });
      return 'unknown';
    } finally {
      setDeleteVerificationLoading(false);
    }
  }, [actorId, addNotification, navigate]);
  useEffect(() => {
    void load();
    return () => {
      loadSequenceRef.current += 1;
      auditSequenceRef.current += 1;
    };
  }, [load]);
  const reloadDeleteRecovery = useCallback(() => {
    const currentActorId = Number(actorId);
    if (!Number.isSafeInteger(currentActorId) || currentActorId <= 0) {
      deleteRecoveryRef.current = null;
      setDeleteRecoveryState('blocked');
      setDeleteRecoveryError('当前账号信息不可用，无法安全读取资料删除恢复状态；删除操作保持锁定。');
      return;
    }
    const stored = readResourceDeleteRecovery(currentActorId);
    if (stored.state === 'invalid' || stored.state === 'unavailable') {
      deleteRecoveryRef.current = null;
      setDeleteRecoveryState('blocked');
      setDeleteRecoveryError(stored.state === 'invalid'
        ? '本机存在无法识别的资料删除恢复信息。为避免覆盖未知结果，删除操作保持锁定。'
        : '当前浏览器无法安全读取资料删除恢复信息；恢复状态可读取前，删除操作保持锁定。');
      return;
    }
    if (stored.state === 'none') {
      deleteRecoveryRef.current = null;
      setDeleteRecoveryState('ready');
      setDeleteRecoveryError('');
      setDeleteVerification(null);
      return;
    }
    deleteRecoveryRef.current = stored.recovery;
    setDeleteRecoveryState('pending');
    setDeleteRecoveryError('');
    void verifyDeleteStatus({
      id: stored.recovery.resourceId,
      title: `资料 #${stored.recovery.resourceId}`,
      library_type: stored.recovery.libraryType,
    }, undefined, stored.recovery);
  }, [actorId, verifyDeleteStatus]);
  useEffect(() => {
    setDeleteRecoveryState('loading');
    setDeleteRecoveryError('');
    deleteRecoveryRef.current = null;
    reloadDeleteRecovery();
  }, [actorId, reloadDeleteRecovery]);
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
    if (!resource || resource.status === 'deleted' || deleteVerification || deleteRecoveryState !== 'ready' || deleteLockRef.current) return;
    const currentActorId = Number(actorId);
    if (!Number.isSafeInteger(currentActorId) || currentActorId <= 0) return;
    deleteLockRef.current = true;
    setDeleting(true);
    setDeleteNotice(null);
    let recovery: ResourceDeleteRecovery | null = null;
    let requestSent = false;
    try {
      recovery = {
        version: 1,
        actorId: currentActorId,
        resourceId: resource.id,
        libraryType: resource.library_type,
        requestId: createResourceDeleteRequestId(),
      };
      persistResourceDeleteRecovery(recovery);
      deleteRecoveryRef.current = recovery;
      setDeleteRecoveryState('pending');
      setDeleteVerification({ resource, message: '删除请求已发送；若连接中断，将只读核实，不会自动重复发送。' });
      requestSent = true;
      await deleteResourceCenterResource(resource.id);
      setConfirmDelete(false);
      addNotification({ title: '删除成功', message: `资料「${resource.title}」已删除`, type: 'success' });
      if (clearResourceDeleteRecovery(recovery)) {
        deleteRecoveryRef.current = null;
        setDeleteRecoveryState('ready');
        setDeleteVerification(null);
        navigate(getResourceLibraryPath(resource.library_type));
      } else {
        await verifyDeleteStatus(resource, undefined, recovery);
      }
    } catch (cause) {
      setConfirmDelete(false);
      if (requestSent && recovery) {
        await verifyDeleteStatus({ id: resource.id, title: resource.title, library_type: resource.library_type }, cause, recovery);
      } else {
        const stored = readResourceDeleteRecovery(currentActorId);
        if (stored.state === 'valid') {
          deleteRecoveryRef.current = stored.recovery;
          setDeleteRecoveryState('pending');
          await verifyDeleteStatus({
            id: stored.recovery.resourceId,
            title: `资料 #${stored.recovery.resourceId}`,
            library_type: stored.recovery.libraryType,
          }, cause, stored.recovery);
        } else if (stored.state === 'none') {
          setDeleteRecoveryState('ready');
          setDeleteVerification(null);
          setDeleteNotice(`未能安全保存删除恢复信息，本次未发送删除请求。${getUserFacingErrorMessage(cause, '请检查连接后重试。')}`);
        } else {
          setDeleteRecoveryState('blocked');
          setDeleteRecoveryError('本机删除恢复信息暂时无法安全读取；本次未发送删除请求，资料删除保持锁定。');
        }
      }
    } finally {
      deleteLockRef.current = false;
      setDeleting(false);
    }
  };
  if (state === 'loading' || (resource && resource.id !== id)) return <LoadingState type="page" />;
  if (state === 'error' || !resource) return <PageShell>
    {confirmedCreatedTitle ? <div role="alert" className="mb-4 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast">服务端已确认资料「{confirmedCreatedTitle}」创建成功，但详情暂时无法读取；请重新加载详情，不要重复创建。</div> : null}
    {deleteRecoveryState === 'blocked' ? <div role="alert" className="mb-4 flex flex-col gap-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between"><span>{deleteRecoveryError || '资料删除恢复状态不可用；删除操作保持锁定。'}</span><ActionButton type="button" variant="secondary" onClick={reloadDeleteRecovery}>重新读取恢复信息</ActionButton></div> : null}
    {deleteVerification ? <div role="alert" className="mb-4 flex flex-col gap-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between"><span>{deleteVerification.message}</span><ActionButton type="button" variant="secondary" disabled={deleteVerificationLoading} onClick={() => void verifyDeleteStatus(deleteVerification.resource)}>{deleteVerificationLoading ? '正在核实…' : '只读核实资料状态'}</ActionButton></div> : null}
    {pendingUpdateRecovery?.actorId === Number(actorId) ? <div role="alert" className="mb-4 flex flex-col gap-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between"><span>资料「{pendingUpdateRecovery.recovery.resourceId}」仍有一次更新结果待核实。详情当前无法读取；请先打开目标资料并只读核实，不要重复保存。</span><ActionButton type="button" variant="secondary" onClick={() => pendingUpdateRecovery.recovery.resourceId === id ? void load() : navigate(`/asset-center/resources/${pendingUpdateRecovery.recovery.resourceId}?library_type=${encodeURIComponent(pendingUpdateRecovery.recovery.libraryType)}`, { replace: true })}>{pendingUpdateRecovery.recovery.resourceId === id ? '重新读取详情' : '打开待核实资料'}</ActionButton></div> : null}
    {unreadableUpdateRecovery ? <div role="alert" className="mb-4 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast">本机资料更新恢复信息暂时无法读取。请勿重复提交编辑；恢复存储可用后先核实待处理结果。</div> : null}
    <ErrorState title="资料详情暂时无法读取" description={`${loadError || '读取请求暂时失败'}。${confirmedCreatedTitle ? '请重新加载详情；资料已创建，不要重复创建。' : '请重新加载详情后重试。'}`} actionText="重新加载详情" onRetry={() => void load()} />
  </PageShell>;
  return <PageShell>
    <PageHeader title={resource.title} actions={<><Link aria-label="返回所属资料库" to={getResourceLibraryPath(resource.library_type)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-studio-border-soft p-0 text-studio-text-secondary transition-colors hover:bg-studio-surface-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-studio-primary"><ArrowLeft className="h-4 w-4" /></Link>{hasPermission('resource:update') ? <><ActionButton type="button" disabled title="真实文件存储与上传流程尚未接入"><Upload className="mr-2 inline h-4 w-4" />上传文件（暂未开放）</ActionButton>{resource.status !== 'deleted' ? <ActionButton type="button" disabled={Boolean(deleteVerification) || deleteRecoveryState !== 'ready'} onClick={() => setEditOpen(true)}><Pencil className="mr-2 inline h-4 w-4" />编辑</ActionButton> : null}</> : null}{hasPermission('resource:delete') && resource.status !== 'deleted' ? <ActionButton type="button" variant="danger" disabled={Boolean(deleteVerification) || deleteRecoveryState !== 'ready'} onClick={() => setConfirmDelete(true)}><Trash2 className="mr-2 inline h-4 w-4" />删除</ActionButton> : null}</>} />
    {confirmedCreatedTitle ? <p role="status" className="text-sm text-studio-success-contrast">资料「{confirmedCreatedTitle}」已创建。</p> : null}
    {resource.status === 'deleted' ? <div role="status" className="my-4 rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-3 text-sm text-studio-text-secondary">{resourceStatusLabel(resource.status)}，此资料仅供查看，不能再次编辑或删除。</div> : null}
    {deleteRecoveryState === 'blocked' ? <div role="alert" className="my-4 flex flex-col gap-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between"><span>{deleteRecoveryError || '资料删除恢复状态不可用；删除操作保持锁定。'}</span><ActionButton type="button" variant="secondary" onClick={reloadDeleteRecovery}>重新读取恢复信息</ActionButton></div> : null}
    {deleteVerification ? <div role="alert" className="my-4 flex flex-col gap-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between"><span>{deleteVerification.message}</span><ActionButton type="button" variant="secondary" disabled={deleteVerificationLoading} onClick={() => void verifyDeleteStatus(deleteVerification.resource)}>{deleteVerificationLoading ? '正在核实…' : '只读核实资料状态'}</ActionButton></div> : null}
    {deleteNotice ? <div role="status" className="my-4 rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-3 text-sm text-studio-text-secondary">{deleteNotice}</div> : null}
    {resourceRefreshError ? <div role="alert" className="my-4 flex flex-col gap-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between"><span>{resourceRefreshError}</span><ActionButton type="button" onClick={() => void refreshResourceAfterUpdate()}>只重试读取详情</ActionButton></div> : null}
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4"><GlassPanel className="p-5"><div className="grid gap-4 text-sm sm:grid-cols-2"><div><span className="text-studio-text-muted">分类</span><p className="mt-1 text-studio-text-primary">{resource.category?.name || '—'}</p></div><div><span className="text-studio-text-muted">更新时间</span><p className="mt-1 text-studio-text-primary">{formatBeijingTime(resource.updated_at)}</p></div><div><span className="text-studio-text-muted">可见范围</span><p className="mt-1 text-studio-text-primary">{resourceVisibilityLabel(resource.visibility)}</p></div><div><span className="text-studio-text-muted">状态</span><p className="mt-1 text-studio-text-primary">{resourceStatusLabel(resource.status)}</p></div></div>{resource.summary ? <p className="mt-5 border-t border-studio-border-soft pt-5 text-sm leading-7 text-studio-text-secondary">{resource.summary}</p> : null}</GlassPanel>{legacyArchive.kind === 'archive' ? <LegacyPublishedArchiveSnapshotView snapshot={legacyArchive.snapshot} canViewProduction={canViewProduction} /> : legacyArchive.kind === 'invalid' ? <InvalidLegacyPublishedArchiveNotice /> : <GlassPanel className="p-5"><h2 className="mb-4 font-semibold text-studio-text-primary">正文</h2><div className="max-h-[70vh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7 text-studio-text-secondary">{resource.content_text || '—'}</div></GlassPanel>}</div>
      <div className="space-y-4"><GlassPanel className="p-5"><h2 className="font-semibold text-studio-text-primary">标签</h2><div className="mt-3 flex flex-wrap gap-2">{resource.tags.length ? resource.tags.map((tag) => <span key={tag.id} className="rounded-button bg-studio-surface-elevated px-2.5 py-1 text-xs text-studio-text-secondary">{tag.name}</span>) : <span className="text-sm text-studio-text-muted">—</span>}</div></GlassPanel><GlassPanel className="p-5"><h2 className="font-semibold text-studio-text-primary">文件</h2><div className="mt-3 space-y-2">{resource.files.length ? resource.files.map((file) => <div key={file.id} className="flex items-center gap-2 rounded-button bg-studio-surface-soft p-3 text-sm text-studio-text-secondary"><File className="h-4 w-4" /><span className="truncate">{file.original_name}</span></div>) : <span className="text-sm text-studio-text-muted">—</span>}</div></GlassPanel><GlassPanel className="p-5"><h2 className="font-semibold text-studio-text-primary">关联内容</h2><div className="mt-3 space-y-2 text-sm text-studio-text-secondary">{resource.relations.length ? resource.relations.map((relation) => <div key={relation.id}>{relation.target_type} · {relation.target_id}</div>) : '—'}</div></GlassPanel><GlassPanel className="p-5"><h2 className="font-semibold text-studio-text-primary">审计记录</h2>{auditState === 'loading' ? <p role="status" className="mt-3 text-sm text-studio-text-muted">正在加载审计记录…</p> : auditState === 'error' ? <div role="alert" className="mt-3 space-y-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 p-3 text-sm text-studio-amber-contrast"><p>审计记录暂时无法读取，详情仍可正常查看；记录可能不完整。{auditError ? ` ${auditError}` : ''}</p><ActionButton type="button" variant="secondary" onClick={() => void loadAudit()}>重新加载审计记录</ActionButton></div> : <div className="mt-3 space-y-2 text-sm text-studio-text-secondary">{audit.length ? audit.slice(0, 8).map((item) => <div key={item.id} className="flex justify-between gap-2"><span>{item.action}</span><span>{formatBeijingDate(item.created_at)}</span></div>) : resource.audit_summary?.total ? <div className="flex justify-between"><span>{resource.audit_summary.last_action || '记录'}</span><span>{resource.audit_summary.total}</span></div> : '—'}</div>}</GlassPanel></div>
    </div>
    <ResourceEditModal open={editOpen} resource={resource} onClose={() => setEditOpen(false)} onUpdated={handleResourceUpdated} onRecovered={handleRecoveredResourceUpdate} />
    <ConfirmModal open={confirmDelete} title="删除资料" description={resource.title} variant="danger" confirmText="删除" loading={deleting || deleteVerificationLoading || deleteRecoveryState !== 'ready'} onCancel={() => setConfirmDelete(false)} onConfirm={handleDelete} />
  </PageShell>;
}
