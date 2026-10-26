import { ArrowLeft, Check, Save, Send } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { createProduction, getProductionById, getProductionCreateStatus, getProductionHistory, getTopics, updateProduction } from '@/api';
import ContentEditor, { type EditorCommandHandle } from '@/components/ContentEditor';
import ProductionReviewPanel from '@/components/production/ProductionReviewPanel';
import ProductionMaterialHistorySnapshot from '@/components/production/ProductionMaterialHistorySnapshot';
import ProductionOriginPanel from '@/components/production/ProductionOriginPanel';
import { productionStatusLabel } from '@/components/production/productionStatusLabel';
import { ActionButton } from '@/components/studio';
import { getProductionVersionRoomId } from '@/collaboration/core/events';
import { createProductionEditorAdapter } from '@/editor/adapters/productionEditorAdapter';
import type { ContentEditorRuntimeHandle } from '@/editor/contracts/contentEditorAdapter';
import type { Production, ProductionHistory, Topic } from '@/types';
import { clearSafeDraft, readSafeDraftValue, userSafeDraftKey, writeSafeDraft } from '@/platform/safe-draft';
import { useAuthStore } from '@/store';
import { useNetworkState } from '@/platform/network';
import { usePermission } from '@/hooks/usePermission';
import { useRouteNavigationGuard, type RouteNavigationAttempt } from '@/hooks/useRouteNavigationGuard';
import { isWeb } from '@/platform/runtime';
import AccessDeniedState from '@/components/AccessDeniedState';
import {
  persistMobileProductionWriteRecovery,
  readMobileProductionWriteRecovery,
  removeMobileProductionWriteRecovery,
  type MobileProductionWriteOperation,
  type MobileProductionWriteRecovery,
} from './mobileProductionRecovery';

const PRODUCTION_CREATE_REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MobileProductionCreateRecovery = {
  version: 1;
  userId: number;
  clientRequestId: string;
  topicId: number;
  targetStatus: 'draft' | 'review';
  contentFingerprint: string;
  phase: 'uncertain' | 'ready' | 'checking';
  readError: string | null;
};

function mobileProductionCreateRecoveryKey(userId: number | null | undefined) {
  return userSafeDraftKey(userId, 'production:create-recovery');
}

function readMobileProductionCreateRecovery(userId: number | null | undefined): MobileProductionCreateRecovery | 'invalid' | null {
  const key = mobileProductionCreateRecoveryKey(userId);
  if (!key || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<MobileProductionCreateRecovery>;
    if (value.version !== 1 || value.userId !== userId
      || typeof value.clientRequestId !== 'string' || !PRODUCTION_CREATE_REQUEST_ID.test(value.clientRequestId)
      || !Number.isSafeInteger(value.topicId) || Number(value.topicId) <= 0
      || !['draft', 'review'].includes(String(value.targetStatus))
      || typeof value.contentFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.contentFingerprint)) return 'invalid';
    return {
      version: 1,
      userId: Number(value.userId),
      clientRequestId: value.clientRequestId,
      topicId: Number(value.topicId),
      targetStatus: value.targetStatus as 'draft' | 'review',
      contentFingerprint: value.contentFingerprint,
      // A reload always starts with a read-only server check.
      phase: 'uncertain',
      readError: null,
    };
  } catch {
    return 'invalid';
  }
}

function persistMobileProductionCreateRecovery(recovery: MobileProductionCreateRecovery) {
  const key = mobileProductionCreateRecoveryKey(recovery.userId);
  if (!key || typeof window === 'undefined') throw new Error('当前账号尚未确认，无法安全保存创作恢复状态。');
  try {
    window.sessionStorage.setItem(key, JSON.stringify(recovery));
    const stored = readMobileProductionCreateRecovery(recovery.userId);
    if (!stored || stored === 'invalid' || stored.clientRequestId !== recovery.clientRequestId
      || stored.topicId !== recovery.topicId || stored.targetStatus !== recovery.targetStatus
      || stored.contentFingerprint !== recovery.contentFingerprint) {
      throw new Error('创作恢复状态未能完整保存。');
    }
  } catch (error) {
    throw new Error(`本次创作请求未发送：${error instanceof Error ? error.message : '浏览器无法保存恢复状态'}`);
  }
}

function removeMobileProductionCreateRecovery(userId: number, clientRequestId: string) {
  const key = mobileProductionCreateRecoveryKey(userId);
  if (!key || typeof window === 'undefined') return;
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(key) || 'null') as { clientRequestId?: unknown } | null;
    if (stored?.clientRequestId === clientRequestId) window.sessionStorage.removeItem(key);
  } catch {
    // Keeping a stale marker is safe: revisiting the new-draft route only performs a read-only status check.
  }
}

