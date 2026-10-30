import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, CornerDownRight, Lightbulb, MapPin, MessageSquare, Send, X } from 'lucide-react';
import {
  createProductionReviewThread,
  getProductionReviewThreadRequestStatus,
  getProductionReviewReplyRequestStatus,
  getProductionReviewStatusRequestStatus,
  getProductionReviewThreads,
  replyToProductionReviewThread,
  updateProductionReviewThreadStatus,
  type ProductionReviewAnchor,
  type ProductionReviewThread,
  type ProductionReviewThreadCreateInput,
} from '../../api/workflow';
import type { EditorCommandHandle } from '../ContentEditor';
import { ActionButton, GlassPanel } from '../studio';
import { getUserFacingErrorMessage } from '@/lib/userFacingError';

type NoticeType = 'success' | 'warning' | 'error';

interface ProductionReviewPanelProps {
  productionId: number;
  version: string;
  currentVersion: boolean;
  canComment: boolean;
  canAccept: boolean;
  canModerate: boolean;
  currentUserId: number | null;
  editorHandle: EditorCommandHandle | null;
  flushEditor: () => Promise<{ status: string }>;
  mutationsLocked: boolean;
  beginAcceptingSuggestion: () => boolean;
  endAcceptingSuggestion: () => void;
  onNotice: (title: string, message: string, type: NoticeType) => void;
}

function anchorFromThread(thread: ProductionReviewThread): ProductionReviewAnchor {
  return {
    quote: thread.anchor_quote,
    context: thread.anchor_context,
    from: thread.anchor_from,
    to: thread.anchor_to,
  };
}

function statusLabel(thread: ProductionReviewThread) {
  if (thread.kind === 'suggestion') {
    return thread.status === 'accepted' ? '已采纳' : thread.status === 'rejected' ? '已拒绝' : '待处理';
  }
  return thread.status === 'resolved' ? '已结束' : '讨论中';
}

function formatReviewTime(value: string) {
  if (!value) return '';
  return value.replace('T', ' ').slice(0, 16);
}

function replyFieldAccessibleName(thread: ProductionReviewThread) {
  const kind = thread.kind === 'comment' ? '批注' : '修改建议';
  const summary = thread.summary.trim().replace(/\s+/gu, ' ');
  const summaryCharacters = Array.from(summary);
  const summaryExcerpt = summaryCharacters.slice(0, 80).join('');
  const summaryLabel = summaryExcerpt
    ? `${summaryExcerpt}${summaryCharacters.length > 80 ? '…' : ''}`
    : '当前讨论';
  return `回复${kind}：${summaryLabel}`;
}

type ReplyRecoveryState = 'checking' | 'not_found' | 'unknown' | 'conflict' | 'applied' | 'corrupt';
type ReplyRecovery = { requestId: string | null; content: string | null; state: ReplyRecoveryState };
const replyRecoveryKey = (actorId: number, productionId: number, threadId: number) =>
  `xmt:production-review-reply:v1:${actorId}:${productionId}:${threadId}`;
const replyStateKey = (productionId: number, threadId: number) => `${productionId}:${threadId}`;
const replyRequestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readReplyRecovery(actorId: number, productionId: number, threadId: number): ReplyRecovery | null {
  try {
    const raw = window.sessionStorage.getItem(replyRecoveryKey(actorId, productionId, threadId));
    if (raw === null) return null;
    const value = JSON.parse(raw) as { requestId?: unknown; content?: unknown };
    if (typeof value.requestId !== 'string' || !replyRequestIdPattern.test(value.requestId)
      || typeof value.content !== 'string' || !value.content.trim() || value.content.length > 4000) {
      return { requestId: null, content: null, state: 'corrupt' };
    }
    return { requestId: value.requestId.toLowerCase(), content: value.content, state: 'checking' };
  } catch {
    return { requestId: null, content: null, state: 'corrupt' };
  }
}

function writeReplyRecovery(actorId: number, productionId: number, threadId: number, recovery: Pick<ReplyRecovery, 'requestId' | 'content'>) {
  try {
    if (!recovery.requestId || recovery.content === null) return false;
    const key = replyRecoveryKey(actorId, productionId, threadId);
    const serialized = JSON.stringify(recovery);
    window.sessionStorage.setItem(key, serialized);
    return window.sessionStorage.getItem(key) === serialized;
  } catch {
    return false;
  }
}

function clearReplyRecovery(actorId: number, productionId: number, threadId: number) {
  try {
    window.sessionStorage.removeItem(replyRecoveryKey(actorId, productionId, threadId));
    return true;
  } catch {
    return false;
  }
}

type ReviewStatusTarget = 'resolved' | 'accepted' | 'rejected';
type StatusRecoveryState = 'preparing' | 'checking' | 'not_found' | 'needs_body_check' | 'unknown' | 'conflict' | 'applied' | 'corrupt';
type StatusRecovery = { requestId: string | null; status: ReviewStatusTarget | null; contentApplied: boolean; state: StatusRecoveryState };
const statusRecoveryKey = (actorId: number, productionId: number, threadId: number) =>
  `xmt:production-review-status:v1:${actorId}:${productionId}:${threadId}`;

function readStatusRecovery(actorId: number, productionId: number, threadId: number): StatusRecovery | null {
  try {
    const raw = window.sessionStorage.getItem(statusRecoveryKey(actorId, productionId, threadId));
    if (raw === null) return null;
    const value = JSON.parse(raw) as { requestId?: unknown; status?: unknown; contentApplied?: unknown };
    if (typeof value.requestId !== 'string' || !replyRequestIdPattern.test(value.requestId)
      || (value.status !== 'resolved' && value.status !== 'accepted' && value.status !== 'rejected')
      || typeof value.contentApplied !== 'boolean') {
      return { requestId: null, status: null, contentApplied: false, state: 'corrupt' };
    }
    return {
      requestId: value.requestId.toLowerCase(),
      status: value.status,
      contentApplied: value.contentApplied,
      state: 'checking',
    };
  } catch {
    return { requestId: null, status: null, contentApplied: false, state: 'corrupt' };
  }
}

function writeStatusRecovery(actorId: number, productionId: number, threadId: number, recovery: Pick<StatusRecovery, 'requestId' | 'status' | 'contentApplied'>) {
  try {
    if (!recovery.requestId || !recovery.status) return false;
    const key = statusRecoveryKey(actorId, productionId, threadId);
    const serialized = JSON.stringify({
      requestId: recovery.requestId,
      status: recovery.status,
      contentApplied: recovery.contentApplied,
    });
    window.sessionStorage.setItem(key, serialized);
    return window.sessionStorage.getItem(key) === serialized;
  } catch {
    return false;
  }
}

function clearStatusRecovery(actorId: number, productionId: number, threadId: number) {
  try {
    window.sessionStorage.removeItem(statusRecoveryKey(actorId, productionId, threadId));
    return true;
  } catch {
    return false;
  }
}

