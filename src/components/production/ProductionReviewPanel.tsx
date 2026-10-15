import { useCallback, useEffect, useState } from 'react';
import { Check, CornerDownRight, Lightbulb, MapPin, MessageSquare, Send, X } from 'lucide-react';
import {
  createProductionReviewThread,
  getProductionReviewThreads,
  replyToProductionReviewThread,
  updateProductionReviewThreadStatus,
  type ProductionReviewAnchor,
  type ProductionReviewThread,
} from '../../api/workflow';
import type { EditorCommandHandle } from '../ContentEditor';
import { ActionButton, GlassPanel } from '../studio';

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
  const [busyKey, setBusyKey] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void getProductionReviewThreads(productionId, version)
      .then((items) => { if (active) setThreads(items); })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : '获取批注与建议失败');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [productionId, refreshKey, version]);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  const beginCompose = useCallback((kind: 'comment' | 'suggestion') => {
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
  }, [canComment, currentVersion, editorHandle, onNotice]);

  const cancelCompose = useCallback(() => {
    setComposeKind(null);
    setAnchor(null);
    setSummary('');
    setProposedText('');
  }, []);

  const submitThread = useCallback(async () => {
    if (!composeKind || !anchor || !summary.trim()) return;
    setBusyKey('create');
    setError('');
    try {
      await createProductionReviewThread(productionId, {
        version,
        kind: composeKind,
        anchor,
        summary: summary.trim(),
        ...(composeKind === 'suggestion' ? { proposed_text: proposedText } : {}),
      });
      cancelCompose();
      refresh();
      onNotice(composeKind === 'comment' ? '批注已添加' : '修改建议已提交', '讨论已保存到当前稿件版本。', 'success');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '添加批注或建议失败');
    } finally {
      setBusyKey('');
    }
  }, [anchor, cancelCompose, composeKind, onNotice, productionId, proposedText, refresh, summary, version]);

  const submitReply = useCallback(async (threadId: number) => {
    const content = (replyDrafts[threadId] || '').trim();
    if (!content) return;
    setBusyKey(`reply-${threadId}`);
    setError('');
    try {
      await replyToProductionReviewThread(productionId, threadId, content);
      setReplyDrafts((current) => ({ ...current, [threadId]: '' }));
      refresh();
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : '添加回复失败');
    } finally {
      setBusyKey('');
    }
  }, [productionId, refresh, replyDrafts]);

  const updateStatus = useCallback(async (thread: ProductionReviewThread, status: 'resolved' | 'accepted' | 'rejected') => {
    setBusyKey(`status-${thread.id}`);
    setError('');
    try {
      if (status === 'accepted') {
        if (!editorHandle || !currentVersion) throw new Error('请在当前可编辑版本中处理修改建议');
        const result = editorHandle.applyReviewSuggestion(anchorFromThread(thread), thread.proposed_text ?? '');
        if (result === 'missing') throw new Error('原文已变化或无法唯一定位。请核对正文后手动修改，再处理这条建议。');
        const saveResult = await flushEditor();
        if (saveResult.status !== 'synced') {
          throw new Error('建议内容已放入正文，但保存尚未确认成功。请先完成正文保存，再重试接受建议。');
        }
      }
      await updateProductionReviewThreadStatus(productionId, thread.id, status);
      refresh();
      onNotice(status === 'accepted' ? '建议已接受' : status === 'rejected' ? '建议已拒绝' : '讨论已结束',
        status === 'accepted' ? '替换内容已保存到当前稿件。' : '处理结果已保存。', 'success');
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : '更新批注或建议状态失败');
    } finally {
      setBusyKey('');
    }
  }, [currentVersion, editorHandle, flushEditor, onNotice, productionId, refresh]);

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
          <ActionButton onClick={() => beginCompose('comment')} disabled={!canComment || !currentVersion} className="px-3 py-2 text-xs">
            <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> 给选中文字加批注
          </ActionButton>
          <ActionButton onClick={() => beginCompose('suggestion')} disabled={!canComment || !currentVersion} className="px-3 py-2 text-xs">
            <Lightbulb className="mr-1.5 h-3.5 w-3.5" /> 提出修改建议
          </ActionButton>
        </div>
      </div>

      {composeKind && anchor ? (
        <div className="border-b border-studio-border-soft bg-studio-surface-soft/40 p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-studio-text-primary">
              {composeKind === 'comment' ? '新建批注讨论' : '提出审阅建议'}
            </h3>
            <button type="button" onClick={cancelCompose} className="xmt-btn xmt-btn-ghost px-2 py-1" aria-label="取消编辑">
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
              onChange={(event) => setSummary(event.target.value)}
              placeholder={composeKind === 'comment' ? '写下需要讨论的内容…' : '说明这样修改的原因…'}
            />
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <ActionButton onClick={cancelCompose} className="px-3 py-2 text-xs">取消</ActionButton>
            <ActionButton onClick={() => void submitThread()} disabled={!summary.trim() || busyKey === 'create'} variant="primary" className="px-3 py-2 text-xs">
              <Send className="mr-1.5 h-3.5 w-3.5" /> {busyKey === 'create' ? '正在保存…' : '提交'}
            </ActionButton>
          </div>
        </div>
      ) : null}

      {error ? <p role="alert" className="mx-5 mt-4 rounded-lg border border-studio-coral/30 bg-studio-coral/10 px-3 py-2 text-sm text-studio-coral-contrast">{error}</p> : null}

      {loading ? (
        <p className="px-5 py-8 text-center text-sm text-studio-text-muted">正在加载批注与建议…</p>
      ) : threads.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm font-medium text-studio-text-primary">这个版本还没有批注或修改建议</p>
          <p className="mt-1 text-xs text-studio-text-muted">选中稿件中的文字即可发起讨论或建议。</p>
        </div>
      ) : (
        <div className="divide-y divide-studio-border-soft">
          {threads.map((thread) => {
            const isOpen = thread.status === 'open';
            const busy = busyKey === `status-${thread.id}`;
            return (
              <article key={thread.id} className="space-y-3 px-5 py-4" aria-label={thread.kind === 'comment' ? '批注讨论' : '修改建议'}>
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
                  }} className="ml-auto px-2 py-1 text-xs" aria-label="定位原文">
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
                      onChange={(event) => setReplyDrafts((current) => ({ ...current, [thread.id]: event.target.value }))}
                      maxLength={4000}
                      aria-label="回复内容"
                      placeholder="回复这条讨论…"
                    />
                    <ActionButton onClick={() => void submitReply(thread.id)} disabled={!(replyDrafts[thread.id] || '').trim() || busyKey === `reply-${thread.id}`} className="px-3 py-2 text-xs">
                      <Send className="mr-1 h-3.5 w-3.5" /> 回复
                    </ActionButton>
                  </div>
                ) : null}
                {isOpen && thread.kind === 'suggestion' && canComment && currentVersion ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    <ActionButton onClick={() => void updateStatus(thread, 'rejected')} disabled={busy} className="px-3 py-2 text-xs">
                      <X className="mr-1 h-3.5 w-3.5" /> 拒绝建议
                    </ActionButton>
                    <ActionButton onClick={() => void updateStatus(thread, 'accepted')} disabled={!canAccept || busy} variant="primary" className="px-3 py-2 text-xs">
                      <Check className="mr-1 h-3.5 w-3.5" /> 接受并保存
                    </ActionButton>
                  </div>
                ) : null}
                {isOpen && thread.kind === 'comment' && canResolve(thread) && currentVersion ? (
                  <div className="flex justify-end">
                    <ActionButton onClick={() => void updateStatus(thread, 'resolved')} disabled={busy} className="px-3 py-2 text-xs">结束讨论</ActionButton>
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
