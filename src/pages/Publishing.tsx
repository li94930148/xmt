import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle,
  Edit3,
  ExternalLink,
  FileText,
  Heart,
  Link2,
  MessageCircle,
  Play,
  Plus,
  RefreshCw,
  Share2,
  Trash2,
  Unlink,
  UserRound,
} from 'lucide-react';
import {
  createPublishing,
  deletePublishing,
  getPublishingDouyinCandidates,
  getPublishingCreateStatus,
  getPublishingDeleteStatus,
  getPublishingDouyinLinkState,
  getPublishingUpdateStatus,
  getPublishing,
  getTopics,
  reconcilePublishingDouyin,
  updatePublishing,
  updatePublishingDouyinLink,
} from '../api';
import type { PublishingDouyinCandidate } from '../api';
import type { PublishingSummary, PublishingUpdatePayload } from '../api/workflow';
import { getWorkflowStatusLabel } from '../platform/workflow-status-labels';
import { BaseModal, ConfirmModal, FormModal, LoadingState } from '../components/common';
import ActionButton from '../components/studio/ActionButton';
import GlassPanel from '../components/studio/GlassPanel';
import MetricCard from '../components/studio/MetricCard';
import PageHeader from '../components/studio/PageHeader';
import PageShell from '../components/studio/PageShell';
import PlatformBadge from '../components/studio/PlatformBadge';
import ResponsiveTableShell from '../components/studio/ResponsiveTableShell';
import SearchBar from '../components/studio/SearchBar';
import StatusPill, { type StatusTone } from '../components/studio/StatusPill';
import StudioEmptyState from '../components/studio/EmptyState';
import { formatBeijingDate } from '../lib/utils';
import { useAppStore, useAuthStore } from '../store';
import { Publishing as PublishingType, Topic } from '../types';
import { usePermission } from '../hooks/usePermission';

interface PendingPublishingDeleteVerification {
  id: number;
  title: string;
  page: number;
  readError: string | null;
}

type PublishingCreatePayload = Parameters<typeof createPublishing>[0];

interface PendingPublishingCreateVerification {
  clientRequestId: string;
  userId: number;
  payload: PublishingCreatePayload;
  page: number;
  status: 'checking' | 'uncertain' | 'ready';
  readError: string | null;
}

type PublishingEditPayload = Pick<PublishingUpdatePayload, 'platform' | 'url' | 'status' | 'publish_time' | 'views' | 'likes' | 'shares' | 'comments'>;

interface PendingPublishingUpdateVerification {
  id: number;
  userId: number;
  title: string;
  page: number;
  payload: PublishingEditPayload;
  original: PublishingEditPayload;
  originalRecord: PublishingType;
  status: 'checking' | 'uncertain';
  readError: string | null;
}

interface PendingPublishingDouyinLinkVerification {
  id: number;
  userId: number;
  title: string;
  page: number;
  requestedWorkId: number | null;
  originalWorkId: number | null;
  status: 'checking' | 'uncertain';
  readError: string | null;
}

function publishingDeleteVerificationKey(userId: number | undefined) {
  return userId ? `xmt:publishing-delete-pending:v1:user:${userId}` : null;
}

function publishingCreateVerificationKey(userId: number | undefined) {
  return userId ? `xmt:publishing-create-pending:v1:user:${userId}` : null;
}

function publishingUpdateVerificationKey(userId: number | undefined) {
  return userId ? `xmt:publishing-update-pending:v1:user:${userId}` : null;
}

function publishingDouyinLinkVerificationKey(userId: number | undefined) {
  return userId ? `xmt:publishing-douyin-link-pending:v1:user:${userId}` : null;
}

function readPublishingDouyinWorkId(value: unknown): number | null | undefined {
  if (value == null) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function loadPendingPublishingDouyinLinkVerification(userId: number | undefined): PendingPublishingDouyinLinkVerification | null {
  const key = publishingDouyinLinkVerificationKey(userId);
  if (!key || userId === undefined || typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null') as Partial<PendingPublishingDouyinLinkVerification> | null;
    const requestedWorkId = readPublishingDouyinWorkId(value?.requestedWorkId);
    const originalWorkId = readPublishingDouyinWorkId(value?.originalWorkId);
    if (!value || value.userId !== userId || !Number.isSafeInteger(value.id) || Number(value.id) <= 0
      || typeof value.title !== 'string' || !Number.isSafeInteger(value.page) || Number(value.page) <= 0
      || requestedWorkId === undefined || originalWorkId === undefined) return null;
    return {
      id: Number(value.id),
      userId,
      title: value.title,
      page: Number(value.page),
      requestedWorkId,
      originalWorkId,
      status: 'uncertain',
      readError: null,
    };
  } catch {
    return null;
  }
}

function persistPendingPublishingDouyinLinkVerification(pending: PendingPublishingDouyinLinkVerification) {
  const key = publishingDouyinLinkVerificationKey(pending.userId);
  if (!key || typeof window === 'undefined') throw new Error('当前账号尚未确认，无法安全保存关联恢复状态');
  sessionStorage.setItem(key, JSON.stringify({
    id: pending.id,
    userId: pending.userId,
    title: pending.title,
    page: pending.page,
    requestedWorkId: pending.requestedWorkId,
    originalWorkId: pending.originalWorkId,
    status: 'uncertain',
  }));
  const stored = loadPendingPublishingDouyinLinkVerification(pending.userId);
  if (!stored || stored.id !== pending.id || stored.requestedWorkId !== pending.requestedWorkId
    || stored.originalWorkId !== pending.originalWorkId) {
    throw new Error('关联恢复状态未能保存，本次未发送写入');
  }
}

function removeStoredPublishingDouyinLinkVerification(userId: number, id: number) {
  const key = publishingDouyinLinkVerificationKey(userId);
  if (!key || typeof window === 'undefined') return;
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) || 'null') as { id?: unknown } | null;
    if (Number(stored?.id) === id) sessionStorage.removeItem(key);
  } catch {
    // A read-only state check remains safe if marker cleanup fails.
  }
}

function isPublishingEditPayload(value: unknown): value is PublishingEditPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return (payload.platform === undefined || typeof payload.platform === 'string')
    && (payload.url === undefined || typeof payload.url === 'string')
    && (payload.status === undefined || typeof payload.status === 'string')
    && (payload.publish_time === undefined || typeof payload.publish_time === 'string')
    && ['views', 'likes', 'shares', 'comments'].every((field) => {
      const metric = payload[field];
      return metric === undefined || metric === null || (typeof metric === 'number' && Number.isSafeInteger(metric) && metric >= 0);
    });
}

function loadPendingPublishingUpdateVerification(userId: number | undefined): PendingPublishingUpdateVerification | null {
  const key = publishingUpdateVerificationKey(userId);
  if (!key || userId === undefined || typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null') as Partial<PendingPublishingUpdateVerification> | null;
    const originalRecord = value?.originalRecord as Partial<PublishingType> | undefined;
    if (!value || value.userId !== userId || !Number.isInteger(value.id) || Number(value.id) <= 0
      || !Number.isInteger(value.page) || Number(value.page) <= 0 || typeof value.title !== 'string'
      || !isPublishingEditPayload(value.payload) || !isPublishingEditPayload(value.original)
      || !originalRecord || Number(originalRecord.id) !== Number(value.id)
      || !Number.isInteger(originalRecord.topic_id) || typeof originalRecord.platform !== 'string'
      || typeof originalRecord.status !== 'string' || typeof originalRecord.url !== 'string'
      || typeof originalRecord.publish_time !== 'string') return null;
    return {
      id: Number(value.id),
      userId,
      title: value.title,
      page: Number(value.page),
      payload: value.payload,
      original: value.original,
      originalRecord: originalRecord as PublishingType,
      status: 'uncertain',
      readError: null,
    };
  } catch {
    return null;
  }
}

function removeStoredPublishingUpdateVerification(userId: number, id: number) {
  const key = publishingUpdateVerificationKey(userId);
  if (!key || typeof window === 'undefined') return;
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) || 'null') as { id?: unknown } | null;
    if (Number(stored?.id) === id) sessionStorage.removeItem(key);
  } catch {
    // A read-only status check remains safe even if this session marker cannot be removed.
  }
}

function loadPendingPublishingCreateVerification(userId: number | undefined): PendingPublishingCreateVerification | null {
  const key = publishingCreateVerificationKey(userId);
  if (!key || userId === undefined || typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null') as Partial<PendingPublishingCreateVerification> | null;
    const payload = value?.payload as Partial<PublishingCreatePayload> | undefined;
    if (!value || value.userId !== userId || typeof value.clientRequestId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.clientRequestId)
      || !payload || !Number.isInteger(payload.topic_id) || Number(payload.topic_id) <= 0
      || typeof payload.platform !== 'string' || typeof payload.url !== 'string'
      || typeof payload.status !== 'string' || typeof payload.publish_time !== 'string'
      || !Number.isInteger(value.page) || Number(value.page) <= 0
      || !['pending', 'published', 'failed', 'scheduled'].includes(payload.status)) return null;
    const metricValues = [payload.views, payload.likes, payload.shares, payload.comments];
    if (metricValues.some((metric) => metric !== null && metric !== undefined
      && (!Number.isInteger(metric) || Number(metric) < 0))) return null;
    return {
      clientRequestId: value.clientRequestId,
      userId,
      payload: {
        topic_id: Number(payload.topic_id),
        platform: payload.platform,
        url: payload.url,
        status: payload.status,
        publish_time: payload.publish_time,
        views: payload.views == null ? null : Number(payload.views),
        likes: payload.likes == null ? null : Number(payload.likes),
        shares: payload.shares == null ? null : Number(payload.shares),
        comments: payload.comments == null ? null : Number(payload.comments),
      },
      page: Number(value.page),
      status: value.status === 'ready' ? 'ready' : 'uncertain',
      readError: null,
    };
  } catch {
    return null;
  }
}

