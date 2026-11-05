import { useState, useEffect, useCallback, useRef, useId } from 'react';
import PageHeading from '@/components/common/PageHeading';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAppStore, useAuthStore } from '../store';
import {
  getInspirations,
  createInspirition,
  voteInspiration,
  deleteInspiration,
  promoteInspiration,
  getInspirationDetail,
  getInspirationDetailForRecovery,
  createInspirationComment,
  getInspirationCreateRequest,
  getInspirationVoteRequest,
} from '../api';
import { getInspirationDeleteStatus, InspirationDeleteError } from '../api/inspirations';
import type { Inspiration, InspirationComment } from '../api/inspirations';
import ConfirmModal from '../components/common/ConfirmModal';
import LoadingState from '../components/common/LoadingState';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useModalLifecycle } from '../components/common/useModalLifecycle';
import { usePermission } from '../hooks/usePermission';
import { useDebounce } from '../hooks/useDebounce';
import { useSocket } from '../hooks/useSocket';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { showRealtimeToast } from '../components/RealtimeToast';
import SimilarTopicReview from '../components/topics/SimilarTopicReview';
import { formatBeijingTime } from '../lib/utils';
import { getUserFacingErrorMessage } from '../lib/userFacingError';
import { findSimilarTopicsByTitle, normalizeTopicTitle, type SimilarTopic } from '../utils/topic-title-similarity';
import ActionButton from '../components/studio/ActionButton';
import {
  persistInspirationPromotionRecovery,
  readAllInspirationPromotionRecoveries,
  removeInspirationPromotionRecovery,
  type PendingInspirationPromotion,
} from './inspirationPromotionRecovery';
import {
  Plus,
  Search,
  Lightbulb,
  ThumbsUp,
  Trash2,
  ArrowRight,
  X,
  Filter,
  Sparkles,
  MessageCircle,
} from 'lucide-react';

const categories = [
  { value: '', label: '全部' },
  { value: '口播', label: '口播' },
  { value: '带货', label: '带货' },
  { value: '科普', label: '科普' },
  { value: '故事', label: '故事' },
  { value: '其他', label: '其他' },
];

type DetailState = {
  inspiration: Inspiration;
  comments: InspirationComment[];
} | null;

type PendingCommentRequest = {
  clientRequestId: string;
  content: string;
  inspirationId: number;
  userId: number;
  needsVerification: boolean;
};

type PendingInspirationCreate = {
  clientRequestId: string;
  userId: number;
  title: string;
  description: string;
  category: string;
  needsVerification: boolean;
};

type PendingInspirationVote = {
  clientRequestId: string;
  userId: number;
  inspirationId: number;
  desiredVoted: boolean;
  needsVerification: boolean;
};

const commentRecoveryKey = (userId: number, inspirationId: number) => `${userId}:${inspirationId}`;
const commentStorageKey = (userId: number, inspirationId: number) => `xmt:inspiration-comment-pending:v1:${userId}:${inspirationId}`;
const voteRecoveryKey = (userId: number, inspirationId: number) => `${userId}:${inspirationId}`;
const voteStoragePrefix = 'xmt:inspiration-vote-pending:v1:';
const voteStorageKey = (userId: number, inspirationId: number) => `${voteStoragePrefix}${userId}:${inspirationId}`;

function readStoredInspirationVote(userId: number, inspirationId: number): PendingInspirationVote | null {
  try {
    const value = sessionStorage.getItem(voteStorageKey(userId, inspirationId));
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<PendingInspirationVote>;
    if (parsed.userId !== userId || parsed.inspirationId !== inspirationId || typeof parsed.desiredVoted !== 'boolean'
      || typeof parsed.clientRequestId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.clientRequestId)) return null;
    return {
      userId,
      inspirationId,
      desiredVoted: parsed.desiredVoted,
      clientRequestId: parsed.clientRequestId.toLowerCase(),
      needsVerification: parsed.needsVerification !== false,
    };
  } catch {
    return null;
  }
}

function readStoredInspirationVotes(userId: number): PendingInspirationVote[] {
  const pending: PendingInspirationVote[] = [];
  const userPrefix = `${voteStoragePrefix}${userId}:`;
  try {
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (!key?.startsWith(userPrefix)) continue;
      const inspirationId = Number(key.slice(userPrefix.length));
      if (!Number.isSafeInteger(inspirationId) || inspirationId <= 0) continue;
      const request = readStoredInspirationVote(userId, inspirationId);
      if (request) pending.push(request);
    }
  } catch {
    return pending;
  }
  return pending;
}

function persistInspirationVote(pending: PendingInspirationVote): boolean {
  try {
    const key = voteStorageKey(pending.userId, pending.inspirationId);
    const serialized = JSON.stringify(pending);
    sessionStorage.setItem(key, serialized);
    return sessionStorage.getItem(key) === serialized;
  } catch {
    return false;
  }
}

function removeStoredInspirationVote(userId: number, inspirationId: number, clientRequestId?: string) {
  try {
    const key = voteStorageKey(userId, inspirationId);
    const stored = readStoredInspirationVote(userId, inspirationId);
    if (!clientRequestId || stored?.clientRequestId === clientRequestId) sessionStorage.removeItem(key);
  } catch {
    // The server-side request ledger remains authoritative if local cleanup is unavailable.
  }
}

function readStoredCommentRequest(userId: number, inspirationId: number): PendingCommentRequest | null {
  try {
    const value = sessionStorage.getItem(commentStorageKey(userId, inspirationId));
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<PendingCommentRequest>;
    if (parsed.userId !== userId || (parsed.inspirationId !== undefined && parsed.inspirationId !== inspirationId)
      || typeof parsed.content !== 'string'
      || typeof parsed.clientRequestId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.clientRequestId)) return null;
    return {
      userId,
      inspirationId,
      content: parsed.content,
      clientRequestId: parsed.clientRequestId,
      needsVerification: parsed.needsVerification === true,
    };
  } catch {
    return null;
  }
}

function commentRequestMatchesStored(inspirationId: number, pending: PendingCommentRequest) {
  if (pending.inspirationId !== inspirationId) return false;
  const stored = readStoredCommentRequest(pending.userId, inspirationId);
  return Boolean(stored
    && stored.userId === pending.userId
    && stored.inspirationId === inspirationId
    && stored.clientRequestId === pending.clientRequestId.toLowerCase()
    && stored.content === pending.content
    && stored.needsVerification === pending.needsVerification);
}

function persistCommentRequest(inspirationId: number, pending: PendingCommentRequest) {
  try {
    sessionStorage.setItem(commentStorageKey(pending.userId, inspirationId), JSON.stringify(pending));
    return commentRequestMatchesStored(inspirationId, pending);
  } catch {
    return false;
  }
}

function removeStoredCommentRequest(userId: number, inspirationId: number, clientRequestId?: string) {
  try {
    const key = commentStorageKey(userId, inspirationId);
    const stored = readStoredCommentRequest(userId, inspirationId);
    if (!clientRequestId || stored?.clientRequestId === clientRequestId) sessionStorage.removeItem(key);
  } catch {
    // Storage cleanup is best-effort; server-side idempotency remains authoritative.
  }
}

const inspirationCreateStorageKey = (userId: number) => `xmt:inspiration-create-pending:v1:${userId}`;

function readStoredInspirationCreate(userId: number): PendingInspirationCreate | null {
  try {
    const value = sessionStorage.getItem(inspirationCreateStorageKey(userId));
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<PendingInspirationCreate>;
    if (parsed.userId !== userId || typeof parsed.clientRequestId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.clientRequestId)
      || typeof parsed.title !== 'string' || typeof parsed.description !== 'string' || typeof parsed.category !== 'string') return null;
    return {
      userId,
      clientRequestId: parsed.clientRequestId,
      title: parsed.title,
      description: parsed.description,
      category: parsed.category,
      needsVerification: parsed.needsVerification === true,
    };
  } catch {
    return null;
  }
}

function inspirationCreateMatchesStored(pending: PendingInspirationCreate) {
  const stored = readStoredInspirationCreate(pending.userId);
  return Boolean(stored
    && stored.userId === pending.userId
    && stored.clientRequestId.toLowerCase() === pending.clientRequestId.toLowerCase()
    && stored.title === pending.title
    && stored.description === pending.description
    && stored.category === pending.category
    && stored.needsVerification === pending.needsVerification);
}

function persistInspirationCreate(pending: PendingInspirationCreate): boolean {
  try {
    sessionStorage.setItem(inspirationCreateStorageKey(pending.userId), JSON.stringify(pending));
    return inspirationCreateMatchesStored(pending);
  } catch {
    return false;
  }
}

function removeStoredInspirationCreate(userId: number, clientRequestId?: string) {
  try {
    const stored = readStoredInspirationCreate(userId);
    if (!clientRequestId || stored?.clientRequestId === clientRequestId) {
      sessionStorage.removeItem(inspirationCreateStorageKey(userId));
    }
  } catch {
    // Storage cleanup is best-effort; server-side idempotency remains authoritative.
  }
}

