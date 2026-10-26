import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore, useAuthStore } from '../store';
import { createAnnouncement, deleteAnnouncement, getAnnouncementCreateRequestStatus, getAnnouncements } from '@/api/announcements';
import { usePermission } from '@/hooks/usePermission';
import ConfirmModal from '@/components/common/ConfirmModal';
import {
  Pin, Plus, Trash2, Megaphone, StickyNote, AlertTriangle, X,
} from 'lucide-react';
import type { Announcement } from '../types';
import { formatBeijingDate } from '../lib/utils';
import { GlassPanel } from './studio';
import { parseStoredBjt } from '@shared/time';

type AnnouncementCreatePayload = { content: string; type: string; pinned: boolean };
type PendingAnnouncementCreate = {
  version: 1;
  actorId: number;
  requestId: string;
  payload: AnnouncementCreatePayload;
};
type PendingCreateState = 'checking' | 'not_found' | 'unknown' | 'conflict';
type PendingAnnouncementDelete = { version: 1; actorId: number; announcementId: number; confirmed?: boolean };
type PendingDeleteState = 'checking' | 'unknown';

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pendingCreateStorageKey = (actorId: number) => `xmt:announcement-create-pending:v1:actor:${actorId}`;
const pendingDeleteStorageKey = (actorId: number) => `xmt:announcement-delete-pending:v1:actor:${actorId}`;

function parsePendingCreate(raw: string, actorId: number): PendingAnnouncementCreate | null {
  try {
    const value = JSON.parse(raw) as Partial<PendingAnnouncementCreate>;
    if (
      value.version !== 1 || value.actorId !== actorId || typeof value.requestId !== 'string' || !REQUEST_ID_PATTERN.test(value.requestId) ||
      !value.payload || typeof value.payload.content !== 'string' || typeof value.payload.type !== 'string' || typeof value.payload.pinned !== 'boolean'
    ) return null;
    return {
      version: 1,
      actorId,
      requestId: value.requestId.toLowerCase(),
      payload: { content: value.payload.content, type: value.payload.type, pinned: value.payload.pinned },
    };
  } catch {
    return null;
  }
}

function storePendingCreate(marker: PendingAnnouncementCreate): boolean {
  try {
    sessionStorage.setItem(pendingCreateStorageKey(marker.actorId), JSON.stringify(marker));
    return true;
  } catch {
    return false;
  }
}

function removePendingCreate(actorId: number): boolean {
  try {
    sessionStorage.removeItem(pendingCreateStorageKey(actorId));
    return true;
  } catch {
    return false;
  }
}

function parsePendingDelete(raw: string, actorId: number): PendingAnnouncementDelete | null {
  try {
    const value = JSON.parse(raw) as Partial<PendingAnnouncementDelete>;
    if (value.version !== 1 || value.actorId !== actorId || !Number.isSafeInteger(value.announcementId) || Number(value.announcementId) <= 0) return null;
    if (value.confirmed !== undefined && typeof value.confirmed !== 'boolean') return null;
    return { version: 1, actorId, announcementId: Number(value.announcementId), confirmed: value.confirmed === true };
  } catch {
    return null;
  }
}

function storePendingDelete(marker: PendingAnnouncementDelete): boolean {
  try {
    const key = pendingDeleteStorageKey(marker.actorId);
    sessionStorage.setItem(key, JSON.stringify(marker));
    const stored = parsePendingDelete(sessionStorage.getItem(key) || '', marker.actorId);
    return stored?.announcementId === marker.announcementId && stored.confirmed === (marker.confirmed === true);
  } catch {
    return false;
  }
}

function removePendingDelete(actorId: number): boolean {
  try {
    const key = pendingDeleteStorageKey(actorId);
    sessionStorage.removeItem(key);
    return sessionStorage.getItem(key) === null;
  } catch {
    return false;
  }
}

