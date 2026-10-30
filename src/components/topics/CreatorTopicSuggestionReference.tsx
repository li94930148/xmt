import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getDouyinDashboard, submitCreatorTopicSuggestionFeedback, verifyCreatorTopicSuggestionFeedback } from '@/api/creatorCenter';
import { useAuthStore } from '@/store';
import { usePermission } from '@/hooks/usePermission';
import GlassPanel from '@/components/studio/GlassPanel';
import ActionButton from '@/components/studio/ActionButton';
import type { CreatorTopicSuggestions } from '../../../shared/types/creator-topic-suggestions';
import CreatorTopicSuggestionEvidence from './CreatorTopicSuggestionEvidence';
import { getUserFacingErrorMessage } from '@/lib/userFacingError';

type Props = { background: string; disabled?: boolean; onApply: (background: string) => void };
type FeedbackRecovery = { status: 'checking' | 'not_recorded' | 'unavailable' | 'changed'; message: string };

function Reference({ account, id, evidenceId, background, disabled, onApply }: Props & { account: string; id: string; evidenceId: string }) {
  const userId = useAuthStore(state => state.user?.id);
  const { loading: permissionsLoading, hasPermission } = usePermission();
  const allowed = !permissionsLoading && hasPermission('creator:data:view') && hasPermission('topic:create');
  const [data, setData] = useState<CreatorTopicSuggestions>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedbackRecovery, setFeedbackRecovery] = useState<FeedbackRecovery | null>(null);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const feedbackLockRef = useRef(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    setLoading(true); setError(''); setData(undefined);
    void getDouyinDashboard(account, controller.signal).then(result => {
      if (!controller.signal.aborted) setData(result.topic_suggestions);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(getUserFacingErrorMessage(cause, '创作依据暂时无法加载，请检查连接后重试。'));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [account, allowed, attempt, userId]);
  const item = data?.account_uid === account ? data.items.find(value => value.id === id && value.evidence_id === evidenceId) : undefined;
  const marker = `【创作数据参考 ${account}/${id}】`;
  const applied = background.includes(marker);
  const reconcileAdoption = async () => {
    setFeedbackRecovery({ status: 'checking', message: '采纳反馈结果暂未确认，正在只读核实；已追加到草稿的内容会保留。' });
    try {
      const result = await verifyCreatorTopicSuggestionFeedback(account, id, evidenceId, 'adopted');
      if (result.status === 'saved') {
        setData(current => current && current.account_uid === account ? ({
          ...current,
          items: current.items.map(value => value.id === id && value.evidence_id === evidenceId ? { ...value, feedback: result.feedback } : value),
        }) : current);
        setFeedbackRecovery(null);
      } else if (result.status === 'not_recorded') {
        setFeedbackRecovery({ status: 'not_recorded', message: '采纳反馈已核实为尚未记录；依据仍保留在草稿中，确认后可安全重试反馈。' });
      } else {
        setFeedbackRecovery({ status: 'changed', message: '创作建议样本或反馈状态已变化；没有再次提交采纳反馈。已追加到草稿的内容保留，请刷新数据核实。' });
      }
    } catch {
      setFeedbackRecovery({ status: 'unavailable', message: '采纳反馈结果暂未确认，状态读取失败；依据已保留在草稿中，只读重新核实前不会再次提交。' });
    }
  };
  const recordAdoption = async () => {
    if (!item || !data || feedbackLockRef.current) return;
    feedbackLockRef.current = true;
    setFeedbackBusy(true);
    setFeedbackRecovery(null);
    try {
      const result = await submitCreatorTopicSuggestionFeedback(account, item.id, item.evidence_id, 'adopted');
      setData(current => current && current.account_uid === account ? ({ ...current, items: current.items.map(value => value.id === item.id && value.evidence_id === item.evidence_id ? { ...value, feedback: result.feedback } : value) }) : current);
    } catch {
      await reconcileAdoption();
    } finally {
      feedbackLockRef.current = false;
      setFeedbackBusy(false);
    }
  };
  const apply = () => {
    if (!item || !data || disabled || applied || feedbackLockRef.current || feedbackRecovery?.status === 'changed') return;
    const lines = [marker, item.direction,
      `${item.age_band}；特征组 ${item.sample_count} 条 / 对照组 ${item.baseline_count} 条；累计播放中位数 ${item.median_plays} / ${item.baseline_median_plays}，约 ${item.play_ratio} 倍。`,
      `来源：抖音作品采集数据；分析时间 ${data.evaluated_at}。`, data.methodology,
      ...item.samples.map(work => `特征样本：${work.title}（播放 ${work.play_count}） /analytics/creator-center/work/${work.id}?account_id=${encodeURIComponent(account)}`),
      ...item.baseline_samples.map(work => `对照样本：${work.title}（播放 ${work.play_count}） /analytics/creator-center/work/${work.id}?account_id=${encodeURIComponent(account)}`)];
    onApply(lines.join('\n'));
    void recordAdoption();
  };
  const retryFeedback = () => { void recordAdoption(); };
  const verifyFeedback = async () => {
    if (feedbackLockRef.current) return;
    feedbackLockRef.current = true;
    setFeedbackBusy(true);
    try {
      await reconcileAdoption();
    } finally {
      feedbackLockRef.current = false;
      setFeedbackBusy(false);
    }
  };
  return <GlassPanel className="space-y-3 p-4 sm:p-6" aria-label="选题创作依据">
    <h2 className="font-semibold">选题创作依据</h2>
    {permissionsLoading ? <p role="status">正在确认权限…</p> : !allowed ? <p>当前账号无权读取创作依据，仍可填写有权限的选题内容。</p> : loading ? <p role="status">正在重新核验作品数据…</p> : error ? <div role="alert"><p>{error}</p><ActionButton onClick={() => setAttempt(value => value + 1)}>重试创作依据</ActionButton></div> : !item ? <p role="status">这条建议已不满足当前样本条件或不可用，请返回数据驾驶舱查看最新结果。已有草稿未改动。</p> : <>
      <CreatorTopicSuggestionEvidence item={item} accountUid={account} />
      <p className="text-xs leading-6 text-studio-text-muted">{data?.methodology}</p>
      <p className="text-sm text-studio-text-secondary">仅追加到项目背景，保留标题、平台和已有内容；不会自动提交选题。</p>
      <ActionButton disabled={disabled || applied || feedbackBusy || feedbackRecovery?.status === 'changed'} onClick={apply}>{feedbackBusy ? feedbackRecovery?.status === 'checking' ? '正在核实反馈…' : '正在记录采纳反馈…' : applied ? '已加入项目背景' : '将依据加入项目背景'}</ActionButton>
      {item.feedback?.my_outcome === 'adopted' ? <p role="status" className="text-sm text-studio-success-contrast">已记录：这条依据已加入选题草稿。</p> : applied && !feedbackBusy && !feedbackRecovery ? <p role="status" className="text-sm text-studio-text-muted">依据已加入当前草稿。</p> : null}
      {feedbackRecovery?.status === 'checking' ? <p role="status" className="text-sm text-studio-amber-contrast">{feedbackRecovery.message}</p> : null}
      {feedbackRecovery?.status === 'not_recorded' ? <div role="status" className="space-y-2 text-sm text-studio-amber-contrast"><p>{feedbackRecovery.message}</p><ActionButton disabled={feedbackBusy} onClick={retryFeedback}>确认后重试采纳反馈</ActionButton></div> : null}
      {feedbackRecovery?.status === 'unavailable' ? <div role="alert" className="space-y-2"><p className="text-sm text-studio-coral-contrast">{feedbackRecovery.message}</p><ActionButton disabled={feedbackBusy} onClick={() => void verifyFeedback()}>{feedbackBusy ? '正在只读核实…' : '只读重新核实反馈状态'}</ActionButton></div> : null}
      {feedbackRecovery?.status === 'changed' ? <p role="alert" className="text-sm text-studio-coral-contrast">{feedbackRecovery.message}</p> : null}
    </>}
  </GlassPanel>;
}

export default function CreatorTopicSuggestionReference(props: Props) {
  const [params] = useSearchParams();
  const userId = useAuthStore(state => state.user?.id);
  const account = params.get('creatorAccount') || '';
  const id = params.get('creatorSuggestion') || '';
  const evidenceId = params.get('creatorEvidence') || '';
  if (!account || account.length > 256 || !/^[a-f0-9]{20}$/.test(id) || !/^[a-f0-9]{32}$/.test(evidenceId)) return null;
  // Changing account, reference, or signed-in user must discard previous evidence.
  return <Reference key={`${userId}:${account}:${id}:${evidenceId}`} {...props} account={account} id={id} evidenceId={evidenceId} />;
}