export default function Inspirations() {
  const [inspirations, setInspirations] = useState<Inspiration[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingInspiration, setCreatingInspiration] = useState(false);
  const [createRecoveryPending, setCreateRecoveryPending] = useState(false);
  const [createRecoveryUncertain, setCreateRecoveryUncertain] = useState(false);
  const [createStorageError, setCreateStorageError] = useState<string | null>(null);
  const [createVerificationInFlight, setCreateVerificationInFlight] = useState(false);
  const [formData, setFormData] = useState({ title: '', description: '', category: '其他' });
  const [promotingIds, setPromotingIds] = useState<Set<number>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [deleteVerificationIds, setDeleteVerificationIds] = useState<Set<number>>(new Set());
  const [deleteVerifyingIds, setDeleteVerifyingIds] = useState<Set<number>>(new Set());
  const [newItemIds, setNewItemIds] = useState<Set<number>>(new Set());
  const [voteAnimatingIds, setVoteAnimatingIds] = useState<Set<number>>(new Set());
  const [votePendingIds, setVotePendingIds] = useState<Set<number>>(new Set());
  const [voteVerificationIds, setVoteVerificationIds] = useState<Set<number>>(new Set());
  const [voteRetryIds, setVoteRetryIds] = useState<Set<number>>(new Set());
  const voteInFlightRef = useRef(new Set<string>());
  const voteUncertainRef = useRef(new Set<string>());
  const voteVerificationInFlightRef = useRef(new Set<string>());
  const voteRequestsRef = useRef(new Map<string, PendingInspirationVote>());
  const voteRecoveryNoticeShownRef = useRef(new Set<number>());
  const [recentCommentIds, setRecentCommentIds] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const createDialogRef = useRef<HTMLDivElement>(null);
  const createDialogTitleId = useId();
  const detailDialogRef = useRef<HTMLDivElement>(null);
  const detailDialogTitleId = useId();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<DetailState>(null);
  const [commentText, setCommentText] = useState('');
  const [commentSubmittingIds, setCommentSubmittingIds] = useState<Set<number>>(new Set());
  const [commentUncertainKeys, setCommentUncertainKeys] = useState<Set<string>>(new Set());
  const [commentRecoveryStorageWarningKeys, setCommentRecoveryStorageWarningKeys] = useState<Set<string>>(new Set());
  const [commentVerifyingKeys, setCommentVerifyingKeys] = useState<Set<string>>(new Set());
  const [similarTopicReview, setSimilarTopicReview] = useState<{
    inspirationId: number;
    title: string;
    topics: SimilarTopic[];
    checkFailed: boolean;
  } | null>(null);
  const [promotionVerificationIds, setPromotionVerificationIds] = useState<Set<number>>(new Set());
  const [promotionRecoveryReady, setPromotionRecoveryReady] = useState(false);
  const [promotionRecoveryStorageBlocked, setPromotionRecoveryStorageBlocked] = useState(false);
  const addNotification = useAppStore((state) => state.addNotification);
  const navigate = useNavigate();
  const authStore = useAuthStore();
  const authUserId = authStore.user?.id;
  const styles = useThemeStyles();
  const { hasPermission } = usePermission();
  const canDeleteAnyInspiration = hasPermission('inspiration:delete');
  const canPromoteInspiration = hasPermission('inspiration:promote');
  const debouncedSearch = useDebounce(searchTerm, 400);
  const socket = useSocket();
  const newItemIdsRef = useRef(new Set<number>());
  const createInFlightRef = useRef(false);
  const createRequestRef = useRef<PendingInspirationCreate | null>(null);
  const deleteInFlightRef = useRef(new Set<number>());
  const deleteUncertainRef = useRef(new Set<number>());
  const deleteVerificationInFlightRef = useRef(new Set<number>());
  const deleteRealtimeConfirmedRef = useRef(new Set<number>());
  const promoteInFlightRef = useRef(new Set<number>());
  const promotionUncertainRef = useRef(new Set<number>());
  const promotionRequestsRef = useRef(new Map<number, PendingInspirationPromotion>());
  const promotionVerificationInFlightRef = useRef(new Set<number>());
  const commentInFlightRef = useRef(new Set<number>());
  const commentUncertainRef = useRef(new Set<string>());
  const commentVerificationInFlightRef = useRef(new Set<string>());
  const commentRequestByKeyRef = useRef(new Map<string, PendingCommentRequest>());
  const promotionReviewRef = useRef<number | null>(null);
  const selectedIdRef = useRef<number | null>(null);
  const reviewedPromotionTitles = useRef(new Set<string>());

  const clearVoteRecovery = (pending: PendingInspirationVote) => {
    const key = voteRecoveryKey(pending.userId, pending.inspirationId);
    removeStoredInspirationVote(pending.userId, pending.inspirationId, pending.clientRequestId);
    if (voteRequestsRef.current.get(key)?.clientRequestId === pending.clientRequestId) {
      voteRequestsRef.current.delete(key);
    }
    voteUncertainRef.current.delete(key);
    voteVerificationInFlightRef.current.delete(key);
    if (useAuthStore.getState().user?.id !== pending.userId) return;
    setVoteVerificationIds((current) => {
      if (!current.has(pending.inspirationId)) return current;
      const next = new Set(current);
      next.delete(pending.inspirationId);
      return next;
    });
    setVoteRetryIds((current) => {
      if (!current.has(pending.inspirationId)) return current;
      const next = new Set(current);
      next.delete(pending.inspirationId);
      return next;
    });
  };

  function finishConfirmedDelete(id: number) {
    deleteUncertainRef.current.delete(id);
    setDeleteVerificationIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setInspirations((prev) => prev.filter((item) => item.id !== id));
    if (authUserId !== undefined) {
      const requestKey = commentRecoveryKey(authUserId, id);
      commentUncertainRef.current.delete(requestKey);
      commentVerificationInFlightRef.current.delete(requestKey);
      commentRequestByKeyRef.current.delete(requestKey);
      removeStoredCommentRequest(authUserId, id);
      setCommentUncertainKeys((current) => {
        if (!current.has(requestKey)) return current;
        const next = new Set(current);
        next.delete(requestKey);
        return next;
      });
      setCommentVerifyingKeys((current) => {
        if (!current.has(requestKey)) return current;
        const next = new Set(current);
        next.delete(requestKey);
        return next;
      });
    }
    if (authUserId !== undefined) {
      const key = voteRecoveryKey(authUserId, id);
      const pending = voteRequestsRef.current.get(key);
      if (pending) clearVoteRecovery(pending);
      else removeStoredInspirationVote(authUserId, id);
      voteRequestsRef.current.delete(key);
      voteInFlightRef.current.delete(key);
      voteUncertainRef.current.delete(key);
    }
    setVoteVerificationIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setVoteRetryIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    promotionUncertainRef.current.delete(id);
    setPromotionVerificationIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    if (selectedIdRef.current === id) {
      selectedIdRef.current = null;
      setSelectedId(null);
      setDetailData(null);
    }
  }

  const fetchInspirations = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const result = await getInspirations({
        search: debouncedSearch || undefined,
        category: categoryFilter || undefined,
      });
      setInspirations(result.data || []);
    } catch (error) {
      setListError(getUserFacingErrorMessage(error, '获取灵感列表失败，请检查连接后重试。'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, categoryFilter]);

  useEffect(() => {
    void fetchInspirations();
  }, [fetchInspirations]);

  useEffect(() => {
    if (authUserId === undefined) return;
    const pending = readStoredInspirationCreate(authUserId);
    if (!pending) return;
    createRequestRef.current = pending;
    setFormData({ title: pending.title, description: pending.description, category: pending.category });
    setShowCreateModal(true);
    setCreateRecoveryPending(true);
    setCreateRecoveryUncertain(pending.needsVerification);
    addNotification({
      title: pending.needsVerification ? '上次创建结果待确认' : '可安全重试上次创建',
      message: pending.needsVerification
        ? '已恢复上次提交内容；请先只读核实，确认前不会再次创建。'
        : '已恢复上次提交内容和请求编号，再次提交不会重复创建。',
      type: 'warning',
    });
  }, [addNotification, authUserId]);

  useEffect(() => {
    if (authUserId === undefined) {
      voteRequestsRef.current.clear();
      voteInFlightRef.current.clear();
      voteUncertainRef.current.clear();
      voteVerificationInFlightRef.current.clear();
      setVotePendingIds(new Set());
      setVoteVerificationIds(new Set());
      setVoteRetryIds(new Set());
      return;
    }

    const pendingVotes = readStoredInspirationVotes(authUserId);
    voteRequestsRef.current = new Map(pendingVotes.map((pending) => [
      voteRecoveryKey(pending.userId, pending.inspirationId),
      pending,
    ]));
    voteInFlightRef.current.clear();
    voteUncertainRef.current = new Set(pendingVotes
      .filter((pending) => pending.needsVerification)
      .map((pending) => voteRecoveryKey(pending.userId, pending.inspirationId)));
    voteVerificationInFlightRef.current.clear();
    setVotePendingIds(new Set());
    setVoteVerificationIds(new Set(pendingVotes
      .filter((pending) => pending.needsVerification)
      .map((pending) => pending.inspirationId)));
    setVoteRetryIds(new Set(pendingVotes
      .filter((pending) => !pending.needsVerification)
      .map((pending) => pending.inspirationId)));

    if (pendingVotes.length > 0 && !voteRecoveryNoticeShownRef.current.has(authUserId)) {
      voteRecoveryNoticeShownRef.current.add(authUserId);
      const needsVerification = pendingVotes.some((pending) => pending.needsVerification);
      addNotification({
        title: needsVerification ? '上次点赞结果待确认' : '可安全重试上次点赞',
        message: needsVerification
          ? '已恢复上次点赞请求；请先只读核实，确认前不会再次切换点赞状态。'
          : '已恢复上次点赞请求编号；重试会继续使用同一编号，不会重复切换状态。',
        type: 'warning',
      });
    }
  }, [addNotification, authUserId]);

  const syncInspirationPatch = useCallback((id: number, patch: Partial<Inspiration>) => {
    setInspirations((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setDetailData((prev) =>
      prev && prev.inspiration.id === id
        ? { ...prev, inspiration: { ...prev.inspiration, ...patch } }
        : prev
    );
  }, []);

  useRealtimeSync({
    room: 'inspirations',
    socket,
    events: {
      'inspiration:created': (data: Inspiration) => {
        setInspirations((prev) => {
          if (prev.some((item) => item.id === data.id)) return prev;
          return [{ ...data, comment_count: data.comment_count || 0 }, ...prev];
        });
        newItemIdsRef.current.add(data.id);
        setNewItemIds(new Set(newItemIdsRef.current));
        setTimeout(() => {
          newItemIdsRef.current.delete(data.id);
          setNewItemIds(new Set(newItemIdsRef.current));
        }, 2000);
        showRealtimeToast({
          title: '新灵感',
          message: `「${data.title}」已添加到灵感池`,
          icon: <Lightbulb className="w-5 h-5 text-studio-amber" />,
        });
      },
      'inspiration:voted': (data: { id: number; votes: number; userId: number }) => {
        if (data.userId === authStore.user?.id) return;
        syncInspirationPatch(data.id, { votes: data.votes });
      },
      'inspiration:commented': (data: {
        inspirationId: number;
        comment: InspirationComment;
        comment_count: number;
      }) => {
        syncInspirationPatch(data.inspirationId, { comment_count: data.comment_count });

        if (data.comment.creator_id !== authStore.user?.id) {
          setRecentCommentIds((prev) => {
            const next = new Set(prev);
            next.add(data.inspirationId);
            return next;
          });
          setTimeout(() => {
            setRecentCommentIds((prev) => {
              const next = new Set(prev);
              next.delete(data.inspirationId);
              return next;
            });
          }, 6000);
        }

        setDetailData((prev) => {
          if (!prev || prev.inspiration.id !== data.inspirationId) return prev;
          if (prev.comments.some((comment) => comment.id === data.comment.id)) return prev;
          return {
            inspiration: { ...prev.inspiration, comment_count: data.comment_count },
            comments: [...prev.comments, data.comment],
          };
        });
      },
      'inspiration:deleted': (data: { id: number }) => {
        const wasUncertain = deleteUncertainRef.current.has(data.id);
        if (deleteInFlightRef.current.has(data.id) || wasUncertain) {
          deleteRealtimeConfirmedRef.current.add(data.id);
        }
        finishConfirmedDelete(data.id);
        if (wasUncertain) {
          addNotification({ title: '删除状态已核实', message: '实时更新确认该灵感已删除，列表已同步。', type: 'success' });
          if (!deleteVerificationInFlightRef.current.has(data.id)) deleteRealtimeConfirmedRef.current.delete(data.id);
        }
      },
    },
  });

  const openDetail = useCallback(
    async (id: number) => {
      selectedIdRef.current = id;
      setSelectedId(id);
      setDetailLoading(true);
      setCommentText('');
      if (authUserId !== undefined) {
        const requestKey = commentRecoveryKey(authUserId, id);
        const pending = commentRequestByKeyRef.current.get(requestKey) || readStoredCommentRequest(authUserId, id);
        if (pending) {
          commentRequestByKeyRef.current.set(requestKey, pending);
          setCommentText(pending.content);
          if (pending.needsVerification) {
            commentUncertainRef.current.add(requestKey);
            setCommentUncertainKeys((current) => new Set(current).add(requestKey));
          }
        }
      }
      setRecentCommentIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

      try {
        const result = await getInspirationDetail(id);
        setDetailData(result);
        syncInspirationPatch(id, { comment_count: result.comments.length });
      } catch (error) {
        selectedIdRef.current = null;
        addNotification({
          title: '获取灵感详情失败',
          message: getUserFacingErrorMessage(error, '获取灵感详情失败，请检查连接后重试。'),
          type: 'error',
        });
        setSelectedId(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [addNotification, authUserId, syncInspirationPatch]
  );

  const closeDetail = () => {
    selectedIdRef.current = null;
    setSelectedId(null);
    setDetailData(null);
    setCommentText('');
  };

  const closeCreateDialog = () => {
    if (createRecoveryPending) return;
    setShowCreateModal(false);
  };

  useModalLifecycle(showCreateModal, createDialogRef, closeCreateDialog, !createRecoveryPending);
  useModalLifecycle(selectedId !== null, detailDialogRef, closeDetail, true);

  const finishInspirationCreate = (created: Inspiration, pending: PendingInspirationCreate, verified: boolean) => {
    const matchesCurrentFilter =
      (!categoryFilter || created.category === categoryFilter) &&
      (!debouncedSearch || `${created.title} ${created.description || ''}`.toLocaleLowerCase().includes(debouncedSearch.toLocaleLowerCase()));
    if (matchesCurrentFilter) {
      setInspirations((previous) => previous.some((item) => item.id === created.id) ? previous : [created, ...previous]);
    }
    removeStoredInspirationCreate(pending.userId, pending.clientRequestId);
    if (createRequestRef.current?.clientRequestId === pending.clientRequestId) createRequestRef.current = null;
    setCreateRecoveryPending(false);
    setCreateRecoveryUncertain(false);
    setShowCreateModal(false);
    setFormData({ title: '', description: '', category: '其他' });
    addNotification(verified
      ? { title: '创建结果已核实', message: `「${created.title}」已在服务器保存，列表已同步。`, type: 'success' }
      : { title: '提交成功', message: `「${created.title}」已添加到灵感池`, type: 'success' });
  };

  const finishDeletedInspirationCreate = (pending: PendingInspirationCreate) => {
    removeStoredInspirationCreate(pending.userId, pending.clientRequestId);
    if (createRequestRef.current?.clientRequestId === pending.clientRequestId) createRequestRef.current = null;
    setCreateRecoveryPending(false);
    setCreateRecoveryUncertain(false);
    setShowCreateModal(false);
    setFormData({ title: '', description: '', category: '其他' });
    addNotification({ title: '上次创建记录已删除', message: '已核实原灵感已删除，不会因为重试而重新创建。', type: 'info' });
  };

  const handleCreate = async () => {
    if (createInFlightRef.current) return;
    if (!formData.title.trim()) {
      addNotification({ title: '创建失败', message: '请输入灵感标题', type: 'error' });
      return;
    }
    if (authUserId === undefined || createRecoveryUncertain) return;

    const payload = { ...formData };
    let pending = createRequestRef.current || readStoredInspirationCreate(authUserId);
    if (pending && (pending.userId !== authUserId || pending.title !== payload.title
      || pending.description !== payload.description || pending.category !== payload.category)) {
      addNotification({ title: '上次创建仍待处理', message: '请先使用上次的原内容完成安全重试，再创建新的灵感。', type: 'warning' });
      return;
    }
    if (!pending) {
      pending = {
        clientRequestId: crypto.randomUUID(),
        userId: authUserId,
        ...payload,
        needsVerification: true,
      };
    }
    pending.needsVerification = true;
    createRequestRef.current = pending;
    setCreateStorageError(null);
    if (!persistInspirationCreate(pending)) {
      removeStoredInspirationCreate(pending.userId, pending.clientRequestId);
      if (createRequestRef.current?.clientRequestId === pending.clientRequestId) createRequestRef.current = null;
      setCreateRecoveryPending(false);
      setCreateRecoveryUncertain(false);
      setCreateStorageError('浏览器无法确认灵感创建恢复信息已保存；本次未发送。请检查浏览器存储后重试。');
      return;
    }
    setCreateRecoveryPending(true);

    createInFlightRef.current = true;
    setCreatingInspiration(true);
    try {
      const result = await createInspirition(payload, pending.clientRequestId);
      finishInspirationCreate(result.inspiration, pending, false);
    } catch {
      try {
        const recovered = await getInspirationCreateRequest(pending.clientRequestId);
        if (recovered?.deleted) {
          finishDeletedInspirationCreate(pending);
        } else if (recovered) {
          finishInspirationCreate(recovered.inspiration, pending, true);
        } else {
          pending.needsVerification = false;
          persistInspirationCreate(pending);
          setCreateRecoveryUncertain(false);
          addNotification({
            title: '提交结果未确认',
            message: '服务器暂未找到这条灵感；可以使用相同请求编号安全重试。',
            type: 'warning',
          });
        }
      } catch {
        pending.needsVerification = true;
        persistInspirationCreate(pending);
        setCreateRecoveryUncertain(true);
        addNotification({
          title: '创建结果待确认',
          message: '请求未获确认，且服务器状态暂时无法读取。已暂停再次提交；请先只读核实，避免重复创建。',
          type: 'warning',
        });
      }
    } finally {
      createInFlightRef.current = false;
      setCreatingInspiration(false);
    }
  };

  const verifyInspirationCreate = async () => {
    const pending = createRequestRef.current || (authUserId === undefined ? null : readStoredInspirationCreate(authUserId));
    if (!pending || createVerificationInFlight) return;
    createRequestRef.current = pending;
    setCreateVerificationInFlight(true);
    try {
      const recovered = await getInspirationCreateRequest(pending.clientRequestId);
      if (recovered?.deleted) {
        finishDeletedInspirationCreate(pending);
      } else if (recovered) {
        finishInspirationCreate(recovered.inspiration, pending, true);
      } else {
        pending.needsVerification = false;
        persistInspirationCreate(pending);
        setCreateRecoveryUncertain(false);
        addNotification({ title: '创建状态已核实', message: '服务器尚未找到这条灵感；可以使用原请求编号安全重试。', type: 'info' });
      }
    } catch {
      pending.needsVerification = true;
      persistInspirationCreate(pending);
      setCreateRecoveryUncertain(true);
      addNotification({ title: '仍无法核实创建状态', message: '本次只读读取未成功；创建仍保持暂停，请稍后重试核实。', type: 'error' });
    } finally {
      setCreateVerificationInFlight(false);
    }
  };

  const handleVote = async (id: number) => {
    const previous = inspirations.find((item) => item.id === id);
    const userId = authUserId;
    if (!previous || userId === undefined) return;
    const key = voteRecoveryKey(userId, id);
    if (voteInFlightRef.current.has(key) || voteUncertainRef.current.has(key)) return;

    let pending = voteRequestsRef.current.get(key) || readStoredInspirationVote(userId, id);
    if (pending?.needsVerification) {
      voteUncertainRef.current.add(key);
      setVoteVerificationIds((current) => new Set(current).add(id));
      return;
    }
    const nextVoted = pending?.desiredVoted ?? !previous.voted;
    if (!pending) {
      pending = {
        clientRequestId: crypto.randomUUID(),
        userId,
        inspirationId: id,
        desiredVoted: nextVoted,
        needsVerification: true,
      };
    } else {
      pending.needsVerification = true;
    }
    voteRequestsRef.current.set(key, pending);
    if (!persistInspirationVote(pending)) {
      voteRequestsRef.current.delete(key);
      addNotification({
        title: '无法安全提交点赞',
        message: '浏览器暂时无法保存本次请求编号；为避免响应丢失后重复切换，请检查浏览器存储后重试。',
        type: 'error',
      });
      return;
    }

    voteInFlightRef.current.add(key);
    setVotePendingIds((current) => new Set(current).add(id));
    setVoteRetryIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    const delta = nextVoted === previous.voted ? 0 : nextVoted ? 1 : -1;

    syncInspirationPatch(id, { voted: nextVoted, votes: Math.max(0, previous.votes + delta) });
    setVoteAnimatingIds((items) => new Set(items).add(id));
    setTimeout(() => {
      setVoteAnimatingIds((items) => {
        const next = new Set(items);
        next.delete(id);
        return next;
      });
    }, 300);

    try {
      const result = await voteInspiration(id, {
        clientRequestId: pending.clientRequestId,
        voted: pending.desiredVoted,
      });
      if (useAuthStore.getState().user?.id !== userId) return;
      syncInspirationPatch(id, {
        voted: result.voted,
        ...(typeof result.votes === 'number' ? { votes: result.votes } : {}),
      });
      clearVoteRecovery(pending);
    } catch {
      if (useAuthStore.getState().user?.id !== userId) return;
      try {
        const requestStatus = await getInspirationVoteRequest(pending.clientRequestId);
        if (requestStatus && 'deleted' in requestStatus) {
          finishConfirmedDelete(id);
          clearVoteRecovery(pending);
          return;
        }
        if (requestStatus && requestStatus.inspirationId !== id) throw new Error('VOTE_REQUEST_TARGET_MISMATCH');
        if (requestStatus) {
          syncInspirationPatch(id, { voted: requestStatus.voted, votes: requestStatus.votes });
          clearVoteRecovery(pending);
          addNotification(requestStatus.voted === pending.desiredVoted
            ? { title: '投票结果已核实', message: requestStatus.voted ? '服务端已保存点赞，列表状态已同步。' : '服务端已保存取消点赞，列表状态已同步。', type: 'success' }
            : { title: '点赞状态已核实', message: `服务器当前为${requestStatus.voted ? '已点赞' : '未点赞'}，列表已同步；如需更改，可重新操作。`, type: 'info' });
          return;
        }

        const latest = await getInspirationDetailForRecovery(id);
        if (useAuthStore.getState().user?.id !== userId) return;
        syncInspirationPatch(id, { voted: latest.inspiration.voted, votes: latest.inspiration.votes });
        pending.needsVerification = false;
        persistInspirationVote(pending);
        voteRequestsRef.current.set(key, pending);
        voteUncertainRef.current.delete(key);
        setVoteVerificationIds((current) => {
          if (!current.has(id)) return current;
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        setVoteRetryIds((current) => new Set(current).add(id));
        addNotification({
          title: '点赞状态已核实，可安全重试',
          message: '服务器尚未找到这次请求；再次操作会沿用原请求编号，不会重复切换状态。',
          type: 'info',
        });
      } catch {
        if (useAuthStore.getState().user?.id !== userId) return;
        pending.needsVerification = true;
        persistInspirationVote(pending);
        voteRequestsRef.current.set(key, pending);
        voteUncertainRef.current.add(key);
        setVoteVerificationIds((current) => new Set(current).add(id));
        addNotification({
          title: '点赞结果待确认',
          message: '请求未获确认，且请求结果与当前状态暂时无法读取。已保存原请求编号并暂停再次操作；请只读重试核实。',
          type: 'warning',
        });
      }
    } finally {
      voteInFlightRef.current.delete(key);
      if (useAuthStore.getState().user?.id === userId) {
        setVotePendingIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    }
  };

  const verifyVoteState = async (id: number) => {
    const userId = authUserId;
    if (userId === undefined) return;
    const key = voteRecoveryKey(userId, id);
    if (voteVerificationInFlightRef.current.has(key)) return;
    const pending = voteRequestsRef.current.get(key) || readStoredInspirationVote(userId, id);
    if (!pending) return;
    voteRequestsRef.current.set(key, pending);
    voteVerificationInFlightRef.current.add(key);
    setVotePendingIds((current) => new Set(current).add(id));
    try {
      const requestStatus = await getInspirationVoteRequest(pending.clientRequestId);
      if (useAuthStore.getState().user?.id !== userId) return;
      if (requestStatus && 'deleted' in requestStatus) {
        finishConfirmedDelete(id);
        clearVoteRecovery(pending);
        addNotification({ title: '点赞记录已核实', message: '对应灵感已删除，已清理本地待确认状态。', type: 'info' });
      } else if (requestStatus) {
        if (requestStatus.inspirationId !== id) throw new Error('VOTE_REQUEST_TARGET_MISMATCH');
        syncInspirationPatch(id, { voted: requestStatus.voted, votes: requestStatus.votes });
        clearVoteRecovery(pending);
        addNotification({
          title: '点赞状态已核实',
          message: requestStatus.voted ? '服务器显示当前已点赞，列表已同步。' : '服务器显示当前未点赞，列表已同步。',
          type: 'info',
        });
      } else {
        const latest = await getInspirationDetailForRecovery(id);
        if (useAuthStore.getState().user?.id !== userId) return;
        syncInspirationPatch(id, { voted: latest.inspiration.voted, votes: latest.inspiration.votes });
        pending.needsVerification = false;
        persistInspirationVote(pending);
        voteRequestsRef.current.set(key, pending);
        voteUncertainRef.current.delete(key);
        setVoteVerificationIds((current) => {
          if (!current.has(id)) return current;
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        setVoteRetryIds((current) => new Set(current).add(id));
        addNotification({
          title: '点赞状态已核实，可安全重试',
          message: '服务器尚未找到这次请求；再次操作会沿用原请求编号，不会重复切换状态。',
          type: 'info',
        });
      }
    } catch {
      if (useAuthStore.getState().user?.id === userId) {
        pending.needsVerification = true;
        persistInspirationVote(pending);
        voteRequestsRef.current.set(key, pending);
        voteUncertainRef.current.add(key);
        addNotification({
          title: '仍无法核实点赞状态',
          message: '本次只读读取未成功；点赞操作仍保持暂停，请稍后重试核实。',
          type: 'error',
        });
      }
    } finally {
      voteVerificationInFlightRef.current.delete(key);
      if (useAuthStore.getState().user?.id === userId) {
        setVotePendingIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    }
  };

  const handleDelete = async (id: number) => {
    if (deleteInFlightRef.current.has(id) || deleteUncertainRef.current.has(id)) return;

    deleteInFlightRef.current.add(id);
    setDeletingIds((current) => new Set(current).add(id));
    try {
      await deleteInspiration(id);
      addNotification({ title: '删除成功', message: '灵感已删除', type: 'success' });
      finishConfirmedDelete(id);
    } catch (error) {
      if (deleteRealtimeConfirmedRef.current.has(id)) {
        finishConfirmedDelete(id);
        addNotification({ title: '删除状态已核实', message: '实时更新确认该灵感已删除，列表已同步。', type: 'success' });
      } else if (error instanceof InspirationDeleteError && error.status === 404) {
        finishConfirmedDelete(id);
        addNotification({ title: '删除状态已核实', message: '服务端确认这条灵感已不存在，列表已同步。', type: 'success' });
      } else if (error instanceof InspirationDeleteError && error.status === 403) {
        addNotification({
          title: '删除失败',
          message: getUserFacingErrorMessage(error, '当前账号没有删除这条灵感的权限，请联系管理员。'),
          type: 'error',
        });
      } else {
        try {
          const status = await getInspirationDeleteStatus(id);
          if (deleteRealtimeConfirmedRef.current.has(id) || status === 'missing') {
            finishConfirmedDelete(id);
            addNotification({ title: '删除状态已核实', message: '服务端确认这条灵感已删除，列表已同步。', type: 'success' });
          } else {
            addNotification({ title: '删除未完成', message: '服务端仍保留这条灵感；可确认内容后重新操作。', type: 'warning' });
          }
        } catch {
          if (deleteRealtimeConfirmedRef.current.has(id)) {
            finishConfirmedDelete(id);
            addNotification({ title: '删除状态已核实', message: '实时更新确认该灵感已删除，列表已同步。', type: 'success' });
          } else {
            deleteUncertainRef.current.add(id);
            setDeleteVerificationIds((current) => new Set(current).add(id));
            addNotification({ title: '删除结果待确认', message: '服务端状态暂时无法读取；已暂停再次删除，请先只读核实。', type: 'warning' });
          }
        }
      }
    } finally {
      deleteInFlightRef.current.delete(id);
      deleteRealtimeConfirmedRef.current.delete(id);
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const verifyInspirationDelete = async (id: number) => {
    if (!deleteUncertainRef.current.has(id) || deleteVerificationInFlightRef.current.has(id)) return;
    deleteVerificationInFlightRef.current.add(id);
    setDeleteVerifyingIds((current) => new Set(current).add(id));
    try {
      const status = await getInspirationDeleteStatus(id);
      if (deleteRealtimeConfirmedRef.current.has(id) || status === 'missing') {
        finishConfirmedDelete(id);
        addNotification({ title: '删除状态已核实', message: '服务端确认这条灵感已删除，列表已同步。', type: 'success' });
      } else {
        deleteUncertainRef.current.delete(id);
        setDeleteVerificationIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        addNotification({ title: '删除状态已核实', message: '服务端仍保留这条灵感；当前没有删除，可在确认后重新操作。', type: 'info' });
      }
    } catch {
      if (deleteRealtimeConfirmedRef.current.has(id)) {
        finishConfirmedDelete(id);
        addNotification({ title: '删除状态已核实', message: '实时更新确认该灵感已删除，列表已同步。', type: 'success' });
      } else {
        addNotification({ title: '仍无法核实删除状态', message: '本次只读读取未成功；删除仍保持暂停，请稍后重试核实。', type: 'error' });
      }
    } finally {
      deleteVerificationInFlightRef.current.delete(id);
      deleteRealtimeConfirmedRef.current.delete(id);
      setDeleteVerifyingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const handlePromote = async (id: number) => {
    if (!promotionRecoveryReady || promotionRecoveryStorageBlocked || !Number.isSafeInteger(authUserId)
      || promoteInFlightRef.current.has(id) || promotionReviewRef.current === id || promotionUncertainRef.current.has(id)) return;
    const inspiration = inspirations.find((item) => item.id === id);
    if (!inspiration) return;
    const reviewKey = `${id}:${normalizeTopicTitle(inspiration.title)}`;
    promoteInFlightRef.current.add(id);
    setPromotingIds((current) => new Set(current).add(id));
    try {
      if (!reviewedPromotionTitles.current.has(reviewKey)) {
        try {
          const topics = await findSimilarTopicsByTitle(inspiration.title);
          if (topics.length > 0) {
            promotionReviewRef.current = id;
            setSimilarTopicReview({ inspirationId: id, title: inspiration.title, topics, checkFailed: false });
            return;
          }
        } catch {
          promotionReviewRef.current = id;
          setSimilarTopicReview({ inspirationId: id, title: inspiration.title, topics: [], checkFailed: true });
          return;
        }
        reviewedPromotionTitles.current.add(reviewKey);
      }

      const pending: PendingInspirationPromotion = {
        schemaVersion: 1,
        userId: Number(authUserId),
        inspirationId: id,
        operationId: window.crypto.randomUUID(),
      };
      if (!persistInspirationPromotionRecovery(window.sessionStorage, pending)) {
        addNotification({ title: '转为选题未发送', message: '本机无法保存待核实标记，本次没有发送转换请求。请检查浏览器存储权限后重试。', type: 'error' });
        return;
      }
      promotionRequestsRef.current.set(id, pending);
      promotionUncertainRef.current.add(id);

      const result = await promoteInspiration(id);
      removeInspirationPromotionRecovery(window.sessionStorage, pending);
      promotionRequestsRef.current.delete(id);
      promotionUncertainRef.current.delete(id);
      addNotification({
        title: '转为选题成功',
        message: `已创建选题 #${result.topicId}`,
        type: 'success',
      });
      syncInspirationPatch(id, { status: 'promoted', topic_id: result.topicId });
      closeDetail();
      navigate(`/topics/${result.topicId}`, { state: { mobileReturnTo: '/inspirations' } });
    } catch {
      const pendingRecovery = promotionRequestsRef.current.get(id);
      if (!pendingRecovery) {
        addNotification({ title: '转为选题失败', message: '本次转换请求未发送；可以在确认相似选题后重试。', type: 'error' });
        return;
      }
      try {
        const latest = await getInspirationDetailForRecovery(id);
        const current = latest.inspiration;
        if (current.topic_id) {
          removeInspirationPromotionRecovery(window.sessionStorage, pendingRecovery);
          promotionRequestsRef.current.delete(id);
          promotionUncertainRef.current.delete(id);
          syncInspirationPatch(id, { status: current.status, topic_id: current.topic_id });
          addNotification({ title: '转选题结果已核实', message: `服务器已关联选题 #${current.topic_id}，现在为你打开。`, type: 'success' });
          closeDetail();
          navigate(`/topics/${current.topic_id}`, { state: { mobileReturnTo: '/inspirations' } });
        } else if (current.status === 'promoted') {
          promotionUncertainRef.current.add(id);
          setPromotionVerificationIds((items) => new Set(items).add(id));
          addNotification({ title: '关联选题待核实', message: '服务器显示该灵感已转为选题，但暂时没有可确认的关联编号；请重试只读核实，不要重复转化。', type: 'warning' });
        } else {
          if (removeInspirationPromotionRecovery(window.sessionStorage, pendingRecovery)) {
            promotionRequestsRef.current.delete(id);
            promotionUncertainRef.current.delete(id);
            addNotification({ title: '转为选题失败', message: '服务器当前尚未建立选题关联，可以在确认相似选题后安全重试。', type: 'error' });
          } else {
            promotionUncertainRef.current.add(id);
            setPromotionVerificationIds((items) => new Set(items).add(id));
            addNotification({ title: '转为选题结果待确认', message: '服务器尚未建立选题关联，但本机恢复标记仍未能核验清除；请先只读核实。', type: 'warning' });
          }
        }
      } catch (error) {
        promotionUncertainRef.current.add(id);
        setPromotionVerificationIds((items) => new Set(items).add(id));
        addNotification({
          title: '转选题结果待确认',
          message: `操作结果无法确认（${getUserFacingErrorMessage(error, '读取失败')}），且服务器状态暂时无法读取。已暂停再次转化；请只读核实，不要重复操作。`,
          type: 'warning',
        });
      }
    } finally {
      promoteInFlightRef.current.delete(id);
      setPromotingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const verifyPromotionState = async (id: number) => {
    if (promotionVerificationInFlightRef.current.has(id)) return;
    const pending = promotionRequestsRef.current.get(id);
    if (!pending || !promotionUncertainRef.current.has(id)) return;
    promotionVerificationInFlightRef.current.add(id);
    setPromotingIds((current) => new Set(current).add(id));
    try {
      const latest = await getInspirationDetailForRecovery(id);
      const current = latest.inspiration;
      if (current.topic_id) {
        removeInspirationPromotionRecovery(window.sessionStorage, pending);
        promotionRequestsRef.current.delete(id);
        promotionUncertainRef.current.delete(id);
        setPromotionVerificationIds((items) => {
          const next = new Set(items);
          next.delete(id);
          return next;
        });
        syncInspirationPatch(id, { status: current.status, topic_id: current.topic_id });
        addNotification({ title: '转选题状态已核实', message: `已确认关联选题 #${current.topic_id}，现在为你打开。`, type: 'success' });
        closeDetail();
        navigate(`/topics/${current.topic_id}`, { state: { mobileReturnTo: '/inspirations' } });
      } else if (current.status === 'promoted') {
        addNotification({ title: '关联选题仍待核实', message: '服务器显示该灵感已转为选题，但关联编号仍不可用；请稍后只读重试或联系管理员核对。', type: 'warning' });
      } else {
        if (removeInspirationPromotionRecovery(window.sessionStorage, pending)) {
          promotionRequestsRef.current.delete(id);
          promotionUncertainRef.current.delete(id);
          setPromotionVerificationIds((items) => {
            const next = new Set(items);
            next.delete(id);
            return next;
          });
          addNotification({ title: '转选题状态已核实', message: '服务器尚未建立选题关联，已恢复安全重试入口。', type: 'info' });
        } else {
          addNotification({ title: '恢复状态仍待处理', message: '服务器尚未建立选题关联，但本机核实标记未能清除；为避免重复转换，请稍后重新核实。', type: 'warning' });
        }
      }
    } catch {
      addNotification({ title: '仍无法核实转选题状态', message: '本次只读读取未成功；再次转化仍保持暂停，请稍后重试核实。', type: 'error' });
    } finally {
      promotionVerificationInFlightRef.current.delete(id);
      setPromotingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  useEffect(() => {
    promotionRequestsRef.current.clear();
    promotionUncertainRef.current.clear();
    promotionVerificationInFlightRef.current.clear();
    setPromotionVerificationIds(new Set());
    setPromotionRecoveryReady(false);
    setPromotionRecoveryStorageBlocked(false);
    if (!Number.isSafeInteger(authUserId) || Number(authUserId) <= 0) return;

    try {
      const stored = readAllInspirationPromotionRecoveries(window.sessionStorage, Number(authUserId));
      if (stored.state !== 'ready' || stored.invalidIds.length > 0) {
        setPromotionRecoveryStorageBlocked(true);
        setPromotionRecoveryReady(true);
        return;
      }

      const requests = new Map(stored.pending.map((pending) => [pending.inspirationId, pending]));
      promotionRequestsRef.current = requests;
      promotionUncertainRef.current = new Set(requests.keys());
      setPromotionVerificationIds(new Set(requests.keys()));
      setPromotionRecoveryReady(true);
    } catch {
      setPromotionRecoveryStorageBlocked(true);
      setPromotionRecoveryReady(true);
    }
  }, [authUserId]);

  const continueAfterSimilarityReview = () => {
    if (!similarTopicReview) return;
    const { inspirationId, title } = similarTopicReview;
    reviewedPromotionTitles.current.add(`${inspirationId}:${normalizeTopicTitle(title)}`);
    promotionReviewRef.current = null;
    setSimilarTopicReview(null);
    void handlePromote(inspirationId);
  };

  const cancelSimilarityReview = () => {
    promotionReviewRef.current = null;
    setSimilarTopicReview(null);
  };

  const syncCommentSnapshot = (id: number, comments: InspirationComment[], commentCount: number) => {
    syncInspirationPatch(id, { comment_count: commentCount });
    setDetailData((current) => {
      if (!current || current.inspiration.id !== id) return current;
      const merged = new Map(current.comments.map((comment) => [comment.id, comment]));
      comments.forEach((comment) => merged.set(comment.id, comment));
      return {
        inspiration: { ...current.inspiration, comment_count: commentCount },
        comments: [...merged.values()],
      };
    });
  };

  const clearCommentUncertainty = (requestKey: string) => {
    commentUncertainRef.current.delete(requestKey);
    setCommentUncertainKeys((current) => {
      if (!current.has(requestKey)) return current;
      const next = new Set(current);
      next.delete(requestKey);
      return next;
    });
  };

  const clearCommentRecovery = (requestKey: string, clientRequestId: string) => {
    const pending = commentRequestByKeyRef.current.get(requestKey);
    if (pending?.clientRequestId === clientRequestId) {
      commentRequestByKeyRef.current.delete(requestKey);
      const [userId, inspirationId] = requestKey.split(':').map(Number);
      if (Number.isFinite(userId) && Number.isFinite(inspirationId)) {
        removeStoredCommentRequest(userId, inspirationId, clientRequestId);
      }
    }
    clearCommentUncertainty(requestKey);
    setCommentRecoveryStorageWarningKeys((current) => {
      if (!current.has(requestKey)) return current;
      const next = new Set(current);
      next.delete(requestKey);
      return next;
    });
  };

  const handleCommentSubmit = async () => {
    const inspirationId = selectedId;
    const content = commentText.trim();
    const userId = authStore.user?.id;
    if (!inspirationId || !content || userId === undefined || commentInFlightRef.current.has(inspirationId)) return;

    const requestKey = commentRecoveryKey(userId, inspirationId);
    if (commentUncertainRef.current.has(requestKey)) return;
    let pending = commentRequestByKeyRef.current.get(requestKey) || readStoredCommentRequest(userId, inspirationId);
    if (!pending || pending.userId !== userId || pending.content !== content) {
      if (pending) removeStoredCommentRequest(userId, inspirationId, pending.clientRequestId);
      pending = { clientRequestId: crypto.randomUUID(), content, inspirationId, userId, needsVerification: true };
      commentRequestByKeyRef.current.set(requestKey, pending);
    }
    commentRequestByKeyRef.current.set(requestKey, pending);
    pending.needsVerification = true;
    if (!persistCommentRequest(inspirationId, pending)) {
      // No request has been sent for this attempt, so keep this draft retryable in memory.
      pending.needsVerification = false;
      commentRequestByKeyRef.current.set(requestKey, pending);
      addNotification({
        title: '本次未发送',
        message: '浏览器无法确认评论恢复信息已保存；本次没有发送评论。请检查浏览器存储后重试。',
        type: 'error',
      });
      return;
    }

    commentInFlightRef.current.add(inspirationId);
    setCommentSubmittingIds((current) => new Set(current).add(inspirationId));
    try {
      const result = await createInspirationComment(inspirationId, content, pending.clientRequestId);
      syncCommentSnapshot(inspirationId, [result.comment], result.comment_count);
      if (selectedIdRef.current === inspirationId && commentText === content) setCommentText('');
      clearCommentRecovery(requestKey, pending.clientRequestId);
      addNotification({ title: '评论已发布', message: '你的评论已显示在讨论区。', type: 'success' });
    } catch {
      try {
        const latest = await getInspirationDetailForRecovery(inspirationId);
        syncCommentSnapshot(inspirationId, latest.comments, latest.comments.length);
        const confirmed = latest.comments.find((comment) => comment.client_request_id === pending.clientRequestId);
        if (confirmed) {
          if (selectedIdRef.current === inspirationId && commentText === content) setCommentText('');
          clearCommentRecovery(requestKey, pending.clientRequestId);
          addNotification({ title: '评论结果已核实', message: '服务器已保存这条评论，讨论区已同步。', type: 'success' });
        } else {
          pending.needsVerification = false;
          persistCommentRequest(inspirationId, pending);
          addNotification({
            title: '发表评论失败',
            message: '服务器尚未保存这条评论。重试会沿用同一请求编号，不会重复添加已保存的评论。',
            type: 'error',
          });
        }
      } catch {
        pending.needsVerification = true;
        const recoveryPersisted = persistCommentRequest(inspirationId, pending)
          || commentRequestMatchesStored(inspirationId, pending);
        setCommentRecoveryStorageWarningKeys((current) => {
          if (current.has(requestKey) === !recoveryPersisted) return current;
          const next = new Set(current);
          if (recoveryPersisted) next.delete(requestKey);
          else next.add(requestKey);
          return next;
        });
        commentUncertainRef.current.add(requestKey);
        setCommentUncertainKeys((current) => new Set(current).add(requestKey));
        addNotification({
          title: '评论结果待确认',
          message: recoveryPersisted
            ? '请求未获确认，且服务器状态暂时无法读取。已暂停再次发表评论；请先只读核实，避免重复操作。'
            : '请求未获确认，服务器状态暂时无法读取，且无法确认恢复编号仍保存在浏览器中。请勿刷新或关闭当前页面；只读核实前已暂停再次发表评论。',
          type: 'warning',
        });
      }
    } finally {
      commentInFlightRef.current.delete(inspirationId);
      setCommentSubmittingIds((current) => {
        const next = new Set(current);
        next.delete(inspirationId);
        return next;
      });
    }
  };

  const verifyCommentState = async (inspirationId: number) => {
    const userId = authStore.user?.id;
    if (userId === undefined) return;
    const requestKey = commentRecoveryKey(userId, inspirationId);
    const pending = commentRequestByKeyRef.current.get(requestKey);
    if (!pending || commentVerificationInFlightRef.current.has(requestKey)) return;

    commentVerificationInFlightRef.current.add(requestKey);
    setCommentVerifyingKeys((current) => new Set(current).add(requestKey));
    try {
      const latest = await getInspirationDetailForRecovery(inspirationId);
      syncCommentSnapshot(inspirationId, latest.comments, latest.comments.length);
      const confirmed = latest.comments.find((comment) => comment.client_request_id === pending.clientRequestId);
      if (confirmed) {
        if (selectedIdRef.current === inspirationId && commentText === pending.content) setCommentText('');
        clearCommentRecovery(requestKey, pending.clientRequestId);
        addNotification({ title: '评论状态已核实', message: '服务器已保存这条评论，讨论区已同步。', type: 'success' });
      } else {
        pending.needsVerification = false;
        const recoveryPersisted = persistCommentRequest(inspirationId, pending);
        setCommentRecoveryStorageWarningKeys((current) => {
          if (current.has(requestKey) === !recoveryPersisted) return current;
          const next = new Set(current);
          if (recoveryPersisted) next.delete(requestKey);
          else next.add(requestKey);
          return next;
        });
        clearCommentUncertainty(requestKey);
        addNotification({ title: '评论状态已核实', message: '服务器尚未保存这条评论；当前输入已保留，可以安全重试。', type: 'info' });
      }
    } catch {
      addNotification({ title: '仍无法核实评论状态', message: '本次只读读取未成功；发表评论仍保持暂停，请稍后重试核实。', type: 'error' });
    } finally {
      commentVerificationInFlightRef.current.delete(requestKey);
      setCommentVerifyingKeys((current) => {
        if (!current.has(requestKey)) return current;
        const next = new Set(current);
        next.delete(requestKey);
        return next;
      });
    }
  };

  const categoryColors: Record<string, string> = {
    口播: 'bg-studio-primary-soft text-studio-primary-contrast',
    带货: 'bg-studio-amber-soft text-studio-amber-contrast',
    科普: 'bg-studio-success-soft text-studio-success-contrast',
    故事: 'bg-studio-violet-soft text-studio-violet-contrast',
    其他: 'bg-studio-surface-soft text-studio-text-muted',
  };
  const activeCommentRecoveryKey = selectedId !== null && authStore.user
    ? commentRecoveryKey(authStore.user.id, selectedId)
    : null;
  const activeCommentUncertain = Boolean(activeCommentRecoveryKey && commentUncertainKeys.has(activeCommentRecoveryKey));
  const activeCommentRecoveryStorageWarning = Boolean(activeCommentRecoveryKey && commentRecoveryStorageWarningKeys.has(activeCommentRecoveryKey));
  const activeCommentVerifying = Boolean(activeCommentRecoveryKey && commentVerifyingKeys.has(activeCommentRecoveryKey));

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div>
          <PageHeading className={styles.pageTitle}>灵感池</PageHeading>
          <p className={`${styles.subtitle} mt-1`}>收集团队灵感，快速互动，再在详情里集中讨论</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className={`flex shrink-0 items-center gap-2 whitespace-nowrap px-5 py-2.5 ${styles.buttonPrimary} rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]`}
        >
          <Plus className="w-4 h-4" />
          <span className="font-medium text-sm">提交灵感</span>
        </button>
      </div>

      {promotionRecoveryStorageBlocked ? (
        <div role="alert" className="rounded-xl border border-studio-amber/30 bg-studio-amber-soft px-4 py-3 text-sm text-studio-amber-contrast">
          转选题恢复记录暂时无法确认，新的转选题操作已暂停。请检查浏览器存储权限并重新加载页面。
        </div>
      ) : null}

      <div className={`${styles.card} p-4`}>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${styles.textMuted}`} />
            <input
              id="inspiration-search"
              name="search"
              type="text"
              aria-label="搜索灵感"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="搜索灵感..."
              className={`w-full pl-10 pr-4 py-2.5 ${styles.input} text-sm`}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className={`w-4 h-4 ${styles.textMuted}`} />
            <select
              id="inspiration-category-filter"
              name="categoryFilter"
              aria-label="按分类筛选灵感"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className={`px-4 py-2.5 ${styles.input} text-sm`}
            >
              {categories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading && inspirations.length === 0 ? (
        <LoadingState type="inline" text="正在加载灵感列表…" className="flex h-64 w-full justify-center" />
      ) : inspirations.length === 0 && listError ? (
        <div role="alert" className={`${styles.card} flex flex-col items-center gap-3 p-8 text-center`}>
          <p className={styles.textPrimary}>{listError}</p>
          <ActionButton type="button" variant="secondary" onClick={() => void fetchInspirations()}>
            重新加载灵感
          </ActionButton>
        </div>
      ) : inspirations.length === 0 ? (
        <div className={`${styles.card} p-12 text-center`}>
          <Lightbulb className={`w-12 h-12 ${styles.textMuted} mx-auto mb-4`} />
          <h3 className={`text-lg font-medium ${styles.textPrimary} mb-2`}>还没有灵感</h3>
          <p className={`${styles.textSecondary} mb-4`}>点击右上角“提交灵感”开始收集团队创意</p>
        </div>
      ) : (
        <>
        {listError ? (
          <div role="alert" className={`${styles.card} mb-4 flex flex-wrap items-center justify-between gap-3 p-4`}>
            <p className={styles.textPrimary}>{listError}</p>
            <ActionButton type="button" variant="secondary" onClick={() => void fetchInspirations()}>
              重新加载灵感
            </ActionButton>
          </div>
        ) : null}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {inspirations.map((inspiration) => {
            const isPromoted = inspiration.status === 'promoted';

            return (
              <article
                key={inspiration.id}
                className={`${styles.card} p-5 text-left hover:border-studio-primary/30 hover:-translate-y-0.5 transition-all duration-200 group ${newItemIds.has(inspiration.id) ? 'animate-new-item new-item-highlight' : ''}`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <h3 aria-label={inspiration.title} className={`text-base font-semibold ${styles.textPrimary} mb-1.5`}>
                      <ActionButton
                        type="button"
                        variant="ghost"
                        aria-label={`查看灵感详情：${inspiration.title}`}
                        onClick={() => void openDetail(inspiration.id)}
                        className="min-h-10 w-full justify-start rounded-sm border-0 bg-transparent px-0 py-0 text-left text-base font-semibold leading-[inherit] text-inherit shadow-none hover:bg-transparent hover:text-inherit hover:transform-none active:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-focus-ring"
                      >
                        <span className="line-clamp-2">{inspiration.title}</span>
                      </ActionButton>
                    </h3>
                    {inspiration.description && (
                      <p className={`text-sm ${styles.textSecondary} line-clamp-3`}>
                        {inspiration.description}
                      </p>
                    )}
                  </div>
                  <span className={`text-[10px] shrink-0 ${styles.textMuted}`}>
                    {formatBeijingTime(inspiration.updated_at)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {inspiration.category && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        categoryColors[inspiration.category] || categoryColors.其他
                      }`}
                    >
                      {inspiration.category}
                    </span>
                  )}
                  {isPromoted && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-studio-success-soft text-studio-success-contrast font-medium">
                      已转选题
                    </span>
                  )}
                  {recentCommentIds.has(inspiration.id) && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-studio-cyan-soft text-studio-cyan-contrast font-medium">
                      有新评论
                    </span>
                  )}
                </div>

                <div data-inspiration-actions className={`flex flex-col gap-2 pt-3 border-t ${styles.borderLight} sm:flex-row sm:items-center sm:justify-between`}>
                  <div className="flex items-center gap-2">
                    <ActionButton
                      type="button"
                      variant="icon"
                      aria-label={`点赞灵感：${inspiration.title}`}
                      aria-pressed={Boolean(inspiration.voted)}
                      aria-busy={votePendingIds.has(inspiration.id) || voteVerificationIds.has(inspiration.id)}
                      disabled={votePendingIds.has(inspiration.id) || voteVerificationIds.has(inspiration.id)}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleVote(inspiration.id);
                      }}
                      className={`min-h-10 min-w-10 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        inspiration.voted
                          ? 'bg-studio-primary/15 text-studio-primary-contrast'
                          : `${styles.bgTertiary} ${styles.textSecondary} hover:bg-studio-primary/10 hover:text-studio-primary-contrast`
                      } ${voteAnimatingIds.has(inspiration.id) ? 'animate-pulse-vote' : ''} disabled:opacity-50`}
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      {inspiration.votes}
                    </ActionButton>
                    <ActionButton
                      type="button"
                      variant="icon"
                      aria-label={`查看灵感讨论：${inspiration.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        void openDetail(inspiration.id);
                      }}
                      className={`min-h-10 min-w-10 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium ${styles.bgTertiary} ${styles.textSecondary} hover:bg-studio-primary/10 hover:text-studio-primary-contrast transition-all`}
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      {inspiration.comment_count || 0}
                    </ActionButton>
                  </div>

                  <div className="flex min-w-0 items-center justify-between gap-2 sm:justify-end">
                    <span className={`max-w-28 truncate whitespace-nowrap text-[10px] ${styles.textMuted}`}>
                      {inspiration.creator_name || '匿名'}
                    </span>
                    {!isPromoted && canPromoteInspiration && (
                      <ActionButton
                        type="button"
                        variant="secondary"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handlePromote(inspiration.id);
                        }}
                        disabled={promotingIds.has(inspiration.id) || promotionVerificationIds.has(inspiration.id) || similarTopicReview?.inspirationId === inspiration.id}
                        className={`min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2 text-xs font-medium ${styles.bgTertiary} ${styles.textSecondary} hover:bg-studio-success/10 hover:text-studio-success-contrast transition-all disabled:opacity-50`}
                      >
                        {promotingIds.has(inspiration.id) || similarTopicReview?.inspirationId === inspiration.id ? (
                          <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <ArrowRight className="w-3.5 h-3.5" />
                        )}
                        转为选题
                      </ActionButton>
                    )}
                    {isPromoted && inspiration.topic_id ? <ActionButton type="button" variant="ghost" className="min-h-11 shrink-0 whitespace-nowrap" onClick={(event) => { event.stopPropagation(); navigate(`/topics/${inspiration.topic_id}`, { state: { mobileReturnTo: '/inspirations' } }); }}>查看关联选题</ActionButton> : null}
                    {(canDeleteAnyInspiration || authStore.user?.id === inspiration.creator_id) && (
                      <ActionButton
                        type="button"
                        variant="danger"
                        aria-label={`删除灵感：${inspiration.title}`}
                        aria-busy={deletingIds.has(inspiration.id) || deleteVerifyingIds.has(inspiration.id)}
                        disabled={!promotionRecoveryReady || promotionRecoveryStorageBlocked || deletingIds.has(inspiration.id) || deleteVerificationIds.has(inspiration.id) || promotionVerificationIds.has(inspiration.id)}
                        onClick={(event) => {
                          event.stopPropagation();
                          setPendingDeleteId(inspiration.id);
                        }}
                        className="h-10 w-10 min-h-10 min-w-10 p-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </ActionButton>
                    )}
                  </div>
                </div>
                {voteVerificationIds.has(inspiration.id) ? (
                  <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-studio-amber/30 bg-studio-amber-soft px-3 py-2 text-xs text-studio-amber-contrast">
                    <span>点赞结果待确认；再次操作已暂停。</span>
                    <ActionButton
                      type="button"
                      variant="ghost"
                      className="min-h-10 px-2 text-xs"
                      aria-label={`只读核实点赞状态：${inspiration.title}`}
                      disabled={votePendingIds.has(inspiration.id)}
                      onClick={(event) => {
                        event.stopPropagation();
                        void verifyVoteState(inspiration.id);
                      }}
                    >
                      只读核实
                    </ActionButton>
                  </div>
                ) : voteRetryIds.has(inspiration.id) ? (
                  <div role="status" className="mt-3 rounded-lg border border-studio-cyan/30 bg-studio-cyan-soft px-3 py-2 text-xs text-studio-cyan-contrast">
                    上次点赞状态已核实；再次操作会沿用原请求编号安全重试。
                  </div>
                ) : null}
                {deleteVerificationIds.has(inspiration.id) ? (
                  <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-studio-amber/30 bg-studio-amber-soft px-3 py-2 text-xs text-studio-amber-contrast">
                    <span>删除结果待确认；再次删除已暂停。</span>
                    <ActionButton
                      type="button"
                      variant="ghost"
                      className="min-h-10 px-2 text-xs"
                      aria-label={`只读核实删除状态：${inspiration.title}`}
                      disabled={deleteVerifyingIds.has(inspiration.id)}
                      onClick={(event) => {
                        event.stopPropagation();
                        void verifyInspirationDelete(inspiration.id);
                      }}
                    >
                      {deleteVerifyingIds.has(inspiration.id) ? '核实中…' : '只读核实'}
                    </ActionButton>
                  </div>
                ) : null}
                {promotionVerificationIds.has(inspiration.id) ? (
                  <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-studio-amber/30 bg-studio-amber-soft px-3 py-2 text-xs text-studio-amber-contrast">
                    <span>转选题结果待确认；再次转化已暂停。</span>
                    <ActionButton
                      type="button"
                      variant="ghost"
                      className="min-h-10 px-2 text-xs"
                      aria-label={`只读核实转选题状态：${inspiration.title}`}
                      disabled={promotingIds.has(inspiration.id)}
                      onClick={(event) => {
                        event.stopPropagation();
                        void verifyPromotionState(inspiration.id);
                      }}
                    >
                      只读核实
                    </ActionButton>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
        </>
      )}

      {showCreateModal && createPortal((
        <div
          ref={createDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={createDialogTitleId}
          tabIndex={-1}
          className={`fixed inset-0 ${styles.overlay} flex items-center justify-center z-modal p-4`}
        >
          <div className={`${styles.modal} p-6 w-full max-w-md mx-4`}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-studio-primary" />
                <h2 id={createDialogTitleId} className={`text-lg font-bold ${styles.textPrimary}`}>提交灵感</h2>
              </div>
              <button
                type="button"
                aria-label="关闭提交灵感弹窗"
                onClick={closeCreateDialog}
                disabled={createRecoveryPending}
                className={`xmt-btn xmt-btn-ghost h-10 w-10 min-h-10 min-w-10 shrink-0 !p-0 ${styles.textMuted}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {createStorageError ? (
                <div role="alert" className="rounded-lg border border-studio-amber/25 bg-studio-amber/10 px-3 py-2 text-sm text-studio-amber-contrast">
                  {createStorageError}
                </div>
              ) : null}
              {createRecoveryPending ? (
                <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-studio-amber/30 bg-studio-amber-soft px-3 py-2 text-xs text-studio-amber-contrast">
                  <span>
                    {creatingInspiration || createVerificationInFlight
                      ? '正在确认上次提交…'
                      : createRecoveryUncertain
                        ? '上次创建结果待确认；再次提交已暂停。'
                        : '服务器尚未找到该记录；可以安全重试上次创建。'}
                  </span>
                  {createRecoveryUncertain ? (
                    <ActionButton
                      type="button"
                      variant="ghost"
                      className="min-h-10 px-2 text-xs"
                      aria-label="只读核实上次灵感创建状态"
                      disabled={createVerificationInFlight || creatingInspiration}
                      onClick={() => void verifyInspirationCreate()}
                    >
                      {createVerificationInFlight ? '核实中…' : '只读核实'}
                    </ActionButton>
                  ) : null}
                </div>
              ) : null}
              <div>
                <label htmlFor="inspiration-title" className={`block ${styles.textSecondary} text-sm font-medium mb-1.5`}>标题 *</label>
                <input
                  id="inspiration-title"
                  name="title"
                  data-modal-autofocus=""
                  type="text"
                  value={formData.title}
                  disabled={createRecoveryPending}
                  onChange={(event) => {
                    setFormData({ ...formData, title: event.target.value });
                    setCreateStorageError(null);
                  }}
                  className={`w-full px-4 py-2.5 ${styles.input} text-sm`}
                  placeholder="你的灵感是什么？"
                />
              </div>
              <div>
                <label htmlFor="inspiration-description" className={`block ${styles.textSecondary} text-sm font-medium mb-1.5`}>描述</label>
                <textarea
                  id="inspiration-description"
                  name="description"
                  value={formData.description}
                  disabled={createRecoveryPending}
                  onChange={(event) => {
                    setFormData({ ...formData, description: event.target.value });
                    setCreateStorageError(null);
                  }}
                  className={`w-full px-4 py-2.5 ${styles.input} text-sm resize-none`}
                  rows={4}
                  placeholder="补充更多想法、场景、切入角度"
                />
              </div>
              <div>
                <label htmlFor="inspiration-category" className={`block ${styles.textSecondary} text-sm font-medium mb-1.5`}>分类</label>
                <select
                  id="inspiration-category"
                  name="category"
                  value={formData.category}
                  disabled={createRecoveryPending}
                  onChange={(event) => {
                    setFormData({ ...formData, category: event.target.value });
                    setCreateStorageError(null);
                  }}
                  className={`w-full px-4 py-2.5 ${styles.input} text-sm`}
                >
                  {categories
                    .filter((item) => item.value)
                    .map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeCreateDialog}
                  disabled={createRecoveryPending}
                  className={`flex-1 px-4 py-2.5 ${styles.buttonSecondary} rounded-xl text-sm`}
                >
                  取消
                </button>
                <button
                  onClick={() => void handleCreate()}
                  disabled={creatingInspiration || createRecoveryUncertain || createVerificationInFlight}
                  aria-busy={creatingInspiration || createVerificationInFlight}
                  className={`flex-1 px-4 py-2.5 ${styles.buttonPrimary} rounded-xl text-sm`}
                >
                  {creatingInspiration ? '提交中…' : createRecoveryPending ? '安全重试' : '提交'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}

      {selectedId !== null && createPortal((
        <div
          ref={detailDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={detailDialogTitleId}
          tabIndex={-1}
          className={`fixed inset-0 ${styles.overlay} flex items-center justify-center z-modal p-4`}
        >
          <div className={`${styles.modal} w-full max-w-4xl h-[82vh] flex flex-col overflow-hidden`}>
            <div className={`px-6 py-4 border-b ${styles.border} flex items-center justify-between gap-4 shrink-0`}>
              <div className="min-w-0">
                <p className={`text-xs uppercase tracking-[0.24em] ${styles.textMuted}`}>灵感详情</p>
                <h2 id={detailDialogTitleId} className={`text-lg font-semibold ${styles.textPrimary} truncate mt-1`}>
                  {detailData?.inspiration.title || '加载中...'}
                </h2>
              </div>
              <button
                type="button"
                data-modal-autofocus=""
                aria-label="关闭灵感详情"
                onClick={closeDetail}
                className={`xmt-btn xmt-btn-ghost h-10 w-10 shrink-0 !p-0 ${styles.hoverBg}`}
              >
                <X className={`w-5 h-5 ${styles.textSecondary}`} />
              </button>
            </div>

            {detailLoading ? (
              <LoadingState type="inline" text="正在加载灵感详情…" className="flex flex-1 items-center justify-center" />
            ) : detailData ? (
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <div className={`px-6 py-5 border-b ${styles.border}`}>
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      {detailData.inspiration.category && (
                        <span
                          className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${
                            categoryColors[detailData.inspiration.category] || categoryColors.其他
                          }`}
                        >
                          {detailData.inspiration.category}
                        </span>
                      )}
                      <span className={`text-xs ${styles.textMuted}`}>
                        提交者 {detailData.inspiration.creator_name || '匿名'}
                      </span>
                      <span className={`text-xs ${styles.textMuted}`}>
                        更新于 {formatBeijingTime(detailData.inspiration.updated_at)}
                      </span>
                    </div>
                    <div className={`text-sm leading-7 whitespace-pre-wrap ${styles.textPrimary}`}>
                      {detailData.inspiration.description?.trim() || '这条灵感还没有补充详细描述。'}
                    </div>
                    {detailData.inspiration.topic_id ? <ActionButton type="button" variant="ghost" className="mt-4 min-h-11" onClick={() => navigate(`/topics/${detailData.inspiration.topic_id}`, { state: { mobileReturnTo: '/inspirations' } })}>查看关联选题</ActionButton> : null}
                  </div>

                  <div className={`px-6 py-4 border-b ${styles.border}`}>
                    <p className={`text-sm font-medium ${styles.textPrimary}`}>讨论区</p>
                    <p className={`text-xs ${styles.textMuted} mt-1`}>
                      共 {detailData.comments.length} 条评论
                    </p>
                  </div>

                  <div className="px-6 py-4 space-y-3">
                    {detailData.comments.length === 0 ? (
                      <div className={`rounded-2xl border border-dashed ${styles.border} px-4 py-8 text-center ${styles.textMuted}`}>
                        还没有人留言，你可以先说说自己的想法。
                      </div>
                    ) : (
                      detailData.comments.map((comment, index) => (
                        <div key={comment.id} className={`rounded-2xl ${styles.bgTertiary} px-4 py-3`}>
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`text-xs font-semibold ${styles.textPrimary}`}>#{index + 1}</span>
                              <span className={`text-sm font-medium ${styles.textPrimary}`}>
                                {comment.creator_name || '匿名'}
                              </span>
                            </div>
                            <span className={`text-xs ${styles.textMuted}`}>
                              {formatBeijingTime(comment.created_at)}
                            </span>
                          </div>
                          <p className={`text-sm leading-6 whitespace-pre-wrap ${styles.textSecondary}`}>
                            {comment.content}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className={`px-6 py-4 border-t ${styles.border} shrink-0`}>
                  <div className="flex flex-col gap-3">
                    {activeCommentUncertain && selectedId !== null ? (
                      <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-studio-amber/30 bg-studio-amber-soft px-3 py-2 text-xs text-studio-amber-contrast">
                        <span>{activeCommentRecoveryStorageWarning
                          ? '评论结果待确认；恢复编号无法确认仍保存在浏览器中。请勿刷新或关闭当前页面，只读核实前已暂停再次发表评论。'
                          : '评论结果待确认；再次发表评论已暂停。'}</span>
                        <ActionButton
                          type="button"
                          variant="ghost"
                          className="min-h-10 px-2 text-xs"
                          aria-label={`只读核实评论状态：${detailData.inspiration.title}`}
                          disabled={activeCommentVerifying}
                          onClick={() => void verifyCommentState(selectedId)}
                        >
                          {activeCommentVerifying ? '核实中…' : '只读核实'}
                        </ActionButton>
                      </div>
                    ) : null}
                    <textarea
                      value={commentText}
                      onChange={(event) => setCommentText(event.target.value)}
                      disabled={commentSubmittingIds.has(selectedId) || activeCommentUncertain || activeCommentVerifying}
                      name="comment"
                      className={`w-full px-4 py-3 ${styles.input} text-sm resize-none`}
                      rows={3}
                      placeholder="写下你的想法，补充角度、风险点、延展方向..."
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={() => void handleCommentSubmit()}
                        aria-busy={commentSubmittingIds.has(selectedId) || activeCommentVerifying}
                        disabled={commentSubmittingIds.has(selectedId) || activeCommentUncertain || activeCommentVerifying || !commentText.trim()}
                        className={`px-4 py-2 rounded-lg text-sm ${styles.buttonPrimary} disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {commentSubmittingIds.has(selectedId) ? '发送中...' : '发表评论'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ), document.body)}
      <SimilarTopicReview
        open={similarTopicReview !== null}
        title={similarTopicReview?.title ?? ''}
        topics={similarTopicReview?.topics ?? []}
        checkFailed={similarTopicReview?.checkFailed}
        continueLabel="仍然转为选题"
        onCancel={cancelSimilarityReview}
        onContinue={continueAfterSimilarityReview}
      />
      <ConfirmModal
        open={pendingDeleteId !== null}
        title="删除这条灵感？"
        description="删除后这条灵感将从灵感池移除，无法恢复。"
        confirmText="删除灵感"
        variant="danger"
        loading={pendingDeleteId !== null && deletingIds.has(pendingDeleteId)}
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => {
          const id = pendingDeleteId;
          if (id === null) return;
          void handleDelete(id).finally(() => setPendingDeleteId(null));
        }}
      />
    </div>
  );
}
