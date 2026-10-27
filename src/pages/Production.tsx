import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore, useAuthStore } from '../store';
import { getProduction, getProductionById, createProduction, getProductionCreateStatus, getTopics, updateProduction } from '../api';
import { Production as ProductionType, Topic } from '../types';
import { Plus, Search, FileText, Edit3, ChevronLeft, ChevronRight } from 'lucide-react';
import { ActionButton, ResponsiveTableShell } from '@/components/studio';
import BaseModal from '../components/common/BaseModal';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useSocket } from '../hooks/useSocket';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { usePermission } from '../hooks/usePermission';
import { formatBeijingDate } from '../lib/utils';

const PAGE_SIZE = 20;
const PRODUCTION_CREATE_REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ProductionCreatePayload = { topic_id: number; version: string; content: string; status: string };
type ProductionUpdatePayload = Pick<ProductionType, 'topic_id' | 'version' | 'content' | 'status'>;
type ProductionUpdateSnapshot = Pick<ProductionType, 'id' | 'topic_id' | 'version' | 'content' | 'status' | 'created_at' | 'updated_at'> & {
  content_json: string | null;
  content_markdown: string | null;
  file_path: string | null;
  operator_id: number | null;
  operator_name: string;
  topic_title: string;
  topic_status: string;
};
type PendingProductionCreateVerification = {
  clientRequestId: string;
  userId: number;
  payload: ProductionCreatePayload;
  topicTitle: string;
  page: number;
  status: 'uncertain' | 'ready' | 'checking';
  readError: string | null;
};
type PendingProductionUpdateVerification = {
  id: number;
  userId: number;
  page: number;
  topicTitle: string;
  targetTopicTitle: string;
  targetTopicStatus: string;
  targetOperatorName: string;
  original: ProductionUpdateSnapshot;
  payload: ProductionUpdatePayload;
  status: 'saving' | 'checking' | 'uncertain' | 'changed' | 'missing';
  readError: string | null;
  observedRecord?: ProductionType;
};

function productionCreateVerificationKey(userId: number | undefined) {
  return userId ? `xmt:production-create-pending:v1:user:${userId}` : null;
}

function loadPendingProductionCreateVerification(userId: number | undefined): PendingProductionCreateVerification | null {
  const key = productionCreateVerificationKey(userId);
  if (!key || userId === undefined || typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null') as Partial<PendingProductionCreateVerification> | null;
    const payload = value?.payload as Partial<ProductionCreatePayload> | undefined;
    if (!value || value.userId !== userId || typeof value.clientRequestId !== 'string'
      || !PRODUCTION_CREATE_REQUEST_ID.test(value.clientRequestId)
      || !payload || !Number.isSafeInteger(payload.topic_id) || Number(payload.topic_id) <= 0
      || typeof payload.version !== 'string' || typeof payload.content !== 'string'
      || typeof payload.status !== 'string'
      || typeof value.topicTitle !== 'string'
      || !Number.isSafeInteger(value.page) || Number(value.page) <= 0) return null;
    return {
      clientRequestId: value.clientRequestId,
      userId,
      payload: {
        topic_id: Number(payload.topic_id),
        version: payload.version,
        content: payload.content,
        status: payload.status,
      },
      topicTitle: value.topicTitle,
      page: Number(value.page),
      // Always read the server before offering a retry after a reload.
      status: 'uncertain',
      readError: null,
    };
  } catch {
    return null;
  }
}

function persistPendingProductionCreateVerification(pending: PendingProductionCreateVerification) {
  const key = productionCreateVerificationKey(pending.userId);
  if (!key || typeof window === 'undefined') throw new Error('当前账号尚未确认，无法安全保存创作恢复状态');
  sessionStorage.setItem(key, JSON.stringify({
    clientRequestId: pending.clientRequestId,
    userId: pending.userId,
    payload: pending.payload,
    topicTitle: pending.topicTitle,
    page: pending.page,
    status: pending.status,
  }));
  const stored = loadPendingProductionCreateVerification(pending.userId);
  if (!stored || stored.clientRequestId !== pending.clientRequestId || stored.userId !== pending.userId
    || stored.payload.topic_id !== pending.payload.topic_id || stored.payload.version !== pending.payload.version
    || stored.payload.content !== pending.payload.content || stored.payload.status !== pending.payload.status) {
    throw new Error('创作恢复状态未能完整保存，本次未发送创建请求');
  }
}

function removeStoredProductionCreateVerification(userId: number, clientRequestId: string) {
  const key = productionCreateVerificationKey(userId);
  if (!key || typeof window === 'undefined') return;
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) || 'null') as { clientRequestId?: unknown } | null;
    if (stored?.clientRequestId === clientRequestId) sessionStorage.removeItem(key);
  } catch {
    // The server-side request key still prevents duplicates if local cleanup fails.
  }
}

function productionUpdateVerificationKey(userId: number | undefined) {
  return userId ? `xmt:production-update-pending:v1:user:${userId}` : null;
}

function isProductionUpdateSnapshot(value: unknown): value is ProductionUpdateSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<ProductionUpdateSnapshot>;
  return Number.isSafeInteger(snapshot.id) && Number(snapshot.id) > 0
    && Number.isSafeInteger(snapshot.topic_id) && Number(snapshot.topic_id) > 0
    && typeof snapshot.version === 'string' && typeof snapshot.content === 'string'
    && typeof snapshot.status === 'string' && (typeof snapshot.file_path === 'string' || snapshot.file_path === null)
    && (typeof snapshot.content_json === 'string' || snapshot.content_json === null)
    && (typeof snapshot.content_markdown === 'string' || snapshot.content_markdown === null)
    && (snapshot.operator_id === null || (Number.isSafeInteger(snapshot.operator_id) && Number(snapshot.operator_id) > 0))
    && typeof snapshot.operator_name === 'string' && typeof snapshot.topic_title === 'string'
    && typeof snapshot.topic_status === 'string' && typeof snapshot.created_at === 'string'
    && typeof snapshot.updated_at === 'string';
}

function isProductionUpdateRecord(value: unknown): value is ProductionType {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<ProductionType>;
  return Number.isSafeInteger(record.id) && Number(record.id) > 0
    && Number.isSafeInteger(record.topic_id) && Number(record.topic_id) > 0
    && typeof record.version === 'string' && typeof record.content === 'string'
    && typeof record.status === 'string' && (typeof record.file_path === 'string' || record.file_path == null)
    // Historical production rows may legitimately have no operator ID.
    && (record.operator_id == null || (Number.isSafeInteger(record.operator_id) && Number(record.operator_id) > 0))
    && typeof record.operator_name === 'string'
    && typeof record.created_at === 'string' && typeof record.updated_at === 'string'
    && typeof record.topic_title === 'string' && typeof record.topic_status === 'string'
    && (record.content_json === undefined || record.content_json === null || typeof record.content_json === 'string')
    && (record.content_markdown === undefined || record.content_markdown === null || typeof record.content_markdown === 'string');
}

function isProductionUpdatePayload(value: unknown): value is ProductionUpdatePayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<ProductionUpdatePayload>;
  return Number.isSafeInteger(payload.topic_id) && Number(payload.topic_id) > 0
    && typeof payload.version === 'string' && typeof payload.content === 'string'
    && typeof payload.status === 'string';
}

