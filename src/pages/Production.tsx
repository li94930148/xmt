import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore, useAuthStore } from '../store';
import { getProduction, createProduction, getProductionCreateStatus, getTopics, updateProduction } from '../api';
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
type PendingProductionCreateVerification = {
  clientRequestId: string;
  userId: number;
  payload: ProductionCreatePayload;
  topicTitle: string;
  page: number;
  status: 'uncertain' | 'ready' | 'checking';
  readError: string | null;
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
  const [createVerificationLoading, setCreateVerificationLoading] = useState(false);
  const initialPendingCreateVerificationRef = useRef(pendingCreateVerification);
  const restoredCreateVerificationStartedRef = useRef(false);
  const createVerificationLockRef = useRef(false);
  const createWritesLocked = Boolean(pendingCreateVerification && pendingCreateVerification.userId === authUserId);
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

    const productionToUpdate = editingProduction;
    const nextTopicId = parseInt(formData.topic_id);
    saveInFlightRef.current = true;
    setSavingRecord(true);
    try {
      await updateProduction(productionToUpdate.id, {
        topic_id: nextTopicId,
        version: formData.version, 
        content: formData.content, 
        expected_content: productionToUpdate.content,
        status: formData.status,
        version_action: 'none',
      });
    } catch (error) {
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