async function fingerprintMobileProductionContent(content: string) {
  if (!globalThis.crypto?.subtle || typeof TextEncoder === 'undefined') {
    throw new Error('当前浏览器不支持安全的正文核实，本次创作请求未发送。');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isDefinitiveMobileProductionCreateRejection(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && ![404, 408, 409, 425, 429].includes(status);
}

export default function MobileProductionEditor() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const requestedVersion = searchParams.get('version')?.trim() || '';
  const reviewTaskRequested = searchParams.get('action') === 'review';
  const userId = useAuthStore((state) => state.user?.id);
  const currentUserId = userId ?? null;
  const navigate = useNavigate();
  const locationState = location.state as { mobileReturnTo?: unknown; mobileCreateDraftKey?: unknown } | null;
  const requestedReturnPath = locationState?.mobileReturnTo;
  const returnPath = typeof requestedReturnPath === 'string' && (/^\/(?:topics|publishing|shooting)\/\d+$/.test(requestedReturnPath) || requestedReturnPath === '/topics?view=board')
    ? requestedReturnPath
    : reviewTaskRequested ? '/' : '/production/content';
  const [production, setProduction] = useState<Production | null>(null);
  const [historicalVersion, setHistoricalVersion] = useState<ProductionHistory | null>(null);
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [pendingCreateRecovery, setPendingCreateRecovery] = useState<MobileProductionCreateRecovery | null>(null);
  const [createRecoveryInvalid, setCreateRecoveryInvalid] = useState(false);
  const [pendingWriteRecovery, setPendingWriteRecovery] = useState<MobileProductionWriteRecovery | null>(null);
  const [writeRecoveryInvalid, setWriteRecoveryInvalid] = useState(false);
  const [reviewSuggestionAccepting, setReviewSuggestionAccepting] = useState(false);
  const [notice, setNotice] = useState('');
  const [reviewEditorHandle, setReviewEditorHandle] = useState<EditorCommandHandle | null>(null);
  const persistedContentRef = useRef('');
  const allowRouteTransitionRef = useRef(false);
  const runtimeHandleRef = useRef<ContentEditorRuntimeHandle | null>(null);
  const savingRef = useRef(false);
  const skipSafeDraftWriteRef = useRef(false);
  const pendingCreateRecoveryRef = useRef<MobileProductionCreateRecovery | null>(null);
  const createRecoveryInvalidRef = useRef(false);
  const createRecoveryLockRef = useRef(false);
  const autoVerifyCreateRecoveryRef = useRef(false);
  const pendingWriteRecoveryRef = useRef<MobileProductionWriteRecovery | null>(null);
  const writeRecoveryInvalidRef = useRef(false);
  const writeRecoveryLockRef = useRef(false);
  const autoCheckedWriteRecoveryKeyRef = useRef<string | null>(null);
  const reviewSuggestionLockRef = useRef(false);
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
  const reviewTaskUnavailable = Boolean(reviewTaskRequested && production && routeDataReady && !isHistoricalView && production.status !== 'review');
  const displayedVersion = historicalVersion?.version || production?.version || 'v1.0';
  const displayedContent = historicalVersion ? historicalVersion.content_markdown ?? historicalVersion.content ?? '' : content;
  const visibleCreateRecovery = isNewProduction && pendingCreateRecovery && pendingCreateRecovery.userId === userId
    ? pendingCreateRecovery
    : null;
  const visibleWriteRecovery = !isNewProduction && pendingWriteRecovery && pendingWriteRecovery.userId === userId
    && pendingWriteRecovery.productionId === Number(id)
    ? pendingWriteRecovery
    : null;
  const completedCreateDraftKey = locationState?.mobileCreateDraftKey;
  const createRecoveryLocked = Boolean(isNewProduction && (visibleCreateRecovery || createRecoveryInvalid));
  const writeRecoveryLocked = Boolean(!isNewProduction && (visibleWriteRecovery || writeRecoveryInvalid));
  const canEdit = canEditPermission && (isNewProduction || production?.can_edit === true) && !isHistoricalView && !reviewTaskUnavailable && routeDataReady && !createRecoveryLocked && !writeRecoveryLocked;
  const hasUnsavedChanges = Boolean(canEdit && (saving || reviewSuggestionAccepting || (production ? content !== persistedContentRef.current : Boolean(topicId || content))));
  const draftKey = userSafeDraftKey(userId, `production:${id ?? 'new'}`);

  const updatePendingCreateRecovery = useCallback((recovery: MobileProductionCreateRecovery | null) => {
    pendingCreateRecoveryRef.current = recovery;
    setPendingCreateRecovery(recovery);
  }, []);

  const updateCreateRecoveryInvalid = useCallback((invalid: boolean) => {
    createRecoveryInvalidRef.current = invalid;
    setCreateRecoveryInvalid(invalid);
  }, []);

  const updatePendingWriteRecovery = useCallback((recovery: MobileProductionWriteRecovery | null) => {
    pendingWriteRecoveryRef.current = recovery;
    setPendingWriteRecovery(recovery);
  }, []);

  const updateWriteRecoveryInvalid = useCallback((invalid: boolean) => {
    writeRecoveryInvalidRef.current = invalid;
    setWriteRecoveryInvalid(invalid);
  }, []);

  const load = useCallback(async () => {
    if (permissionsLoading) return;
    allowRouteTransitionRef.current = false;
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setNotice('');
    setLoadFailed(false);
    setHistoricalVersion(null);
    setHistoryUnavailable(false);
    if (isNewProduction) {
      setProduction(null);
      setTopicId('');
      persistedContentRef.current = '';
    }
    try {
      if (!draftKey) throw new Error('当前账号无法读取本机草稿。');
      if (isNewProduction && !canEditPermission) throw new Error('当前账号没有新建创作稿件的权限。');
      if (id && id !== 'new' && !canView) throw new Error('当前账号没有查看这份创作稿件的权限。');
      if (id && id !== 'new') {
        const recovery = readMobileProductionWriteRecovery(userId, Number(id));
        if (recovery === 'invalid') {
          updateWriteRecoveryInvalid(true);
          updatePendingWriteRecovery(null);
        } else {
          updateWriteRecoveryInvalid(false);
          updatePendingWriteRecovery(recovery);
        }
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
        updatePendingWriteRecovery(null);
        updateWriteRecoveryInvalid(false);
        const recovery = readMobileProductionCreateRecovery(userId);
        if (recovery === 'invalid') {
          updateCreateRecoveryInvalid(true);
          updatePendingCreateRecovery(null);
        } else {
          updateCreateRecoveryInvalid(false);
          updatePendingCreateRecovery(recovery);
          autoVerifyCreateRecoveryRef.current = Boolean(recovery);
          if (recovery) setTopicId(String(recovery.topicId));
        }
        setContent(readSafeDraftValue<string>(draftKey) ?? '');
        const topicResult = canEditPermission ? await getTopics({ page: 1, limit: 100 }) : null;
        if (requestId !== loadRequestRef.current) return;
        if (topicResult) setTopics(topicResult.data.filter((topic) => ['approved', 'production'].includes(topic.status)));
      } else {
        updatePendingCreateRecovery(null);
        updateCreateRecoveryInvalid(false);
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
  }, [canEditPermission, canView, draftKey, id, isNewProduction, permissionsLoading, requestedVersion, routeRequestKey, updateCreateRecoveryInvalid, updatePendingCreateRecovery, updatePendingWriteRecovery, updateWriteRecoveryInvalid, userId]);
  useEffect(() => { void load(); }, [load]);

  const finishMobileProductionCreate = useCallback((recovery: MobileProductionCreateRecovery, productionId: number) => {
    removeMobileProductionCreateRecovery(recovery.userId, recovery.clientRequestId);
    updatePendingCreateRecovery(null);
    updateCreateRecoveryInvalid(false);
    if (draftKey) clearSafeDraft(draftKey);
    allowRouteTransitionRef.current = true;
    navigate(`/production/content/${productionId}`, {
      replace: true,
      state: { mobileReturnTo: returnPath, ...(draftKey ? { mobileCreateDraftKey: draftKey } : {}) },
    });
  }, [draftKey, navigate, returnPath, updateCreateRecoveryInvalid, updatePendingCreateRecovery]);

  const resolveMobileProductionCreate = useCallback(async (recovery: MobileProductionCreateRecovery) => {
    try {
      const result = await getProductionCreateStatus(recovery.clientRequestId);
      if (result.status === 'created') {
        finishMobileProductionCreate(recovery, result.productionId);
        return;
      }
      if (result.status === 'deleted') {
        removeMobileProductionCreateRecovery(recovery.userId, recovery.clientRequestId);
        updatePendingCreateRecovery(null);
        setNotice('已核实原请求对应的稿件已删除；如仍需创建，请检查当前内容后重新保存。');
        return;
      }

      const recoveredContent = readSafeDraftValue<string>(draftKey || '') ?? '';
      const recoveredFingerprint = await fingerprintMobileProductionContent(recoveredContent);
      if (recoveredFingerprint !== recovery.contentFingerprint) {
        const uncertain = {
          ...recovery,
          phase: 'uncertain' as const,
          readError: '服务器暂未找到原请求，但本机正文与原请求摘要不一致；为避免错建或重复，已暂停重试。',
        };
        updatePendingCreateRecovery(uncertain);
        setNotice(uncertain.readError);
        return;
      }

      const ready: MobileProductionCreateRecovery = { ...recovery, phase: 'ready', readError: null };
      try {
        persistMobileProductionCreateRecovery(ready);
        updatePendingCreateRecovery(ready);
        setNotice('服务器暂未找到这条稿件。原正文与请求编号已保留；只有再次明确确认，才会用同一编号安全重试。');
      } catch (storageError) {
        const uncertain = {
          ...recovery,
          phase: 'uncertain' as const,
          readError: storageError instanceof Error ? storageError.message : '恢复信息保存失败；暂不允许重试。',
        };
        updatePendingCreateRecovery(uncertain);
        setNotice(uncertain.readError);
      }
    } catch (error) {
      const uncertain = {
        ...recovery,
        phase: 'uncertain' as const,
        readError: `创作结果仍无法确认（${error instanceof Error ? error.message : '读取失败'}）。请只读核实，不要重新创建。`,
      };
      updatePendingCreateRecovery(uncertain);
      setNotice(uncertain.readError);
    }
  }, [draftKey, finishMobileProductionCreate, updatePendingCreateRecovery]);

  const verifyMobileProductionCreate = useCallback(async (recovery: MobileProductionCreateRecovery) => {
    if (savingRef.current || createRecoveryLockRef.current || recovery.userId !== userId) return;
    createRecoveryLockRef.current = true;
    savingRef.current = true;
    setSaving(true);
    setNotice('');
    updatePendingCreateRecovery({ ...recovery, phase: 'checking', readError: null });
    try {
      await resolveMobileProductionCreate(recovery);
    } finally {
      createRecoveryLockRef.current = false;
      savingRef.current = false;
      setSaving(false);
    }
  }, [resolveMobileProductionCreate, updatePendingCreateRecovery, userId]);

  const submitMobileProductionCreate = useCallback(async (recovery: MobileProductionCreateRecovery) => {
    if (savingRef.current || createRecoveryLockRef.current || recovery.userId !== userId) return;
    savingRef.current = true;
    setSaving(true);
    setNotice('');
    try {
      const currentContent = readSafeDraftValue<string>(draftKey || '') ?? '';
      const currentFingerprint = await fingerprintMobileProductionContent(currentContent);
      if (currentFingerprint !== recovery.contentFingerprint) {
        const uncertain = { ...recovery, phase: 'uncertain' as const, readError: '本机正文已与原请求不一致，暂不重试；请先只读核实创建结果。' };
        updatePendingCreateRecovery(uncertain);
        setNotice(uncertain.readError);
        return;
      }
      const checking: MobileProductionCreateRecovery = { ...recovery, phase: 'checking', readError: null };
      persistMobileProductionCreateRecovery(checking);
      updatePendingCreateRecovery(checking);
      try {
        const result = await createProduction({
          topic_id: recovery.topicId,
          content: currentContent,
          status: recovery.targetStatus,
        }, recovery.clientRequestId);
        const productionId = Number(result.productionId);
        if (!Number.isSafeInteger(productionId) || productionId <= 0) throw new Error('创建响应未包含有效的创作记录编号');
        finishMobileProductionCreate(recovery, productionId);
      } catch (error) {
        if (isDefinitiveMobileProductionCreateRejection(error)) {
          removeMobileProductionCreateRecovery(recovery.userId, recovery.clientRequestId);
          updatePendingCreateRecovery(null);
          setNotice(error instanceof Error ? error.message : '创作保存失败，请检查后重试。');
        } else {
          await resolveMobileProductionCreate({ ...recovery, phase: 'uncertain', readError: null });
        }
      }
    } catch (error) {
      const uncertain = {
        ...recovery,
        phase: 'uncertain' as const,
        readError: error instanceof Error ? error.message : '本机恢复信息无法确认；未安全重试。',
      };
      updatePendingCreateRecovery(uncertain);
      setNotice(uncertain.readError);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [draftKey, finishMobileProductionCreate, resolveMobileProductionCreate, updatePendingCreateRecovery, userId]);

  useEffect(() => {
    const recovery = pendingCreateRecovery;
    const routeLoaded = !loading && loadedRouteRequestKey === routeRequestKey;
    if (!isNewProduction || !recovery || recovery.phase !== 'uncertain' || !routeLoaded || !autoVerifyCreateRecoveryRef.current) return;
    autoVerifyCreateRecoveryRef.current = false;
    void verifyMobileProductionCreate(recovery);
  }, [isNewProduction, loadedRouteRequestKey, loading, pendingCreateRecovery, routeRequestKey, verifyMobileProductionCreate]);

  useEffect(() => {
    if (isNewProduction || typeof completedCreateDraftKey !== 'string') return;
    const expectedDraftKey = userSafeDraftKey(userId, 'production:new');
    if (expectedDraftKey && completedCreateDraftKey === expectedDraftKey) clearSafeDraft(completedCreateDraftKey);
  }, [completedCreateDraftKey, isNewProduction, userId]);

  useEffect(() => {
    if (!canEdit || !draftKey || loading || !content) return;
    if (skipSafeDraftWriteRef.current) {
      skipSafeDraftWriteRef.current = false;
      if (content === persistedContentRef.current) {
        clearSafeDraft(draftKey);
        return;
      }
    }
    writeSafeDraft(draftKey, content);
  }, [canEdit, content, draftKey, loading]);

  const handleRouteNavigationAttempt = useCallback(({ proceed, stay }: RouteNavigationAttempt) => {
    if (allowRouteTransitionRef.current) {
      proceed();
      return;
    }
    if (savingRef.current || saving || reviewSuggestionLockRef.current || reviewSuggestionAccepting) {
      setNotice(reviewSuggestionLockRef.current || reviewSuggestionAccepting
        ? '修改建议正在应用并保存，请稍候后再离开。'
        : '稿件保存尚未完成，请稍候后再离开。');
      stay();
      return;
    }
    if (!window.confirm('当前稿件尚未提交，正文草稿已尽可能保存在本机。确认离开并稍后续写吗？')) {
      stay();
      return;
    }
    proceed();
  }, [reviewSuggestionAccepting, saving]);
  useRouteNavigationGuard(hasUnsavedChanges, handleRouteNavigationAttempt);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleRuntimeHandleChange = useCallback((handle: ContentEditorRuntimeHandle | null) => { runtimeHandleRef.current = handle; }, []);
  const handleReviewEditorHandleChange = useCallback((handle: EditorCommandHandle | null) => { setReviewEditorHandle(handle); }, []);
  const flushReviewEditor = useCallback(async () => {
    const handle = runtimeHandleRef.current;
    return handle ? handle.flush({ timeoutMs: 15_000 }) : { status: 'failed' };
  }, []);
  const applyRecoveredProduction = useCallback((serverRecord: Production, preserveLocalDraft: boolean) => {
    const serverContent = String(serverRecord.content || '');
    const localDraft = draftKey ? readSafeDraftValue<string>(draftKey) : null;
    const contentToKeep = preserveLocalDraft ? (localDraft ?? content) : serverContent;
    persistedContentRef.current = serverContent;
    setProduction(serverRecord);
    setTopicId(String(serverRecord.topic_id));
    if (contentToKeep === serverContent) {
      setContent(serverContent);
      skipSafeDraftWriteRef.current = true;
      if (draftKey) clearSafeDraft(draftKey);
    } else {
      setContent(contentToKeep);
      if (draftKey) writeSafeDraft(draftKey, contentToKeep);
    }
  }, [content, draftKey]);
  const resolveMobileProductionWrite = useCallback(async (recovery: MobileProductionWriteRecovery) => {
    try {
      const serverRecord = await getProductionById(recovery.productionId);
      if (serverRecord.id !== recovery.productionId) throw new Error('服务器返回的稿件与当前页面不一致。');
      const serverContent = String(serverRecord.content || '');
      const serverFingerprint = await fingerprintMobileProductionContent(serverContent);
      const targetReached = serverRecord.version === recovery.previousVersion
        && serverRecord.topic_id === recovery.topicId
        && serverRecord.status === recovery.targetStatus
        && serverFingerprint === recovery.targetContentFingerprint;
      const originalUnchanged = serverRecord.version === recovery.previousVersion
        && serverRecord.topic_id === recovery.topicId
        && serverRecord.status === recovery.previousStatus
        && serverFingerprint === recovery.previousContentFingerprint;

      if (targetReached) {
        removeMobileProductionWriteRecovery(recovery);
        updatePendingWriteRecovery(null);
        updateWriteRecoveryInvalid(false);
        applyRecoveredProduction(serverRecord, true);
        setNotice(serverContent === (readSafeDraftValue<string>(draftKey || '') ?? content)
          ? '服务器已确认保存结果，没有重复提交。'
          : '服务器已确认本次保存；后续本机正文仍保留为草稿。');
        return 'confirmed' as const;
      }

      if (originalUnchanged) {
        const ready: MobileProductionWriteRecovery = { ...recovery, phase: 'ready', readError: null };
        persistMobileProductionWriteRecovery(ready);
        updatePendingWriteRecovery(ready);
        updateWriteRecoveryInvalid(false);
        applyRecoveredProduction(serverRecord, true);
        setNotice('服务器仍是原稿状态，正文和请求范围已核实；系统没有自动重试。请检查后使用下方的明确重试操作。');
        return 'ready' as const;
      }

      removeMobileProductionWriteRecovery(recovery);
      updatePendingWriteRecovery(null);
      updateWriteRecoveryInvalid(false);
      applyRecoveredProduction(serverRecord, true);
      setNotice('服务器上的稿件状态、版本或正文已变化；本机正文已保留为草稿，系统没有重复提交。请检查最新状态后再决定下一步。');
      return 'changed' as const;
    } catch (error) {
      const uncertain: MobileProductionWriteRecovery = {
        ...recovery,
        phase: 'uncertain',
        readError: `稿件写入结果仍无法确认（${error instanceof Error ? error.message : '只读读取失败'}）。编辑和后续写入已暂停。`,
      };
      try { persistMobileProductionWriteRecovery(uncertain); } catch { /* Keep the in-memory write lock even if session storage is unavailable. */ }
      updatePendingWriteRecovery(uncertain);
      updateWriteRecoveryInvalid(false);
      setNotice(uncertain.readError || '稿件写入结果仍无法确认。');
      return 'uncertain' as const;
    }
  }, [applyRecoveredProduction, content, draftKey, updatePendingWriteRecovery, updateWriteRecoveryInvalid]);
  const writeMobileProduction = useCallback(async (
    operation: MobileProductionWriteOperation,
    targetStatus: string,
    nextContent: string,
    existingRecovery?: MobileProductionWriteRecovery,
  ) => {
    if (!production || !currentUserId || !draftKey) throw new Error('当前账号或稿件尚未确认，保存操作未发送。');
    if (!existingRecovery && (pendingWriteRecoveryRef.current || writeRecoveryInvalidRef.current)) {
      throw new Error('上一条稿件更新仍待核实；请先只读核实服务器状态。');
    }
    const baseContent = persistedContentRef.current;
    const previousContentFingerprint = await fingerprintMobileProductionContent(baseContent);
    const targetContentFingerprint = await fingerprintMobileProductionContent(nextContent);
    if (existingRecovery && (existingRecovery.userId !== currentUserId
      || existingRecovery.productionId !== production.id || existingRecovery.operation !== operation
      || existingRecovery.topicId !== production.topic_id || existingRecovery.previousVersion !== production.version
      || existingRecovery.previousStatus !== production.status || existingRecovery.targetStatus !== targetStatus
      || existingRecovery.previousContentFingerprint !== previousContentFingerprint
      || existingRecovery.targetContentFingerprint !== targetContentFingerprint)) {
      throw new Error('待重试正文或服务器基线已变化；请先只读核实服务器状态。');
    }
    if (!existingRecovery && ((operation === 'review-submit' && (production.status !== 'draft' || targetStatus !== 'review'))
      || (operation === 'review-approve' && (production.status !== 'review' || targetStatus !== 'approved'))
      || ((operation === 'draft-save' || operation === 'editor-autosave') && targetStatus !== production.status))) {
      throw new Error('本次稿件更新与当前流程状态不匹配，操作未发送。');
    }

    const recovery: MobileProductionWriteRecovery = existingRecovery
      ? { ...existingRecovery, phase: 'checking', readError: null }
      : {
        version: 1,
        userId: currentUserId,
        productionId: production.id,
        operation,
        topicId: production.topic_id,
        previousVersion: production.version,
        previousStatus: production.status,
        targetStatus,
        previousContentFingerprint,
        targetContentFingerprint,
        phase: 'checking',
        readError: null,
      };
    persistMobileProductionWriteRecovery(recovery);
    try {
      await updateProduction(production.id, {
        topic_id: production.topic_id,
        version: production.version,
        content: nextContent,
        expected_content: baseContent,
        status: targetStatus,
        version_action: 'none',
      });
      removeMobileProductionWriteRecovery(recovery);
      updatePendingWriteRecovery(null);
      updateWriteRecoveryInvalid(false);
      persistedContentRef.current = nextContent;
      setProduction((current) => current?.id === production.id ? {
        ...current,
        content: nextContent,
        content_markdown: nextContent,
        content_json: nextContent,
        status: targetStatus,
      } : current);
      return 'saved' as const;
    } catch (error) {
      if (isDefinitiveMobileProductionCreateRejection(error)) {
        removeMobileProductionWriteRecovery(recovery);
        updatePendingWriteRecovery(null);
        updateWriteRecoveryInvalid(false);
        throw error;
      }
      const uncertain: MobileProductionWriteRecovery = { ...recovery, phase: 'uncertain', readError: null };
      updatePendingWriteRecovery(uncertain);
      const result = await resolveMobileProductionWrite(uncertain);
      return result === 'confirmed' ? 'recovered' as const : false as const;
    }
  }, [currentUserId, draftKey, production, resolveMobileProductionWrite, updatePendingWriteRecovery, updateWriteRecoveryInvalid]);
  const verifyMobileProductionWrite = useCallback(async (recovery: MobileProductionWriteRecovery) => {
    if (savingRef.current || writeRecoveryLockRef.current || recovery.userId !== currentUserId
      || recovery.productionId !== Number(id)) return;
    writeRecoveryLockRef.current = true;
    savingRef.current = true;
    setSaving(true);
    setNotice('');
    updatePendingWriteRecovery({ ...recovery, phase: 'checking', readError: null });
    try {
      await resolveMobileProductionWrite(recovery);
    } finally {
      writeRecoveryLockRef.current = false;
      savingRef.current = false;
      setSaving(false);
    }
  }, [currentUserId, id, resolveMobileProductionWrite, updatePendingWriteRecovery]);
  const retryMobileProductionWrite = useCallback(async (recovery: MobileProductionWriteRecovery) => {
    if (savingRef.current || recovery.phase !== 'ready' || recovery.userId !== currentUserId) return;
    savingRef.current = true;
    setSaving(true);
    setNotice('');
    try {
      const retryContent = readSafeDraftValue<string>(draftKey || '') ?? content;
      const retryFingerprint = await fingerprintMobileProductionContent(retryContent);
      if (retryFingerprint !== recovery.targetContentFingerprint) {
        setNotice('本机正文与原更新不一致；为避免覆盖或重复提交，暂不重试，请先只读核实。');
        updatePendingWriteRecovery({ ...recovery, phase: 'uncertain', readError: '本机正文已变化。' });
        return;
      }
      const outcome = await writeMobileProduction(recovery.operation, recovery.targetStatus, retryContent, recovery);
      if (!outcome) return;
      if (draftKey) {
        skipSafeDraftWriteRef.current = true;
        clearSafeDraft(draftKey);
      }
      setContent(retryContent);
      setNotice(outcome === 'recovered'
        ? recovery.operation === 'review-approve' ? '服务器已确认审核通过，没有重复提交。'
          : recovery.operation === 'review-submit' ? '服务器已确认提交审核，没有重复提交。'
            : '服务器已确认保存，没有重复提交。'
        : recovery.operation === 'review-approve' ? '审核已通过'
          : recovery.operation === 'review-submit' ? '已提交审核' : '已保存草稿');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '稿件更新失败');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [content, currentUserId, draftKey, updatePendingWriteRecovery, writeMobileProduction]);
  const adapter = useMemo(() => production && !isHistoricalView ? createProductionEditorAdapter({ documentId: getProductionVersionRoomId(production.id, production.version), collaborationRoom: getProductionVersionRoomId(production.id, production.version), initialContent: content, readonly: !canEdit || reviewSuggestionAccepting, capabilities: { collaboration: canEdit, manualSave: false, immersive: false, pageScroll: true }, persist: async (next) => { if (!canEdit) throw new Error('当前账号没有修改创作稿件的权限'); const confirmed = await writeMobileProduction('editor-autosave', production.status, next); if (!confirmed) throw new Error('自动保存结果尚待核实；请先只读核实服务器状态。'); } }) : undefined, [canEdit, content, isHistoricalView, production, reviewSuggestionAccepting, writeMobileProduction]);
  useEffect(() => {
    if (isNewProduction || !routeDataReady || !id || !currentUserId
      ) return;
    const identityKey = `${currentUserId}:${id}`;
    if (autoCheckedWriteRecoveryKeyRef.current === identityKey) return;
    autoCheckedWriteRecoveryKeyRef.current = identityKey;
    const stored = readMobileProductionWriteRecovery(currentUserId, Number(id));
    if (stored === 'invalid') {
      updateWriteRecoveryInvalid(true);
      updatePendingWriteRecovery(null);
      return;
    }
    if (stored) {
      updatePendingWriteRecovery(stored);
      updateWriteRecoveryInvalid(false);
      void verifyMobileProductionWrite(stored);
    }
  }, [currentUserId, id, isNewProduction, routeDataReady, updatePendingWriteRecovery, updateWriteRecoveryInvalid, verifyMobileProductionWrite]);
  const beginReviewSuggestionAccept = useCallback(() => {
    if (savingRef.current || reviewSuggestionLockRef.current) return false;
    reviewSuggestionLockRef.current = true;
    setReviewSuggestionAccepting(true);
    return true;
  }, []);
  const endReviewSuggestionAccept = useCallback(() => {
    reviewSuggestionLockRef.current = false;
    setReviewSuggestionAccepting(false);
  }, []);
  const save = async (submit: boolean) => {
    if (reviewSuggestionLockRef.current) {
      setNotice('修改建议正在应用并保存，请完成后再保存稿件。');
      return;
    }
    if (!canEdit || !draftKey) { setNotice('当前账号没有修改创作稿件的权限。'); return; }
    if (!topicId) { setNotice('请先选择关联选题'); return; }
    if (networkState === 'offline') { setNotice('当前离线，正文已保存为本地草稿，恢复网络后再保存。'); return; }
    if (createRecoveryInvalidRef.current) {
      setNotice('本机创作恢复标记无法读取，已暂停新建，避免重复创建。请先恢复浏览器会话存储。');
      return;
    }
    if (pendingCreateRecoveryRef.current) {
      setNotice('上一条创作请求仍待核实；请先使用页面提示中的只读核实或同编号安全重试。');
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true); setNotice('');
    let createRecovery: MobileProductionCreateRecovery | null = null;
    try {
      if (production) {
        const flushResult = await flushReviewEditor();
        if (flushResult.status !== 'synced') {
          setNotice(flushResult.status === 'timed_out'
            ? '正文仍在保存，本次操作未执行，请稍后重试。'
            : flushResult.status === 'cancelled'
              ? '正文保存已中断，本次操作未执行；请刷新确认正文后重试。'
              : '正文保存结果未确认，本次操作未执行；请检查保存状态后重试。');
          return;
        }
        const shouldWrite = submit || content !== persistedContentRef.current;
        const outcome = shouldWrite ? await writeMobileProduction(
          submit ? 'review-submit' : 'draft-save',
          submit ? 'review' : production.status,
          content,
        ) : 'saved' as const;
        if (!outcome) return;
        clearSafeDraft(draftKey);
        setNotice(outcome === 'recovered'
          ? submit ? '服务器已确认提交审核，没有重复提交。' : '服务器已确认保存，没有重复提交。'
          : submit ? '已提交审核' : '已保存草稿');
      } else {
        const authenticatedUserId = currentUserId;
        if (authenticatedUserId === null) throw new Error('当前登录身份尚未确认，创作请求未发送。');
        if (!writeSafeDraft(draftKey, content)) throw new Error('本机安全草稿无法保存，创作请求未发送；请检查浏览器存储空间后重试。');
        const recovery: MobileProductionCreateRecovery = {
          version: 1,
          userId: authenticatedUserId,
          clientRequestId: crypto.randomUUID(),
          topicId: Number(topicId),
          targetStatus: submit ? 'review' : 'draft',
          contentFingerprint: await fingerprintMobileProductionContent(content),
          phase: 'uncertain',
          readError: null,
        };
        persistMobileProductionCreateRecovery(recovery);
        createRecovery = recovery;
        updatePendingCreateRecovery({ ...recovery, phase: 'checking' });
        autoVerifyCreateRecoveryRef.current = false;
        try {
          const result = await createProduction({ topic_id: recovery.topicId, content, status: recovery.targetStatus }, recovery.clientRequestId);
          const productionId = Number(result.productionId);
          if (!Number.isSafeInteger(productionId) || productionId <= 0) throw new Error('创建响应未包含有效的创作记录编号');
          finishMobileProductionCreate(recovery, productionId);
        } catch (error) {
          if (isDefinitiveMobileProductionCreateRejection(error)) {
            removeMobileProductionCreateRecovery(recovery.userId, recovery.clientRequestId);
            updatePendingCreateRecovery(null);
            createRecovery = null;
            setNotice(error instanceof Error ? error.message : '创作保存失败，请检查后重试。');
          } else {
            await resolveMobileProductionCreate(recovery);
          }
        }
      }
    } catch (error) {
      if (createRecovery) await resolveMobileProductionCreate(createRecovery);
      else setNotice(error instanceof Error ? error.message : '保存稿件失败');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const approveReview = async () => {
    if (!production || production.status !== 'review' || !canEdit || !draftKey) return;
    if (reviewSuggestionLockRef.current) {
      setNotice('修改建议正在应用并保存，请完成后再审核稿件。');
      return;
    }
    if (networkState === 'offline') { setNotice('当前离线，无法确认审核结果；恢复网络后再试。'); return; }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setNotice('');
    try {
      const flushResult = await flushReviewEditor();
      if (flushResult.status !== 'synced') {
        setNotice(flushResult.status === 'timed_out'
          ? '正文仍在保存，审核未执行，请稍后重试。'
          : flushResult.status === 'cancelled'
            ? '正文保存已中断，审核未执行；请刷新确认正文后重试。'
            : '正文保存结果未确认，审核未执行；请检查保存状态后重试。');
        return;
      }
      const approvedContent = persistedContentRef.current;
      const outcome = await writeMobileProduction('review-approve', 'approved', approvedContent);
      if (!outcome) return;
      clearSafeDraft(draftKey);
      setProduction((current) => current?.id === production.id ? {
        ...current,
        content: approvedContent,
        content_markdown: approvedContent,
        content_json: approvedContent,
        status: 'approved',
      } : current);
      setContent(approvedContent);
      setNotice(outcome === 'recovered' ? '服务器已确认审核通过，没有重复提交。' : '审核已通过');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '审核稿件失败');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
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
              : reviewTaskRequested && returnPath === '/'
                ? '返回工作台'
                : '返回创作'}
      </button>
      {permissionsLoading ? <p className="text-sm text-studio-text-muted">正在检查访问权限…</p> : null}
      {isNewProduction && createRecoveryInvalid ? (
        <p role="alert" className="rounded-2xl border border-studio-coral/30 bg-studio-coral-soft p-4 text-sm text-studio-coral-contrast">
          本机创作恢复标记无法读取，已暂停新建以避免重复创建。请恢复当前浏览器会话存储后重新打开此页；不会自动重发创作请求。
        </p>
      ) : null}
      {visibleCreateRecovery ? (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast">
          <p>
            {visibleCreateRecovery.phase === 'ready'
              ? '服务器暂未找到这条稿件。原正文与请求编号已保留；只有再次明确确认，才会用同一编号安全重试。'
              : visibleCreateRecovery.readError || '上一次创作结果仍在核实。核实完成前不会另建请求，也不会自动重发。'}
          </p>
          <ActionButton
            type="button"
            variant="secondary"
            className="self-start"
            disabled={saving || visibleCreateRecovery.phase === 'checking'}
            onClick={() => visibleCreateRecovery.phase === 'ready'
              ? void submitMobileProductionCreate(visibleCreateRecovery)
              : void verifyMobileProductionCreate(visibleCreateRecovery)}
          >
            {saving || visibleCreateRecovery.phase === 'checking'
              ? '正在处理…'
              : visibleCreateRecovery.phase === 'ready' ? '使用同一请求编号安全重试' : '只读核实创建状态'}
          </ActionButton>
        </div>
      ) : null}
      {!isNewProduction && writeRecoveryInvalid && routeDataReady ? (
        <p role="alert" className="rounded-2xl border border-studio-coral/30 bg-studio-coral-soft p-4 text-sm text-studio-coral-contrast">
          本机稿件恢复标记无法读取。为避免重复保存或审核，当前稿件保持只读；恢复当前浏览器标签会话后重新打开页面，将只读核实服务器状态。
        </p>
      ) : null}
      {visibleWriteRecovery ? (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast">
          <p>
            {visibleWriteRecovery.phase === 'ready'
              ? '服务器仍是原稿状态。正文已保留；系统不会自动重试，只有再次明确确认才会发送同一更新。'
              : visibleWriteRecovery.readError || '上一次稿件更新结果仍待核实；核实期间编辑、保存与审核操作已暂停。'}
          </p>
          <ActionButton
            type="button"
            variant="secondary"
            className="self-start"
            disabled={saving || visibleWriteRecovery.phase === 'checking'}
            onClick={() => visibleWriteRecovery.phase === 'ready'
              ? void retryMobileProductionWrite(visibleWriteRecovery)
              : void verifyMobileProductionWrite(visibleWriteRecovery)}
          >
            {saving || visibleWriteRecovery.phase === 'checking'
              ? '正在处理…'
              : visibleWriteRecovery.phase === 'ready'
                ? visibleWriteRecovery.operation === 'review-approve' ? '再次明确确认审核通过'
                  : visibleWriteRecovery.operation === 'review-submit' ? '使用原正文明确重试提交审核'
                    : '使用原正文明确重试保存'
                : '只读核实稿件状态'}
          </ActionButton>
        </div>
      ) : null}
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
          <select name="topicId" disabled={Boolean(production) || routeDataLoading || saving} value={topicId} onChange={(event) => setTopicId(event.target.value)} className="min-h-11 w-full rounded-xl border border-studio-border-soft bg-studio-bg px-3 text-sm">
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
      {reviewTaskUnavailable ? (
        <p role="status" className="rounded-2xl border border-studio-border-soft bg-studio-surface p-3 text-sm text-studio-text-secondary">
          这份稿件已不在待审核状态，当前状态：{production ? productionStatusLabel(production.status) : '状态待确认'}。请返回工作台确认最新任务。
        </p>
      ) : null}
      {!routeDataLoading && !loadFailed && !(historyUnavailable && isHistoricalView) ? (
        <section className="overflow-visible rounded-2xl border border-studio-border-soft bg-studio-surface">
          {!canEdit ? <p className="border-b border-studio-border-soft px-4 py-3 text-sm text-studio-text-muted">{pendingCreateRecovery ? '新建结果正在只读核实；原正文已保留，核实期间编辑与新建操作已暂停。' : createRecoveryInvalid ? '恢复标记无法读取；为避免重复创建，当前页面保持只读。' : visibleWriteRecovery ? '稿件写入结果正在只读核实；原正文已保留，核实期间编辑、保存与审核操作已暂停。' : writeRecoveryInvalid ? '恢复标记无法读取；为避免重复写入，当前页面保持只读。' : reviewTaskUnavailable ? '待审核任务已结束：当前页面只读。' : '只读模式：当前账号仅可查看。'}</p> : null}
          <ContentEditor
            key={historicalVersion ? `production-${production?.id}-history-${historicalVersion.id}` : production ? `production-${production.id}-current-${production.version}` : `new-${topicId}`}
            value={displayedContent}
            onChange={canEdit && !saving && !reviewSuggestionAccepting ? setContent : undefined}
            readOnly={!canEdit || saving || reviewSuggestionAccepting}
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
          mutationsLocked={saving || reviewSuggestionAccepting}
          beginAcceptingSuggestion={beginReviewSuggestionAccept}
          endAcceptingSuggestion={endReviewSuggestionAccept}
          onNotice={(title, message) => setNotice(`${title}：${message}`)}
        />
      ) : null}
      {notice && routeDataReady && !historyUnavailable ? <p role="status" className="text-sm text-studio-text-secondary">{notice}</p> : null}
      {canEdit && !reviewTaskUnavailable ? (
        <div className="sticky z-sticky -mx-1 grid grid-cols-2 gap-3 bg-studio-bg px-1 py-2" style={{ bottom: 'max(var(--xmt-keyboard-height, 0px), var(--xmt-mobile-nav-height, 4.0625rem))' }}>
          <ActionButton type="button" variant="secondary" disabled={routeDataLoading || saving || reviewSuggestionAccepting} onClick={() => void save(false)} className="min-h-12 w-full justify-center gap-2 rounded-xl text-sm font-semibold">
            <Save className="h-4 w-4" />{production?.status === 'review' ? '保存修改' : '保存草稿'}
          </ActionButton>
          {production?.status === 'review' ? (
            <ActionButton type="button" variant="primary" disabled={routeDataLoading || saving || reviewSuggestionAccepting} onClick={() => void approveReview()} className="min-h-12 w-full justify-center gap-2 rounded-xl text-sm font-semibold">
              <Check className="h-4 w-4" />审核通过
            </ActionButton>
          ) : (
            <ActionButton type="button" variant="primary" disabled={routeDataLoading || saving || reviewSuggestionAccepting} onClick={() => void save(true)} className="min-h-12 w-full justify-center gap-2 rounded-xl text-sm font-semibold">
              <Send className="h-4 w-4" />提交审核
            </ActionButton>
          )}
        </div>
      ) : null}
    </div>
  );
}
