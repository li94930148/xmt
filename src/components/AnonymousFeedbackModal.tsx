import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import FormModal from './common/FormModal';
import LoadingState from './common/LoadingState';
import {
  getAnonymousFeedbackSubmissionRequestStatus,
  getPublicAnonymousFeedback,
  submitAnonymousFeedback,
  type AnonymousFeedbackSubmissionRequestStatus,
  type AnonymousFeedbackType,
  type PublicAnonymousFeedback,
} from '../api/anonymousFeedback';
import { useAppStore } from '../store';
import { formatBeijingDate } from '../lib/utils';
import { ActionButton } from './studio';
import {
  clearPendingAnonymousFeedbackSubmission,
  fingerprintAnonymousFeedbackSubmission,
  readPendingAnonymousFeedbackSubmission,
  savePendingAnonymousFeedbackSubmission,
  type PendingAnonymousFeedbackSubmission,
} from '../features/anonymous-feedback/submissionRecovery';

const types: Array<{ value: AnonymousFeedbackType; label: string }> = [
  { value: 'feature', label: '功能建议' },
  { value: 'usage', label: '使用问题' },
  { value: 'process', label: '流程优化' },
  { value: 'team', label: '团队建议' },
  { value: 'other', label: '其他' },
];

const typeLabels = Object.fromEntries(types.map((item) => [item.value, item.label])) as Record<AnonymousFeedbackType, string>;