type ThreadRecoveryState = 'checking' | 'not_found' | 'unknown' | 'conflict' | 'applied' | 'corrupt';
type ThreadRecovery = { requestId: string | null; input: ProductionReviewThreadCreateInput | null; state: ThreadRecoveryState };
const threadRecoveryKey = (actorId: number, productionId: number) =>
  `xmt:production-review-thread:v1:${actorId}:${productionId}`;

function readThreadRecovery(actorId: number, productionId: number): ThreadRecovery | null {
  try {
    const raw = window.sessionStorage.getItem(threadRecoveryKey(actorId, productionId));
    if (raw === null) return null;
    const value = JSON.parse(raw) as { requestId?: unknown; input?: unknown };
    if (typeof value.requestId !== 'string' || !replyRequestIdPattern.test(value.requestId)
      || !value.input || typeof value.input !== 'object') {
      return { requestId: null, input: null, state: 'corrupt' };
    }
    const input = value.input as Record<string, unknown>;
    const anchor = input.anchor as Record<string, unknown> | null;
    if (typeof input.version !== 'string' || !input.version.trim() || input.version.length > 32
      || (input.kind !== 'comment' && input.kind !== 'suggestion')
      || typeof input.summary !== 'string' || !input.summary.trim() || Array.from(input.summary).length > 4000
      || !anchor || typeof anchor.quote !== 'string' || !anchor.quote.trim() || Array.from(anchor.quote).length > 2000
      || typeof anchor.context !== 'string' || Array.from(anchor.context).length > 500
      || !Number.isSafeInteger(anchor.from) || !Number.isSafeInteger(anchor.to)
      || Number(anchor.from) < 0 || Number(anchor.to) <= Number(anchor.from)
      || (input.kind === 'suggestion' && (typeof input.proposed_text !== 'string' || Array.from(input.proposed_text).length > 2000))) {
      return { requestId: null, input: null, state: 'corrupt' };
    }
    return {
      requestId: value.requestId.toLowerCase(),
      input: {
        version: input.version,
        kind: input.kind,
        anchor: {
          quote: anchor.quote,
          context: anchor.context,
          from: Number(anchor.from),
          to: Number(anchor.to),
        },
        summary: input.summary,
        ...(input.kind === 'suggestion' ? { proposed_text: input.proposed_text as string } : {}),
      },
      state: 'checking',
    };
  } catch {
    return { requestId: null, input: null, state: 'corrupt' };
  }
}

function writeThreadRecovery(actorId: number, productionId: number, recovery: Pick<ThreadRecovery, 'requestId' | 'input'>) {
  try {
    if (!recovery.requestId || !recovery.input) return false;
    const key = threadRecoveryKey(actorId, productionId);
    const serialized = JSON.stringify(recovery);
    window.sessionStorage.setItem(key, serialized);
    return window.sessionStorage.getItem(key) === serialized;
  } catch {
    return false;
  }
}

function clearThreadRecovery(actorId: number, productionId: number) {
  try {
    window.sessionStorage.removeItem(threadRecoveryKey(actorId, productionId));
    return true;
  } catch {
    return false;
  }
}