function hasUnknownDeleteOutcome(error: unknown): boolean {
  const status = Number((error as Error & { status?: number } | null)?.status);
  return !Number.isFinite(status) || status === 408 || status === 429 || status >= 500;
}

const typeConfig: Record<string, { label: string; icon: typeof Pin; color: string; bgLight: string; bgDark: string; border: string }> = {
  note: { label: '便签', icon: StickyNote, color: 'var(--xmt-primary-contrast)', bgLight: 'bg-studio-primary/5', bgDark: 'bg-studio-primary/10', border: 'border-studio-primary/20' },
  announcement: { label: '公告', icon: Megaphone, color: 'var(--xmt-success-contrast)', bgLight: 'bg-studio-success/5', bgDark: 'bg-studio-success/10', border: 'border-studio-success/20' },
  important: { label: '重要', icon: AlertTriangle, color: 'var(--xmt-coral-contrast)', bgLight: 'bg-studio-coral/5', bgDark: 'bg-studio-coral/10', border: 'border-studio-coral/20' },
};

export default function AnnouncementBoard() {
  const theme = useAppStore((state) => state.theme);
  const addNotification = useAppStore((state) => state.addNotification);
  const actorId = useAuthStore((state) => state.user?.id);
  const { hasPermission, loading: permissionLoading } = usePermission();
  const canManageAnnouncements = !permissionLoading && hasPermission('system:announcement');
  const [items, setItems] = useState<Announcement[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState<string>('note');
  const [newPinned, setNewPinned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<PendingAnnouncementCreate | null>(null);
  const [pendingCreateState, setPendingCreateState] = useState<PendingCreateState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingAnnouncementDelete | null>(null);
  const [pendingDeleteState, setPendingDeleteState] = useState<PendingDeleteState | null>(null);
  const [deleteConfirmationMessage, setDeleteConfirmationMessage] = useState('');
  const [recoveryStorage, setRecoveryStorage] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [verifyingCreate, setVerifyingCreate] = useState(false);
  const [verifyingDelete, setVerifyingDelete] = useState(false);
  const mutationLockRef = useRef(false);
  const readLockRef = useRef(false);

  const activePendingCreate = pendingCreate?.actorId === actorId ? pendingCreate : null;
  const activePendingDelete = pendingDelete?.actorId === actorId ? pendingDelete : null;

  const fetchItems = useCallback(async () => {
    if (readLockRef.current) return false;
    readLockRef.current = true;
    setLoading(true);
    try {
      const data = await getAnnouncements();
      setItems(data);
      setLoaded(true);
      setLoadError('');
      return true;
    } catch (err) {
      setLoadError((err as Error).message || '公告列表暂时无法读取。');
      return false;
    } finally {
      readLockRef.current = false;
      setLoading(false);
    }
  }, []);

  const verifyPendingDelete = useCallback(async (marker: PendingAnnouncementDelete) => {
    if (useAuthStore.getState().user?.id !== marker.actorId) return;
    setPendingDeleteState('checking');
    setFeedback('正在只读核实公告删除状态；不会自动重发删除请求。');
    try {
      const data = await getAnnouncements();
      if (useAuthStore.getState().user?.id !== marker.actorId) return;
      setItems(data);
      setLoaded(true);
      setLoadError('');
      const current = data.find((item) => Number(item.id) === marker.announcementId);
      if (current && marker.confirmed) {
        setPendingDelete(marker);
        setPendingDeleteState('unknown');
        setFeedback('删除请求已收到成功回执，但只读列表仍显示该公告；写入保持锁定，请稍后重新核实。');
        return;
      }
      if (!removePendingDelete(marker.actorId)) {
        setPendingDelete(marker);
        setPendingDeleteState('unknown');
        setFeedback('公告状态已读取，但本地恢复记录无法清理；公告操作仍锁定，请稍后重新核实。');
        return;
      }
      setPendingDelete(null);
      setPendingDeleteState(null);
      if (current) {
        setDeleteCandidate(current);
        setDeleteConfirmationMessage('只读核实发现公告仍存在；本次未自动重试。如仍要删除，请再次确认。');
        setFeedback('只读核实发现该公告仍存在；未自动重试，请在确认框中再次确认后再删除。');
      } else {
        setDeleteCandidate(null);
        setDeleteConfirmationMessage('');
        setFeedback(marker.confirmed
          ? '服务端已确认删除该公告，且只读列表确认当前不存在；未重发删除请求。'
          : '只读核实发现该公告当前已不存在；无法确认是否由本次删除完成，未重发删除请求。');
      }
    } catch {
      if (useAuthStore.getState().user?.id !== marker.actorId) return;
      setPendingDelete(marker);
      setPendingDeleteState('unknown');
      setFeedback('暂时无法核实公告删除状态；公告写入已锁定，只能重新核实，请勿重复删除。');
    }
  }, []);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const finishConfirmedCreate = useCallback(async (marker: PendingAnnouncementCreate, notify: boolean) => {
    if (!removePendingCreate(marker.actorId)) {
      if (useAuthStore.getState().user?.id === marker.actorId) {
        setPendingCreate(marker);
        setPendingCreateState('unknown');
        setFeedback('公告已确认发布，但本地恢复记录暂时无法清理；操作仍保持锁定，请稍后重新核实。');
      }
      return;
    }
    if (useAuthStore.getState().user?.id !== marker.actorId) return;

    setPendingCreate(null);
    setPendingCreateState(null);
    setNewContent('');
    setNewType('note');
    setNewPinned(false);
    setShowForm(false);
    setPendingConfirmation(true);
    setFeedback('服务端已确认公告发布，正在更新列表。');
    if (notify) addNotification({ title: '创建成功', message: '公告已发布', type: 'success' });
    const refreshed = await fetchItems();
    if (useAuthStore.getState().user?.id !== marker.actorId) return;
    if (refreshed) {
      setPendingConfirmation(false);
      setFeedback('公告已发布。');
    } else {
      setFeedback('服务端已确认公告发布，但公告列表暂未刷新；请重新加载列表确认，不要重复发布。');
    }
  }, [addNotification, fetchItems]);

  const finishDeletedCreate = useCallback((marker: PendingAnnouncementCreate) => {
    if (!removePendingCreate(marker.actorId)) {
      if (useAuthStore.getState().user?.id === marker.actorId) {
        setPendingCreate(marker);
        setPendingCreateState('unknown');
        setFeedback('已核实原公告随后被删除，但本地恢复记录无法清理；操作仍保持锁定。');
      }
      return;
    }
    if (useAuthStore.getState().user?.id !== marker.actorId) return;
    setPendingCreate(null);
    setPendingCreateState(null);
    setNewContent('');
    setNewType('note');
    setNewPinned(false);
    setShowForm(false);
    setFeedback('已核实该请求曾创建公告，但公告后来已被删除；不会自动重建。如仍需发布，请重新创建。');
  }, []);

  const inspectPendingCreate = useCallback(async (marker: PendingAnnouncementCreate, notifyOnCommit: boolean) => {
    if (useAuthStore.getState().user?.id !== marker.actorId) return;
    setPendingCreateState('checking');
    try {
      const status = await getAnnouncementCreateRequestStatus(marker.requestId);
      if (useAuthStore.getState().user?.id !== marker.actorId) return;
      if (status.state === 'committed') {
        await finishConfirmedCreate(marker, notifyOnCommit);
      } else if (status.state === 'deleted') {
        finishDeletedCreate(marker);
      } else if (status.state === 'not_found') {
        setPendingCreateState('not_found');
        setFeedback('目前核实为尚未创建。为避免误发，只有点击下方按钮才会使用原请求编号和原内容重试。');
      } else {
        setPendingCreateState('conflict');
        setFeedback('该请求编号与其他请求冲突，公告操作已锁定；请联系管理员核实。');
      }
    } catch {
      if (useAuthStore.getState().user?.id !== marker.actorId) return;
      setPendingCreateState('unknown');
      setFeedback('暂时无法核实公告创建状态；操作已锁定，请稍后重新核实，不要重复发布。');
    }
  }, [finishConfirmedCreate, finishDeletedCreate]);

  useEffect(() => {
    if (!Number.isSafeInteger(actorId) || !actorId) {
      setRecoveryStorage('loading');
      setPendingCreate(null);
      setPendingCreateState(null);
      setPendingDelete(null);
      setPendingDeleteState(null);
      setShowForm(false);
      setNewContent('');
      setNewType('note');
      setNewPinned(false);
      return;
    }
    setRecoveryStorage('loading');
    try {
      const rawCreate = sessionStorage.getItem(pendingCreateStorageKey(actorId));
      const rawDelete = sessionStorage.getItem(pendingDeleteStorageKey(actorId));
      if (rawCreate && rawDelete) {
        setRecoveryStorage('unavailable');
        setFeedback('发现多条未核实的公告操作恢复记录，公告写入已锁定；请勿重复操作。');
        return;
      }
      if (rawDelete) {
        const marker = parsePendingDelete(rawDelete, actorId);
        if (!marker) {
          setRecoveryStorage('unavailable');
          setFeedback('发现无法读取的公告删除恢复记录，公告操作已锁定；请勿重复删除。');
          return;
        }
        setPendingCreate(null);
        setPendingCreateState(null);
        setPendingDelete(marker);
        setPendingDeleteState('checking');
        setRecoveryStorage('ready');
        setVerifyingDelete(true);
        mutationLockRef.current = true;
        void verifyPendingDelete(marker).finally(() => {
          mutationLockRef.current = false;
          setVerifyingDelete(false);
        });
        return;
      }
      if (!rawCreate) {
        setPendingCreate(null);
        setPendingCreateState(null);
        setPendingDelete(null);
        setPendingDeleteState(null);
        setShowForm(false);
        setNewContent('');
        setNewType('note');
        setNewPinned(false);
        setRecoveryStorage('ready');
        return;
      }
      const marker = parsePendingCreate(rawCreate, actorId);
      if (!marker) {
        setRecoveryStorage('unavailable');
        setFeedback('发现无法读取的公告恢复记录，公告操作已锁定；请勿重复发布。');
        return;
      }
      setPendingDelete(null);
      setPendingDeleteState(null);
      setPendingCreate(marker);
      setPendingCreateState('checking');
      setNewContent(marker.payload.content);
      setNewType(marker.payload.type);
      setNewPinned(marker.payload.pinned);
      setShowForm(true);
      setRecoveryStorage('ready');
      setVerifyingCreate(true);
      mutationLockRef.current = true;
      void inspectPendingCreate(marker, false).finally(() => {
        mutationLockRef.current = false;
        setVerifyingCreate(false);
      });
    } catch {
      setRecoveryStorage('unavailable');
      setFeedback('无法访问本地公告恢复记录，公告操作已锁定；请勿重复发布。');
    }
  }, [actorId, inspectPendingCreate, verifyPendingDelete]);

  const handleRetryList = async () => {
    if (activePendingDelete) {
      await verifyPendingDelete(activePendingDelete);
      return;
    }
    const wasPending = pendingConfirmation;
    const refreshed = await fetchItems();
    if (refreshed) {
      setPendingConfirmation(false);
      setFeedback(wasPending ? '公告列表已重新加载，先前操作已确认。' : '公告列表已重新加载。');
    }
  };

  const handleVerifyDelete = async () => {
    if (!activePendingDelete || mutationLockRef.current) return;
    mutationLockRef.current = true;
    setVerifyingDelete(true);
    try {
      await verifyPendingDelete(activePendingDelete);
    } finally {
      mutationLockRef.current = false;
      setVerifyingDelete(false);
    }
  };

  const handleCreate = async () => {
    if (!actorId || recoveryStorage !== 'ready' || !newContent.trim() || !loaded || loading || loadError || pendingConfirmation || activePendingCreate || mutationLockRef.current || !canManageAnnouncements) return;
    const payload: AnnouncementCreatePayload = {
      content: newContent.trim(),
      type: newType,
      pinned: newPinned,
    };
    const marker: PendingAnnouncementCreate = {
      version: 1,
      actorId,
      requestId: globalThis.crypto.randomUUID(),
      payload,
    };
    if (!storePendingCreate(marker)) {
      setRecoveryStorage('unavailable');
      setFeedback('无法保存公告恢复编号，本次没有发送发布请求；请刷新页面后重试。');
      return;
    }

    setPendingCreate(marker);
    setPendingCreateState('checking');
    mutationLockRef.current = true;
    setSubmitting(true);
    setFeedback('');
    try {
      await createAnnouncement(payload, marker.requestId);
      await finishConfirmedCreate(marker, true);
    } catch {
      await inspectPendingCreate(marker, true);
    } finally {
      mutationLockRef.current = false;
      setSubmitting(false);
    }
  };

  const handleVerifyCreate = async () => {
    if (!activePendingCreate || mutationLockRef.current) return;
    mutationLockRef.current = true;
    setVerifyingCreate(true);
    try {
      await inspectPendingCreate(activePendingCreate, false);
    } finally {
      mutationLockRef.current = false;
      setVerifyingCreate(false);
    }
  };

  const handleRetryUncommittedCreate = async () => {
    const marker = activePendingCreate;
    if (!marker || pendingCreateState !== 'not_found' || mutationLockRef.current || !canManageAnnouncements) return;
    mutationLockRef.current = true;
    setSubmitting(true);
    setPendingCreateState('checking');
    setFeedback('正在使用原请求编号核实并重试公告发布。');
    try {
      await createAnnouncement(marker.payload, marker.requestId);
      await finishConfirmedCreate(marker, true);
    } catch {
      await inspectPendingCreate(marker, true);
    } finally {
      mutationLockRef.current = false;
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteCandidate || !actorId || !canManageAnnouncements || pendingConfirmation || activePendingCreate || activePendingDelete || recoveryStorage !== 'ready' || mutationLockRef.current) return;
    const candidate = deleteCandidate;
    const marker: PendingAnnouncementDelete = { version: 1, actorId, announcementId: candidate.id, confirmed: false };
    if (!storePendingDelete(marker)) {
      setRecoveryStorage('unavailable');
      setFeedback('无法安全保存公告删除恢复信息；本次没有发送删除请求。请检查会话存储后重试。');
      return;
    }
    mutationLockRef.current = true;
    setDeleting(true);
    setFeedback('');
    setDeleteConfirmationMessage('');
    setPendingDelete(marker);
    setPendingDeleteState('checking');
    try {
      await deleteAnnouncement(candidate.id);
      const committedMarker = { ...marker, confirmed: true };
      const committedMarkerStored = storePendingDelete(committedMarker);
      const markerCleared = committedMarkerStored && removePendingDelete(actorId);
      setItems((prev) => prev.filter((item) => item.id !== candidate.id));
      setDeleteCandidate(null);
      if (!markerCleared) {
        setPendingDelete(committedMarker);
        setPendingDeleteState('unknown');
        setFeedback('服务端已确认删除，但本地恢复记录暂时无法清理；写入保持锁定，只能继续只读核实。');
        return;
      }
      setPendingDelete(null);
      setPendingDeleteState(null);
      setPendingConfirmation(true);
      setFeedback('服务端已确认删除公告，正在更新列表。');
      addNotification({ title: '已删除', message: '公告已删除', type: 'success' });
      const refreshed = await fetchItems();
      if (refreshed) {
        setPendingConfirmation(false);
        setFeedback('公告已删除。');
      } else {
        setFeedback('服务端已确认删除公告，但公告列表暂未刷新；请重新加载列表确认，不要重复删除。');
      }
    } catch (err) {
      if (hasUnknownDeleteOutcome(err)) {
        setPendingDelete(marker);
        setPendingDeleteState('checking');
        setFeedback('删除请求未收到明确结果，正在只读核实；不会自动重发删除请求。');
        await verifyPendingDelete(marker);
      } else if (Number((err as Error & { status?: number }).status) === 404) {
        const markerCleared = removePendingDelete(actorId);
        setItems((prev) => prev.filter((item) => item.id !== candidate.id));
        setDeleteCandidate(null);
        setFeedback(markerCleared
          ? '服务器确认该公告当前已不存在；无法确认是否由本次删除完成，未重发删除请求。'
          : '服务器确认该公告当前已不存在，但本地恢复记录无法清理；公告操作仍锁定。');
        if (!markerCleared) {
          setPendingDelete(marker);
          setPendingDeleteState('unknown');
        } else {
          setPendingDelete(null);
          setPendingDeleteState(null);
        }
      } else {
        const markerCleared = removePendingDelete(actorId);
        if (markerCleared) {
          setPendingDelete(null);
          setPendingDeleteState(null);
          const message = (err as Error).message || '删除公告失败，请重试。';
          setFeedback(message);
          addNotification({ title: '删除失败', message, type: 'error' });
        } else {
          setPendingDelete(marker);
          setPendingDeleteState('checking');
          setFeedback('删除请求已明确失败，但本地恢复记录无法清理；正在只读核实当前状态。');
          await verifyPendingDelete(marker);
        }
      }
    } finally {
      mutationLockRef.current = false;
      setDeleting(false);
    }
  };

  // Sort: pinned first, then by date
  const sortedItems = [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (parseStoredBjt(b.created_at)?.getTime() ?? 0) - (parseStoredBjt(a.created_at)?.getTime() ?? 0);
  });

  const mutationBusy = submitting || deleting || verifyingCreate || verifyingDelete;
  const writeControlsLocked = mutationBusy || pendingConfirmation || Boolean(activePendingCreate) || Boolean(activePendingDelete) || recoveryStorage !== 'ready';
  const pendingCreateMessage = pendingCreateState === 'checking'
    ? '正在核实公告创建状态；公告操作暂时锁定。'
    : pendingCreateState === 'not_found'
      ? '目前核实为尚未创建。只有明确点击下方按钮，才会使用原请求编号和原内容重试。'
      : pendingCreateState === 'conflict'
        ? '请求编号与其他请求冲突，公告操作已锁定；请联系管理员核实。'
        : pendingCreateState === 'unknown'
          ? '暂时无法核实公告创建状态；公告操作已锁定，请稍后重新核实，不要重复发布。'
          : '';

  return (
    <GlassPanel className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[14px] bg-studio-amber/15 text-studio-amber-contrast">
            <Megaphone className="h-4 w-4" />
          </div>
          <h3 className="text-base font-semibold text-studio-text-primary">公告板</h3>
        </div>
        {canManageAnnouncements ? (
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            disabled={writeControlsLocked || !loaded || loading}
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-button border border-studio-border-soft bg-studio-surface-soft text-studio-text-muted transition-colors hover:border-studio-border-active hover:bg-studio-surface-elevated hover:text-studio-text-primary disabled:opacity-50"
            title="添加公告"
            aria-label={showForm ? '关闭公告表单' : '添加公告'}
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </button>
        ) : null}
      </div>

      {activePendingCreate ? (
        <div className="mb-4 rounded-card border border-studio-amber/30 bg-studio-amber/10 p-3">
          <p role={pendingCreateState === 'unknown' || pendingCreateState === 'conflict' ? 'alert' : 'status'} className="text-sm text-studio-text-secondary">
            {pendingCreateMessage || '公告创建结果待核实；操作暂时锁定。'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => void handleVerifyCreate()} disabled={mutationBusy} className="xmt-btn xmt-btn-secondary min-h-9 px-3 text-xs disabled:opacity-50">
              {verifyingCreate ? '正在核实…' : '重新核实发布状态'}
            </button>
            {pendingCreateState === 'not_found' && canManageAnnouncements ? (
              <button type="button" onClick={() => void handleRetryUncommittedCreate()} disabled={mutationBusy} className="xmt-btn xmt-btn-primary min-h-9 px-3 text-xs disabled:opacity-50">
                {submitting ? '正在安全重试…' : '确认未创建，使用原编号重试'}
              </button>
            ) : null}
          </div>
        </div>
      ) : activePendingDelete ? (
        <div className="mb-4 rounded-card border border-studio-amber/30 bg-studio-amber/10 p-3">
          <p role={pendingDeleteState === 'unknown' ? 'alert' : 'status'} className="text-sm text-studio-text-secondary">
            {pendingDeleteState === 'checking'
              ? '正在只读核实公告删除状态；公告写入暂时锁定，不会自动重发。'
              : feedback || '公告删除结果待核实；公告写入已锁定，请勿重复删除。'}
          </p>
          <button type="button" onClick={() => void handleVerifyDelete()} disabled={mutationBusy} className="xmt-btn xmt-btn-secondary mt-2 min-h-9 px-3 text-xs disabled:opacity-50">
            {verifyingDelete ? '正在核实…' : '重新核实公告删除状态'}
          </button>
        </div>
      ) : recoveryStorage === 'unavailable' ? (
        <div className="mb-4 rounded-card border border-studio-coral/30 bg-studio-coral/10 p-3">
          <p role="alert" className="text-sm text-studio-text-secondary">{feedback || '公告恢复记录不可用，公告操作已锁定；请勿重复发布。'}</p>
        </div>
      ) : recoveryStorage === 'loading' && actorId ? (
        <p role="status" className="mb-4 text-sm text-studio-text-muted">正在读取公告恢复状态…</p>
      ) : null}

      {showForm && (
        <div className="mb-4 rounded-card border border-studio-border-soft bg-studio-surface-soft p-4">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            disabled={writeControlsLocked}
            placeholder="输入公告内容..."
            rows={2}
            className="mb-3 min-h-20 w-full resize-y rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm leading-6 text-studio-text-primary outline-none transition focus:border-studio-border-active disabled:opacity-60"
          />
          <div className="flex items-center gap-2 flex-wrap">
            {(['note', 'announcement', 'important'] as const).map((t) => {
              const cfg = typeConfig[t];
              const Icon = cfg.icon;
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={newType === t}
                  disabled={writeControlsLocked}
                  onClick={() => setNewType(t)}
                  className={`inline-flex min-h-8 items-center gap-1.5 rounded-button border px-3 py-1.5 text-xs font-medium transition-colors ${
                    newType === t
                      ? `${theme === 'dark' ? cfg.bgDark : cfg.bgLight} ${cfg.border}`
                      : 'border-studio-border-soft bg-studio-surface-soft text-studio-text-muted hover:bg-studio-surface-elevated hover:text-studio-text-primary'
                  } disabled:opacity-50`}
                  style={newType === t ? { color: cfg.color } : undefined}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {cfg.label}
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={newPinned}
              disabled={writeControlsLocked}
              onClick={() => setNewPinned(!newPinned)}
              className={`inline-flex min-h-8 items-center gap-1 rounded-button border px-3 py-1.5 text-xs font-medium transition-colors ${
                newPinned
                  ? `bg-studio-amber/10 border-studio-amber/30 text-studio-amber-contrast`
                  : 'border-studio-border-soft bg-studio-surface-soft text-studio-text-muted hover:bg-studio-surface-elevated hover:text-studio-text-primary'
              } disabled:opacity-50`}
            >
              <Pin className="w-3 h-3" />
              置顶
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newContent.trim() || writeControlsLocked || loading || !loaded || Boolean(loadError)}
              className="inline-flex min-h-8 items-center justify-center rounded-button border border-studio-primary/40 px-4 py-1.5 text-xs font-semibold text-white transition-all xmt-btn-primary disabled:pointer-events-none disabled:opacity-40"
            >
              {submitting ? '发布中...' : '发布'}
            </button>
          </div>
        </div>
      )}

      {(feedback || (loadError && !pendingConfirmation)) ? (
        <div className="mb-3 rounded-card border border-studio-border-soft bg-studio-surface-soft p-3">
          {feedback && !activePendingCreate && !activePendingDelete && recoveryStorage !== 'unavailable' ? <p role={feedback.includes('失败') || feedback.includes('无法') || feedback.includes('锁定') ? 'alert' : 'status'} className="text-sm text-studio-text-secondary">{feedback}</p> : null}
          {loadError && !pendingConfirmation ? <p className="mt-1 text-sm text-studio-text-muted">公告列表暂时无法读取：{loadError}</p> : null}
          {loadError ? (
            <button type="button" disabled={loading} onClick={() => void handleRetryList()} className="xmt-btn xmt-btn-secondary mt-2 min-h-9 px-3 text-xs disabled:opacity-50">
              {loading ? '正在重新加载…' : '重新加载列表'}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
        {loading && !loaded ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-card border border-studio-border-soft bg-studio-surface-soft p-3">
                <div className="mb-2 h-3 w-3/4 rounded bg-studio-surface-elevated" />
                <div className="h-2 w-1/2 rounded bg-studio-surface-elevated" />
              </div>
            ))}
          </div>
        ) : !loaded && loadError ? (
          <div className="rounded-card border border-dashed border-studio-border-soft py-6 text-center text-sm text-studio-text-muted">公告列表不可用，请重新加载后再查看。</div>
        ) : sortedItems.length === 0 ? (
          <div className="rounded-card border border-dashed border-studio-border-soft py-6 text-center text-sm text-studio-text-muted">{loadError ? '公告列表暂未刷新。' : '暂无公告'}</div>
        ) : (
          sortedItems.map((item) => {
            const cfg = typeConfig[item.type] || typeConfig.note;
            const Icon = cfg.icon;
            return (
              <div
                key={item.id}
                className={`group rounded-card border p-3 transition-all duration-200 hover:border-studio-border-active hover:bg-studio-surface-elevated ${theme === 'dark' ? cfg.bgDark : cfg.bgLight} ${cfg.border}`}
              >
                <div className="flex items-start gap-2.5">
                  <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: cfg.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-studio-text-primary">{item.content}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {item.pinned && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-studio-amber-contrast">
                          <Pin className="w-2.5 h-2.5" /> 置顶
                        </span>
                      )}
                      <span className="text-[10px] text-studio-text-muted">
                        {item.creator_name || '系统'} · {formatBeijingDate(item.created_at)}
                      </span>
                    </div>
                  </div>
                  {canManageAnnouncements ? (
                    <button
                      type="button"
                      disabled={writeControlsLocked || loading}
                      onClick={() => { setDeleteConfirmationMessage(''); setDeleteCandidate(item); }}
                      className="rounded p-1 text-studio-coral-contrast opacity-0 transition-opacity hover:bg-studio-coral-soft group-hover:opacity-100 focus:opacity-100 disabled:opacity-40"
                      title="删除"
                      aria-label={`删除公告：${item.content.slice(0, 32)}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
      <ConfirmModal
        open={Boolean(deleteCandidate)}
        title="确认删除公告？"
        description={deleteCandidate ? <>{deleteConfirmationMessage ? <span className="mb-2 block text-studio-amber-contrast">{deleteConfirmationMessage}</span> : null}删除后无法恢复：<span className="font-medium text-studio-text-primary">{deleteCandidate.content}</span></> : undefined}
        confirmText="删除公告"
        variant="danger"
        loading={deleting || verifyingDelete}
        onCancel={() => { if (!mutationLockRef.current) { setDeleteCandidate(null); setDeleteConfirmationMessage(''); } }}
        onConfirm={handleDelete}
      />
    </GlassPanel>
  );
}