export default function AnonymousFeedbackModal({
  open,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void | Promise<void>;
}) {
  const [feedback, setFeedback] = useState<PublicAnonymousFeedback[]>([]);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<AnonymousFeedbackType | ''>('');
  const [content, setContent] = useState('');
  const [needReply, setNeedReply] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingRecovery, setPendingRecovery] = useState<PendingAnonymousFeedbackSubmission | null>(null);
  const [recoveryState, setRecoveryState] = useState<AnonymousFeedbackSubmissionRequestStatus | 'idle' | 'checking' | 'submitting' | 'unavailable'>('idle');
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [storageIssue, setStorageIssue] = useState<string | null>(null);
  const addNotification = useAppStore((state) => state.addNotification);
  const submitLockRef = useRef(false);
  const feedbackRequestSequenceRef = useRef(0);
  const onSubmittedRef = useRef(onSubmitted);
  onSubmittedRef.current = onSubmitted;

  const loadFeedback = useCallback(async () => {
    const requestSequence = ++feedbackRequestSequenceRef.current;
    setLoading(true);
    try {
      const nextFeedback = await getPublicAnonymousFeedback();
      if (requestSequence === feedbackRequestSequenceRef.current) setFeedback(nextFeedback);
    } catch (error) {
      if (requestSequence === feedbackRequestSequenceRef.current) {
        addNotification({ title: '加载失败', message: error instanceof Error ? error.message : '无法获取意见列表', type: 'error' });
      }
    } finally {
      if (requestSequence === feedbackRequestSequenceRef.current) setLoading(false);
    }
  }, [addNotification]);

  const completeSubmission = useCallback(async () => {
    try {
      clearPendingAnonymousFeedbackSubmission(window.sessionStorage);
    } catch {
      // A retained marker is safe: reopening the modal will confirm the same receipt without reposting.
    }
    setPendingRecovery(null);
    setRecoveryState('idle');
    setRecoveryError(null);
    setStorageIssue(null);
    setType(''); setContent(''); setNeedReply(false);
    setSubmitting(false);
    submitLockRef.current = false;
    addNotification({ title: '提交成功', message: '感谢你的声音，意见已匿名发布', type: 'success' });
    void loadFeedback();
    try {
      await onSubmittedRef.current?.();
    } catch (error) {
      addNotification({ title: '意见已提交，页面暂未刷新', message: error instanceof Error ? error.message : '稍后可重新加载列表', type: 'warning' });
    }
  }, [addNotification, loadFeedback]);

  const verifySubmission = useCallback(async (pending: PendingAnonymousFeedbackSubmission) => {
    setRecoveryState('checking');
    setRecoveryError(null);
    try {
      const state = await getAnonymousFeedbackSubmissionRequestStatus(pending.clientRequestId, pending.requestFingerprint);
      if (state === 'processed') {
        await completeSubmission();
        return;
      }
      setRecoveryState(state);
      if (state === 'conflict') setRecoveryError('服务器记录与当前恢复内容不一致。为避免重复提交，内容已锁定；请联系管理员核对。');
    } catch (error) {
      setRecoveryState('unavailable');
      setRecoveryError(error instanceof Error ? error.message : '暂时无法核实意见提交结果');
    }
  }, [completeSubmission]);

  const postSubmission = useCallback(async (pending: PendingAnonymousFeedbackSubmission, lockAlreadyHeld = false) => {
    if (submitLockRef.current && !lockAlreadyHeld) return;
    if (!lockAlreadyHeld) submitLockRef.current = true;
    setSubmitting(true);
    setRecoveryState('submitting');
    setRecoveryError(null);
    try {
      await submitAnonymousFeedback(pending.payload, pending.clientRequestId);
      await completeSubmission();
    } catch {
      setSubmitting(false);
      submitLockRef.current = false;
      void verifySubmission(pending);
      return;
    }
    setSubmitting(false);
    submitLockRef.current = false;
  }, [completeSubmission, verifySubmission]);

  useEffect(() => {
    if (!open) return;
    void loadFeedback();
    setStorageIssue(null);
    try {
      const pending = readPendingAnonymousFeedbackSubmission(window.sessionStorage);
      if (!pending) {
        setPendingRecovery(null);
        setRecoveryState('idle');
        setRecoveryError(null);
        return;
      }
      setPendingRecovery(pending);
      setType(pending.payload.type);
      setContent(pending.payload.content);
      setNeedReply(pending.payload.needReply);
      void verifySubmission(pending);
    } catch {
      setStorageIssue('浏览器无法读取当前标签会话中的意见恢复记录。请先核实恢复记录，再继续提交。');
    }
  }, [loadFeedback, open, verifySubmission]);

  const handleClose = () => {
    if (submitLockRef.current) return;
    if (!pendingRecovery && !storageIssue) {
      setType(''); setContent(''); setNeedReply(false);
    }
    onClose();
  };

  const clearBrokenRecovery = () => {
    try {
      clearPendingAnonymousFeedbackSubmission(window.sessionStorage);
      setStorageIssue(null);
      setRecoveryState('idle');
      addNotification({
        title: '本地恢复记录已清除',
        message: '服务器结果仍未核实。若此前已提交，重新提交可能产生重复意见。',
        type: 'warning',
      });
    } catch {
      setStorageIssue('浏览器无法清除当前标签会话中的恢复记录，请稍后重试。');
    }
  };

  const beginNewSubmission = () => {
    if (!pendingRecovery || recoveryState !== 'not_found' || submitting) return;
    try {
      clearPendingAnonymousFeedbackSubmission(window.sessionStorage);
      setPendingRecovery(null);
      setRecoveryState('idle');
      setRecoveryError(null);
      addNotification({
        title: '原请求当前不存在',
        message: '它可能尚未提交，也可能对应意见已被删除。系统不会复用原请求编号；如需再次提出，请检查保留内容后明确提交。',
        type: 'warning',
      });
    } catch {
      setRecoveryError('浏览器无法清除旧请求编号，请稍后重试。');
    }
  };

  const handleSubmit = async () => {
    if (submitLockRef.current) return;
    if (pendingRecovery) return;
    if (storageIssue) return;
    if (!type || !content.trim()) {
      addNotification({ title: '请完善意见', message: '意见类型和意见内容均为必填项', type: 'warning' });
      return;
    }
    const payload = { type, content: content.trim(), needReply };
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const pending: PendingAnonymousFeedbackSubmission = {
        clientRequestId: window.crypto.randomUUID(),
        requestFingerprint: await fingerprintAnonymousFeedbackSubmission(payload),
        payload,
      };
      savePendingAnonymousFeedbackSubmission(window.sessionStorage, pending);
      setPendingRecovery(pending);
      setContent(payload.content);
      void postSubmission(pending, true);
    } catch (error) {
      submitLockRef.current = false;
      setSubmitting(false);
      setRecoveryState('idle');
      addNotification({
        title: '无法安全开始提交',
        message: error instanceof Error && error.message === '当前浏览器无法安全生成意见恢复校验值'
          ? error.message
          : '浏览器无法保存意见恢复记录，意见尚未发送。请稍后重试。',
        type: 'error',
      });
    }
  };

  const recoveryFooter = pendingRecovery || storageIssue ? (
    <div className="flex flex-wrap justify-end gap-3">
      <ActionButton variant="ghost" onClick={handleClose} disabled={submitting} className="min-h-10 whitespace-normal">
        暂时关闭并保留记录
      </ActionButton>
      {pendingRecovery && recoveryState === 'not_found' ? (
        <ActionButton variant="primary" onClick={beginNewSubmission} disabled={submitting} className="min-h-10 whitespace-normal">
          检查后开始新提交
        </ActionButton>
      ) : null}
      {pendingRecovery && recoveryState === 'unavailable' ? (
        <ActionButton variant="ghost" onClick={() => void verifySubmission(pendingRecovery)} className="min-h-10 whitespace-normal">
          重新核实结果
        </ActionButton>
      ) : null}
      {storageIssue ? (
        <ActionButton variant="primary" onClick={clearBrokenRecovery} className="min-h-10 whitespace-normal">
          清除损坏的恢复记录
        </ActionButton>
      ) : null}
    </div>
  ) : undefined;

  return (
    <FormModal
      open={open}
      onCancel={handleClose}
      onSubmit={handleSubmit}
      footer={recoveryFooter}
      locked={Boolean(pendingRecovery || storageIssue)}
      loading={submitting}
      size="lg"
      title="匿名意见箱"
      description="所有意见均匿名展示，管理员回复后团队成员都能看到"
      submitText="提交意见"
    >
      <div className="space-y-6">
        {storageIssue ? (
          <div className="rounded-card border border-studio-coral/30 bg-studio-coral/10 p-3 text-sm leading-6 text-studio-coral-contrast" role="alert">
            <p className="font-semibold">本地意见恢复记录无法读取</p>
            <p className="mt-1">{storageIssue}。服务器结果尚未核实，因此暂时锁定意见内容。清除这条损坏记录后，如果此前已提交，重新提交可能会产生重复意见。</p>
          </div>
        ) : null}
        {pendingRecovery ? (
          <div className={`rounded-card border p-3 text-sm leading-6 ${recoveryState === 'conflict' || recoveryState === 'unavailable' ? 'border-studio-coral/30 bg-studio-coral/10 text-studio-coral-contrast' : 'border-studio-border-soft bg-studio-surface-soft text-studio-text-primary'}`} role={recoveryState === 'conflict' || recoveryState === 'unavailable' ? 'alert' : 'status'} aria-live="polite">
            <p className="font-semibold">
              {recoveryState === 'checking' ? '正在核实意见提交结果' : null}
              {recoveryState === 'submitting' ? '正在提交意见' : null}
              {recoveryState === 'not_found' ? '尚未查到这次意见提交' : null}
              {recoveryState === 'unavailable' ? '暂时无法核实意见提交结果' : null}
              {recoveryState === 'conflict' ? '恢复记录与服务器不一致' : null}
              {recoveryState === 'idle' ? '等待核实意见提交结果' : null}
            </p>
            <p className="mt-1">
              {recoveryState === 'checking' ? '正在只读核实；核实完成前不会再次提交。' : null}
              {recoveryState === 'submitting' ? '提交请求正在处理，请稍候。' : null}
              {recoveryState === 'not_found' ? '服务器未找到原请求。它可能尚未提交，也可能对应意见已被删除。为避免恢复已删除意见，系统不会用旧编号重试。若要重新提出，请先检查保留内容，再明确开始新提交。' : null}
              {recoveryState === 'unavailable' ? `${recoveryError || '请稍后重试核实'}。意见保持锁定，不会自动重发。` : null}
              {recoveryState === 'conflict' ? (recoveryError || '为避免重复提交，意见保持锁定。请联系管理员核对。') : null}
              {recoveryState === 'idle' ? '意见保持锁定，不会自动重发。' : null}
            </p>
          </div>
        ) : null}
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-studio-text-primary">大家的意见</h3>
            <span className="text-xs text-studio-text-muted">共 {feedback.length} 条</span>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-card border border-studio-border-soft bg-studio-surface-soft">
            {loading ? <LoadingState type="inline" text="正在加载意见..." className="p-5" /> : feedback.length > 0 ? (
              <div className="divide-y divide-studio-border-soft">
                {feedback.map((item) => (
                  <article key={item.id} className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-full border border-studio-border-soft bg-studio-surface-elevated px-2.5 py-1 text-xs font-medium text-studio-text-secondary">{typeLabels[item.type]}</span>
                      <time className="text-xs text-studio-text-muted">{formatBeijingDate(item.created_at)}</time>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-studio-text-primary">{item.content}</p>
                    {item.reply_content ? (
                      <div className="mt-3 rounded-button border border-studio-primary/20 bg-studio-primary/8 p-3">
                        <p className="text-xs font-semibold text-studio-cyan-contrast">管理员回复</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-studio-text-secondary">{item.reply_content}</p>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center px-4 py-8 text-center">
                <MessageSquareText className="h-6 w-6 text-studio-text-muted" />
                <p className="mt-3 text-sm font-medium text-studio-text-secondary">还没有意见</p>
                <p className="mt-1 text-xs text-studio-text-muted">成为第一个留下想法的人</p>
              </div>
            )}
          </div>
        </section>

        <section className="border-t border-studio-border-soft pt-5">
          <h3 className="mb-4 text-sm font-semibold text-studio-text-primary">提出新意见</h3>
          <div className="space-y-4">
            <label className="block text-sm font-medium text-studio-text-secondary">
              意见类型 <span className="text-studio-coral-contrast">*</span>
              <select value={type} onChange={(event) => setType(event.target.value as AnonymousFeedbackType)} className="xmt-field mt-2 w-full">
                <option value="">请选择意见类型</option>
                {types.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium text-studio-text-secondary">
              意见内容 <span className="text-studio-coral-contrast">*</span>
              <textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={2000} rows={4} placeholder="请输入你的想法..." className="xmt-field mt-2 w-full resize-y" />
              <span className="mt-1 block text-right text-xs text-studio-text-muted">{content.length}/2000</span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 text-sm text-studio-text-secondary">
              <input type="checkbox" checked={needReply} onChange={(event) => setNeedReply(event.target.checked)} className="h-4 w-4 rounded border-studio-border-soft accent-studio-primary" />
              希望收到管理员回复
            </label>
          </div>
        </section>
      </div>
    </FormModal>
  );
}