function loadPendingProductionUpdateVerification(userId: number | undefined): PendingProductionUpdateVerification | null {
  const key = productionUpdateVerificationKey(userId);
  if (!key || userId === undefined || typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null') as Partial<PendingProductionUpdateVerification> | null;
    if (!value || value.userId !== userId || !Number.isSafeInteger(value.id) || Number(value.id) <= 0
      || !Number.isSafeInteger(value.page) || Number(value.page) <= 0
      || typeof value.topicTitle !== 'string' || typeof value.targetTopicTitle !== 'string'
      || typeof value.targetTopicStatus !== 'string' || typeof value.targetOperatorName !== 'string'
      || !isProductionUpdateSnapshot(value.original)
      || value.original.id !== value.id || !isProductionUpdatePayload(value.payload)
      || !['saving', 'checking', 'uncertain', 'changed', 'missing'].includes(String(value.status))) return null;
    return {
      id: Number(value.id),
      userId,
      page: Number(value.page),
      topicTitle: value.topicTitle,
      targetTopicTitle: value.targetTopicTitle,
      targetTopicStatus: value.targetTopicStatus,
      targetOperatorName: value.targetOperatorName,
      original: value.original,
      payload: value.payload,
      // A refresh always starts with a read-only server check.
      status: 'uncertain',
      readError: null,
    };
  } catch {
    return null;
  }
}

function persistPendingProductionUpdateVerification(pending: PendingProductionUpdateVerification) {
  const key = productionUpdateVerificationKey(pending.userId);
  if (!key || typeof window === 'undefined') throw new Error('当前账号尚未确认，无法安全保存创作更新恢复状态');
  sessionStorage.setItem(key, JSON.stringify({
    id: pending.id,
    userId: pending.userId,
    page: pending.page,
    topicTitle: pending.topicTitle,
    targetTopicTitle: pending.targetTopicTitle,
    targetTopicStatus: pending.targetTopicStatus,
    targetOperatorName: pending.targetOperatorName,
    original: pending.original,
    payload: pending.payload,
    status: pending.status,
  }));
  const stored = loadPendingProductionUpdateVerification(pending.userId);
  if (!stored || stored.id !== pending.id || stored.userId !== pending.userId
    || !(Object.keys(pending.original) as Array<keyof ProductionUpdateSnapshot>)
      .every((key) => stored.original[key] === pending.original[key])
    || stored.targetTopicTitle !== pending.targetTopicTitle
    || stored.targetTopicStatus !== pending.targetTopicStatus
    || stored.targetOperatorName !== pending.targetOperatorName
    || stored.payload.topic_id !== pending.payload.topic_id || stored.payload.version !== pending.payload.version
    || stored.payload.content !== pending.payload.content || stored.payload.status !== pending.payload.status) {
    throw new Error('创作更新恢复状态未能完整保存，本次未发送修改');
  }
}

function removeStoredProductionUpdateVerification(userId: number, id: number) {
  const key = productionUpdateVerificationKey(userId);
  if (!key || typeof window === 'undefined') return;
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) || 'null') as { id?: unknown } | null;
    if (Number(stored?.id) === id) sessionStorage.removeItem(key);
  } catch {
    // A leftover marker only triggers another read-only check after reload.
  }
}

function snapshotProductionRecord(record: ProductionType): ProductionUpdateSnapshot {
  return {
    id: Number(record.id),
    topic_id: Number(record.topic_id),
    version: String(record.version ?? ''),
    content: String(record.content ?? ''),
    status: String(record.status ?? ''),
    content_json: record.content_json == null ? null : String(record.content_json),
    content_markdown: record.content_markdown == null ? null : String(record.content_markdown),
    file_path: record.file_path == null ? null : String(record.file_path),
    operator_id: record.operator_id == null ? null : Number(record.operator_id),
    operator_name: String(record.operator_name ?? ''),
    topic_title: String(record.topic_title ?? ''),
    topic_status: String(record.topic_status ?? ''),
    created_at: String(record.created_at ?? ''),
    updated_at: String(record.updated_at ?? ''),
  };
}

function matchesProductionUpdateTarget(record: ProductionType, pending: PendingProductionUpdateVerification) {
  const current = snapshotProductionRecord(record);
  return current.id === pending.id
    && current.topic_id === pending.payload.topic_id
    && current.version === pending.payload.version
    && current.content === pending.payload.content
    && current.content_json === pending.payload.content
    && current.content_markdown === pending.payload.content
    && current.status === pending.payload.status
    && current.file_path === pending.original.file_path
    && current.created_at === pending.original.created_at
    && current.operator_id === pending.userId
    && current.operator_name === pending.targetOperatorName
    && current.topic_title === pending.targetTopicTitle
    && current.topic_status === pending.targetTopicStatus;
}

function matchesProductionUpdateOriginal(record: ProductionType, pending: PendingProductionUpdateVerification) {
  const current = snapshotProductionRecord(record);
  return (Object.keys(pending.original) as Array<keyof ProductionUpdateSnapshot>)
    .every((key) => current[key] === pending.original[key]);
}

function isDefinitiveProductionUpdateRejection(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && ![408, 425, 429].includes(status);
}

function isDefinitiveProductionCreateRejection(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && ![404, 408, 425, 429].includes(status);
}

const useAutoResizeTextarea = (value: string, minHeight = 100, maxHeight = 300) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const resize = () => {
      textarea.style.height = 'auto';
      const computedStyle = window.getComputedStyle(textarea);
      const paddingTop = parseInt(computedStyle.paddingTop) || 0;
      const paddingBottom = parseInt(computedStyle.paddingBottom) || 0;
      const scrollHeight = textarea.scrollHeight;
      const newHeight = Math.min(Math.max(scrollHeight + paddingTop + paddingBottom, minHeight), maxHeight);
      textarea.style.height = `${newHeight}px`;
    };

    resize();

    const observer = new MutationObserver(resize);
    if (textarea.parentNode) {
      observer.observe(textarea.parentNode, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    return () => observer.disconnect();
  }, [value, minHeight, maxHeight]);

  return textareaRef;
};