function removeStoredPublishingCreateVerification(userId: number, clientRequestId: string) {
  const key = publishingCreateVerificationKey(userId);
  if (!key || typeof window === 'undefined') return;
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) || 'null') as { clientRequestId?: unknown } | null;
    if (stored?.clientRequestId === clientRequestId) sessionStorage.removeItem(key);
  } catch {
    // Storage cleanup is best-effort; a fresh read remains safe because the server key is idempotent.
  }
}

function loadPendingPublishingDeleteVerification(userId: number | undefined): PendingPublishingDeleteVerification | null {
  const key = publishingDeleteVerificationKey(userId);
  if (!key || typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null') as Partial<PendingPublishingDeleteVerification> | null;
    if (!value || !Number.isInteger(value.id) || Number(value.id) <= 0
      || typeof value.title !== 'string' || !Number.isInteger(value.page) || Number(value.page) <= 0) return null;
    return { id: Number(value.id), title: value.title, page: Number(value.page), readError: null };
  } catch {
    return null;
  }
}

function isDefinitivePublishingDeleteRejection(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && ![404, 408, 425, 429].includes(status);
}

function isDefinitivePublishingCreateRejection(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && ![408, 409, 425, 429].includes(status);
}

function isDefinitivePublishingUpdateRejection(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && ![408, 425, 429].includes(status);
}

function isDefinitivePublishingDouyinLinkRejection(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && ![408, 425, 429].includes(status);
}

const initialFormData = {
  topic_id: '',
  platform: '',
  url: '',
  status: 'pending',
  publish_time: '',
  views: '',
  likes: '',
  shares: '',
  comments: '',
};

const statusTone: Record<string, StatusTone> = {
  pending: 'amber',
  published: 'success',
  failed: 'coral',
  scheduled: 'cyan',
};

const metricSourceLabels: Record<string, string> = {
  douyin_official_export: '官方',
  manual: '手录',
  douyin_creator_collection: '采集',
  douyin_legacy_current: '旧同步',
  legacy_analytics: '旧历史',
  unavailable: '待补',
};

function formMetricValue(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function publishingDateInputValue(value: string | null | undefined) {
  return String(value ?? '').trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T]|$)/)?.[1] || '';
}

function publishingDateFromRecord(record: Pick<PublishingType, 'publishing_publish_time' | 'publish_time'>) {
  const storedDate = [record.publishing_publish_time, record.publish_time]
    .find((value) => typeof value === 'string' && value.trim().length > 0);
  return publishingDateInputValue(storedDate);
}

function getNextAction(status: string) {
  if (status === 'published') {
    return '查看数据';
  }
  if (status === 'failed') {
    return '处理异常';
  }
  if (status === 'scheduled') {
    return '确认排期';
  }
  return '准备发布';
}

