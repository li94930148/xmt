import { ArrowLeft, Save, Send } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { createProduction, getProductionById, getProductionHistory, getTopics, updateProduction } from '@/api';
import ContentEditor, { type EditorCommandHandle } from '@/components/ContentEditor';
import ProductionReviewPanel from '@/components/production/ProductionReviewPanel';
import ProductionMaterialHistorySnapshot from '@/components/production/ProductionMaterialHistorySnapshot';
import ProductionOriginPanel from '@/components/production/ProductionOriginPanel';
import { getProductionVersionRoomId } from '@/collaboration/core/events';
import { createProductionEditorAdapter } from '@/editor/adapters/productionEditorAdapter';
import type { ContentEditorRuntimeHandle } from '@/editor/contracts/contentEditorAdapter';
import type { Production, ProductionHistory, Topic } from '@/types';
import { clearSafeDraft, readSafeDraftValue, userSafeDraftKey, writeSafeDraft } from '@/platform/safe-draft';
import { useAuthStore } from '@/store';
import { useNetworkState } from '@/platform/network';
import { usePermission } from '@/hooks/usePermission';
import { isWeb } from '@/platform/runtime';
import AccessDeniedState from '@/components/AccessDeniedState';

export default function MobileProductionEditor() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const requestedVersion = searchParams.get('version')?.trim() || '';
  const userId = useAuthStore((state) => state.user?.id);
  const currentUserId = userId ?? null;
  const navigate = useNavigate();
  const requestedReturnPath = (location.state as { mobileReturnTo?: unknown } | null)?.mobileReturnTo;
  const returnPath = typeof requestedReturnPath === 'string' && (/^\/(?:topics|publishing|shooting)\/\d+$/.test(requestedReturnPath) || requestedReturnPath === '/topics?view=board')
    ? requestedReturnPath
    : '/production/content';
  const [production, setProduction] = useState<Production | null>(null);
  const [historicalVersion, setHistoricalVersion] = useState<ProductionHistory | null>(null);
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [reviewEditorHandle, setReviewEditorHandle] = useState<EditorCommandHandle | null>(null);
  const persistedContentRef = useRef('');
  const runtimeHandleRef = useRef<ContentEditorRuntimeHandle | null>(null);
  const savingRef = useRef(false);
  const loadRequestRef = useRef(0);
  const [loadedRouteRequestKey, setLoadedRouteRequestKey] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const routeRequestKey = `${id ?? 'new'}:${requestedVersion}`;
  const routeDataLoading = loading || loadedRouteRequestKey !== routeRequestKey;
  const routeDataReady = !routeDataLoading && !loadFailed;
  const networkState = useNetworkState();
  const { permissions, loading: permissionsLoading } = usePermission();
  const canView = permissions.includes('*') || permissions.includes('production:view') || permissions.includes('production:update');
  const canEditPermission = permissions.includes('*') || permissions.includes('production:update');
  const isNewProduction = !id || id === 'new';
  const isHistoricalView = Boolean(production && requestedVersion && requestedVersion !== production.version);
  const displayedVersion = historicalVersion?.version || production?.version || 'v1.0';
  const displayedContent = historicalVersion ? historicalVersion.content_markdown ?? historicalVersion.content ?? '' : content;
  const canEdit = canEditPermission && (isNewProduction || production?.can_edit === true) && !isHistoricalView && routeDataReady;
  const draftKey = userSafeDraftKey(userId, `production:${id ?? 'new'}`);

  const load = useCallback(async () => {
    if (permissionsLoading) return;
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setNotice('');
    setLoadFailed(false);
    setHistoricalVersion(null);
    setHistoryUnavailable(false);
    try {
      if (!draftKey) throw new Error('当前账号无法读取本机草稿。');
      if (isNewProduction && !canEditPermission) throw new Error('当前账号没有新建创作稿件的权限。');
      if (id && id !== 'new' && !canView) throw new Error('当前账号没有查看这份创作稿件的权限。');
      if (id && id !== 'new') {
        const [result, topicResult] = await Promise.all([
          getProductionById(Number(id)),
          canEditPermission ? getTopics({ page: 1, limit: 100 }) : Promise.resolve(null),
        ]);
        if (requestId !== loadRequestRef.current) return;
        if (topicResult) setTopics(topicResult.data.filter((topic) => ['approved', 'production'].includes(topic.status)));
        persistedContentRef.current = result.content || '';
        setProduction(result);
        setTopicId(String(result.topic_id));

        if (requestedVersion && requestedVersion !== result.version) {
          if (requestedVersion.length > 64) {
            setHistoryUnavailable(true);
            setNotice(`引用的历史版本 ${requestedVersion.slice(0, 64)} 不可用；未用当前稿替代。`);
            setContent('');
          } else {
            try {
              const historyResult = await getProductionHistory(result.id, 1, 1, true, requestedVersion);
              if (requestId !== loadRequestRef.current) return;
              const exactVersion = historyResult.data.find((entry) => entry.version === requestedVersion);
              if (!exactVersion) {
                setHistoryUnavailable(true);
                setNotice(`引用的历史版本 ${requestedVersion} 不可用；未用当前稿替代。`);
                setContent('');
              } else {
                setHistoricalVersion(exactVersion);
                setContent(exactVersion.content_markdown ?? exactVersion.content ?? '');
              }
            } catch {
              if (requestId !== loadRequestRef.current) return;
              setHistoryUnavailable(true);
              setNotice(`无法读取引用的历史版本 ${requestedVersion}；未用当前稿替代。`);
              setContent('');
            }
          }
        } else {
          setContent(canEditPermission && result.can_edit === true ? (readSafeDraftValue<string>(draftKey) ?? result.content ?? '') : (result.content ?? ''));
        }
      }
      if (isNewProduction) {
        const topicResult = canEditPermission ? await getTopics({ page: 1, limit: 100 }) : null;
        if (requestId !== loadRequestRef.current) return;
        if (topicResult) setTopics(topicResult.data.filter((topic) => ['approved', 'production'].includes(topic.status)));
        setContent(readSafeDraftValue<string>(draftKey) ?? '');
      }
    } catch (error) {
      if (requestId !== loadRequestRef.current) return;
      setLoadFailed(true);
      setNotice(error instanceof Error ? error.message : '加载稿件失败');
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
        setLoadedRouteRequestKey(routeRequestKey);
      }
    }
  }, [canEditPermission, canView, draftKey, id, isNewProduction, permissionsLoading, requestedVersion, routeRequestKey]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (canEdit && draftKey && !loading && content) writeSafeDraft(draftKey, content); }, [canEdit, content, draftKey, loading]);

  const adapter = useMemo(() => production && !isHistoricalView ? createProductionEditorAdapter({ documentId: getProductionVersionRoomId(production.id, production.version), collaborationRoom: getProductionVersionRoomId(production.id, production.version), initialContent: content, readonly: !canEdit, capabilities: { collaboration: canEdit, manualSave: false, immersive: false, pageScroll: true }, persist: async (next) => { if (!canEdit) throw new Error('当前账号没有修改创作稿件的权限'); await updateProduction(production.id, { topic_id: production.topic_id, version: production.version, content: next, expected_content: persistedContentRef.current, status: production.status, version_action: 'none' }); persistedContentRef.current = next; } }) : undefined, [canEdit, content, isHistoricalView, production]);
  const handleRuntimeHandleChange = useCallback((handle: ContentEditorRuntimeHandle | null) => { runtimeHandleRef.current = handle; }, []);
  const handleReviewEditorHandleChange = useCallback((handle: EditorCommandHandle | null) => { setReviewEditorHandle(handle); }, []);
  const flushReviewEditor = useCallback(async () => {
    const handle = runtimeHandleRef.current;
    return handle ? handle.flush({ timeoutMs: 15_000 }) : { status: 'failed' };
  }, []);
  const save = async (submit: boolean) => {
    if (!canEdit || !draftKey) { setNotice('当前账号没有修改创作稿件的权限。'); return; }
    if (!topicId) { setNotice('请先选择关联选题'); return; }
    if (networkState === 'offline') { setNotice('当前离线，正文已保存为本地草稿，恢复网络后再保存。'); return; }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true); setNotice('');
    try {
      if (production) { await updateProduction(production.id, { topic_id: Number(topicId), version: production.version, content, expected_content: persistedContentRef.current, status: submit ? 'review' : production.status, version_action: 'none' }); persistedContentRef.current = content; clearSafeDraft(draftKey); }
      else { const result = await createProduction({ topic_id: Number(topicId), content, status: submit ? 'review' : 'draft' }); clearSafeDraft(draftKey); navigate(`/production/content/${result.productionId}`, { replace: true }); }
      setNotice(submit ? '已提交审核' : '已保存草稿');
    } catch (error) { setNotice(error instanceof Error ? error.message : '保存稿件失败'); } finally { savingRef.current = false; setSaving(false); }
  };
  if (!permissionsLoading && (isNewProduction ? !canEditPermission : !canView)) return <div className="space-y-4"><button type="button" onClick={() => navigate('/production/content')} className="inline-flex min-h-11 items-center gap-2 text-sm text-studio-cyan-contrast"><ArrowLeft className="h-4 w-4" />返回创作</button><AccessDeniedState title="当前账号无法打开这份稿件" description={isNewProduction ? '新建稿件需要创作权限。' : '查看稿件需要相应的创作查看权限。'} /></div>;
  return (
    <div className="space-y-4">
      <button type="button" onClick={() => navigate(returnPath)} className="inline-flex min-h-11 items-center gap-2 text-sm text-studio-cyan-contrast">
        <ArrowLeft className="h-4 w-4" />
        {returnPath.startsWith('/topics/') || returnPath === '/topics?view=board'
          ? '返回选题'
          : returnPath.startsWith('/publishing/')
            ? '返回发布管理'
            : returnPath.startsWith('/shooting/')
              ? '返回成片制作'
              : '返回创作'}
      </button>
      {permissionsLoading ? <p className="text-sm text-studio-text-muted">正在检查访问权限…</p> : null}
      {isHistoricalView && routeDataReady ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-studio-border-soft bg-studio-surface p-3 text-sm">
          <span className="text-studio-text-secondary">历史版本 {displayedVersion} · 只读</span>
          <button type="button" onClick={() => navigate(`/production/${production!.id}`, { state: { mobileReturnTo: returnPath } })} className="min-h-10 rounded-xl border border-studio-border-soft px-3 font-semibold text-studio-cyan-contrast">
            返回当前版本
          </button>
        </div>
      ) : null}
      {canEdit ? (
        <label className="block rounded-2xl border border-studio-border-soft bg-studio-surface p-4">
          <span className="mb-2 block text-sm font-semibold">关联选题</span>
          <select disabled={Boolean(production) || routeDataLoading || saving} value={topicId} onChange={(event) => setTopicId(event.target.value)} className="min-h-11 w-full rounded-xl border border-studio-border-soft bg-studio-bg px-3 text-sm">
            <option value="">请选择选题</option>
            {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
          </select>
        </label>
      ) : null}
      {routeDataLoading ? <p className="text-sm text-studio-text-muted">正在载入稿件…</p> : null}
      {!routeDataLoading && loadFailed ? (
        <div className="space-y-3">
          <p role="alert" className="rounded-2xl border border-studio-coral/30 bg-studio-coral-soft p-4 text-sm text-studio-coral-contrast">
            {notice || '加载稿件失败；正文暂不可用。'}
          </p>
          <button type="button" disabled={loading} onClick={() => void load()} className="xmt-btn xmt-btn-secondary inline-flex min-h-10 items-center px-4 disabled:opacity-50">
            {loading ? '正在重新加载…' : '重试加载'}
          </button>
        </div>
      ) : null}
      {!routeDataLoading && !loadFailed && historyUnavailable && isHistoricalView ? (
        <p role="alert" className="rounded-2xl border border-studio-coral/30 bg-studio-coral-soft p-4 text-sm text-studio-coral-contrast">
          {notice || `引用的历史版本 ${requestedVersion} 不可用；未用当前稿替代。`}
        </p>
      ) : null}
      {!routeDataLoading && !loadFailed && !(historyUnavailable && isHistoricalView) ? (
        <section className="overflow-visible rounded-2xl border border-studio-border-soft bg-studio-surface">
          {!canEdit ? <p className="border-b border-studio-border-soft px-4 py-3 text-sm text-studio-text-muted">只读模式：当前账号仅可查看。</p> : null}
          <ContentEditor
            key={historicalVersion ? `production-${production?.id}-history-${historicalVersion.id}` : production ? `production-${production.id}-current-${production.version}` : `new-${topicId}`}
            value={displayedContent}
            onChange={canEdit && !saving ? setContent : undefined}
            readOnly={!canEdit || saving}
            placeholder="开始编写正文…"
            collaborationKey={canEdit && production && !isHistoricalView ? getProductionVersionRoomId(production.id, production.version) : undefined}
            collaborationEnabled={canEdit && Boolean(production) && !isHistoricalView}
            adapter={adapter}
            toolbarVariant="basic"
            className="mobile-editor"
            onRuntimeHandleChange={handleRuntimeHandleChange}
            onEditorCommandHandleChange={handleReviewEditorHandleChange}
          />
        </section>
      ) : null}
      {production && routeDataReady ? (
        <ProductionOriginPanel sourceType={production.origin_source_type} sourceSnapshot={production.origin_source_content_snapshot} sourceOutlineVersion={production.origin_source_outline_version} sourceTopicId={production.topic_id} />
      ) : null}
      {isWeb() && historicalVersion && routeDataReady ? (
        <ProductionMaterialHistorySnapshot
          version={displayedVersion}
          snapshotHtml={historicalVersion.material_draft_snapshot_html}
        />
      ) : null}
      {production && routeDataReady ? (
        <ProductionReviewPanel
          productionId={production.id}
          version={displayedVersion}
          currentVersion={!isHistoricalView}
          canComment={permissions.includes('*') || permissions.includes('workflow:comment')}
          canAccept={canEdit && !isHistoricalView}
          canModerate={permissions.includes('*') || permissions.includes('comment:delete')}
          currentUserId={currentUserId}
          editorHandle={reviewEditorHandle}
          flushEditor={flushReviewEditor}
          onNotice={(title, message) => setNotice(`${title}：${message}`)}
        />
      ) : null}
      {notice && routeDataReady && !historyUnavailable ? <p role="status" className="text-sm text-studio-text-secondary">{notice}</p> : null}
      {canEdit ? (
        <div className="sticky z-sticky -mx-1 grid grid-cols-2 gap-3 bg-studio-bg px-1 py-2" style={{ bottom: 'var(--xmt-keyboard-height, 0px)' }}>
          <button type="button" disabled={routeDataLoading || saving} onClick={() => void save(false)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-studio-border-soft text-sm font-semibold disabled:opacity-50">
            <Save className="h-4 w-4" />保存草稿
          </button>
          <button type="button" disabled={routeDataLoading || saving} onClick={() => void save(true)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-studio-primary-button text-sm font-semibold text-white disabled:opacity-50">
            <Send className="h-4 w-4" />提交审核
          </button>
        </div>
      ) : null}
    </div>
  );
}