export default function Production() {
  const authUserId = useAuthStore((store) => store.user?.id);
  const authUserName = useAuthStore((store) => store.user?.name);
  const [productions, setProductions] = useState<ProductionType[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [listLoadAttempt, setListLoadAttempt] = useState(0);
  const [savingRecord, setSavingRecord] = useState(false);
  const [page, setPage] = useState(1);
  const pageRef = useRef(page);
  pageRef.current = page;
  const [total, setTotal] = useState(0);
  const totalRef = useRef(total);
  totalRef.current = total;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState({ topic_id: '', version: '', content: '', status: 'draft' });
  const [editingProduction, setEditingProduction] = useState<ProductionType | null>(null);
  const [pendingCreateVerification, setPendingCreateVerification] = useState<PendingProductionCreateVerification | null>(
    () => loadPendingProductionCreateVerification(authUserId),
  );
  const [pendingUpdateVerification, setPendingUpdateVerification] = useState<PendingProductionUpdateVerification | null>(
    () => loadPendingProductionUpdateVerification(authUserId),
  );
  const [updateRecoveryOwnerUserId, setUpdateRecoveryOwnerUserId] = useState(authUserId);
  const [createVerificationLoading, setCreateVerificationLoading] = useState(false);
  const initialPendingCreateVerificationRef = useRef(pendingCreateVerification);
  const initialPendingUpdateVerificationRef = useRef(pendingUpdateVerification);
  const restoredCreateVerificationStartedRef = useRef(false);
  const restoredUpdateVerificationStartedRef = useRef(false);
  const createVerificationLockRef = useRef(false);
  const updateVerificationLockRef = useRef(false);
  const [updateVerificationNotice, setUpdateVerificationNotice] = useState<string | null>(null);
  const createWritesLocked = Boolean(
    (pendingCreateVerification && pendingCreateVerification.userId === authUserId)
    || updateRecoveryOwnerUserId !== authUserId
    || (pendingUpdateVerification && pendingUpdateVerification.userId === authUserId),
  );
  const pendingRefreshContextRef = useRef<string | null>(null);
  const pendingDeletedProductionIdsRef = useRef(new Set<number>());
  const saveInFlightRef = useRef(false);
  const productionListRequestIdRef = useRef(0);
  
  const createTextareaRef = useAutoResizeTextarea(formData.content, 100, 300);
  const editTextareaRef = useAutoResizeTextarea(formData.content, 100, 300);
  
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const addNotification = useAppStore((store) => store.addNotification);
  const { hasPermission, loading: permissionsLoading } = usePermission();
  const styles = useThemeStyles();
  const closeCreateModal = useCallback(() => {
    if (!savingRecord && !createWritesLocked) setShowCreateModal(false);
  }, [savingRecord, createWritesLocked]);
  const closeEditModal = useCallback(() => {
    if (savingRecord || createWritesLocked) return;
    setShowEditModal(false);
    setEditingProduction(null);
  }, [savingRecord, createWritesLocked]);

  const fetchProductionPage = useCallback(async (nextPage: number) => {
    return getProduction({ page: nextPage, limit: PAGE_SIZE });
  }, []);

  const confirmedWriteRefreshError = (fallback: string) => {
    const refreshContext = pendingRefreshContextRef.current;
    return refreshContext
      ? `服务端已确认${refreshContext}，但列表刷新失败；请重新加载列表确认，不要重复提交。`
      : fallback;
  };

  useEffect(() => {
    const requestId = ++productionListRequestIdRef.current;
    setLoading(true);
    void fetchProductionPage(page).then((result) => {
      if (productionListRequestIdRef.current !== requestId) return;
      totalRef.current = result.total;
      const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
      if (page > lastPage) {
        // The server total can shrink after a delete from another client.
        // Keep this read from clearing loading; the corrected page owns the next read.
        productionListRequestIdRef.current += 1;
        pageRef.current = lastPage;
        setPage(lastPage);
        return;
      }
      setProductions(result.data);
      setTotal(result.total);
      pendingRefreshContextRef.current = null;
      pendingDeletedProductionIdsRef.current.clear();
      setListError('');
    }).catch(() => {
      if (productionListRequestIdRef.current !== requestId) return;
      setListError(confirmedWriteRefreshError('创作列表读取失败，请重新加载列表。'));
    }).finally(() => {
      if (productionListRequestIdRef.current === requestId) setLoading(false);
    });
    return () => {
      // Invalidate every read from this page/refresh scope, including a socket
      // refresh that may have superseded this effect's own request.
      productionListRequestIdRef.current += 1;
    };
  }, [page, listLoadAttempt, fetchProductionPage]);

  useEffect(() => {
    let cancelled = false;
    void getTopics({ page: 1, limit: 100 }).then((topicList) => {
      if (cancelled) return;
      setTopics(topicList.data.filter((topic) => topic.status === 'approved' || topic.status === 'production'));
    }).catch(() => {
      if (!cancelled) addNotification({ title: '选题读取失败', message: '创作列表仍可查看；新增创作暂不可用，请重新加载页面后重试。', type: 'error' });
    });
    return () => { cancelled = true; };
  }, [addNotification]);

  useEffect(() => {
    if (permissionsLoading || searchParams.get('action') !== 'write') return;
    // A browser Back can land on the previous route before this passive effect
    // runs. Never let stale action-query cleanup replace that newer route.
    const currentSearchParams = new URLSearchParams(window.location.search);
    if (window.location.pathname !== '/production'
      || currentSearchParams.get('action') !== 'write'
      || currentSearchParams.toString() !== searchParams.toString()) return;
    const canWrite = hasPermission('production:update');
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('action');
    setSearchParams(nextSearchParams, { replace: true });
    if (canWrite && !createWritesLocked) {
      setFormData({ topic_id: '', version: '', content: '', status: 'draft' });
      setShowCreateModal(true);
    }
  }, [createWritesLocked, hasPermission, permissionsLoading, searchParams, setSearchParams]);

  const retryProductionList = () => {
    productionListRequestIdRef.current += 1;
    setListLoadAttempt((attempt) => attempt + 1);
  };

  const refreshAfterConfirmedWrite = useCallback((context: string, targetPage = pageRef.current) => {
    productionListRequestIdRef.current += 1;
    pendingRefreshContextRef.current = context;
    if (targetPage !== page) setPage(targetPage);
    else setListLoadAttempt((attempt) => attempt + 1);
  }, [page]);

  const finishProductionCreate = useCallback((pending: PendingProductionCreateVerification, productionId: number, verified: boolean) => {
    removeStoredProductionCreateVerification(pending.userId, pending.clientRequestId);
    setPendingCreateVerification(null);
    setShowCreateModal(false);
    setFormData({ topic_id: '', version: '', content: '', status: 'draft' });
    setPage(1);
    addNotification(verified
      ? { title: '创建结果已核实', message: `服务器确认「${pending.topicTitle}」的创作记录 #${productionId} 已创建，没有重复提交。`, type: 'success' }
      : { title: '创建成功', message: `「${pending.topicTitle}」的创作记录已添加，没有重复创建。`, type: 'success' });
    refreshAfterConfirmedWrite(`创作记录「${pending.topicTitle}」已创建`, 1);
  }, [addNotification, refreshAfterConfirmedWrite]);

  const resolvePendingProductionUpdate = useCallback(async (pending: PendingProductionUpdateVerification) => {
    try {
      const current = await getProductionById(pending.id);
      if (!isProductionUpdateRecord(current)) throw new Error('服务器返回的创作记录格式不完整。');
      if (Number(current.id) !== pending.id) throw new Error('服务器返回的创作记录与待核实记录不一致。');
      if (matchesProductionUpdateTarget(current, pending)) {
        removeStoredProductionUpdateVerification(pending.userId, pending.id);
        setPendingUpdateVerification(null);
        setUpdateVerificationNotice(null);
        setProductions((items) => items.map((item) => item.id === pending.id ? { ...item, ...current } : item));
        setShowEditModal(false);
        setEditingProduction(null);
        setFormData({ topic_id: '', version: '', content: '', status: 'draft' });
        addNotification({
          title: '更新结果已核实',
          message: `服务器确认创作记录「${pending.topicTitle}」已更新，没有重复提交。`,
          type: 'success',
        });
        refreshAfterConfirmedWrite(`创作记录「${pending.topicTitle}」已保存`, pending.page);
        return;
      }

      if (matchesProductionUpdateOriginal(current, pending)) {
        removeStoredProductionUpdateVerification(pending.userId, pending.id);
        setPendingUpdateVerification(null);
        setEditingProduction(current);
        setFormData({
          topic_id: String(pending.payload.topic_id),
          version: pending.payload.version,
          content: pending.payload.content,
          status: pending.payload.status,
        });
        setShowEditModal(true);
        setUpdateVerificationNotice('服务器仍保留原记录；本次修改没有自动重试。编辑内容已保留，核对后可由你明确再次点击“更新”。');
        addNotification({ title: '更新尚未应用', message: '服务器记录与保存前一致；编辑内容已保留，没有自动重试。', type: 'warning' });
        return;
      }

      const changed = { ...pending, status: 'changed' as const, readError: '服务器记录在本次保存前后发生了其他变化。请先核对最新记录；系统不会覆盖或自动重试。', observedRecord: current };
      setPendingUpdateVerification(changed);
      setProductions((items) => items.map((item) => item.id === pending.id ? { ...item, ...current } : item));
      setShowEditModal(false);
      addNotification({ title: '服务器记录已变化', message: '本机编辑草稿已保留并锁定写入；请查看最新服务器记录后明确解决。', type: 'warning' });
    } catch (error) {
      if ((error as { status?: unknown } | null)?.status === 404) {
        setShowEditModal(false);
        setPendingUpdateVerification({
          ...pending,
          status: 'missing',
          readError: `服务器当前未找到创作记录「${pending.topicTitle}」。为避免在记录状态未解决时继续写入，创作列表写入仍被锁定；可再次只读核实，或确认记录已不存在以解除限制。`,
        });
        addNotification({ title: '更新结果仍待处理', message: '服务器当前未找到原记录；本次没有重发。确认记录状态后再解除创作列表写入限制。', type: 'warning' });
        return;
      }

      const readError = error instanceof Error ? error.message : '只读读取失败';
      const uncertain = {
        ...pending,
        status: 'uncertain' as const,
        readError: `创作记录更新结果尚未确认，当前服务器状态也无法读取（${readError}）。写入已锁定；请只读核实，不要重复提交。`,
      };
      setPendingUpdateVerification(uncertain);
      setShowEditModal(false);
      addNotification({ title: '更新结果待确认', message: '服务器状态暂时无法读取；创作列表写入已暂停，请先只读核实。', type: 'warning' });
    }
  }, [addNotification, refreshAfterConfirmedWrite]);

  const verifyPendingProductionUpdate = useCallback(async (pending: PendingProductionUpdateVerification) => {
    if (updateVerificationLockRef.current || saveInFlightRef.current || pending.userId !== authUserId) return;
    updateVerificationLockRef.current = true;
    setSavingRecord(true);
    setPendingUpdateVerification({ ...pending, status: 'checking', readError: null });
    try {
      await resolvePendingProductionUpdate(pending);
    } finally {
      updateVerificationLockRef.current = false;
      setSavingRecord(false);
    }
  }, [authUserId, resolvePendingProductionUpdate]);

  const resolvePendingProductionCreate = useCallback(async (pending: PendingProductionCreateVerification) => {
    try {
      const result = await getProductionCreateStatus(pending.clientRequestId);
      if (result.status === 'created') {
        finishProductionCreate(pending, result.productionId, true);
      } else if (result.status === 'deleted') {
        removeStoredProductionCreateVerification(pending.userId, pending.clientRequestId);
        setPendingCreateVerification(null);
        setShowCreateModal(false);
        addNotification({ title: '原请求对应记录已删除', message: '已核实原创作记录已删除，不会因为重试而重新创建。', type: 'info' });
      } else {
        const ready: PendingProductionCreateVerification = { ...pending, status: 'ready', readError: null };
        try {
          persistPendingProductionCreateVerification(ready);
          setPendingCreateVerification(ready);
          setShowCreateModal(false);
          addNotification({
            title: '创建结果尚未确认',
            message: '服务器暂未找到这条创作记录；原表单和请求编号已保留，只有使用同一编号才能安全重试。',
            type: 'warning',
          });
        } catch (storageError) {
          setPendingCreateVerification({
            ...pending,
            status: 'uncertain',
            readError: `服务器暂未找到创作记录，但恢复信息无法保存（${storageError instanceof Error ? storageError.message : '存储不可用'}）；请先只读核实，不要重新创建。`,
          });
        }
      }
    } catch (error) {
      const readError = error instanceof Error ? error.message : '读取失败';
      setPendingCreateVerification({
        ...pending,
        status: 'uncertain',
        readError: `创作记录创建结果尚未确认，状态读取失败（${readError}）。请只读核实，不要另建一条。`,
      });
      setShowCreateModal(false);
      addNotification({
        title: '创建结果待确认',
        message: '写入状态暂时无法读取。已暂停创作列表的其它写入，请先只读核实，避免重复创建。',
        type: 'warning',
      });
    }
  }, [addNotification, finishProductionCreate]);

  const verifyPendingProductionCreate = useCallback(async (pending: PendingProductionCreateVerification) => {
    if (createVerificationLockRef.current || saveInFlightRef.current || pending.userId !== authUserId) return;
    createVerificationLockRef.current = true;
    setCreateVerificationLoading(true);
    setPendingCreateVerification({ ...pending, status: 'checking', readError: null });
    try {
      await resolvePendingProductionCreate(pending);
    } finally {
      createVerificationLockRef.current = false;
      setCreateVerificationLoading(false);
    }
  }, [authUserId, resolvePendingProductionCreate]);

  const submitPendingProductionCreate = useCallback(async (pending: PendingProductionCreateVerification) => {
    if (saveInFlightRef.current || createVerificationLockRef.current || authUserId !== pending.userId) return;
    saveInFlightRef.current = true;
    setSavingRecord(true);
    try {
      const checking: PendingProductionCreateVerification = { ...pending, status: 'checking', readError: null };
      try {
        persistPendingProductionCreateVerification({ ...pending, status: 'uncertain' });
      } catch (storageError) {
        if (pendingCreateVerification?.clientRequestId === pending.clientRequestId) {
          setPendingCreateVerification({ ...pending, status: 'ready', readError: storageError instanceof Error ? storageError.message : '恢复信息保存失败' });
        } else {
          setShowCreateModal(true);
          addNotification({ title: '创建未发送', message: storageError instanceof Error ? storageError.message : '恢复信息保存失败，请检查后重试。', type: 'error' });
        }
        return;
      }

      setPendingCreateVerification(checking);
      setShowCreateModal(false);
      try {
        const result = await createProduction(pending.payload, pending.clientRequestId);
        const productionId = Number(result.productionId);
        if (!Number.isSafeInteger(productionId) || productionId <= 0) throw new Error('创建响应未包含有效的创作记录编号');
        finishProductionCreate(pending, productionId, false);
      } catch (error) {
        if (isDefinitiveProductionCreateRejection(error)) {
          removeStoredProductionCreateVerification(pending.userId, pending.clientRequestId);
          setPendingCreateVerification(null);
          setFormData({
            topic_id: String(pending.payload.topic_id),
            version: pending.payload.version,
            content: pending.payload.content,
            status: pending.payload.status,
          });
          setShowCreateModal(true);
          addNotification({ title: '创建失败', message: (error as Error).message, type: 'error' });
        } else {
          await resolvePendingProductionCreate(checking);
        }
      }
    } finally {
      saveInFlightRef.current = false;
      setSavingRecord(false);
    }
  }, [addNotification, authUserId, finishProductionCreate, pendingCreateVerification, resolvePendingProductionCreate]);

  useEffect(() => {
    if (initialPendingCreateVerificationRef.current || authUserId === undefined) return;
    const pending = loadPendingProductionCreateVerification(authUserId);
    if (!pending) return;
    initialPendingCreateVerificationRef.current = pending;
    setPendingCreateVerification(pending);
  }, [authUserId]);

  useEffect(() => {
    const pending = initialPendingCreateVerificationRef.current;
    if (restoredCreateVerificationStartedRef.current || !pending) return;
    restoredCreateVerificationStartedRef.current = true;
    initialPendingCreateVerificationRef.current = null;
    setPendingCreateVerification(pending);
    void verifyPendingProductionCreate(pending);
  }, [verifyPendingProductionCreate]);

  useEffect(() => {
    if (authUserId === undefined) return;
    if (updateRecoveryOwnerUserId !== authUserId) {
      const pending = loadPendingProductionUpdateVerification(authUserId);
      initialPendingUpdateVerificationRef.current = pending;
      restoredUpdateVerificationStartedRef.current = false;
      setPendingUpdateVerification(pending);
      setUpdateRecoveryOwnerUserId(authUserId);
      return;
    }
    const key = productionUpdateVerificationKey(authUserId);
    if (!key) return;
    try {
      if (pendingUpdateVerification?.userId === authUserId) {
        persistPendingProductionUpdateVerification(pendingUpdateVerification);
      } else {
        sessionStorage.removeItem(key);
      }
    } catch {
      // Keep the in-memory write lock when recovery storage is unavailable.
    }
  }, [authUserId, pendingUpdateVerification, updateRecoveryOwnerUserId]);

  useEffect(() => {
    if (initialPendingUpdateVerificationRef.current || authUserId === undefined) return;
    const pending = loadPendingProductionUpdateVerification(authUserId);
    if (!pending) return;
    initialPendingUpdateVerificationRef.current = pending;
    setPendingUpdateVerification(pending);
  }, [authUserId]);

  useEffect(() => {
    const pending = initialPendingUpdateVerificationRef.current;
    if (restoredUpdateVerificationStartedRef.current || !pending || pending.userId !== authUserId) return;
    restoredUpdateVerificationStartedRef.current = true;
    initialPendingUpdateVerificationRef.current = null;
    setPendingUpdateVerification(pending);
    void verifyPendingProductionUpdate(pending);
  }, [authUserId, verifyPendingProductionUpdate]);

  const socket = useSocket();

  const refreshProductionListFromSocket = (requestedPage = pageRef.current) => {
    const requestId = ++productionListRequestIdRef.current;
    setLoading(true);
    // Socket callbacks can outlive the render that created them (for example,
    // while a socket reconnects or the page is updated during HMR). Read the
    // latest rendered pagination target instead of the callback's old page.
    void fetchProductionPage(requestedPage).then((result) => {
      if (productionListRequestIdRef.current !== requestId) return;
      totalRef.current = result.total;
      const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
      if (requestedPage > lastPage) {
        productionListRequestIdRef.current += 1;
        pageRef.current = lastPage;
        setPage(lastPage);
        return;
      }
      setProductions(result.data);
      setTotal(result.total);
      pendingRefreshContextRef.current = null;
      pendingDeletedProductionIdsRef.current.clear();
      setListError('');
    }).catch(() => {
      if (productionListRequestIdRef.current !== requestId) return;
      setListError(confirmedWriteRefreshError('创作列表未能实时更新；当前内容可能不是最新的，请重新加载列表。'));
    }).finally(() => {
      if (productionListRequestIdRef.current === requestId) setLoading(false);
    });
  };

  // ===== 实时协作 =====
  useRealtimeSync({
    room: 'production',
    socket,
    events: {
      'production:created': () => {
        refreshProductionListFromSocket();
      },
      'production:updated': (data) => {
        setProductions(prev => prev.map(p => p.id === data.id ? { ...p, ...data } : p));
        refreshProductionListFromSocket();
      },
      'production:deleted': (data) => {
        if (pendingDeletedProductionIdsRef.current.has(data.id)) return;
        pendingDeletedProductionIdsRef.current.add(data.id);
        const wasVisible = productions.some((production) => production.id === data.id);
        setProductions(prev => prev.filter(p => p.id !== data.id));
        if (wasVisible) {
          totalRef.current = Math.max(0, totalRef.current - 1);
          setTotal(totalRef.current);
        }
        const currentPage = pageRef.current;
        const lastPage = Math.max(1, Math.ceil(totalRef.current / PAGE_SIZE));
        if (currentPage > lastPage) {
          productionListRequestIdRef.current += 1;
          pageRef.current = lastPage;
          setPage(lastPage);
          setLoading(true);
          return;
        }
        refreshProductionListFromSocket(currentPage);
      },
    },
  });

  const handleCreate = async () => {
    if (saveInFlightRef.current || createWritesLocked) return;
    if (!formData.topic_id) {
      addNotification({ title: '创建失败', message: '请选择关联选题', type: 'error' });
      return;
    }
    if (authUserId === undefined) {
      addNotification({ title: '创建暂不可用', message: '当前登录身份尚未确认，请刷新后再试。', type: 'error' });
      return;
    }
    const topicId = Number.parseInt(formData.topic_id, 10);
    const pending: PendingProductionCreateVerification = {
      clientRequestId: crypto.randomUUID(),
      userId: authUserId,
      payload: {
        topic_id: topicId,
        version: formData.version,
        content: formData.content,
        status: formData.status,
      },
      topicTitle: topics.find((topic) => topic.id === topicId)?.title ?? '当前选题',
      page: 1,
      status: 'uncertain',
      readError: null,
    };
    restoredCreateVerificationStartedRef.current = true;
    await submitPendingProductionCreate(pending);
  };

  const handleEdit = (production: ProductionType) => {
    if (createWritesLocked) return;
    setEditingProduction(production);
    setFormData({ 
      topic_id: production.topic_id.toString(), 
      version: production.version, 
      content: production.content, 
      status: production.status 
    });
    setShowEditModal(true);
  };

  const handleUpdate = async () => {
    if (saveInFlightRef.current || createWritesLocked) return;
    if (!editingProduction || !formData.topic_id) {
      addNotification({ title: '更新失败', message: '请选择关联选题', type: 'error' });
      return;
    }
    if (authUserId === undefined || !Number.isSafeInteger(authUserId) || authUserId <= 0) {
      addNotification({ title: '更新暂不可用', message: '当前登录身份尚未确认；本次没有发送修改。', type: 'error' });
      return;
    }

    const productionToUpdate = editingProduction;
    const nextTopicId = parseInt(formData.topic_id);
    if (typeof authUserName !== 'string' || !authUserName.trim()) {
      addNotification({ title: '更新暂不可用', message: '当前操作人信息尚未确认；本次没有发送修改。', type: 'error' });
      return;
    }
    const original = snapshotProductionRecord(productionToUpdate);
    const targetTopic = topics.find((topic) => Number(topic.id) === nextTopicId);
    if (nextTopicId !== productionToUpdate.topic_id && !targetTopic) {
      addNotification({ title: '更新暂不可用', message: '关联选题信息尚未读取完整；请重新加载选题后再保存。', type: 'error' });
      return;
    }
    const targetTopicTitle = targetTopic?.title ?? productionToUpdate.topic_title ?? '当前选题';
    const currentTargetTopicStatus = targetTopic?.status ?? productionToUpdate.topic_status ?? '';
    const pending: PendingProductionUpdateVerification = {
      id: productionToUpdate.id,
      userId: authUserId,
      page,
      topicTitle: productionToUpdate.topic_title || '该创作记录',
      targetTopicTitle,
      targetTopicStatus: formData.status === 'approved' && productionToUpdate.status !== 'approved'
        && currentTargetTopicStatus === 'production' ? 'shooting' : currentTargetTopicStatus,
      targetOperatorName: authUserName,
      original,
      payload: {
        topic_id: nextTopicId,
        version: formData.version,
        content: formData.content,
        status: formData.status,
      },
      status: 'saving',
      readError: null,
    };
    saveInFlightRef.current = true;
    setSavingRecord(true);
    setUpdateVerificationNotice(null);
    try {
      try {
        persistPendingProductionUpdateVerification(pending);
      } catch (error) {
        addNotification({
          title: '更新未发送',
          message: error instanceof Error ? error.message : '创作恢复状态无法保存；本次没有发送修改。',
          type: 'error',
        });
        return;
      }
      setPendingUpdateVerification(pending);

      try {
        const result = await updateProduction(productionToUpdate.id, {
          ...pending.payload,
          expected_content: productionToUpdate.content,
          version_action: 'none',
        });
        if (!result || typeof result !== 'object' || typeof result.message !== 'string' || !result.message.trim()
          || (result.version !== undefined && (typeof result.version !== 'string' || result.version !== pending.payload.version))) {
          throw new Error('更新响应内容无效；正在只读核实服务器状态。');
        }
      } catch (error) {
        if (isDefinitiveProductionUpdateRejection(error)) {
          removeStoredProductionUpdateVerification(pending.userId, pending.id);
          setPendingUpdateVerification(null);
          addNotification({ title: '更新失败', message: (error as Error).message, type: 'error' });
          return;
        }
        const uncertain = { ...pending, status: 'checking' as const, readError: null };
        setPendingUpdateVerification(uncertain);
        setShowEditModal(false);
        addNotification({ title: '正在核实更新结果', message: '服务器响应不确定；先只读核实创作记录，不会自动重复提交。', type: 'warning' });
        updateVerificationLockRef.current = true;
        try {
          await resolvePendingProductionUpdate(uncertain);
        } finally {
          updateVerificationLockRef.current = false;
        }
        return;
      }

      removeStoredProductionUpdateVerification(pending.userId, pending.id);
      setPendingUpdateVerification(null);
    } catch (error) {
      removeStoredProductionUpdateVerification(pending.userId, pending.id);
      setPendingUpdateVerification(null);
      addNotification({ title: '更新失败', message: (error as Error).message, type: 'error' });
      return;
    } finally {
      saveInFlightRef.current = false;
      setSavingRecord(false);
    }

    const topicTitle = topics.find((topic) => topic.id === nextTopicId)?.title;
    const confirmedTopicTitle = topicTitle ?? productionToUpdate.topic_title ?? '当前选题';
    setProductions((current) => current.map((production) => production.id === productionToUpdate.id
      ? { ...production, topic_id: nextTopicId, topic_title: topicTitle ?? production.topic_title, version: formData.version, content: formData.content, status: formData.status }
      : production));
    addNotification({ title: '更新成功', message: '创作记录已保存', type: 'success' });
    setShowEditModal(false);
    setEditingProduction(null);
    setFormData({ topic_id: '', version: '', content: '', status: 'draft' });
    refreshAfterConfirmedWrite(`创作记录「${confirmedTopicTitle}」${formData.version.trim() ? `（${formData.version.trim()}）` : ''}已保存`);
  };

  const resolveChangedProductionUpdate = (keepDraft: boolean) => {
    const pending = pendingUpdateVerification;
    const latest = pending?.observedRecord;
    if (!pending || pending.status !== 'changed' || !latest || pending.userId !== authUserId) return;
    removeStoredProductionUpdateVerification(pending.userId, pending.id);
    setPendingUpdateVerification(null);
    setEditingProduction(latest);
    setFormData(keepDraft
      ? {
        topic_id: String(pending.payload.topic_id),
        version: pending.payload.version,
        content: pending.payload.content,
        status: pending.payload.status,
      }
      : {
        topic_id: String(latest.topic_id),
        version: latest.version,
        content: latest.content,
        status: latest.status,
      });
    setUpdateVerificationNotice(keepDraft
      ? '你已选择保留本机草稿并基于服务器最新记录继续。请先核对内容，再明确点击“更新”；后续并发变化仍会被服务器拦截。'
      : '已载入服务器最新记录。本次没有重新提交；如需修改，请先检查后再编辑。');
    setShowEditModal(true);
    addNotification({
      title: keepDraft ? '已保留编辑草稿' : '已载入服务器记录',
      message: keepDraft ? '已将服务器最新正文设为并发检查基线；只有你明确再次点击“更新”才会发送修改。' : '请核对服务器当前记录后再决定是否修改。',
      type: 'info',
    });
  };

  const acknowledgeMissingProductionUpdate = () => {
    const pending = pendingUpdateVerification;
    if (!pending || pending.status !== 'missing' || pending.userId !== authUserId) return;
    removeStoredProductionUpdateVerification(pending.userId, pending.id);
    setPendingUpdateVerification(null);
    setEditingProduction(null);
    setUpdateVerificationNotice('你已确认服务器未找到该记录；本次编辑没有重发，表单内容仍保留在当前页面。需要另建记录时，请先核对草稿再手动保存。');
    addNotification({ title: '记录状态已由你确认', message: '写入限制已解除；本次更新没有重发，表单内容仍保留。', type: 'info' });
    retryProductionList();
  };

  const topicStatusColors: Record<string, string> = {
    pending: 'bg-studio-amber-soft text-studio-amber-contrast border-studio-border-soft',
    approved: 'bg-studio-success-soft text-studio-success-contrast border-studio-border-soft',
    rejected: 'bg-studio-coral-soft text-studio-coral-contrast border-studio-border-soft',
    production: 'bg-studio-primary-soft text-studio-primary-contrast border-studio-border-soft',
    shooting: 'bg-studio-violet-soft text-studio-violet-contrast border-studio-border-soft',
    publishing: 'bg-studio-cyan-soft text-studio-cyan-contrast border-studio-border-soft',
    completed: 'bg-studio-surface-soft text-studio-text-muted border-studio-border-soft',
  };

  const topicStatusText: Record<string, string> = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已驳回',
    production: '创作中',
    shooting: '成片制作',
    publishing: '发布中',
    completed: '已完成',
  };

  const productionStatusColors: Record<string, string> = {
    draft: 'bg-studio-amber-soft text-studio-amber-contrast border-studio-border-soft',
    review: 'bg-studio-primary-soft text-studio-primary-contrast border-studio-border-soft',
    approved: 'bg-studio-success-soft text-studio-success-contrast border-studio-border-soft',
    rejected: 'bg-studio-coral-soft text-studio-coral-contrast border-studio-border-soft',
  };

  const productionStatusText: Record<string, string> = {
    draft: '草稿',
    review: '审核中',
    approved: '已通过',
    rejected: '已驳回',
  };

  const normalizedSearchTerm = searchTerm.toLowerCase();
  const filteredProductions = productions.filter((production) =>
    String(production.topic_title ?? '').toLowerCase().includes(normalizedSearchTerm) ||
    String(production.version ?? '').toLowerCase().includes(normalizedSearchTerm),
  );
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight ${styles.textPrimary}`}>创作管理</h1>
          <p className={`${styles.textSecondary} mt-1 text-sm`}>管理创作内容的版本和审核</p>
        </div>
        <button
          onClick={() => { if (!createWritesLocked) setShowCreateModal(true); }}
          disabled={loading || createWritesLocked}
          className={`flex items-center gap-2 px-5 py-2.5 ${styles.buttonPrimary} rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <Plus className="w-4 h-4" />
          <span className="font-medium text-sm">添加创作</span>
        </button>
      </div>

      {pendingCreateVerification && pendingCreateVerification.userId === authUserId ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-studio-amber/25 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0">
            {pendingCreateVerification.status === 'ready'
              ? `服务器暂未找到「${pendingCreateVerification.topicTitle}」的创作记录。原表单与请求编号已保留；只能使用同一编号安全重试，不能另建新请求。`
              : pendingCreateVerification.readError || `「${pendingCreateVerification.topicTitle}」的创建结果正在核实；核实完成前，创作列表的其它写入操作已暂停。`}
          </p>
          <ActionButton
            type="button"
            variant="secondary"
            className="self-start sm:self-auto"
            disabled={savingRecord || createVerificationLoading || pendingCreateVerification.status === 'checking'}
            onClick={() => pendingCreateVerification.status === 'ready'
              ? void submitPendingProductionCreate(pendingCreateVerification)
              : void verifyPendingProductionCreate(pendingCreateVerification)}
          >
            {savingRecord || createVerificationLoading
              ? '正在处理…'
              : pendingCreateVerification.status === 'ready' ? '使用原请求安全重试' : '只读核实创建状态'}
          </ActionButton>
        </div>
      ) : null}

      {pendingUpdateVerification && pendingUpdateVerification.userId === authUserId ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-studio-amber/25 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast">
          <p className="min-w-0">
            {pendingUpdateVerification.readError || (pendingUpdateVerification.status === 'saving'
              ? `正在保存创作记录「${pendingUpdateVerification.topicTitle}」；请等待结果。`
              : pendingUpdateVerification.status === 'checking'
                ? `正在只读核实创作记录「${pendingUpdateVerification.topicTitle}」的更新结果。`
                : `创作记录「${pendingUpdateVerification.topicTitle}」更新结果尚未确认；核实期间，创作列表的写入操作已暂停。`)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              type="button"
              variant="secondary"
              disabled={savingRecord || updateVerificationLockRef.current || pendingUpdateVerification.status === 'saving' || pendingUpdateVerification.status === 'checking'}
              onClick={() => void verifyPendingProductionUpdate(pendingUpdateVerification)}
            >
              {pendingUpdateVerification.status === 'saving' || pendingUpdateVerification.status === 'checking' ? '正在核实…' : '只读核实更新状态'}
            </ActionButton>
            {pendingUpdateVerification.status === 'changed' && pendingUpdateVerification.observedRecord ? (
              <>
                <ActionButton type="button" variant="secondary" onClick={() => resolveChangedProductionUpdate(false)}>
                  按服务器最新记录重新编辑
                </ActionButton>
                <ActionButton type="button" variant="primary" onClick={() => resolveChangedProductionUpdate(true)}>
                  保留草稿并基于最新记录继续
                </ActionButton>
              </>
            ) : null}
            {pendingUpdateVerification.status === 'missing' ? (
              <ActionButton type="button" variant="secondary" onClick={acknowledgeMissingProductionUpdate}>
                确认记录已不存在并解除限制
              </ActionButton>
            ) : null}
          </div>
        </div>
      ) : null}

      {updateVerificationNotice ? (
        <div role="status" className="rounded-xl border border-studio-border-soft bg-studio-surface-soft px-4 py-3 text-sm text-studio-text-secondary">
          {updateVerificationNotice}
        </div>
      ) : null}

      <div className={`${styles.card} p-4`}>
        <div className="relative">
          <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${styles.textMuted}`} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜索选题标题或版本号..."
            className={`w-full pl-10 pr-4 py-2.5 ${styles.input} text-sm`}
          />
        </div>
      </div>

      {listError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-studio-border-soft bg-studio-coral-soft px-4 py-3 text-sm text-studio-coral-contrast">
        <span>{listError}</span>
        <ActionButton type="button" variant="secondary" onClick={retryProductionList}>重新加载列表</ActionButton>
      </div> : null}

      <ResponsiveTableShell
        className={styles.card}
        footer={(
          <div className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${styles.border}`}>
            <p className={`text-sm ${styles.textMuted}`}>
              共 {total} 条 · 第 {page} / {totalPages} 页{searchTerm ? ` · 当前页匹配 ${filteredProductions.length} 条` : ''}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  productionListRequestIdRef.current += 1;
                  setPage((current) => Math.max(1, current - 1));
                }}
                disabled={page <= 1 || loading}
                className={`inline-flex min-h-10 items-center gap-1 rounded-button px-3 py-2 text-sm ${styles.buttonSecondary} disabled:cursor-not-allowed disabled:opacity-45`}
              >
                <ChevronLeft className="h-4 w-4" /> 上一页
              </button>
              <button
                type="button"
                onClick={() => {
                  productionListRequestIdRef.current += 1;
                  setPage((current) => Math.min(totalPages, current + 1));
                }}
                disabled={page >= totalPages || loading}
                className={`inline-flex min-h-10 items-center gap-1 rounded-button px-3 py-2 text-sm ${styles.buttonSecondary} disabled:cursor-not-allowed disabled:opacity-45`}
              >
                下一页 <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      >
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className={styles.tableHeader}>
                <th className={`text-left px-6 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>关联选题</th>
                <th className={`text-left px-6 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>版本</th>
                <th className={`text-left px-6 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>状态</th>
                <th className={`text-left px-6 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>负责人</th>
                <th className={`text-left px-6 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>创建时间</th>
                <th className="sticky right-0 z-20 w-[104px] border-l border-studio-border-soft bg-studio-surface-soft px-2 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-studio-text-muted">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className={`w-8 h-8 border-4 ${styles.spinner} border-t-transparent rounded-full animate-spin mx-auto`}></div>
                  </td>
                </tr>
              ) : filteredProductions.length === 0 && listError ? (
                <tr>
                  <td colSpan={6} className={`px-6 py-12 text-center ${styles.textSecondary}`}>列表暂不可用，请先重新加载确认内容。</td>
                </tr>
              ) : filteredProductions.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`px-6 py-12 text-center ${styles.textSecondary}`}>暂无创作记录</td>
                </tr>
              ) : (
                filteredProductions.map((production) => (
                  <tr key={production.id} className={`group border-t ${styles.tableRow} ${styles.tableHover}`}>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => navigate(`/production/${production.id}`)}
                        className="flex items-center gap-2 text-studio-primary hover:text-studio-primary"
                      >
                        <FileText className="w-4 h-4" />
                        <span className={`${styles.textPrimary} font-medium`}>{production.topic_title}</span>
                      </button>
                    </td>
                    <td className={`px-6 py-4 ${styles.textSecondary}`}>{production.version}</td>
                    <td className="px-6 py-4">
                      {(['draft', 'review'] as string[]).includes(production.status) ? (
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border ${productionStatusColors[production.status]}`}>
                          {productionStatusText[production.status]}
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border ${topicStatusColors[production.topic_status || 'production']}`}>
                          {topicStatusText[production.topic_status || 'production']}
                        </span>
                      )}
                    </td>
                    <td className={`px-6 py-4 ${styles.textSecondary}`}>{production.operator_name}</td>
                    <td className={`px-6 py-4 ${styles.textSecondary}`}>{formatBeijingDate(production.created_at)}</td>
                    <td className="sticky right-0 z-10 w-[104px] border-l border-studio-border-soft bg-studio-surface px-2 py-3 transition-colors group-hover:bg-studio-surface-soft">
                      <div className="flex items-center gap-1">
                        <ActionButton
                          type="button"
                          variant="icon"
                          onClick={() => navigate(`/production/${production.id}`)}
                          className="h-10 w-10 min-h-10 min-w-10 p-2 text-studio-text-muted transition hover:bg-studio-surface-soft hover:text-studio-cyan-contrast"
                          title="查看详情"
                          aria-label={`查看创作记录 ${production.topic_title}`}
                        >
                          <FileText className="h-4 w-4" />
                        </ActionButton>
                        <ActionButton
                          type="button"
                          variant="icon"
                          onClick={() => handleEdit(production)}
                          disabled={createWritesLocked}
                          className="h-10 w-10 min-h-10 min-w-10 p-2 text-studio-text-secondary transition hover:border-studio-border-active hover:text-studio-text-primary"
                          title="编辑记录"
                          aria-label={`编辑创作记录 ${production.topic_title}`}
                          aria-disabled={createWritesLocked}
                        >
                          <Edit3 className="h-4 w-4" />
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
      </ResponsiveTableShell>

      {showCreateModal && (
        <BaseModal
          open={showCreateModal}
          onClose={closeCreateModal}
          title="添加创作记录"
          size="md"
          closeOnOverlayClick={!savingRecord && !createWritesLocked}
          closeOnEscape={!savingRecord && !createWritesLocked}
          showCloseButton={!savingRecord && !createWritesLocked}
          footer={(
            <div className="flex gap-3">
              <button
                type="button"
                disabled={savingRecord || createWritesLocked}
                onClick={closeCreateModal}
                className={`flex-1 rounded-button px-4 py-2 ${styles.buttonSecondary} transition-colors disabled:cursor-not-allowed disabled:opacity-50`}
              >
                取消
              </button>
              <button
                type="button"
                disabled={savingRecord || createWritesLocked}
                onClick={handleCreate}
                className={`flex-1 rounded-button px-4 py-2 ${styles.buttonPrimary} transition-colors disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {savingRecord ? '保存中...' : '保存'}
              </button>
            </div>
          )}
        >
            <div className="space-y-4">
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>关联选题 *</label>
                <select
                  value={formData.topic_id}
                  onChange={(e) => setFormData({ ...formData, topic_id: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.bgInput} border ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing}`}
                >
                  <option value="">请选择选题</option>
                  {topics.map(topic => (
                    <option key={topic.id} value={topic.id}>{topic.title}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>版本</label>
                <input
                  type="text"
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.bgInput} border ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing}`}
                  placeholder="如：v1.0"
                />
              </div>
              
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>内容描述</label>
                <textarea
                  ref={createTextareaRef}
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={1}
                  className={`w-full px-4 py-2 ${styles.bgInput} border ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing} transition-all duration-200 overflow-hidden`}
                  placeholder="请输入创作内容描述"
                  style={{
                    minHeight: '100px',
                    maxHeight: '300px',
                    fontSize: '18px',
                    lineHeight: '1.6'
                  }}
                />
              </div>
              
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>状态</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.bgInput} border ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing}`}
                >
                  <option value="draft">草稿</option>
                  <option value="review">审核中</option>
                  <option value="approved">已通过</option>
                  <option value="rejected">已驳回</option>
                </select>
              </div>
              
            </div>
        </BaseModal>
      )}

      {showEditModal && (
        <BaseModal
          open={showEditModal}
          onClose={closeEditModal}
          title="编辑创作记录"
          size="md"
          closeOnOverlayClick={!savingRecord && !createWritesLocked}
          closeOnEscape={!savingRecord && !createWritesLocked}
          showCloseButton={!savingRecord && !createWritesLocked}
          footer={(
            <div className="flex gap-3">
              <button
                type="button"
                disabled={savingRecord || createWritesLocked}
                onClick={closeEditModal}
                className={`flex-1 rounded-button px-4 py-2 ${styles.buttonSecondary} transition-colors disabled:cursor-not-allowed disabled:opacity-50`}
              >
                取消
              </button>
              <button
                type="button"
                disabled={savingRecord || createWritesLocked}
                onClick={handleUpdate}
                className={`flex-1 rounded-button px-4 py-2 ${styles.buttonPrimary} transition-colors disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {savingRecord ? '保存中...' : '更新'}
              </button>
            </div>
          )}
        >
            <div className="space-y-4">
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>关联选题 *</label>
                <select
                  value={formData.topic_id}
                  onChange={(e) => setFormData({ ...formData, topic_id: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.bgInput} border ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing}`}
                >
                  <option value="">请选择选题</option>
                  {topics.map(topic => (
                    <option key={topic.id} value={topic.id}>{topic.title}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>版本</label>
                <input
                  type="text"
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.bgInput} border ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing}`}
                  placeholder="如：v1.0"
                />
              </div>
              
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>内容描述</label>
                <textarea
                  ref={editTextareaRef}
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={3}
                  className={`w-full px-4 py-2 ${styles.bgInput} border ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing} resize-none transition-all duration-200`}
                  placeholder="请输入创作内容描述"
                  style={{
                    minHeight: '100px',
                    maxHeight: '300px',
                    fontSize: '16px',
                    lineHeight: '1.6'
                  }}
                />
              </div>
              
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>状态</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.bgInput} border ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing}`}
                >
                  <option value="draft">草稿</option>
                  <option value="review">审核中</option>
                  <option value="approved">已通过</option>
                  <option value="rejected">已驳回</option>
                </select>
              </div>
              
            </div>
        </BaseModal>
      )}
    </div>
  );
}