export default function ProductionReviewPanel({
  productionId,
  version,
  currentVersion,
  canComment,
  canAccept,
  canModerate,
  currentUserId,
  editorHandle,
  flushEditor,
  mutationsLocked,
  beginAcceptingSuggestion,
  endAcceptingSuggestion,
  onNotice,
}: ProductionReviewPanelProps) {
  const [threads, setThreads] = useState<ProductionReviewThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [composeKind, setComposeKind] = useState<'comment' | 'suggestion' | null>(null);
  const [anchor, setAnchor] = useState<ProductionReviewAnchor | null>(null);
  const [summary, setSummary] = useState('');
  const [proposedText, setProposedText] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [replyRecoveries, setReplyRecoveries] = useState<Record<string, ReplyRecovery>>({});
  const [statusRecoveries, setStatusRecoveries] = useState<Record<string, StatusRecovery>>({});
  const [threadRecovery, setThreadRecovery] = useState<ThreadRecovery | null>(null);
  const [busyKey, setBusyKey] = useState('');
  const mutationLockRef = useRef(false);
  const componentActiveRef = useRef(true);
  const viewScopeRef = useRef({ currentUserId, productionId });
  viewScopeRef.current = { currentUserId, productionId };
  const terminalStatusRequestsRef = useRef(new Set<string>());
  const mutationBusy = Boolean(busyKey) || mutationsLocked;
  const threadFormLocked = mutationBusy || Boolean(threadRecovery);

  useEffect(() => {
    componentActiveRef.current = true;
    return () => { componentActiveRef.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void getProductionReviewThreads(productionId, version)
      .then((items) => { if (active) setThreads(items); })
      .catch((loadError: unknown) => {
        if (active) setError(getUserFacingErrorMessage(loadError, '批注与建议暂时无法加载，请检查连接后重试。'));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [currentUserId, productionId, refreshKey, version]);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);
  const clearCompose = useCallback(() => {
    setComposeKind(null);
    setAnchor(null);
    setSummary('');
    setProposedText('');
  }, []);

  useEffect(() => {
    setReplyDrafts({});
    setReplyRecoveries({});
    setStatusRecoveries({});
  }, [currentUserId, productionId]);

  useEffect(() => {
    if (!currentUserId || threads.length === 0) return;
    let active = true;
    const pending = threads.flatMap((thread) => {
      const recovery = readReplyRecovery(currentUserId, productionId, thread.id);
      return recovery ? [{ threadId: thread.id, recovery }] : [];
    });
    if (pending.length === 0) return;
    const nextRecoveries = Object.fromEntries(pending.map(({ threadId, recovery }) => [replyStateKey(productionId, threadId), recovery]));
    setReplyRecoveries((current) => ({ ...current, ...nextRecoveries }));
    setReplyDrafts((current) => ({
      ...current,
      ...Object.fromEntries(pending.filter(({ recovery }) => recovery.content !== null).map(({ threadId, recovery }) => [threadId, recovery.content!])),
    }));
    for (const { threadId, recovery } of pending) {
      if (!recovery.requestId || recovery.content === null) {
        setError('发现无法读取的回复恢复记录。为避免重复创建，回复输入已锁定；请联系管理员处理本机恢复状态。');
        continue;
      }
      void getProductionReviewReplyRequestStatus(productionId, threadId, recovery.requestId, recovery.content)
        .then((status) => {
          if (!active) return;
          if (status.status === 'applied') {
            const cleared = clearReplyRecovery(currentUserId, productionId, threadId);
            setReplyRecoveries((current) => {
              const next = { ...current };
              if (cleared) delete next[replyStateKey(productionId, threadId)];
              else next[replyStateKey(productionId, threadId)] = { ...recovery, state: 'applied' };
              return next;
            });
            setReplyDrafts((current) => current[threadId]?.trim() === recovery.content
              ? { ...current, [threadId]: '' }
              : current);
            setError(cleared ? '' : '服务端已确认回复，但本机恢复标记暂时无法清除；请勿重复操作，刷新后会再次核实。');
            refresh();
            return;
          }
          if (status.status === 'conflict') {
            setReplyRecoveries((current) => ({
              ...current,
              [replyStateKey(productionId, threadId)]: { ...recovery, state: 'conflict' },
            }));
            setError('本机恢复记录与服务端请求编号冲突。为避免重复发送，回复已锁定；请先核实记录或联系管理员。');
            return;
          }
          setReplyRecoveries((current) => ({
            ...current,
            [replyStateKey(productionId, threadId)]: { ...recovery, state: 'not_found' },
          }));
          setError('服务端尚未找到这条回复请求。原内容已锁定，可使用同一请求编号安全重试。');
        })
        .catch(() => {
          if (!active) return;
          setReplyRecoveries((current) => ({
            ...current,
            [replyStateKey(productionId, threadId)]: { ...recovery, state: 'unknown' },
          }));
          setError('回复结果暂时无法核实。原内容已锁定，请重新核实后再操作。');
        });
    }
    return () => { active = false; };
  }, [currentUserId, productionId, refresh, threads]);

  const beginMutation = useCallback((key: string) => {
    if (mutationLockRef.current || mutationsLocked) return false;
    mutationLockRef.current = true;
    setBusyKey(key);
    setError('');
    return true;
  }, [mutationsLocked]);

  const finishMutation = useCallback(() => {
    mutationLockRef.current = false;
    setBusyKey('');
  }, []);

  const verifyThreadRequest = useCallback(async (
    recovery: ThreadRecovery,
    isCurrent: () => boolean = () => true,
  ) => {
    if (!currentUserId || !recovery.requestId || !recovery.input) {
      if (isCurrent()) {
        setThreadRecovery({ requestId: null, input: null, state: 'corrupt' });
        setError('批注恢复记录无法读取。为避免重复创建，当前稿件的批注输入已锁定；请联系管理员处理本机恢复状态。');
      }
      return 'unknown' as const;
    }
    if (isCurrent()) setThreadRecovery({ ...recovery, state: 'checking' });
    try {
      const status = await getProductionReviewThreadRequestStatus(productionId, recovery.requestId, recovery.input);
      if (!isCurrent()) return 'unknown' as const;
      if (status.status === 'applied') {
        const cleared = clearThreadRecovery(currentUserId, productionId);
        if (cleared) {
          setThreadRecovery(null);
          clearCompose();
          setError('');
          refresh();
        } else {
          setThreadRecovery({ ...recovery, state: 'applied' });
          setError('服务端已确认批注已保存，但本机恢复标记暂时无法清除；请勿重复提交，刷新后会再次核实。');
        }
        return 'applied' as const;
      }
      if (status.status === 'conflict') {
        setThreadRecovery({ ...recovery, state: 'conflict' });
        setError('本机恢复记录与服务端请求编号冲突。为避免重复创建，批注输入已锁定；请先核实记录或联系管理员。');
        return 'conflict' as const;
      }
      setThreadRecovery({ ...recovery, state: 'not_found' });
      setError('服务端尚未找到这条批注请求。原内容已锁定，可使用同一请求编号安全重试。');
      return 'not_found' as const;
    } catch {
      if (isCurrent()) {
        setThreadRecovery({ ...recovery, state: 'unknown' });
        setError('批注结果暂时无法核实。原内容已锁定，请重新核实后再操作。');
      }
      return 'unknown' as const;
    }
  }, [clearCompose, currentUserId, productionId, refresh]);

  const verifyThreadRecovery = useCallback(async () => {
    const recovery = threadRecovery ?? (currentUserId ? readThreadRecovery(currentUserId, productionId) : null);
    if (!recovery) {
      setError('没有可核实的批注请求。');
      return;
    }
    if (recovery.state === 'corrupt') {
      setThreadRecovery(recovery);
      setError('批注恢复记录无法读取。为避免重复创建，当前稿件的批注输入已锁定；请联系管理员处理本机恢复状态。');
      return;
    }
    if (!beginMutation('verify-thread-create')) return;
    try {
      await verifyThreadRequest(recovery);
    } finally {
      finishMutation();
    }
  }, [beginMutation, currentUserId, finishMutation, productionId, threadRecovery, verifyThreadRequest]);

  useEffect(() => {
    setComposeKind(null);
    setAnchor(null);
    setSummary('');
    setProposedText('');
    if (!currentUserId) {
      setThreadRecovery(null);
      return;
    }
    const recovery = readThreadRecovery(currentUserId, productionId);
    if (!recovery) {
      setThreadRecovery(null);
      return;
    }
    setThreadRecovery(recovery);
    if (recovery.input) {
      setComposeKind(recovery.input.kind);
      setAnchor(recovery.input.anchor);
      setSummary(recovery.input.summary);
      setProposedText(recovery.input.proposed_text ?? '');
    }
    if (!recovery.requestId || !recovery.input) {
      setError('发现无法读取的批注恢复记录。为避免重复创建，当前稿件的批注输入已锁定；请联系管理员处理本机恢复状态。');
      return;
    }
    let active = true;
    void verifyThreadRequest(recovery, () => active);
    return () => { active = false; };
  }, [currentUserId, productionId, verifyThreadRequest]);

  const verifyReplyRequest = useCallback(async (
    threadId: number,
    recovery: ReplyRecovery,
    isCurrent: () => boolean = () => true,
  ) => {
    if (!isCurrent()) return 'unknown' as const;
    if (!currentUserId || !recovery.requestId || recovery.content === null) {
      if (isCurrent()) {
        setReplyRecoveries((current) => ({
          ...current,
          [replyStateKey(productionId, threadId)]: { requestId: null, content: null, state: 'corrupt' },
        }));
        setError('回复恢复记录无法读取。为避免重复创建，回复输入已锁定。');
      }
      return 'unknown' as const;
    }
    const checking = { ...recovery, state: 'checking' as const };
    if (isCurrent()) setReplyRecoveries((current) => ({ ...current, [replyStateKey(productionId, threadId)]: checking }));
    try {
      const status = await getProductionReviewReplyRequestStatus(productionId, threadId, recovery.requestId, recovery.content);
      if (!isCurrent()) {
        if (status.status === 'applied' && currentUserId) clearReplyRecovery(currentUserId, productionId, threadId);
        return 'unknown' as const;
      }
      if (status.status === 'applied') {
        const cleared = clearReplyRecovery(currentUserId, productionId, threadId);
        setReplyRecoveries((current) => {
          const next = { ...current };
          if (cleared) delete next[replyStateKey(productionId, threadId)];
          else next[replyStateKey(productionId, threadId)] = { ...recovery, state: 'applied' };
          return next;
        });
        setReplyDrafts((current) => current[threadId]?.trim() === recovery.content
          ? { ...current, [threadId]: '' }
          : current);
        setError(cleared ? '' : '服务端已确认回复，但本机恢复标记暂时无法清除；请勿重复操作，刷新后会再次核实。');
        refresh();
        return 'applied' as const;
      }
      if (status.status === 'conflict') {
        setReplyRecoveries((current) => ({
          ...current,
          [replyStateKey(productionId, threadId)]: { ...recovery, state: 'conflict' },
        }));
        setError('本机恢复记录与服务端请求编号冲突。为避免重复发送，回复已锁定；请先核实记录或联系管理员。');
        return 'conflict' as const;
      }
      setReplyRecoveries((current) => ({
        ...current,
        [replyStateKey(productionId, threadId)]: { ...recovery, state: 'not_found' },
      }));
      setError('服务端尚未找到这条回复请求。原内容已锁定，可使用同一请求编号安全重试。');
      return 'not_found' as const;
    } catch {
      if (isCurrent()) {
        setReplyRecoveries((current) => ({
          ...current,
          [replyStateKey(productionId, threadId)]: { ...recovery, state: 'unknown' },
        }));
        setError('回复结果暂时无法核实。原内容已锁定，请重新核实后再操作。');
      }
      return 'unknown' as const;
    }
  }, [currentUserId, productionId, refresh]);

  const verifyReplyRecovery = useCallback(async (threadId: number) => {
    const key = replyStateKey(productionId, threadId);
    const recovery = replyRecoveries[key] ?? (currentUserId ? readReplyRecovery(currentUserId, productionId, threadId) : null);
    if (!recovery) {
      setError('没有可核实的回复请求。');
      return;
    }
    if (!beginMutation(`verify-reply-${threadId}`)) return;
    const actorId = currentUserId;
    const requestProductionId = productionId;
    try {
      await verifyReplyRequest(threadId, recovery, () => componentActiveRef.current
        && viewScopeRef.current.currentUserId === actorId
        && viewScopeRef.current.productionId === requestProductionId);
    } finally {
      finishMutation();
    }
  }, [beginMutation, currentUserId, finishMutation, productionId, replyRecoveries, verifyReplyRequest]);

  const verifyStatusRequest = useCallback(async (
    threadId: number,
    recovery: StatusRecovery,
    isCurrent: () => boolean = () => true,
  ) => {
    const key = replyStateKey(productionId, threadId);
    if (!currentUserId || !recovery.requestId || !recovery.status) {
      if (isCurrent()) {
        setStatusRecoveries((current) => ({
          ...current,
          [key]: { requestId: null, status: null, contentApplied: false, state: 'corrupt' },
        }));
        setError('状态恢复记录无法读取。为避免重复修改，当前批注操作已锁定。');
      }
      return 'unknown' as const;
    }

    const checking = { ...recovery, state: 'checking' as const };
    if (isCurrent()) setStatusRecoveries((current) => ({ ...current, [key]: checking }));
    try {
      const result = await getProductionReviewStatusRequestStatus(
        productionId, threadId, recovery.requestId, recovery.status,
      );
      if (!isCurrent()) return 'unknown' as const;
      const requestKey = `${currentUserId}:${productionId}:${threadId}:${recovery.requestId}`;
      if (result.status === 'applied') {
        terminalStatusRequestsRef.current.add(requestKey);
        const cleared = clearStatusRecovery(currentUserId, productionId, threadId);
        setStatusRecoveries((current) => {
          const next = { ...current };
          if (cleared) delete next[key];
          else next[key] = { ...recovery, state: 'applied' };
          return next;
        });
        setError(cleared ? '' : '服务端已确认处理结果，但本机恢复标记暂时无法清除；请勿重复操作，刷新后会再次核实。');
        refresh();
        return 'applied' as const;
      }
      if (result.status === 'conflict') {
        terminalStatusRequestsRef.current.add(requestKey);
        setStatusRecoveries((current) => ({ ...current, [key]: { ...recovery, state: 'conflict' } }));
        setError('状态请求编号与服务端记录不一致，已锁定重试；请刷新并核对该批注的处理状态。');
        refresh();
        return 'conflict' as const;
      }
      const state = recovery.status === 'accepted' && !recovery.contentApplied ? 'needs_body_check' : 'not_found';
      setStatusRecoveries((current) => ({ ...current, [key]: { ...recovery, state } }));
      setError(state === 'needs_body_check'
        ? '服务端尚未确认接受状态。请先核对正文是否已保存替换内容，再使用原请求编号重试状态。'
        : '服务端尚未找到这项状态处理；可以使用同一请求编号安全重试。');
      return 'not_found' as const;
    } catch {
      if (isCurrent()) {
        setStatusRecoveries((current) => ({ ...current, [key]: { ...recovery, state: 'unknown' } }));
        setError('处理结果暂时无法核实。请先重新核实，勿再次执行正文替换或创建新请求。');
      }
      return 'unknown' as const;
    }
  }, [currentUserId, productionId, refresh]);

  useEffect(() => {
    if (!currentUserId || threads.length === 0) return;
    let active = true;
    const pending = threads.flatMap((thread) => {
      const recovery = readStatusRecovery(currentUserId, productionId, thread.id);
      return recovery ? [{ threadId: thread.id, recovery }] : [];
    });
    if (pending.length === 0) return;
    setStatusRecoveries((current) => ({
      ...current,
      ...Object.fromEntries(pending.map(({ threadId, recovery }) => {
        const key = replyStateKey(productionId, threadId);
        return [key, current[key]?.requestId === recovery.requestId ? current[key] : recovery];
      })),
    }));
    for (const { threadId, recovery } of pending) {
      if (!recovery.requestId || !recovery.status) {
        setError('发现无法读取的批注状态恢复记录。为避免重复处理，当前操作已锁定。');
        continue;
      }
      const requestKey = `${currentUserId}:${productionId}:${threadId}:${recovery.requestId}`;
      if (terminalStatusRequestsRef.current.has(requestKey)) continue;
      void verifyStatusRequest(threadId, recovery, () => active
        && viewScopeRef.current.currentUserId === currentUserId
        && viewScopeRef.current.productionId === productionId);
    }
    return () => { active = false; };
  }, [currentUserId, productionId, refreshKey, threads, verifyStatusRequest]);

  const verifyStatusRecovery = useCallback(async (threadId: number) => {
    const key = replyStateKey(productionId, threadId);
    const recovery = statusRecoveries[key] ?? (currentUserId ? readStatusRecovery(currentUserId, productionId, threadId) : null);
    if (!recovery) {
      setError('没有可核实的状态请求。');
      return;
    }
    if (!beginMutation(`verify-status-${threadId}`)) return;
    try {
      await verifyStatusRequest(threadId, recovery, () => viewScopeRef.current.currentUserId === currentUserId
        && viewScopeRef.current.productionId === productionId);
    } finally {
      finishMutation();
    }
  }, [beginMutation, currentUserId, finishMutation, productionId, statusRecoveries, verifyStatusRequest]);

  const retryStatusRequest = useCallback(async (
    threadId: number,
    recovery: StatusRecovery,
    confirmBodySaved = false,
  ) => {
    const statusTarget = recovery.status;
    const requestId = recovery.requestId;
    if (!currentUserId || !requestId || !statusTarget) {
      setError('状态恢复记录无法读取，不能安全重试。');
      return;
    }
    if (!beginMutation(`status-${threadId}`)) return;
    const actorId = currentUserId;
    let activeRecovery = recovery;
    try {
      if (confirmBodySaved && recovery.status === 'accepted' && !recovery.contentApplied) {
        activeRecovery = { ...recovery, contentApplied: true, state: 'checking' };
        if (!writeStatusRecovery(actorId, productionId, threadId, activeRecovery)) {
          setStatusRecoveries((current) => ({ ...current, [replyStateKey(productionId, threadId)]: { ...recovery, state: 'needs_body_check' } }));
          setError('本机无法更新恢复记录；未重试状态写入。请检查浏览器存储后重新核对正文。');
          return;
        }
      }
      setStatusRecoveries((current) => ({ ...current, [replyStateKey(productionId, threadId)]: { ...activeRecovery, state: 'checking' } }));
      const result = await updateProductionReviewThreadStatus(productionId, threadId, statusTarget, requestId);
      const requestKey = `${actorId}:${productionId}:${threadId}:${requestId}`;
      if ('conflict' in result || 'forbidden' in result || 'missing' in result) {
        terminalStatusRequestsRef.current.add(requestKey);
        setStatusRecoveries((current) => ({ ...current, [replyStateKey(productionId, threadId)]: { ...activeRecovery, state: 'conflict' } }));
        setError('forbidden' in result
          ? '当前账号权限已变化，未重试批注状态；请联系管理员核实权限。'
          : 'missing' in result
            ? '稿件或批注已不存在，状态请求已停止；请刷新当前页面。'
            : '该批注已由其他操作处理，或恢复请求与原操作不一致。已停止重试并刷新当前状态。');
        refresh();
        return;
      }
      terminalStatusRequestsRef.current.add(requestKey);
      const cleared = clearStatusRecovery(actorId, productionId, threadId);
      setStatusRecoveries((current) => {
        const next = { ...current };
        if (cleared) delete next[replyStateKey(productionId, threadId)];
        else next[replyStateKey(productionId, threadId)] = { ...activeRecovery, state: 'applied' };
        return next;
      });
      setError(cleared ? '' : '服务端已确认处理结果，但本机恢复标记暂时无法清除；请勿重复操作。');
      refresh();
    } catch {
      await verifyStatusRequest(threadId, activeRecovery, () => viewScopeRef.current.currentUserId === actorId
        && viewScopeRef.current.productionId === productionId);
    } finally {
      finishMutation();
    }
  }, [beginMutation, currentUserId, finishMutation, productionId, refresh, verifyStatusRequest]);

  const beginCompose = useCallback((kind: 'comment' | 'suggestion') => {
    if (mutationLockRef.current || mutationsLocked || threadRecovery) return;
    if (!currentVersion) {
      onNotice('历史版本只读', '请切换到当前生效版本后再发起批注或修改建议。', 'warning');
      return;
    }
    if (!canComment) {
      onNotice('暂不可评论', '当前账号没有稿件批注权限。', 'warning');
      return;
    }
    const selected = editorHandle?.getReviewAnchor() || null;
    if (!selected) {
      onNotice('先选择正文', '在稿件中选中一段文字后，再添加批注或提出修改建议。', 'warning');
      return;
    }
    setAnchor(selected);
    setComposeKind(kind);
    setSummary('');
    setProposedText('');
    setError('');
  }, [canComment, currentVersion, editorHandle, mutationsLocked, onNotice, threadRecovery]);

  const cancelCompose = useCallback(() => {
    if (mutationLockRef.current || mutationsLocked || threadRecovery) return;
    clearCompose();
  }, [clearCompose, mutationsLocked, threadRecovery]);

  const submitThread = useCallback(async () => {
    if (!currentUserId) {
      setError('当前登录身份尚未确认，暂不能安全提交批注或建议。');
      return;
    }
    const existingRecovery = threadRecovery ?? readThreadRecovery(currentUserId, productionId);
    if (existingRecovery && existingRecovery.state !== 'not_found') {
      await verifyThreadRecovery();
      return;
    }
    const input = existingRecovery?.input ?? (composeKind && anchor && summary.trim() ? {
      version,
      kind: composeKind,
      anchor,
      summary: summary.trim(),
      ...(composeKind === 'suggestion' ? { proposed_text: proposedText } : {}),
    } : null);
    const requestId = existingRecovery?.requestId ?? crypto.randomUUID();
    if (!input || !requestId || !beginMutation('create')) return;
    const activeRecovery: ThreadRecovery = { requestId, input, state: 'checking' };
    if (!existingRecovery && !writeThreadRecovery(currentUserId, productionId, activeRecovery)) {
      setError('本机无法保存批注恢复记录，未发送请求。请检查浏览器存储后重试。');
      finishMutation();
      return;
    }
    setThreadRecovery(activeRecovery);
    try {
      await createProductionReviewThread(productionId, input, requestId);
      const cleared = clearThreadRecovery(currentUserId, productionId);
      if (cleared) {
        setThreadRecovery(null);
        clearCompose();
        setError('');
        onNotice(input.kind === 'comment' ? '批注已添加' : '修改建议已提交', '讨论已保存到当前稿件版本。', 'success');
      } else {
        setThreadRecovery({ ...activeRecovery, state: 'applied' });
        setError('服务端已确认批注已保存，但本机恢复标记暂时无法清除；请勿重复提交，刷新后会再次核实。');
      }
      refresh();
    } catch {
      await verifyThreadRequest(activeRecovery);
    } finally {
      finishMutation();
    }
  }, [anchor, beginMutation, clearCompose, composeKind, currentUserId, finishMutation, onNotice, productionId, proposedText, refresh, summary, threadRecovery, verifyThreadRecovery, verifyThreadRequest, version]);

  const submitReply = useCallback(async (threadId: number) => {
    if (!currentUserId) {
      setError('当前登录身份尚未确认，暂不能安全提交回复。');
      return;
    }
    const actorId = currentUserId;
    const requestProductionId = productionId;
    const isCurrent = () => componentActiveRef.current
      && viewScopeRef.current.currentUserId === actorId
      && viewScopeRef.current.productionId === requestProductionId;
    const key = replyStateKey(productionId, threadId);
    const recovery = replyRecoveries[key] ?? readReplyRecovery(currentUserId, productionId, threadId);
    if (recovery && recovery.state !== 'not_found') {
      await verifyReplyRecovery(threadId);
      return;
    }
    const content = recovery?.content ?? (replyDrafts[threadId] || '').trim();
    const requestId = recovery?.requestId ?? crypto.randomUUID();
    if (!content || !requestId || !beginMutation(`reply-${threadId}`)) return;
    const activeRecovery: ReplyRecovery = { requestId, content, state: 'checking' };
    if (!recovery && !writeReplyRecovery(currentUserId, productionId, threadId, activeRecovery)) {
      setError('本机无法保存回复恢复记录，未发送回复。请检查浏览器存储后重试。');
      finishMutation();
      return;
    }
    setReplyRecoveries((current) => ({ ...current, [key]: activeRecovery }));
    try {
      await replyToProductionReviewThread(productionId, threadId, content, requestId);
      const cleared = clearReplyRecovery(actorId, requestProductionId, threadId);
      if (!isCurrent()) return;
      setReplyRecoveries((current) => {
        const next = { ...current };
        if (cleared) delete next[key];
        else next[key] = { ...activeRecovery, state: 'applied' };
        return next;
      });
      setReplyDrafts((current) => current[threadId]?.trim() === content
        ? { ...current, [threadId]: '' }
        : current);
      setError(cleared ? '' : '服务端已确认回复，但本机恢复标记暂时无法清除；请勿重复操作，刷新后会再次核实。');
      refresh();
    } catch {
      await verifyReplyRequest(threadId, activeRecovery, isCurrent);
    } finally {
      finishMutation();
    }
  }, [beginMutation, currentUserId, finishMutation, productionId, refresh, replyDrafts, replyRecoveries, verifyReplyRecovery, verifyReplyRequest]);

  const updateStatus = useCallback(async (thread: ProductionReviewThread, status: 'resolved' | 'accepted' | 'rejected') => {
    if (!beginMutation(`status-${thread.id}`)) return;
    if (!currentUserId) {
      setError('无法确认当前操作者，未处理批注状态。');
      finishMutation();
      return;
    }
    const actorId = currentUserId;
    const requestId = crypto.randomUUID();
    let recovery: StatusRecovery = {
      requestId,
      status,
      contentApplied: status !== 'accepted',
      state: status === 'accepted' ? 'preparing' : 'checking',
    };
    const recoveryKey = replyStateKey(productionId, thread.id);
    if (!writeStatusRecovery(actorId, productionId, thread.id, recovery)) {
      setError('本机无法保存状态恢复记录，未提交处理结果。请检查浏览器存储后重试。');
      finishMutation();
      return;
    }
    setStatusRecoveries((current) => ({ ...current, [recoveryKey]: recovery }));
    let acceptingSuggestion = false;
    let bodyTouched = false;
    let statusRequestStarted = false;
    try {
      if (status === 'accepted') {
        if (!beginAcceptingSuggestion()) throw new Error('稿件正在处理其他操作，请完成后重试接受建议。');
        acceptingSuggestion = true;
        if (!editorHandle || !currentVersion) throw new Error('请在当前可编辑版本中处理修改建议');
        const result = editorHandle.applyReviewSuggestion(anchorFromThread(thread), thread.proposed_text ?? '');
        if (result === 'missing') throw new Error('原文已变化或无法唯一定位。请核对正文后手动修改，再处理这条建议。');
        bodyTouched = true;
        const saveResult = await flushEditor();
        if (saveResult.status !== 'synced') {
          setStatusRecoveries((current) => ({ ...current, [recoveryKey]: { ...recovery, state: 'needs_body_check' } }));
          throw new Error('建议内容已放入正文，但保存尚未确认成功。请先核对并保存正文，再用原请求编号重试处理结果。');
        }
        recovery = { ...recovery, contentApplied: true };
        if (!writeStatusRecovery(actorId, productionId, thread.id, recovery)) {
          setStatusRecoveries((current) => ({ ...current, [recoveryKey]: { ...recovery, contentApplied: false, state: 'needs_body_check' } }));
          throw new Error('正文已确认保存，但本机无法更新恢复记录；状态未提交。请核对正文后再安全恢复。');
        }
        setStatusRecoveries((current) => ({ ...current, [recoveryKey]: recovery }));
      }
      statusRequestStarted = true;
      const result = await updateProductionReviewThreadStatus(productionId, thread.id, status, requestId);
      const requestKey = `${actorId}:${productionId}:${thread.id}:${requestId}`;
      if ('conflict' in result || 'forbidden' in result || 'missing' in result) {
        terminalStatusRequestsRef.current.add(requestKey);
        setStatusRecoveries((current) => ({ ...current, [recoveryKey]: { ...recovery, state: 'conflict' } }));
        setError('forbidden' in result
          ? '当前账号权限已变化，未重试批注状态；请联系管理员核实权限。'
          : 'missing' in result
            ? '稿件或批注已不存在，状态请求已停止；请刷新当前页面。'
            : '该批注已由其他操作处理，或恢复请求与原操作不一致。已停止重试并刷新当前状态。');
        refresh();
        return;
      }
      terminalStatusRequestsRef.current.add(requestKey);
      const cleared = clearStatusRecovery(actorId, productionId, thread.id);
      setStatusRecoveries((current) => {
        const next = { ...current };
        if (cleared) delete next[recoveryKey];
        else next[recoveryKey] = { ...recovery, state: 'applied' };
        return next;
      });
      setError(cleared ? '' : '服务端已确认处理结果，但本机恢复标记暂时无法清除；请勿重复操作。');
      refresh();
      if (cleared) {
        onNotice(status === 'accepted' ? '建议已接受' : status === 'rejected' ? '建议已拒绝' : '讨论已结束',
          status === 'accepted' ? '替换内容已保存到当前稿件。' : '处理结果已保存。', 'success');
      }
    } catch (statusError) {
      if (!statusRequestStarted) {
        if (!bodyTouched) {
          const cleared = clearStatusRecovery(actorId, productionId, thread.id);
          setStatusRecoveries((current) => {
            const next = { ...current };
            if (cleared) delete next[recoveryKey];
            else next[recoveryKey] = { ...recovery, state: 'needs_body_check' };
            return next;
          });
        }
        setError(getUserFacingErrorMessage(statusError, '操作尚未提交；请检查浏览器后重试。'));
      } else {
        setError('处理结果暂时未收到确认，正在核实服务端状态…');
        await verifyStatusRequest(thread.id, recovery, () => viewScopeRef.current.currentUserId === actorId
          && viewScopeRef.current.productionId === productionId);
      }
    } finally {
      if (acceptingSuggestion) endAcceptingSuggestion();
      finishMutation();
    }
  }, [beginAcceptingSuggestion, beginMutation, currentUserId, currentVersion, editorHandle, endAcceptingSuggestion, finishMutation, flushEditor, onNotice, productionId, refresh, verifyStatusRequest]);

  const canResolve = (thread: ProductionReviewThread) => canComment && (thread.author_id === currentUserId || canModerate);

  return (
    <GlassPanel className="mt-5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-border-soft px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-studio-text-primary">
            <MessageSquare className="h-4 w-4 text-studio-primary" /> 批注与修改建议
          </h2>
          <p className="mt-1 text-xs text-studio-text-muted">讨论和审阅建议绑定到稿件版本，不会自动覆盖正文。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={() => beginCompose('comment')} disabled={!canComment || !currentVersion || mutationBusy || Boolean(threadRecovery)} className="px-3 py-2 text-xs">
            <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> 给选中文字加批注
          </ActionButton>
          <ActionButton onClick={() => beginCompose('suggestion')} disabled={!canComment || !currentVersion || mutationBusy || Boolean(threadRecovery)} className="px-3 py-2 text-xs">
            <Lightbulb className="mr-1.5 h-3.5 w-3.5" /> 提出修改建议
          </ActionButton>
        </div>
      </div>

      {composeKind && anchor ? (
        <div className="border-b border-studio-border-soft bg-studio-surface-soft/40 p-5" aria-busy={busyKey === 'create' || threadRecovery?.state === 'checking'}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-studio-text-primary">
              {composeKind === 'comment' ? '新建批注讨论' : '提出审阅建议'}
            </h3>
            <button type="button" onClick={cancelCompose} disabled={threadFormLocked} className="xmt-btn xmt-btn-ghost px-2 py-1" aria-label="取消编辑">
              <X className="h-4 w-4" />
            </button>
          </div>
          <blockquote className="mb-3 border-l-2 border-studio-primary/60 pl-3 text-sm text-studio-text-secondary">
            {anchor.quote}
          </blockquote>
          {composeKind === 'suggestion' ? (
            <label className="mb-3 block text-xs text-studio-text-muted">
              建议替换为（留空表示建议删除）
              <textarea
                className="xmt-field mt-1 min-h-20 w-full resize-y"
                value={proposedText}
                maxLength={2000}
                disabled={threadFormLocked}
                onChange={(event) => setProposedText(event.target.value)}
                placeholder="输入建议后的正文…"
              />
            </label>
          ) : null}
          <label className="block text-xs text-studio-text-muted">
            {composeKind === 'comment' ? '批注内容' : '修改理由'}
            <textarea
              className="xmt-field mt-1 min-h-20 w-full resize-y"
              value={summary}
              maxLength={4000}
              disabled={threadFormLocked}
              onChange={(event) => setSummary(event.target.value)}
              placeholder={composeKind === 'comment' ? '写下需要讨论的内容…' : '说明这样修改的原因…'}
            />
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <ActionButton onClick={cancelCompose} disabled={threadFormLocked} className="px-3 py-2 text-xs">取消</ActionButton>
            {threadRecovery ? (
              <ActionButton
                onClick={() => void verifyThreadRecovery()}
                disabled={Boolean(busyKey) || mutationsLocked || threadRecovery.state === 'checking' || threadRecovery.state === 'corrupt'}
                className="px-3 py-2 text-xs"
              >重新核实</ActionButton>
            ) : null}
            <ActionButton
              onClick={() => void submitThread()}
              disabled={mutationBusy || (threadRecovery ? threadRecovery.state !== 'not_found' : !summary.trim())}
              aria-busy={busyKey === 'create'}
              variant="primary"
              className="px-3 py-2 text-xs"
            >
              <Send className="mr-1.5 h-3.5 w-3.5" /> {busyKey === 'create' ? '正在保存…' : threadRecovery?.state === 'not_found' ? '使用原请求重试' : threadRecovery ? '等待核实' : '提交'}
            </ActionButton>
          </div>
        </div>
      ) : null}

      {error ? <p role="alert" className="mx-5 mt-4 rounded-lg border border-studio-coral/30 bg-studio-coral/10 px-3 py-2 text-sm text-studio-coral-contrast">{error}</p> : null}

      {loading ? (
        <p role="status" aria-live="polite" aria-atomic="true" className="px-5 py-8 text-center text-sm text-studio-text-muted">正在加载批注与建议…</p>
      ) : threads.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm font-medium text-studio-text-primary">这个版本还没有批注或修改建议</p>
          <p className="mt-1 text-xs text-studio-text-muted">选中稿件中的文字即可发起讨论或建议。</p>
        </div>
      ) : (
        <div className="divide-y divide-studio-border-soft">
          {threads.map((thread) => {
            const isOpen = thread.status === 'open';
            const busy = mutationBusy;
            const statusBusy = busyKey === `status-${thread.id}`;
            const replyBusy = busyKey === `reply-${thread.id}`;
            const replyVerifyBusy = busyKey === `verify-reply-${thread.id}`;
            const replyRecovery = replyRecoveries[replyStateKey(productionId, thread.id)];
            const statusRecovery = statusRecoveries[replyStateKey(productionId, thread.id)];
            const statusVerifyBusy = busyKey === `verify-status-${thread.id}`;
            return (
              <article key={thread.id} className="space-y-3 px-5 py-4" aria-label={thread.kind === 'comment' ? '批注讨论' : '修改建议'} aria-busy={statusBusy || replyBusy}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${thread.kind === 'suggestion' ? 'bg-studio-primary/12 text-studio-primary-contrast' : 'bg-studio-surface-soft text-studio-text-secondary'}`}>
                    {thread.kind === 'suggestion' ? '修改建议' : '批注讨论'}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${isOpen ? 'bg-studio-amber/12 text-studio-amber-contrast' : 'bg-studio-success/12 text-studio-success-contrast'}`}>
                    {statusLabel(thread)}
                  </span>
                  <span className="text-xs text-studio-text-muted">{thread.author_name || '成员'} · {formatReviewTime(thread.created_at)}</span>
                  <ActionButton onClick={() => {
                    if (!editorHandle?.selectReviewAnchor(anchorFromThread(thread))) {
                      onNotice('无法定位原文', '选中文字可能已被改动或重复，请在正文中手动核对。', 'warning');
                    }
                  }} disabled={mutationBusy} className="ml-auto px-2 py-1 text-xs" aria-label="定位原文">
                    <MapPin className="mr-1 h-3.5 w-3.5" /> 定位原文
                  </ActionButton>
                </div>
                <blockquote className="border-l-2 border-studio-border-strong pl-3 text-sm text-studio-text-secondary">{thread.anchor_quote}</blockquote>
                <p className="whitespace-pre-wrap break-words text-sm text-studio-text-primary">{thread.summary}</p>
                {thread.kind === 'suggestion' ? (
                  <div className="rounded-lg border border-studio-border-soft bg-studio-surface-soft/50 p-3">
                    <p className="mb-1 text-xs text-studio-text-muted">建议替换为</p>
                    <p className="whitespace-pre-wrap break-words text-sm text-studio-text-primary">
                      {thread.proposed_text ? thread.proposed_text : '（删除所选内容）'}
                    </p>
                  </div>
                ) : null}
                {statusRecovery ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-studio-border-soft bg-studio-surface-soft/50 p-3">
                    <p role="status" className="min-w-0 flex-1 text-xs text-studio-text-secondary">
                      {statusRecovery.state === 'preparing' ? '正在应用并保存建议正文，完成后才会提交处理结果…'
                        : statusRecovery.state === 'checking' ? '正在核实这项处理是否已保存…'
                        : statusRecovery.state === 'not_found' ? '服务端尚未找到原请求；可沿用同一编号重试处理结果。'
                          : statusRecovery.state === 'needs_body_check' ? '接受建议前的正文保存状态不确定。请核对正文，确认替换内容已保存后再重试；不会再次自动替换正文。'
                            : statusRecovery.state === 'unknown' ? '处理结果暂时无法核实；请先重新核实。'
                              : statusRecovery.state === 'conflict' ? '该批注已由其他操作处理，或请求编号不一致；请核对刷新后的状态。'
                                : statusRecovery.state === 'applied' ? '服务端已确认处理结果；请勿重复操作。'
                                  : '恢复记录异常，已锁定状态操作。'}
                    </p>
                    {statusRecovery.state === 'unknown' ? (
                      <ActionButton onClick={() => void verifyStatusRecovery(thread.id)} disabled={mutationBusy || statusVerifyBusy} className="px-3 py-2 text-xs">
                        {statusVerifyBusy ? '正在核实…' : '重新核实'}
                      </ActionButton>
                    ) : null}
                    {statusRecovery.state === 'not_found' ? (
                      <ActionButton onClick={() => void retryStatusRequest(thread.id, statusRecovery)} disabled={mutationBusy} className="px-3 py-2 text-xs">
                        使用原编号安全重试
                      </ActionButton>
                    ) : null}
                    {statusRecovery.state === 'needs_body_check' ? (
                      <ActionButton onClick={() => void retryStatusRequest(thread.id, statusRecovery, true)} disabled={mutationBusy} className="px-3 py-2 text-xs">
                        已核对正文，重试处理结果
                      </ActionButton>
                    ) : null}
                  </div>
                ) : null}
                {thread.replies.map((reply) => (
                  <div key={reply.id} className="ml-3 flex gap-2 border-l border-studio-border-soft pl-3 text-sm">
                    <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-studio-text-muted" />
                    <p className="min-w-0 whitespace-pre-wrap break-words text-studio-text-secondary">
                      <span className="font-medium text-studio-text-primary">{reply.author_name || '成员'}：</span>{reply.content}
                    </p>
                  </div>
                ))}
                {isOpen && canComment && currentVersion ? (
                  <div className="flex flex-wrap gap-2">
                    <textarea
                      className="xmt-field min-h-10 min-w-[200px] flex-1 resize-y text-sm"
                      value={replyDrafts[thread.id] || ''}
                      disabled={mutationBusy || Boolean(replyRecovery)}
                      onChange={(event) => setReplyDrafts((current) => ({ ...current, [thread.id]: event.target.value }))}
                      maxLength={4000}
                      aria-label={replyFieldAccessibleName(thread)}
                      placeholder="回复这条讨论…"
                    />
                    {replyRecovery ? (
                      <p role="status" className="basis-full text-xs text-studio-text-secondary">
                        {replyRecovery.state === 'checking' ? '正在核实回复是否已保存…'
                          : replyRecovery.state === 'not_found' ? '尚未找到原请求；可安全地使用同一编号重试。'
                            : replyRecovery.state === 'conflict' ? '恢复编号与内容不匹配，已锁定回复。'
                            : replyRecovery.state === 'applied' ? '回复已确认保存；请勿再次提交。'
                              : replyRecovery.state === 'corrupt' ? '本机恢复记录异常，已锁定回复。'
                                : '回复结果暂时无法核实；请先重新核实。'}
                      </p>
                    ) : null}
                    <ActionButton
                      onClick={() => void submitReply(thread.id)}
                      disabled={mutationBusy || replyRecovery?.state === 'checking' || replyRecovery?.state === 'applied' || replyRecovery?.state === 'conflict' || replyRecovery?.state === 'corrupt' || (!replyRecovery && !(replyDrafts[thread.id] || '').trim())}
                      aria-busy={replyBusy || replyVerifyBusy}
                      className="px-3 py-2 text-xs"
                    >
                      <Send className="mr-1 h-3.5 w-3.5" /> {replyBusy ? '正在回复…' : replyVerifyBusy ? '正在核实…' : replyRecovery?.state === 'not_found' ? '使用原编号安全重试' : replyRecovery?.state === 'unknown' ? '重新核实结果' : replyRecovery?.state === 'applied' ? '回复已确认' : replyRecovery?.state === 'conflict' ? '请求记录冲突' : replyRecovery?.state === 'corrupt' ? '恢复记录异常' : replyRecovery?.state === 'checking' ? '正在核实…' : '回复'}
                    </ActionButton>
                  </div>
                ) : null}
                {isOpen && thread.kind === 'suggestion' && canComment && currentVersion ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    <ActionButton onClick={() => void updateStatus(thread, 'rejected')} disabled={busy || Boolean(statusRecovery)} aria-busy={statusBusy} className="px-3 py-2 text-xs">
                      <X className="mr-1 h-3.5 w-3.5" /> {statusBusy ? '正在处理…' : '拒绝建议'}
                    </ActionButton>
                    <ActionButton onClick={() => void updateStatus(thread, 'accepted')} disabled={!canAccept || busy || Boolean(statusRecovery)} aria-busy={statusBusy} variant="primary" className="px-3 py-2 text-xs">
                      <Check className="mr-1 h-3.5 w-3.5" /> {statusBusy ? '正在应用并保存…' : '接受并保存'}
                    </ActionButton>
                  </div>
                ) : null}
                {isOpen && thread.kind === 'comment' && canResolve(thread) && currentVersion ? (
                  <div className="flex justify-end">
                    <ActionButton onClick={() => void updateStatus(thread, 'resolved')} disabled={busy || Boolean(statusRecovery)} aria-busy={statusBusy} className="px-3 py-2 text-xs">{statusBusy ? '正在结束…' : '结束讨论'}</ActionButton>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </GlassPanel>
  );
}