export default function Publishing() {
  const authUserId = useAuthStore((state) => state.user?.id);
  const [publishings, setPublishings] = useState<PublishingType[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPublishing, setEditingPublishing] = useState<PublishingType | null>(null);
  const [formData, setFormData] = useState(initialFormData);
  const [deleteTarget, setDeleteTarget] = useState<PublishingType | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [savingPublishing, setSavingPublishing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  // 页大小以服务端返回为准，避免前端写死与后端默认值脱节
  const [pageSize, setPageSize] = useState(50);
  const [summary, setSummary] = useState<PublishingSummary>({ today: 0, pending: 0, published: 0, failed: 0 });
  const [linkTarget, setLinkTarget] = useState<PublishingType | null>(null);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkCandidates, setLinkCandidates] = useState<PublishingDouyinCandidate[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [savingDouyinLink, setSavingDouyinLink] = useState(false);
  const [pendingDouyinLinkVerification, setPendingDouyinLinkVerification] = useState<PendingPublishingDouyinLinkVerification | null>(
    () => loadPendingPublishingDouyinLinkVerification(authUserId),
  );
  const initialPendingDouyinLinkVerificationRef = useRef(pendingDouyinLinkVerification);
  const [douyinLinkVerificationLoading, setDouyinLinkVerificationLoading] = useState(false);
  const [syncingDouyin, setSyncingDouyin] = useState(false);
  const [pendingCreateVerification, setPendingCreateVerification] = useState<PendingPublishingCreateVerification | null>(
    () => loadPendingPublishingCreateVerification(authUserId),
  );
  const [pendingUpdateVerification, setPendingUpdateVerification] = useState<PendingPublishingUpdateVerification | null>(
    () => loadPendingPublishingUpdateVerification(authUserId),
  );
  const initialPendingCreateVerificationRef = useRef(pendingCreateVerification);
  const initialPendingUpdateVerificationRef = useRef(pendingUpdateVerification);
  const [createVerificationLoading, setCreateVerificationLoading] = useState(false);
  const [pendingDeleteVerification, setPendingDeleteVerification] = useState<PendingPublishingDeleteVerification | null>(
    () => loadPendingPublishingDeleteVerification(authUserId),
  );
  const initialRequestedPageRef = useRef(pendingDeleteVerification?.page ?? 1);
  const [deleteVerificationNotice, setDeleteVerificationNotice] = useState<string | null>(null);
  const [updateVerificationNotice, setUpdateVerificationNotice] = useState<string | null>(null);
  const [deleteVerificationLoading, setDeleteVerificationLoading] = useState(false);
  const mutationLockRef = useRef(false);
  const deleteLockRef = useRef(false);
  const deleteVerificationLockRef = useRef(false);
  const restoredDeleteVerificationStartedRef = useRef(false);
  const douyinLinkVerificationLockRef = useRef(false);
  const restoredDouyinLinkVerificationStartedRef = useRef(false);
  const createVerificationLockRef = useRef(false);
  const updateVerificationLockRef = useRef(false);
  const restoredUpdateVerificationStartedRef = useRef(false);
  const restoredCreateVerificationStartedRef = useRef(false);
  const reconcileLockRef = useRef(false);
  const douyinLinkLockRef = useRef(false);
  const linkCandidateRequestSequenceRef = useRef(0);
  const linkTargetIdRef = useRef<number | null>(null);
  const linkQueryRef = useRef('');

  useEffect(() => () => {
    linkCandidateRequestSequenceRef.current += 1;
    linkTargetIdRef.current = null;
  }, []);

  const navigate = useNavigate();
  const addNotification = useAppStore((state) => state.addNotification);
  const { hasAllPermissions, loading: permissionsLoading } = usePermission();
  const canManageDouyinLinks = !permissionsLoading
    && hasAllPermissions(['workflow:publishing', 'creator:data:view']);
  const publishingWritesLocked = Boolean(
    pendingDeleteVerification || pendingCreateVerification || pendingUpdateVerification
    || pendingDouyinLinkVerification?.userId === authUserId || syncingDouyin || savingDouyinLink,
  );

  useEffect(() => {
    const key = publishingDeleteVerificationKey(authUserId);
    if (!key) return;
    try {
      if (pendingDeleteVerification) {
        sessionStorage.setItem(key, JSON.stringify({
          id: pendingDeleteVerification.id,
          title: pendingDeleteVerification.title,
          page: pendingDeleteVerification.page,
        }));
      } else {
        sessionStorage.removeItem(key);
      }
    } catch {
      // Keep the in-memory write lock if this browser session cannot persist recovery state.
    }
  }, [authUserId, pendingDeleteVerification]);

  useEffect(() => {
    const key = publishingCreateVerificationKey(authUserId);
    if (!key) return;
    const pending = pendingCreateVerification;
    try {
      if (pending && pending.userId === authUserId) {
        sessionStorage.setItem(key, JSON.stringify({
          clientRequestId: pending.clientRequestId,
          userId: pending.userId,
          payload: pending.payload,
          page: pending.page,
          status: pending.status,
        }));
      } else {
        sessionStorage.removeItem(key);
      }
    } catch {
      // The in-memory request key still makes same-tab retries idempotent.
    }
  }, [authUserId, pendingCreateVerification]);

  useEffect(() => {
    const key = publishingUpdateVerificationKey(authUserId);
    if (!key) return;
    try {
      if (pendingUpdateVerification && pendingUpdateVerification.userId === authUserId) {
        sessionStorage.setItem(key, JSON.stringify({
          id: pendingUpdateVerification.id,
          userId: pendingUpdateVerification.userId,
          title: pendingUpdateVerification.title,
          page: pendingUpdateVerification.page,
          payload: pendingUpdateVerification.payload,
          original: pendingUpdateVerification.original,
          originalRecord: pendingUpdateVerification.originalRecord,
          status: pendingUpdateVerification.status,
        }));
      } else {
        sessionStorage.removeItem(key);
      }
    } catch {
      // The in-memory write lock remains active if this tab cannot persist recovery state.
    }
  }, [authUserId, pendingUpdateVerification]);

  useEffect(() => {
    const key = publishingDouyinLinkVerificationKey(authUserId);
    if (!key) return;
    try {
      if (pendingDouyinLinkVerification && pendingDouyinLinkVerification.userId === authUserId) {
        sessionStorage.setItem(key, JSON.stringify({
          id: pendingDouyinLinkVerification.id,
          userId: pendingDouyinLinkVerification.userId,
          title: pendingDouyinLinkVerification.title,
          page: pendingDouyinLinkVerification.page,
          requestedWorkId: pendingDouyinLinkVerification.requestedWorkId,
          originalWorkId: pendingDouyinLinkVerification.originalWorkId,
          status: 'uncertain',
        }));
      } else if (!pendingDouyinLinkVerification) {
        sessionStorage.removeItem(key);
      }
    } catch {
      // The pre-write session marker is saved synchronously before sending a link request.
    }
  }, [authUserId, pendingDouyinLinkVerification]);

  const fetchData = useCallback(async (requestedPage = 1): Promise<boolean> => {
    setLoading(true);
    setListError(null);
    try {
      const [initialResult, topicList] = await Promise.all([
        getPublishing({ page: requestedPage }),
        getTopics(),
      ]);
      let result = initialResult;
      // 删除末页最后一条后当前页会越界变空，回退到上一页避免出现空白列表
      if (result.data.length === 0 && result.page > 1) {
        result = await getPublishing({ page: result.page - 1 });
      }
      setPublishings(result.data);
      setPage(result.page);
      setTotal(result.total);
      setPageSize(result.limit || 50);
      setSummary(result.summary);
      setTopics(topicList.data.filter((topic) => topic.status === 'publishing' || topic.status === 'shooting'));
      return true;
    } catch (error) {
      setListError((error as Error).message || '暂时无法读取发布列表');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAfterConfirmedMutation = useCallback(async (requestedPage: number, confirmedAction: string) => {
    const refreshed = await fetchData(requestedPage);
    if (!refreshed) {
      setListError(`${confirmedAction}，但发布列表刷新失败；请重新加载列表确认，不要重复操作。`);
    }
    return refreshed;
  }, [fetchData]);

  const resetForm = useCallback(() => {
    setFormData(initialFormData);
    setEditingPublishing(null);
  }, []);

  const finishPublishingCreate = useCallback(async (
    pending: PendingPublishingCreateVerification,
    publishingId: number,
    verified: boolean,
  ) => {
    removeStoredPublishingCreateVerification(pending.userId, pending.clientRequestId);
    setPendingCreateVerification(null);
    setShowCreateModal(false);
    setEditingPublishing(null);
    setFormData(initialFormData);
    addNotification(verified
      ? { title: '创建结果已核实', message: `服务器确认发布记录 #${publishingId} 已创建，没有重复提交。`, type: 'success' }
      : { title: '创建成功', message: '发布记录已添加，没有重复创建。', type: 'success' });
    await refreshAfterConfirmedMutation(1, '服务端已确认发布记录创建');
  }, [addNotification, refreshAfterConfirmedMutation]);

  const resolvePendingPublishingCreate = useCallback(async (pending: PendingPublishingCreateVerification) => {
    try {
      const status = await getPublishingCreateStatus(pending.clientRequestId);
      if (status.status === 'created') {
        await finishPublishingCreate(pending, status.publishingId, true);
      } else if (status.status === 'deleted') {
        removeStoredPublishingCreateVerification(pending.userId, pending.clientRequestId);
        setPendingCreateVerification(null);
        setShowCreateModal(false);
        setEditingPublishing(null);
        setFormData(initialFormData);
        addNotification({ title: '原请求对应记录已删除', message: '已核实这条发布记录已删除，不会因重试而重新创建。', type: 'info' });
      } else {
        setPendingCreateVerification({ ...pending, status: 'ready', readError: null });
        setShowCreateModal(false);
        addNotification({
          title: '创建结果尚未确认',
          message: '服务器暂未找到这条发布记录；原内容与请求编号已保留，可使用同一编号安全重试。',
          type: 'warning',
        });
      }
    } catch (error) {
      const readError = error instanceof Error ? error.message : '读取失败';
      setPendingCreateVerification({
        ...pending,
        status: 'uncertain',
        readError: `发布记录创建结果尚未确认，状态读取失败（${readError}）。请只读核实，不要另建一条。`,
      });
      setShowCreateModal(false);
      addNotification({
        title: '创建结果待确认',
        message: '写入状态暂时无法读取。已暂停发布页面的其它写入，请先只读核实，避免重复创建。',
        type: 'warning',
      });
    }
  }, [addNotification, finishPublishingCreate]);

  const verifyPendingPublishingCreate = useCallback(async (pending: PendingPublishingCreateVerification) => {
    if (createVerificationLockRef.current || mutationLockRef.current) return;
    createVerificationLockRef.current = true;
    setCreateVerificationLoading(true);
    setPendingCreateVerification({ ...pending, status: 'checking', readError: null });
    try {
      await resolvePendingPublishingCreate(pending);
    } finally {
      createVerificationLockRef.current = false;
      setCreateVerificationLoading(false);
    }
  }, [resolvePendingPublishingCreate]);

  const submitPendingPublishingCreate = useCallback(async (pending: PendingPublishingCreateVerification) => {
    if (mutationLockRef.current || createVerificationLockRef.current) return;
    mutationLockRef.current = true;
    setSavingPublishing(true);
    const checking = { ...pending, status: 'checking' as const, readError: null };
    setPendingCreateVerification(checking);
    try {
      const key = publishingCreateVerificationKey(pending.userId);
      try {
        if (key) sessionStorage.setItem(key, JSON.stringify({
          clientRequestId: pending.clientRequestId,
          userId: pending.userId,
          payload: pending.payload,
          page: pending.page,
          status: 'uncertain',
        }));
      } catch {
        // The in-memory key still protects same-tab retries.
      }
      try {
        const result = await createPublishing(pending.payload, pending.clientRequestId);
        await finishPublishingCreate(pending, Number(result.publishingId), false);
      } catch (error) {
        if (isDefinitivePublishingCreateRejection(error) && pending.status !== 'ready') {
          removeStoredPublishingCreateVerification(pending.userId, pending.clientRequestId);
          setPendingCreateVerification(null);
          setFormData({
            topic_id: String(pending.payload.topic_id),
            platform: pending.payload.platform || '',
            url: pending.payload.url || '',
            status: pending.payload.status || 'pending',
            publish_time: pending.payload.publish_time || '',
            views: pending.payload.views == null ? '' : String(pending.payload.views),
            likes: pending.payload.likes == null ? '' : String(pending.payload.likes),
            shares: pending.payload.shares == null ? '' : String(pending.payload.shares),
            comments: pending.payload.comments == null ? '' : String(pending.payload.comments),
          });
          setShowCreateModal(true);
          addNotification({ title: '创建失败', message: (error as Error).message, type: 'error' });
        } else {
          await resolvePendingPublishingCreate(checking);
        }
      }
    } finally {
      mutationLockRef.current = false;
      setSavingPublishing(false);
    }
  }, [addNotification, finishPublishingCreate, resolvePendingPublishingCreate]);

  useEffect(() => {
    const pending = initialPendingCreateVerificationRef.current;
    if (restoredCreateVerificationStartedRef.current || !pending) return;
    restoredCreateVerificationStartedRef.current = true;
    initialPendingCreateVerificationRef.current = null;
    void verifyPendingPublishingCreate(pending);
  }, [verifyPendingPublishingCreate]);

  const restorePublishingEditForm = useCallback((pending: PendingPublishingUpdateVerification, record: PublishingType, payload: PublishingEditPayload) => {
    setEditingPublishing(record);
    setFormData({
      topic_id: String(record.topic_id),
      platform: payload.platform !== undefined ? payload.platform : (record.publishing_platform ?? record.platform ?? ''),
      url: payload.url !== undefined ? payload.url : (record.url || ''),
      status: payload.status !== undefined ? payload.status : (record.publishing_status ?? record.status),
      publish_time: payload.publish_time !== undefined
        ? publishingDateInputValue(payload.publish_time)
        : publishingDateFromRecord(record),
      views: payload.views !== undefined ? (payload.views === null ? '' : String(payload.views)) : (record.manual_views == null ? '' : String(record.manual_views)),
      likes: payload.likes !== undefined ? (payload.likes === null ? '' : String(payload.likes)) : (record.manual_likes == null ? '' : String(record.manual_likes)),
      shares: payload.shares !== undefined ? (payload.shares === null ? '' : String(payload.shares)) : (record.manual_shares == null ? '' : String(record.manual_shares)),
      comments: payload.comments !== undefined ? (payload.comments === null ? '' : String(payload.comments)) : (record.manual_comments == null ? '' : String(record.manual_comments)),
    });
    setShowCreateModal(true);
    setPendingUpdateVerification(null);
  }, []);

  const resolvePendingPublishingUpdate = useCallback(async (pending: PendingPublishingUpdateVerification) => {
    try {
      const result = await getPublishingUpdateStatus(pending.id, pending.payload, pending.original);
      removeStoredPublishingUpdateVerification(pending.userId, pending.id);
      setPendingUpdateVerification(null);
      if (result.status === 'applied') {
        setShowCreateModal(false);
        resetForm();
        setUpdateVerificationNotice(null);
        addNotification({ title: '更新结果已核实', message: `服务器确认发布记录「${pending.title}」已更新，没有重复提交。`, type: 'success' });
        await refreshAfterConfirmedMutation(pending.page, '服务端已确认发布记录更新');
        return;
      }
      if (result.status === 'missing') {
        setShowCreateModal(false);
        resetForm();
        setUpdateVerificationNotice(`发布记录「${pending.title}」已不存在；本次更新未重发。请重新加载列表确认当前数据。`);
        addNotification({ title: '记录已不存在', message: '服务器没有找到这条发布记录；未重复提交更新。', type: 'warning' });
        await fetchData(pending.page);
        return;
      }
      if (result.status === 'unchanged') {
        restorePublishingEditForm(pending, pending.originalRecord, pending.payload);
        setUpdateVerificationNotice('服务器仍保留原值；编辑内容已恢复。核对后如需更新，请由你手动再次提交。');
        addNotification({ title: '更新尚未应用', message: '服务器值与保存前一致；表单已保留，可核对后手动重试。', type: 'warning' });
        return;
      }

      const currentRecord: PublishingType = {
        ...pending.originalRecord,
        id: result.current.id,
        topic_id: result.current.topic_id,
        publishing_platform: result.current.platform,
        publishing_status: result.current.status,
        publishing_publish_time: result.current.publish_time || '',
        platform: pending.originalRecord.data_source === 'douyin' ? pending.originalRecord.platform : (result.current.platform || ''),
        status: pending.originalRecord.data_source === 'douyin' ? pending.originalRecord.status : (result.current.status || ''),
        publish_time: result.current.publish_time || '',
        url: result.current.url || '',
        manual_views: result.current.views,
        manual_likes: result.current.likes,
        manual_shares: result.current.shares,
        manual_comments: result.current.comments,
        views: result.current.views ?? undefined,
        likes: result.current.likes ?? undefined,
        shares: result.current.shares ?? undefined,
        comments: result.current.comments ?? undefined,
      };
      restorePublishingEditForm(pending, currentRecord, pending.payload);
      setUpdateVerificationNotice('服务器记录已发生其他变化；当前内容和你的编辑草稿均已保留。请核对后再由你手动提交，不会自动重试。');
      addNotification({ title: '服务器记录已变化', message: '已读回最新状态并保留编辑草稿；请核对后再明确提交。', type: 'warning' });
      await fetchData(pending.page);
    } catch (error) {
      const readError = error instanceof Error ? error.message : '读取失败';
      setShowCreateModal(false);
      setPendingUpdateVerification({
        ...pending,
        status: 'uncertain',
        readError: `发布记录更新结果尚未确认，当前状态也无法读取（${readError}）。请只读核实，不要重复提交。`,
      });
      addNotification({ title: '更新结果待确认', message: '服务器状态暂时无法读取；发布页面写入已暂停，请先只读核实。', type: 'warning' });
    }
  }, [addNotification, fetchData, refreshAfterConfirmedMutation, resetForm, restorePublishingEditForm]);

  const verifyPendingPublishingUpdate = useCallback(async (pending: PendingPublishingUpdateVerification) => {
    if (updateVerificationLockRef.current || mutationLockRef.current || createVerificationLockRef.current) return;
    updateVerificationLockRef.current = true;
    setPendingUpdateVerification({ ...pending, status: 'checking', readError: null });
    try {
      await resolvePendingPublishingUpdate(pending);
    } finally {
      updateVerificationLockRef.current = false;
    }
  }, [resolvePendingPublishingUpdate]);

  const submitPendingPublishingUpdate = useCallback(async (pending: PendingPublishingUpdateVerification) => {
    if (mutationLockRef.current || updateVerificationLockRef.current || createVerificationLockRef.current) return;
    mutationLockRef.current = true;
    setSavingPublishing(true);
    setUpdateVerificationNotice(null);
    const checking = { ...pending, status: 'checking' as const, readError: null };
    setPendingUpdateVerification(checking);
    const key = publishingUpdateVerificationKey(pending.userId);
    try {
      try {
        if (key) sessionStorage.setItem(key, JSON.stringify(checking));
      } catch {
        // In-memory lock still prevents duplicate writes in this tab.
      }
      try {
        await updatePublishing(pending.id, pending.payload);
        removeStoredPublishingUpdateVerification(pending.userId, pending.id);
        setPendingUpdateVerification(null);
        setShowCreateModal(false);
        resetForm();
        addNotification({ title: '更新成功', message: '发布记录已更新。', type: 'success' });
        await refreshAfterConfirmedMutation(pending.page, '服务端已确认发布记录更新');
      } catch (error) {
        if (isDefinitivePublishingUpdateRejection(error)) {
          removeStoredPublishingUpdateVerification(pending.userId, pending.id);
          setPendingUpdateVerification(null);
          addNotification({ title: '更新失败', message: (error as Error).message, type: 'error' });
        } else {
          await resolvePendingPublishingUpdate(checking);
        }
      }
    } finally {
      mutationLockRef.current = false;
      setSavingPublishing(false);
    }
  }, [addNotification, refreshAfterConfirmedMutation, resetForm, resolvePendingPublishingUpdate]);

  useEffect(() => {
    const pending = initialPendingUpdateVerificationRef.current;
    if (restoredUpdateVerificationStartedRef.current || !pending) return;
    restoredUpdateVerificationStartedRef.current = true;
    initialPendingUpdateVerificationRef.current = null;
    void verifyPendingPublishingUpdate(pending);
  }, [verifyPendingPublishingUpdate]);

  const verifyDeleteStatus = useCallback(async (
    pending: PendingPublishingDeleteVerification,
    operationError?: unknown,
  ) => {
    if (deleteVerificationLockRef.current) return;
    deleteVerificationLockRef.current = true;
    setDeleteVerificationLoading(true);
    setPendingDeleteVerification({ ...pending, readError: null });
    setDeleteVerificationNotice(null);
    try {
      const status = await getPublishingDeleteStatus(pending.id);
      const key = publishingDeleteVerificationKey(authUserId);
      try {
        if (key) sessionStorage.removeItem(key);
      } catch {
        // The in-memory result is authoritative even when session storage is unavailable.
      }
      setPendingDeleteVerification(null);
      setPage(pending.page);
      if (status === 'deleted') {
        const wasVisible = publishings.some((item) => item.id === pending.id);
        setPublishings((current) => current.filter((item) => item.id !== pending.id));
        if (wasVisible) setTotal((current) => Math.max(0, current - 1));
        addNotification({ title: '删除已确认', message: `服务器确认发布记录「${pending.title}」已删除；未重复发送请求。`, type: 'success' });
        await refreshAfterConfirmedMutation(pending.page, `已只读核实发布记录「${pending.title}」已删除`);
      } else {
        setDeleteVerificationNotice(
          `服务器确认发布记录「${pending.title}」仍存在；本次没有重复删除。请核对当前记录后，再由你决定是否重新发起删除。${operationError instanceof Error ? ` ${operationError.message}` : ''}`,
        );
        const refreshed = await fetchData(pending.page);
        if (!refreshed) setDeleteVerificationNotice((current) => `${current || ''} 列表刷新失败，可稍后重新加载。`);
      }
    } catch (error) {
      const readError = error instanceof Error ? error.message : '读取失败';
      setPendingDeleteVerification({
        ...pending,
        readError: `删除请求未获确认${operationError instanceof Error ? `（${operationError.message}）` : ''}，发布记录状态也暂时无法读取${readError ? `（${readError}）` : ''}。请只读重试核实，不要重复删除。`,
      });
    } finally {
      deleteVerificationLockRef.current = false;
      setDeleteVerificationLoading(false);
    }
  }, [addNotification, authUserId, fetchData, publishings, refreshAfterConfirmedMutation]);

  useEffect(() => {
    if (restoredDeleteVerificationStartedRef.current || !pendingDeleteVerification) return;
    restoredDeleteVerificationStartedRef.current = true;
    void verifyDeleteStatus(pendingDeleteVerification);
  }, [pendingDeleteVerification, verifyDeleteStatus]);

  useEffect(() => {
    void fetchData(initialRequestedPageRef.current);
  }, [fetchData]);

  const handleCreate = async () => {
    if (publishingWritesLocked || mutationLockRef.current) return;
    const manualMetricInputs = [formData.views, formData.likes, formData.shares, formData.comments];
    if (manualMetricInputs.some((value) => value.trim() !== '' && formMetricValue(value) === null)) {
      addNotification({ title: '数据无效', message: '手工补充指标必须是非负整数', type: 'error' });
      return;
    }
    const manualMetrics = {
      views: formMetricValue(formData.views),
      likes: formMetricValue(formData.likes),
      shares: formMetricValue(formData.shares),
      comments: formMetricValue(formData.comments),
    };

    if (editingPublishing) {
      if (authUserId === undefined) {
        addNotification({ title: '更新失败', message: '登录状态尚未确认，请刷新后重试', type: 'error' });
        return;
      }
      const usesDouyinData = editingPublishing.data_source === 'douyin';
      const payload: PublishingEditPayload = {
        platform: usesDouyinData ? undefined : formData.platform,
        url: formData.url,
        status: usesDouyinData ? undefined : formData.status,
        publish_time: usesDouyinData ? undefined : formData.publish_time,
        ...manualMetrics,
      };
      const original: PublishingEditPayload = {
        platform: editingPublishing.publishing_platform ?? editingPublishing.platform,
        url: editingPublishing.url || '',
        status: editingPublishing.publishing_status ?? editingPublishing.status,
        publish_time: editingPublishing.publishing_publish_time ?? editingPublishing.publish_time ?? '',
        views: editingPublishing.manual_views ?? null,
        likes: editingPublishing.manual_likes ?? null,
        shares: editingPublishing.manual_shares ?? null,
        comments: editingPublishing.manual_comments ?? null,
      };
      await submitPendingPublishingUpdate({
        id: editingPublishing.id,
        userId: authUserId,
        title: editingPublishing.topic_title || `#${editingPublishing.id}`,
        page,
        payload,
        original,
        originalRecord: editingPublishing,
        status: 'checking',
        readError: null,
      });
      return;
    }

    if (!formData.topic_id) {
      addNotification({ title: '创建失败', message: '请选择关联选题', type: 'error' });
      return;
    }
    if (authUserId === undefined) {
      addNotification({ title: '创建失败', message: '登录状态尚未确认，请刷新后重试', type: 'error' });
      return;
    }
    const pending: PendingPublishingCreateVerification = {
      clientRequestId: crypto.randomUUID(),
      userId: authUserId,
      page: 1,
      status: 'checking',
      readError: null,
      payload: {
        topic_id: Number.parseInt(formData.topic_id, 10),
        platform: formData.platform,
        url: formData.url,
        status: formData.status,
        publish_time: formData.publish_time,
        ...manualMetrics,
      },
    };
    await submitPendingPublishingCreate(pending);
  };

  const handleDelete = async (id: number): Promise<boolean> => {
    if (publishingWritesLocked) return false;
    try {
      await deletePublishing(id);
    } catch (error) {
      if (isDefinitivePublishingDeleteRejection(error)) {
        addNotification({ title: '删除失败', message: (error as Error).message, type: 'error' });
        return false;
      }
      const pending = {
        id,
        title: publishings.find((publishing) => publishing.id === id)?.topic_title || '未命名发布内容',
        page,
        readError: null,
      };
      const key = publishingDeleteVerificationKey(authUserId);
      try {
        if (key) sessionStorage.setItem(key, JSON.stringify({ id: pending.id, title: pending.title, page: pending.page }));
      } catch {
        // In-memory locking still prevents another delete until read-back succeeds.
      }
      restoredDeleteVerificationStartedRef.current = true;
      setDeleteTarget(null);
      await verifyDeleteStatus(pending, error);
      return false;
    }

    const deletedRecord = publishings.find((publishing) => publishing.id === id);
    if (deletedRecord) {
      setPublishings((current) => current.filter((publishing) => publishing.id !== id));
      setTotal((current) => Math.max(0, current - 1));
    }
    addNotification({
      title: '删除成功',
      message: '服务端已确认发布记录删除',
      type: 'success',
    });

    const requestedPage = deletedRecord && publishings.length === 1 && page > 1 ? page - 1 : page;
    if (requestedPage !== page) setPage(requestedPage);
    await refreshAfterConfirmedMutation(requestedPage, '服务端已确认发布记录删除；该行已从当前页面移除，汇总可能尚未更新');
    return true;
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || publishingWritesLocked || deleteLockRef.current) {
      return;
    }

    deleteLockRef.current = true;
    setDeleteLoading(true);
    try {
      const deleted = await handleDelete(deleteTarget.id);
      if (deleted) setDeleteTarget(null);
    } finally {
      deleteLockRef.current = false;
      setDeleteLoading(false);
    }
  };

  const isCurrentLinkCandidateRequest = (requestId: number, targetId: number, query: string) => (
    requestId === linkCandidateRequestSequenceRef.current
    && linkTargetIdRef.current === targetId
    && linkQueryRef.current === query
  );

  const loadLinkCandidates = async (target: PublishingType, query = '') => {
    if (linkTargetIdRef.current !== target.id || linkQueryRef.current !== query) return;
    const requestId = ++linkCandidateRequestSequenceRef.current;
    setLinkLoading(true);
    try {
      const result = await getPublishingDouyinCandidates(target.id, query);
      if (!isCurrentLinkCandidateRequest(requestId, target.id, query)) return;
      if (result.publishing.id !== target.id) {
        throw new Error('候选结果与当前发布记录不一致，请重新加载');
      }
      setLinkCandidates(result.candidates);
    } catch (error) {
      if (!isCurrentLinkCandidateRequest(requestId, target.id, query)) return;
      addNotification({ title: '获取候选失败', message: (error as Error).message, type: 'error' });
    } finally {
      if (isCurrentLinkCandidateRequest(requestId, target.id, query)) setLinkLoading(false);
    }
  };

  const closeDouyinLink = () => {
    if (douyinLinkLockRef.current || savingDouyinLink) return;
    resetDouyinLinkDialog();
  };

  const resetDouyinLinkDialog = useCallback(() => {
    linkCandidateRequestSequenceRef.current += 1;
    linkTargetIdRef.current = null;
    linkQueryRef.current = '';
    setLinkTarget(null);
    setLinkQuery('');
    setLinkCandidates([]);
    setLinkLoading(false);
  }, []);

  const handleLinkQueryChange = (query: string) => {
    linkCandidateRequestSequenceRef.current += 1;
    linkQueryRef.current = query;
    setLinkQuery(query);
    setLinkCandidates([]);
    setLinkLoading(false);
  };

  const openDouyinLink = (publishing: PublishingType) => {
    if (publishingWritesLocked || douyinLinkLockRef.current) return;
    linkCandidateRequestSequenceRef.current += 1;
    linkTargetIdRef.current = publishing.id;
    linkQueryRef.current = '';
    setLinkTarget(publishing);
    setLinkQuery('');
    setLinkCandidates([]);
    setLinkLoading(false);
    void loadLinkCandidates(publishing);
  };

  const resolvePendingDouyinLink = useCallback(async (pending: PendingPublishingDouyinLinkVerification) => {
    let state: Awaited<ReturnType<typeof getPublishingDouyinLinkState>>;
    try {
      state = await getPublishingDouyinLinkState(pending.id);
    } catch (error) {
      const readError = error instanceof Error ? error.message : '读取失败';
      setPendingDouyinLinkVerification({
        ...pending,
        status: 'uncertain',
        readError: `抖音关联结果尚未确认，当前状态也无法读取（${readError}）。请先只读核实，不要重复操作。`,
      });
      resetDouyinLinkDialog();
      addNotification({ title: '关联结果待确认', message: '服务器状态暂时无法读取；发布页面的写入操作已暂停，请先只读核实。', type: 'warning' });
      return;
    }

    removeStoredPublishingDouyinLinkVerification(pending.userId, pending.id);
    setPendingDouyinLinkVerification(null);
    setPage(pending.page);
    if (state.status === 'missing') {
      resetDouyinLinkDialog();
      addNotification({ title: '发布记录已不存在', message: '服务器未找到这条发布记录；关联请求未重发。', type: 'warning' });
      await fetchData(pending.page);
      return;
    }

    if (state.douyinWorkId === pending.requestedWorkId) {
      resetDouyinLinkDialog();
      addNotification({
        title: '关联结果已核实',
        message: pending.requestedWorkId === null
          ? '服务器确认抖音作品关联已解除，没有重复操作。'
          : '服务器确认抖音作品关联已更新，没有重复操作。',
        type: 'success',
      });
      await refreshAfterConfirmedMutation(pending.page, '服务端已确认抖音作品关联更新');
      return;
    }

    if (state.douyinWorkId === pending.originalWorkId) {
      addNotification({
        title: '关联尚未应用',
        message: '服务器仍保留操作前的关联。你可以重新打开候选并核对后，手动决定是否重试。',
        type: 'warning',
      });
      await fetchData(pending.page);
      return;
    }

    resetDouyinLinkDialog();
    addNotification({ title: '关联状态已变化', message: '服务器当前关联与本次操作前后都不同，已按服务器状态刷新；请重新检查后再操作。', type: 'warning' });
    await refreshAfterConfirmedMutation(pending.page, '已读取服务器当前抖音关联状态');
  }, [addNotification, fetchData, refreshAfterConfirmedMutation, resetDouyinLinkDialog]);

  const verifyPendingDouyinLink = useCallback(async (pending: PendingPublishingDouyinLinkVerification) => {
    if (pending.userId !== authUserId || douyinLinkVerificationLockRef.current) return;
    douyinLinkVerificationLockRef.current = true;
    setDouyinLinkVerificationLoading(true);
    setPendingDouyinLinkVerification({ ...pending, status: 'checking', readError: null });
    try {
      await resolvePendingDouyinLink(pending);
    } finally {
      douyinLinkVerificationLockRef.current = false;
      setDouyinLinkVerificationLoading(false);
    }
  }, [authUserId, resolvePendingDouyinLink]);

  useEffect(() => {
    const pending = initialPendingDouyinLinkVerificationRef.current;
    if (restoredDouyinLinkVerificationStartedRef.current || !pending || pending.userId !== authUserId) return;
    restoredDouyinLinkVerificationStartedRef.current = true;
    initialPendingDouyinLinkVerificationRef.current = null;
    void verifyPendingDouyinLink(pending);
  }, [authUserId, verifyPendingDouyinLink]);

  const handleReconcileDouyin = async () => {
    if (publishingWritesLocked || reconcileLockRef.current) return;
    reconcileLockRef.current = true;
    setSyncingDouyin(true);
    try {
      const result = await reconcilePublishingDouyin();
      if (result.archiveSyncPending > 0) {
        addNotification({
          title: '抖音关联已刷新，归档待同步',
          message: `新增 ${result.linked} 条高置信关联；${result.archiveSyncPending} 个选题的发布归档暂未同步，可在对应发布详情页重试。`,
          type: 'warning',
        });
      } else {
        addNotification({
          title: '抖音数据关联已刷新',
          message: result.linked > 0
            ? `新增 ${result.linked} 条高置信关联；歧义或未匹配稿件可人工选择。`
            : '没有发现新的唯一高置信关联，现有绑定保持不变。',
          type: 'success',
        });
      }
      await refreshAfterConfirmedMutation(page, '服务端已确认抖音数据关联刷新');
    } catch (error) {
      addNotification({ title: '刷新关联失败', message: (error as Error).message, type: 'error' });
    } finally {
      reconcileLockRef.current = false;
      setSyncingDouyin(false);
    }
  };

  const handleDouyinLink = async (workId: number | null) => {
    if (publishingWritesLocked || !linkTarget || linkTargetIdRef.current !== linkTarget.id || douyinLinkLockRef.current) return;
    if (workId !== null && !linkCandidates.some((candidate) => candidate.id === workId)) return;
    if (!authUserId) {
      addNotification({ title: '更新关联失败', message: '登录状态尚未确认，本次未发送关联操作。', type: 'error' });
      return;
    }
    const originalWorkId = readPublishingDouyinWorkId(linkTarget.douyin_work_id);
    if (originalWorkId === undefined) {
      addNotification({ title: '更新关联失败', message: '当前关联状态缺失或无效，请重新加载发布列表后再试。', type: 'error' });
      return;
    }
    const pending: PendingPublishingDouyinLinkVerification = {
      id: linkTarget.id,
      userId: authUserId,
      title: linkTarget.topic_title || `#${linkTarget.id}`,
      page,
      requestedWorkId: workId,
      originalWorkId,
      status: 'checking',
      readError: null,
    };
    try {
      persistPendingPublishingDouyinLinkVerification(pending);
    } catch (error) {
      addNotification({
        title: '关联操作未发送',
        message: error instanceof Error ? error.message : '无法保存关联恢复状态；本次未发送写入。',
        type: 'error',
      });
      return;
    }
    douyinLinkLockRef.current = true;
    setSavingDouyinLink(true);
    setLinkLoading(true);
    setPendingDouyinLinkVerification(pending);
    try {
      const result = await updatePublishingDouyinLink(linkTarget.id, workId);
      removeStoredPublishingDouyinLinkVerification(pending.userId, pending.id);
      setPendingDouyinLinkVerification(null);
      addNotification({ title: workId === null ? '关联已解除' : '关联成功', message: result.message, type: 'success' });
      resetDouyinLinkDialog();
      await refreshAfterConfirmedMutation(page, workId === null ? '服务端已确认抖音作品关联解除' : '服务端已确认抖音作品关联');
    } catch (error) {
      if (isDefinitivePublishingDouyinLinkRejection(error)) {
        removeStoredPublishingDouyinLinkVerification(pending.userId, pending.id);
        setPendingDouyinLinkVerification(null);
        addNotification({ title: '更新关联失败', message: (error as Error).message, type: 'error' });
      } else {
        await resolvePendingDouyinLink(pending);
      }
    } finally {
      douyinLinkLockRef.current = false;
      setSavingDouyinLink(false);
      setLinkLoading(false);
    }
  };

  const handleEdit = (publishing: PublishingType) => {
    if (publishingWritesLocked) return;
    setEditingPublishing(publishing);
    setFormData({
      topic_id: publishing.topic_id.toString(),
      platform: publishing.publishing_platform ?? publishing.platform ?? '',
      url: publishing.url || '',
      status: publishing.publishing_status ?? publishing.status,
      publish_time: publishingDateFromRecord(publishing),
      views: publishing.manual_views?.toString() || '',
      likes: publishing.manual_likes?.toString() || '',
      shares: publishing.manual_shares?.toString() || '',
      comments: publishing.manual_comments?.toString() || '',
    });
    setShowCreateModal(true);
  };

  const filteredPublishings = useMemo(
    () =>
      publishings.filter(
        (publishing) =>
          publishing.topic_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          publishing.platform?.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [publishings, searchTerm],
  );
  const editingUsesDouyinData = editingPublishing?.data_source === 'douyin';

  return (
    <PageShell>
      <PageHeader
        title="发布管理"
        description="每条作品单独统计；抖音官方数据优先，手工补充只填缺项并标明来源。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canManageDouyinLinks ? (
              <ActionButton type="button" onClick={() => void handleReconcileDouyin()} disabled={syncingDouyin || publishingWritesLocked}>
                <RefreshCw className={`h-4 w-4 ${syncingDouyin ? 'animate-spin' : ''}`} />
                {syncingDouyin ? '正在关联' : '刷新抖音关联'}
              </ActionButton>
            ) : null}
            <ActionButton
              type="button"
              variant="primary"
              disabled={publishingWritesLocked}
              onClick={() => {
                resetForm();
                setShowCreateModal(true);
              }}
            >
              <Plus className="h-4 w-4" />
              添加发布记录
            </ActionButton>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="今日待发布" value={summary.today} icon={Calendar} tone="cyan" />
        <MetricCard title="待确认" value={summary.pending} icon={FileText} tone="amber" />
        <MetricCard title="已发布" value={summary.published} icon={CheckCircle} tone="success" />
        <MetricCard title="发布异常" value={summary.failed} icon={AlertTriangle} tone="coral" />
      </div>

      {listError ? (
        <div role="alert" className="flex flex-col items-stretch gap-3 rounded-button border border-studio-coral/30 bg-studio-coral/10 px-4 py-3 text-sm text-studio-coral-contrast sm:flex-row sm:items-center sm:justify-between">
          <p className="w-full min-w-0 sm:flex-1">发布列表未能刷新：{listError}</p>
          <ActionButton type="button" className="self-start sm:self-auto" onClick={() => void fetchData(page)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? '正在重新加载' : '重新加载列表'}
          </ActionButton>
        </div>
      ) : null}

      {pendingCreateVerification && pendingCreateVerification.userId === authUserId ? (
        <div role="alert" className="flex flex-col items-stretch gap-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between">
          <p className="w-full min-w-0 sm:flex-1">
            {pendingCreateVerification.status === 'ready'
              ? '服务器暂未找到这条发布记录。原表单与请求编号已保留；只能使用同一编号安全重试，不能另建新请求。'
              : pendingCreateVerification.readError || '发布记录创建结果正在核实；核实完成前，当前发布页面的写入操作已暂停。'}
          </p>
          <ActionButton
            type="button"
            className="self-start sm:self-auto"
            disabled={savingPublishing || createVerificationLoading || pendingCreateVerification.status === 'checking'}
            onClick={() => pendingCreateVerification.status === 'ready'
              ? void submitPendingPublishingCreate(pendingCreateVerification)
              : void verifyPendingPublishingCreate(pendingCreateVerification)}
          >
            <RefreshCw className={`h-4 w-4 ${savingPublishing || createVerificationLoading ? 'animate-spin' : ''}`} />
            {savingPublishing || createVerificationLoading
              ? '正在处理…'
              : pendingCreateVerification.status === 'ready' ? '安全重试同一请求' : '只读核实创建状态'}
          </ActionButton>
        </div>
      ) : null}

      {pendingUpdateVerification && pendingUpdateVerification.userId === authUserId ? (
        <div role="alert" className="flex flex-col items-stretch gap-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between">
          <p className="w-full min-w-0 sm:flex-1">
            {pendingUpdateVerification.readError || `发布记录「${pendingUpdateVerification.title}」更新结果尚未确认；核实期间，当前发布页面的写入操作已暂停。`}
          </p>
          <ActionButton
            type="button"
            className="self-start sm:self-auto"
            disabled={pendingUpdateVerification.status === 'checking'}
            onClick={() => void verifyPendingPublishingUpdate(pendingUpdateVerification)}
          >
            <RefreshCw className={`h-4 w-4 ${pendingUpdateVerification.status === 'checking' ? 'animate-spin' : ''}`} />
            {pendingUpdateVerification.status === 'checking' ? '正在核实…' : '只读核实更新状态'}
          </ActionButton>
        </div>
      ) : null}

      {pendingDeleteVerification ? (
        <div role="alert" className="flex flex-col items-stretch gap-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between">
          <p className="w-full min-w-0 sm:flex-1">
            {pendingDeleteVerification.readError || `发布记录「${pendingDeleteVerification.title}」删除结果尚未确认；核实完成前，当前发布页面的写入操作已暂停。`}
          </p>
          <ActionButton
            type="button"
            className="self-start sm:self-auto"
            disabled={deleteVerificationLoading}
            onClick={() => void verifyDeleteStatus(pendingDeleteVerification)}
          >
            <RefreshCw className={`h-4 w-4 ${deleteVerificationLoading ? 'animate-spin' : ''}`} />
            {deleteVerificationLoading ? '正在核实…' : '只读核实删除状态'}
          </ActionButton>
        </div>
      ) : null}

      {pendingDouyinLinkVerification && pendingDouyinLinkVerification.userId === authUserId ? (
        <div role="alert" className="flex flex-col items-stretch gap-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between">
          <p className="w-full min-w-0 sm:flex-1">
            {pendingDouyinLinkVerification.readError
              || `发布记录「${pendingDouyinLinkVerification.title}」的抖音关联结果尚未确认；核实前，当前发布页面的写入操作已暂停。`}
          </p>
          <ActionButton
            type="button"
            className="self-start sm:self-auto"
            disabled={douyinLinkVerificationLoading || pendingDouyinLinkVerification.status === 'checking'}
            onClick={() => void verifyPendingDouyinLink(pendingDouyinLinkVerification)}
          >
            <RefreshCw className={`h-4 w-4 ${douyinLinkVerificationLoading || pendingDouyinLinkVerification.status === 'checking' ? 'animate-spin' : ''}`} />
            {douyinLinkVerificationLoading || pendingDouyinLinkVerification.status === 'checking' ? '正在核实…' : '只读核实关联状态'}
          </ActionButton>
        </div>
      ) : null}

      {deleteVerificationNotice ? (
        <div role="status" className="flex flex-col items-stretch gap-3 rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-3 text-sm text-studio-text-secondary sm:flex-row sm:items-center sm:justify-between">
          <p className="w-full min-w-0 sm:flex-1">{deleteVerificationNotice}</p>
        </div>
      ) : null}

      {updateVerificationNotice ? (
        <div role="status" className="flex flex-col items-stretch gap-3 rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-3 text-sm text-studio-text-secondary sm:flex-row sm:items-center sm:justify-between">
          <p className="w-full min-w-0 sm:flex-1">{updateVerificationNotice}</p>
          <ActionButton type="button" className="self-start sm:self-auto" onClick={() => void fetchData(page)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? '正在重新加载' : '重新加载列表'}
          </ActionButton>
        </div>
      ) : null}

      <GlassPanel className="p-4">
        <SearchBar
          id="publishing-search"
          name="publishing-search"
          aria-label="搜索发布记录"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="搜索选题标题或发布平台..."
          className="max-w-xl"
        />
      </GlassPanel>

      {loading ? (
        <LoadingState type="section" text="正在加载发布记录..." />
      ) : listError && publishings.length === 0 ? null : (
        filteredPublishings.length === 0 ? (
        <StudioEmptyState
          icon={FileText}
          title="暂无发布记录"
          description={searchTerm ? '没有匹配当前搜索条件的发布记录。' : '添加发布任务后，会在这里形成多平台节奏表。'}
          actionLabel={publishingWritesLocked ? undefined : '添加发布记录'}
          onAction={publishingWritesLocked ? undefined : () => {
            resetForm();
            setShowCreateModal(true);
          }}
        />
        ) : (
        <ResponsiveTableShell>
          <table className="min-w-[1080px] w-full">
            <thead>
              <tr className="border-b border-studio-border-soft bg-studio-surface-soft text-left text-xs font-semibold uppercase tracking-wide text-studio-text-secondary">
                <th className="px-5 py-4">内容</th>
                <th className="px-5 py-4">平台</th>
                <th className="px-5 py-4">发布时间</th>
                <th className="px-5 py-4">数据</th>
                <th className="px-5 py-4">状态</th>
                <th className="px-5 py-4">下一步</th>
                <th className="sticky right-0 z-20 w-[152px] min-w-[152px] border-l border-studio-border-soft bg-studio-surface-soft px-1 py-4 text-right sm:w-[208px] sm:min-w-[208px] sm:px-4">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredPublishings.map((publishing) => (
                <tr key={publishing.id} className="group border-b border-studio-border-soft/70 transition hover:bg-studio-surface-soft">
                  <td className="px-2 py-4 sm:px-5">
                    <button
                      type="button"
                      onClick={() => navigate(`/publishing/${publishing.id}`)}
                      disabled={publishingWritesLocked}
                      className="flex min-w-0 items-start gap-3 text-left"
                    >
                      <span className="mt-0.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-button border border-studio-border-soft bg-studio-surface-soft text-studio-cyan sm:flex">
                        <FileText className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="line-clamp-2 font-semibold text-studio-text-primary group-hover:text-studio-cyan-contrast">
                          {publishing.topic_title || '未命名发布内容'}
                        </span>
                        {publishing.data_source === 'douyin' ? (
                          <span className="mt-1 block line-clamp-1 text-xs text-studio-cyan-contrast" title={publishing.douyin_title || undefined}>
                            抖音作品{publishing.douyin_title && publishing.douyin_title !== publishing.topic_title ? ` · ${publishing.douyin_title}` : ''}
                          </span>
                        ) : null}
                        <span className="mt-1 flex items-center gap-1 text-xs text-studio-text-secondary">
                          <UserRound className="h-3.5 w-3.5" />
                          {publishing.operator_name || '未分配'}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="px-5 py-4">
                    <PlatformBadge platform={publishing.platform} />
                  </td>
                  <td className="px-5 py-4 text-sm text-studio-text-secondary">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-studio-text-muted" />
                      {formatBeijingDate(publishing.publish_time)}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-3 text-xs">
                      <span className="flex items-center gap-1 text-studio-cyan-contrast" title={`播放量 · ${metricSourceLabels[publishing.views_source || 'unavailable']}`}>
                        <Play className="h-3.5 w-3.5" />
                        {publishing.views ? publishing.views.toLocaleString() : 0}
                        <span className="text-[10px] text-studio-text-secondary">{metricSourceLabels[publishing.views_source || 'unavailable']}</span>
                      </span>
                      <span className="flex items-center gap-1 text-studio-coral-contrast" title={`点赞量 · ${metricSourceLabels[publishing.likes_source || 'unavailable']}`}>
                        <Heart className="h-3.5 w-3.5" />
                        {publishing.likes ? publishing.likes.toLocaleString() : 0}
                        <span className="text-[10px] text-studio-text-secondary">{metricSourceLabels[publishing.likes_source || 'unavailable']}</span>
                      </span>
                      <span className="flex items-center gap-1 text-studio-success-contrast" title={`分享量 · ${metricSourceLabels[publishing.shares_source || 'unavailable']}`}>
                        <Share2 className="h-3.5 w-3.5" />
                        {publishing.shares ? publishing.shares.toLocaleString() : 0}
                        <span className="text-[10px] text-studio-text-secondary">{metricSourceLabels[publishing.shares_source || 'unavailable']}</span>
                      </span>
                      <span className="flex items-center gap-1 text-studio-violet-contrast" title={`评论量 · ${metricSourceLabels[publishing.comments_source || 'unavailable']}`}>
                        <MessageCircle className="h-3.5 w-3.5" />
                        {publishing.comments ? publishing.comments.toLocaleString() : 0}
                        <span className="text-[10px] text-studio-text-secondary">{metricSourceLabels[publishing.comments_source || 'unavailable']}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <StatusPill tone={statusTone[publishing.status] || 'muted'}>
                      {getWorkflowStatusLabel('publishing', publishing.status)}
                    </StatusPill>
                  </td>
                  <td className="px-5 py-4 text-sm font-medium text-studio-text-secondary">{getNextAction(publishing.status)}</td>
                  <td className="sticky right-0 z-10 w-[152px] min-w-[152px] border-l border-studio-border-soft bg-studio-surface px-1 py-4 transition-colors group-hover:bg-studio-surface-soft sm:w-[208px] sm:min-w-[208px] sm:px-4">
                    <div className="flex flex-wrap items-center justify-end gap-1 opacity-100 transition-opacity md:opacity-70 md:group-hover:opacity-100">
                      {canManageDouyinLinks ? (
                        <ActionButton
                          type="button"
                          variant="icon"
                          onClick={() => openDouyinLink(publishing)}
                          disabled={savingDouyinLink || publishingWritesLocked}
                          className={`h-10 w-10 min-h-10 min-w-10 p-2 ${publishing.douyin_work_id ? 'border-studio-cyan/40 bg-studio-cyan/10 text-studio-cyan-contrast' : 'border-studio-border-soft bg-studio-surface-soft text-studio-text-secondary hover:border-studio-border-active hover:text-studio-text-primary'}`}
                          title={publishing.douyin_work_id ? '调整抖音作品关联' : '关联抖音作品'}
                          aria-label={`${publishing.douyin_work_id ? '调整抖音作品关联' : '关联抖音作品'} ${publishing.topic_title || '未命名发布内容'}`}
                        >
                          <Link2 className="h-4 w-4" />
                        </ActionButton>
                      ) : null}
                      <ActionButton
                        type="button"
                        variant="icon"
                        onClick={() => handleEdit(publishing)}
                        disabled={publishingWritesLocked}
                        className="h-10 w-10 min-h-10 min-w-10 p-2 text-studio-text-secondary transition hover:border-studio-border-active hover:text-studio-text-primary"
                        title="编辑"
                        aria-label={`编辑发布记录 ${publishing.topic_title || '未命名发布内容'}`}
                      >
                        <Edit3 className="h-4 w-4" />
                      </ActionButton>
                      {publishing.url ? (
                        <a
                          href={publishing.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="xmt-btn xmt-btn-secondary inline-flex h-10 w-10 min-h-10 min-w-10 items-center justify-center p-2 text-studio-text-secondary transition hover:border-studio-border-active hover:text-studio-text-primary"
                          title="打开链接"
                          aria-label={`打开发布链接 ${publishing.topic_title || '未命名发布内容'}`}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : null}
                      <ActionButton
                        type="button"
                        variant="danger"
                        onClick={() => {
                          setDeleteVerificationNotice(null);
                          setDeleteTarget(publishing);
                        }}
                        disabled={publishingWritesLocked}
                        className="h-10 w-10 min-h-10 min-w-10 p-2"
                        title="删除"
                        aria-label={`删除发布记录 ${publishing.topic_title || '未命名发布内容'}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTableShell>
        )
      )}

      {total > pageSize ? (
        <div className="flex items-center justify-between gap-3 text-sm text-studio-text-secondary">
          <span>共 {total} 条，第 {page} / {Math.ceil(total / pageSize)} 页</span>
          <div className="flex gap-2">
            <ActionButton type="button" variant="ghost" disabled={page <= 1} onClick={() => void fetchData(page - 1)}>上一页</ActionButton>
            <ActionButton type="button" variant="ghost" disabled={page >= Math.ceil(total / pageSize)} onClick={() => void fetchData(page + 1)}>下一页</ActionButton>
          </div>
        </div>
      ) : null}

      <FormModal
        open={showCreateModal}
        onCancel={() => {
          if (savingPublishing || pendingUpdateVerification) return;
          setShowCreateModal(false);
          resetForm();
        }}
        onSubmit={handleCreate}
        loading={savingPublishing || Boolean(pendingUpdateVerification)}
        title={editingPublishing ? '编辑发布记录' : '添加发布记录'}
        submitText={editingPublishing ? '更新' : '保存'}
        cancelText="取消"
        size="xl"
      >
        <div className="space-y-4">
          {editingUsesDouyinData ? (
            <div className="rounded-button border border-studio-cyan/30 bg-studio-cyan/10 px-4 py-3 text-sm text-studio-cyan-contrast">
              已关联抖音作品。平台、发布时间和状态由作品关联记录决定；下方数值填写这条作品截至当前的累计表现，官方导出中已有指标仍优先展示。
            </div>
          ) : null}
          <div>
            <label htmlFor="publishing-topic-id" className="mb-2 block text-sm font-medium text-studio-text-secondary">关联选题 *</label>
            <select
              id="publishing-topic-id"
              name="topic_id"
              value={formData.topic_id}
              onChange={(event) => setFormData({ ...formData, topic_id: event.target.value })}
              className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
              disabled={Boolean(editingPublishing) || savingPublishing || publishingWritesLocked}
            >
              <option value="">请选择选题</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="publishing-platform" className="mb-2 block text-sm font-medium text-studio-text-secondary">发布平台</label>
              <input
                id="publishing-platform"
                name="platform"
                type="text"
                value={formData.platform}
                onChange={(event) => setFormData({ ...formData, platform: event.target.value })}
                className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
                placeholder="如：抖音、小红书、视频号"
                disabled={editingUsesDouyinData || savingPublishing || publishingWritesLocked}
              />
            </div>
            <div>
              <label htmlFor="publishing-url" className="mb-2 block text-sm font-medium text-studio-text-secondary">发布链接</label>
              <input
                id="publishing-url"
                name="url"
                type="text"
                value={formData.url}
                onChange={(event) => setFormData({ ...formData, url: event.target.value })}
                className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
                placeholder="请输入发布链接"
                disabled={savingPublishing || publishingWritesLocked}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="publishing-publish-time" className="mb-2 block text-sm font-medium text-studio-text-secondary">发布时间</label>
              <input
                id="publishing-publish-time"
                name="publish_time"
                type="date"
                value={formData.publish_time}
                onChange={(event) => setFormData({ ...formData, publish_time: event.target.value })}
                className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={editingUsesDouyinData || formData.status !== 'pending' || savingPublishing || publishingWritesLocked}
              />
            </div>
            <div>
              <label htmlFor="publishing-status" className="mb-2 block text-sm font-medium text-studio-text-secondary">状态</label>
              <select
                id="publishing-status"
                name="status"
                value={formData.status}
                onChange={(event) => setFormData({ ...formData, status: event.target.value })}
                className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
                disabled={editingUsesDouyinData || savingPublishing || publishingWritesLocked}
              >
                <option value="pending">待发布</option>
                <option value="published">已发布</option>
                <option value="failed">发布异常</option>
                <option value="scheduled">已定时</option>
              </select>
            </div>
          </div>

          <div className="mt-4 border-t border-studio-border-soft pt-4">
            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-studio-text-primary">
              <BarChart3 className="h-5 w-5 text-studio-cyan" />
              数据统计
            </h3>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[
                { key: 'views', label: '播放量', icon: Play },
                { key: 'likes', label: '点赞量', icon: Heart },
                { key: 'shares', label: '分享量', icon: Share2 },
                { key: 'comments', label: '评论量', icon: MessageCircle },
              ].map((field) => {
                const Icon = field.icon;
                return (
                  <div key={field.key}>
                    <label htmlFor={`publishing-metric-${field.key}`} className="mb-2 flex items-center gap-1 text-sm font-medium text-studio-text-secondary">
                      <Icon className="h-4 w-4 text-studio-cyan" />
                      手工补充{field.label}
                    </label>
                    <input
                      id={`publishing-metric-${field.key}`}
                      name={field.key}
                      type="number"
                      value={formData[field.key as keyof typeof formData]}
                      onChange={(event) => setFormData({ ...formData, [field.key]: event.target.value })}
                      className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
                      min="0"
                      step="1"
                      placeholder="留空表示未补充"
                      disabled={savingPublishing || publishingWritesLocked}
                    />
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-studio-text-muted">请填写单条作品截至当前的累计值，不是某一天的新增量。手工值按发布记录分别保存；留空表示未补充，不会写入 0，也不会覆盖抖音官方已提供的指标。</p>
          </div>
        </div>
      </FormModal>

      <BaseModal
        open={Boolean(linkTarget)}
        onClose={closeDouyinLink}
        closeOnOverlayClick={!savingDouyinLink}
        showCloseButton={!savingDouyinLink}
        size="lg"
        title="关联抖音作品"
        description={linkTarget ? `发布稿件：${linkTarget.topic_title || '未命名发布内容'}` : undefined}
        footer={
          <div className="flex items-center justify-between gap-3">
            <div>
              {linkTarget?.douyin_work_id ? (
                <ActionButton type="button" onClick={() => void handleDouyinLink(null)} disabled={linkLoading || savingDouyinLink}>
                  <Unlink className="h-4 w-4" />
                  解除当前关联
                </ActionButton>
              ) : null}
            </div>
            <ActionButton type="button" onClick={closeDouyinLink} disabled={savingDouyinLink}>关闭</ActionButton>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchBar
              id="douyin-candidate-search"
              name="douyin-candidate-search"
              aria-label="搜索抖音作品标题关键词"
              value={linkQuery}
              onChange={(event) => handleLinkQueryChange(event.target.value)}
              placeholder="输入抖音作品标题关键词"
              className="flex-1"
            />
            <ActionButton
              type="button"
              disabled={linkLoading || savingDouyinLink || !linkTarget}
              onClick={() => linkTarget && void loadLinkCandidates(linkTarget, linkQuery)}
            >
              搜索候选
            </ActionButton>
          </div>
          <p className="text-xs leading-5 text-studio-text-muted">
            系统只自动绑定唯一的高置信结果；同名、近似或已被其他稿件占用的作品需要人工确认。
          </p>
          {linkLoading ? (
            <LoadingState type="section" text="正在读取抖音作品..." />
          ) : linkCandidates.length === 0 ? (
            <div className="rounded-button border border-studio-border-soft px-4 py-8 text-center text-sm text-studio-text-muted">
              暂无候选作品
            </div>
          ) : (
            <div className="space-y-2">
              {linkCandidates.map((candidate) => {
                const linkedHere = candidate.linked_publishing_id === linkTarget?.id;
                const linkedElsewhere = Boolean(candidate.linked_publishing_id && !linkedHere);
                return (
                  <div key={candidate.id} className="rounded-button border border-studio-border-soft bg-studio-surface-soft p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="line-clamp-2 font-medium text-studio-text-primary">{candidate.title}</p>
                        <p className="mt-1 text-xs text-studio-text-muted">
                          {formatBeijingDate(candidate.publish_time)} · 播放 {(candidate.play_count || 0).toLocaleString()} · 点赞 {(candidate.like_count || 0).toLocaleString()}
                        </p>
                        <p className="mt-1 text-xs text-studio-cyan-contrast">
                          标题匹配 {Math.round(candidate.match_score * 100)}% · {candidate.match_method === 'exact' ? '标题一致' : candidate.match_method === 'containment' ? '标题包含' : '近似标题'}
                        </p>
                      </div>
                      <ActionButton
                        type="button"
                        variant={linkedHere ? 'primary' : 'secondary'}
                        disabled={linkLoading || savingDouyinLink || linkedHere || linkedElsewhere}
                        onClick={() => void handleDouyinLink(candidate.id)}
                      >
                        {linkedHere ? '当前关联' : linkedElsewhere ? '已关联其他稿件' : '关联此作品'}
                      </ActionButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </BaseModal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onCancel={() => { if (!deleteLockRef.current) setDeleteTarget(null); }}
        onConfirm={handleDeleteConfirm}
        loading={deleteLoading || deleteVerificationLoading}
        variant="danger"
        title="确认删除"
        confirmText="确认删除"
        cancelText="取消"
        description={
          deleteTarget
            ? `确定要删除“${deleteTarget.topic_title || '这条发布记录'}”吗？此操作不可撤销。`
            : ''
        }
      />
    </PageShell>
  );
}
