import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CreatorTopicSuggestionFeedback, CreatorTopicSuggestions } from '../../../shared/types/creator-topic-suggestions';
import { usePermission } from '@/hooks/usePermission';
import { submitCreatorTopicSuggestionFeedback, verifyCreatorTopicSuggestionFeedback } from '@/api/creatorCenter';
import GlassPanel from '@/components/studio/GlassPanel';
import ActionButton from '@/components/studio/ActionButton';
import CreatorTopicSuggestionEvidence from './CreatorTopicSuggestionEvidence';

type FeedbackRecovery = { status: 'checking' | 'not_recorded' | 'unavailable' | 'changed'; message: string };

export default function CreatorTopicSuggestionsPanel({ data, unavailable }: { data?: CreatorTopicSuggestions; unavailable?: boolean }) {
  const navigate = useNavigate();
  const { loading, hasPermission } = usePermission();
  const [feedbackByItem, setFeedbackByItem] = useState<Record<string, CreatorTopicSuggestionFeedback>>({});
  const [feedbackBusy, setFeedbackBusy] = useState<Set<string>>(() => new Set());
  const [feedbackRecovery, setFeedbackRecovery] = useState<Record<string, FeedbackRecovery>>({});
  const feedbackLocksRef = useRef(new Set<string>());
  const updateRecovery = (key: string, recovery: FeedbackRecovery | null) => {
    setFeedbackRecovery(current => {
      const next = { ...current };
      if (recovery) next[key] = recovery;
      else delete next[key];
      return next;
    });
  };
  const reconcileFeedback = async (accountUid: string, item: CreatorTopicSuggestions['items'][number], key: string) => {
    updateRecovery(key, { status: 'checking', message: '反馈结果暂未确认，正在只读核实；不会重复提交。' });
    try {
      const result = await verifyCreatorTopicSuggestionFeedback(accountUid, item.id, item.evidence_id, 'not_adopted');
      if (result.status === 'saved') {
        setFeedbackByItem(current => ({ ...current, [key]: result.feedback }));
        updateRecovery(key, null);
      } else if (result.status === 'not_recorded') {
        updateRecovery(key, { status: 'not_recorded', message: '只读核实确认暂不采用反馈尚未记录；确认后可安全重试。' });
      } else {
        updateRecovery(key, { status: 'changed', message: '创作建议样本或反馈状态已变化，未再次提交。请刷新数据后核实。' });
      }
    } catch {
      updateRecovery(key, { status: 'unavailable', message: '反馈结果暂未确认，状态读取失败；只读重新核实前不会再次提交。' });
    }
  };
  const recordFeedback = async (item: CreatorTopicSuggestions['items'][number], outcome: 'not_adopted') => {
    const accountUid = data?.account_uid;
    if (!accountUid) return;
    const key = `${accountUid}:${item.id}:${item.evidence_id}`;
    if (feedbackLocksRef.current.has(key)) return;
    feedbackLocksRef.current.add(key);
    setFeedbackBusy(current => new Set(current).add(key));
    updateRecovery(key, null);
    try {
      const result = await submitCreatorTopicSuggestionFeedback(accountUid, item.id, item.evidence_id, outcome);
      setFeedbackByItem(current => ({ ...current, [key]: result.feedback }));
    } catch {
      await reconcileFeedback(accountUid, item, key);
    } finally {
      feedbackLocksRef.current.delete(key);
      setFeedbackBusy(current => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };
  const verifyFeedback = async (item: CreatorTopicSuggestions['items'][number]) => {
    const accountUid = data?.account_uid;
    if (!accountUid) return;
    const key = `${accountUid}:${item.id}:${item.evidence_id}`;
    if (feedbackLocksRef.current.has(key)) return;
    feedbackLocksRef.current.add(key);
    setFeedbackBusy(current => new Set(current).add(key));
    try {
      await reconcileFeedback(accountUid, item, key);
    } finally {
      feedbackLocksRef.current.delete(key);
      setFeedbackBusy(current => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };
  return <GlassPanel className="space-y-4 p-4 sm:p-6" aria-label="数据指导创作">
    <div><h2 className="text-lg font-semibold">数据指导创作</h2><p className="mt-1 text-sm text-studio-text-muted">从本账号的作品表现，寻找值得验证的下一次创作方向。</p></div>
    {unavailable ? <p role="status" className="text-sm text-studio-amber-contrast">数据正在刷新或刷新失败，建议暂不可用；请刷新数据后再试。</p> : !data ? <p className="text-sm text-studio-text-muted">当前数据尚未提供创作建议。</p> : <>
      <p className="text-xs leading-6 text-studio-text-muted">{data.methodology}</p>
      <p className="text-xs text-studio-text-muted">本次有效作品 {data.eligible_count} 条，未纳入 {data.excluded_count} 条。来源：作品采集数据，非官方账号汇总。</p>
      {data.status !== 'ready' ? <p role="status" className="rounded-xl bg-studio-surface p-4 text-sm">{data.status === 'insufficient_data' ? '可比样本不足：每个特征及同时间段对照都需要至少 3 条有效作品。可先更新采集数据，或继续积累作品。' : '暂未发现达到展示门槛的特征，不生成推荐。'}</p> : <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        {data.items.map(item => <article key={item.id} className="min-w-0 space-y-4 rounded-xl border border-studio-border-soft bg-studio-surface p-4">
          <h3 className="break-words font-semibold">{item.label}</h3>
          <CreatorTopicSuggestionEvidence item={item} accountUid={data.account_uid} />
          {!loading && hasPermission('topic:create') && data.account_uid ? <ActionButton onClick={() => navigate(`/topics/add?creatorAccount=${encodeURIComponent(data.account_uid)}&creatorSuggestion=${item.id}&creatorEvidence=${item.evidence_id}`)}>以此新建选题</ActionButton> : <p className="text-xs text-studio-text-muted">需有提报选题权限才能使用新建入口。</p>}
          {(() => {
            const key = `${data.account_uid}:${item.id}:${item.evidence_id}`;
            const feedback = feedbackByItem[key] ?? item.feedback ?? { my_outcome: null, adopted_count: 0, not_adopted_count: 0 };
            const recovery = feedbackRecovery[key];
            return <div className="space-y-2 border-t border-studio-border-soft pt-3">
              <p className="text-xs text-studio-text-muted">本账号成员反馈：已用于选题草稿 {feedback.adopted_count} · 暂不采用 {feedback.not_adopted_count}</p>
              {feedback.my_outcome === 'adopted' ? <p role="status" className="text-sm text-studio-success-contrast">你已将这条依据加入选题草稿</p> : feedback.my_outcome === 'not_adopted' ? <p role="status" className="text-sm text-studio-text-secondary">你已标记为暂不采用</p> : recovery?.status === 'changed' ? <p role="alert" className="text-sm text-studio-coral-contrast">{recovery.message}</p> : recovery?.status === 'unavailable' ? <div role="alert" className="space-y-2"><p className="text-sm text-studio-coral-contrast">{recovery.message}</p><ActionButton disabled={feedbackBusy.has(key)} onClick={() => void verifyFeedback(item)}>{feedbackBusy.has(key) ? '正在只读核实…' : '只读重新核实反馈状态'}</ActionButton></div> : recovery?.status === 'checking' ? <p role="status" className="text-sm text-studio-amber-contrast">{recovery.message}</p> : <div className="space-y-2">{recovery?.status === 'not_recorded' ? <p role="status" className="text-sm text-studio-amber-contrast">{recovery.message}</p> : null}<ActionButton disabled={feedbackBusy.has(key)} onClick={() => void recordFeedback(item, 'not_adopted')}>{feedbackBusy.has(key) ? '正在保存反馈…' : recovery?.status === 'not_recorded' ? '确认后重试暂不采用' : '暂不采用'}</ActionButton></div>}
            </div>;
          })()}
        </article>)}
      </div>}
    </>}
  </GlassPanel>;
}
