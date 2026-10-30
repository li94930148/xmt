import { ArrowLeft, Save, Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNetworkState } from '@/platform/network';
import { useAppStore, useAuthStore } from '@/store';
import { celebrateMilestone } from '@/utils/confetti';
import { hasTopicDraftContent } from '@/utils/topicDraft';
import { useTopicDraftCollection } from '@/hooks/useTopicDraftCollection';
import { usePermission } from '@/hooks/usePermission';
import AccessDeniedState from '@/components/AccessDeniedState';
import SimilarTopicReview from '@/components/topics/SimilarTopicReview';
import CreatorTopicSuggestionReference from '@/components/topics/CreatorTopicSuggestionReference';
import TopicDraftPicker from '@/components/topics/TopicDraftPicker';
import { findSimilarTopicsByTitle, normalizeTopicTitle, type SimilarTopic } from '@/utils/topic-title-similarity';
import { creatorTopicSuggestionSourceFromDraft } from '@/utils/creatorTopicSuggestionSource';
import { useTopicCreateRecovery } from '@/hooks/useTopicCreateRecovery';
import type { TopicCreatePayload, TopicCreateRecovery } from '@/utils/topicCreateRecovery';

export default function MobileAddTopic() {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAuthStore((state) => state.user?.id);
  const appStore = useAppStore();
  const networkState = useNetworkState();
  const { hasPermission, loading: permissionsLoading } = usePermission();
  const canCreate = !permissionsLoading && hasPermission('topic:create');
  const draftState = useTopicDraftCollection(userId, canCreate);
  const form = draftState.form;
  const setForm = draftState.setForm;
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const draftStorageUnavailable = draftState.storageUnavailable;
  const [similarTopicReview, setSimilarTopicReview] = useState<{
    actorId: number;
    title: string;
    topics: SimilarTopic[];
    checkFailed: boolean;
  } | null>(null);
  const reviewedTitle = useRef<string | null>(null);
  const submitInFlight = useRef(false);

  const finishTopicCreation = useCallback((topicId: number, recovery: TopicCreateRecovery, recovered: boolean) => {
    if (Number(useAuthStore.getState().user?.id) !== recovery.actorId) return;
    const canSafelyRemoveDraft = Boolean(
      recovery.draftId
      && recovery.draftSnapshot
      && draftState.activeDraftId === recovery.draftId
      && JSON.stringify(draftState.form) === JSON.stringify(recovery.draftSnapshot)
    );
    const draftRemoved = canSafelyRemoveDraft && draftState.removeSubmittedDraft();
    if (!draftRemoved) {
      appStore.addNotification({
        title: '本机草稿已保留',
        message: '选题已成功创建；为避免删除可能更新过的内容，本机草稿未自动清理，请勿重复提报。',
        type: 'warning',
      });
    }
    celebrateMilestone();
    navigate('/topics', { replace: true });
    void topicId;
    void recovered;
  }, [appStore, draftState, navigate]);
  const createRecovery = useTopicCreateRecovery(userId, finishTopicCreation, draftState.ready);

  useEffect(() => {
    setSimilarTopicReview(null);
    reviewedTitle.current = null;
  }, [userId]);

  const change = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const saveLocalDraft = () => {
    if (!canCreate || !userId) { setNotice('当前账号没有提报选题的权限。'); return; }
    if (!hasTopicDraftContent(form)) { setNotice('填写内容后才能保存本地草稿'); return; }
    if (!draftState.saveCurrentDraft().saved) {
      setNotice('');
      return;
    }
    setNotice('已保存到本机草稿，不会创建服务端选题');
  };
  const submit = async (confirmedTitle?: string) => {
    if (submitInFlight.current || createRecovery.locked || !createRecovery.ready) return;
    if (!canCreate || !userId) { setNotice('当前账号没有提报选题的权限。'); return; }
    const submissionActorId = Number(userId);
    const submittedForm = { ...form };
    const title = (confirmedTitle ?? submittedForm.title).trim();
    if (!title) { setNotice('请输入选题标题'); return; }
    const draftSaved = hasTopicDraftContent(submittedForm) && draftState.saveCurrentDraft().saved;
    if (networkState !== 'online') {
      setNotice(draftSaved ? '当前网络未恢复，内容已保存在本地草稿，暂未提交。' : '当前网络未恢复，本机草稿保存失败；当前页面仍保留内容，请勿关闭。');
      return;
    }
    submitInFlight.current = true;
    setSaving(true);
    setNotice('');
    try {
      const normalizedTitle = normalizeTopicTitle(title);
      if (reviewedTitle.current !== normalizedTitle) {
        try {
          const topics = await findSimilarTopicsByTitle(title);
          if (Number(useAuthStore.getState().user?.id) !== submissionActorId) return;
          if (topics.length > 0) {
            setSimilarTopicReview({ actorId: submissionActorId, title, topics, checkFailed: false });
            return;
          }
        } catch {
          if (Number(useAuthStore.getState().user?.id) !== submissionActorId) return;
          setSimilarTopicReview({ actorId: submissionActorId, title, topics: [], checkFailed: true });
          return;
        }
        reviewedTitle.current = normalizedTitle;
      }
      if (Number(useAuthStore.getState().user?.id) !== submissionActorId) return;

      const details = [
        submittedForm.projectBackground.trim() ? `【项目背景】\n${submittedForm.projectBackground.trim()}` : '',
        submittedForm.targetAudience.trim() ? `【目标受众】\n${submittedForm.targetAudience.trim()}` : '',
      ].filter(Boolean).join('\n\n');
      const payload: TopicCreatePayload = {
        title,
        description: details,
        outline: submittedForm.outline.trim() || undefined,
        platform: submittedForm.platform.trim(),
        deadline: submittedForm.deadline,
        assignee_id: submittedForm.assignee_id ? Number(submittedForm.assignee_id) : null,
        creator_suggestion_source: creatorTopicSuggestionSourceFromDraft(location.search, submittedForm.projectBackground),
      };
      await createRecovery.create(payload, draftState.activeDraftId, submittedForm);
    } finally {
      submitInFlight.current = false;
      setSaving(false);
    }
  };

  const continueAfterSimilarityReview = () => {
    if (!similarTopicReview) return;
    if (Number(useAuthStore.getState().user?.id) !== similarTopicReview.actorId) {
      setSimilarTopicReview(null);
      return;
    }
    reviewedTitle.current = normalizeTopicTitle(similarTopicReview.title);
    const title = similarTopicReview.title;
    setSimilarTopicReview(null);
    void submit(title);
  };

  const draftOperationFailed = () => setNotice('本机存储不可用，草稿未能更新；请检查设备存储后重试。');

  if (!permissionsLoading && !canCreate) return <AccessDeniedState title="暂时无法提报选题" description="请联系管理员分配选题创建权限。" />;

  return <>
    {(createRecovery.message || createRecovery.pending) ? (
      <section role="status" aria-live="polite" className="mb-4 rounded-xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-text-secondary">
        <p>{createRecovery.message || '选题创建结果尚未核实；为避免重复创建，原表单已锁定。'}</p>
        {createRecovery.pending?.phase === 'uncertain' || createRecovery.pending?.phase === 'rejected' ? (
          <button type="button" onClick={() => void createRecovery.verify()} className="mt-3 min-h-11 rounded-lg border border-studio-border-soft px-3 font-semibold text-studio-text-primary">
            只读重新核实创建状态
          </button>
        ) : null}
        {createRecovery.pending?.phase === 'rejected' && createRecovery.pending.confirmedNotFound ? (
          <button type="button" onClick={createRecovery.releaseRejected} className="mt-3 min-h-11 rounded-lg bg-studio-primary-button px-3 font-semibold text-white">
            确认服务端未创建并解除本次锁定
          </button>
        ) : null}
        {createRecovery.pending?.phase === 'cleanup_failed' ? (
          <button type="button" onClick={createRecovery.retryCleanup} className="mt-3 min-h-11 rounded-lg border border-studio-border-soft px-3 font-semibold text-studio-text-primary">
            重试清理恢复记录并继续
          </button>
        ) : null}
        {createRecovery.pending?.phase === 'not_found' ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => void createRecovery.retry()} disabled={networkState !== 'online'} className="min-h-11 rounded-lg bg-studio-primary-button px-3 font-semibold text-white disabled:opacity-50">
              确认用原内容和同一编号重试
            </button>
            <button type="button" onClick={() => void createRecovery.verify()} disabled={networkState !== 'online'} className="min-h-11 rounded-lg border border-studio-border-soft px-3 font-semibold text-studio-text-primary disabled:opacity-50">
              再次只读核实
            </button>
          </div>
        ) : null}
      </section>
    ) : null}
    <fieldset disabled={saving || !canCreate || createRecovery.locked} aria-busy={saving || createRecovery.pending?.phase === 'checking'} className="min-w-0 space-y-4 border-0 p-0 pb-2">
    <button type="button" onClick={() => navigate('/topics')} className="inline-flex min-h-11 items-center gap-2 text-sm text-studio-cyan-contrast"><ArrowLeft className="h-4 w-4" />返回选题</button>
    {permissionsLoading ? <p role="status" className="text-sm text-studio-text-muted">正在确认操作权限…</p> : null}
    <TopicDraftPicker
      drafts={draftState.drafts}
      activeDraftId={draftState.activeDraftId}
      onSelect={draftState.selectDraft}
      onCreate={draftState.startNewDraft}
      onDelete={draftState.deleteDraft}
      onFailure={draftOperationFailed}
      compact
    />
    <CreatorTopicSuggestionReference background={form.projectBackground} disabled={saving || !canCreate} onApply={(reference) => setForm(current => ({ ...current, projectBackground: [current.projectBackground, reference].filter(Boolean).join('\n\n') }))} />
    <section className="space-y-4 rounded-2xl border border-studio-border-soft bg-studio-surface p-4">
      <div><h2 data-mobile-page-heading className="text-lg font-semibold">提报选题</h2><p className="mt-1 text-sm text-studio-text-muted">内容会按当前账号自动保存在本机；提交后才会创建选题。</p></div>
      <label className="block"><span className="mb-2 block text-sm font-semibold">选题标题 <span className="text-studio-coral" aria-hidden="true">*</span></span><input id="mobile-topic-title" name="title" type="text" required value={form.title} onChange={(event) => change('title', event.target.value)} className="min-h-11 w-full rounded-xl border border-studio-border-soft bg-studio-bg px-3 text-sm outline-none focus:border-studio-cyan" placeholder="输入清晰、可执行的选题标题" /></label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="block"><span className="mb-2 block text-sm font-semibold">发布平台</span><input id="mobile-topic-platform" name="platform" type="text" value={form.platform} onChange={(event) => change('platform', event.target.value)} className="min-h-11 w-full rounded-xl border border-studio-border-soft bg-studio-bg px-3 text-sm outline-none focus:border-studio-cyan" placeholder="如：抖音、小红书" /></label><label className="block"><span className="mb-2 block text-sm font-semibold">截止日期</span><input id="mobile-topic-deadline" name="deadline" type="date" value={form.deadline} onChange={(event) => change('deadline', event.target.value)} className="min-h-11 w-full rounded-xl border border-studio-border-soft bg-studio-bg px-3 text-sm outline-none focus:border-studio-cyan" /></label></div>
    </section>
    <section className="space-y-4 rounded-2xl border border-studio-border-soft bg-studio-surface p-4">
      <h2 className="text-base font-semibold">项目资料</h2>
      <label className="block"><span className="mb-2 block text-sm font-semibold">项目背景</span><textarea id="mobile-topic-project-background" name="projectBackground" value={form.projectBackground} onChange={(event) => change('projectBackground', event.target.value)} className="min-h-32 w-full resize-y rounded-xl border border-studio-border-soft bg-studio-bg p-3 text-sm leading-6 outline-none focus:border-studio-cyan" placeholder="说明选题来源、场景和目标" /></label>
      <label className="block"><span className="mb-2 block text-sm font-semibold">目标受众</span><textarea id="mobile-topic-target-audience" name="targetAudience" value={form.targetAudience} onChange={(event) => change('targetAudience', event.target.value)} className="min-h-24 w-full resize-y rounded-xl border border-studio-border-soft bg-studio-bg p-3 text-sm leading-6 outline-none focus:border-studio-cyan" placeholder="描述受众特征和需求" /></label>
    </section>
    <section className="rounded-2xl border border-studio-border-soft bg-studio-surface p-4"><label className="block"><span className="mb-2 block text-base font-semibold">大纲结构</span><textarea id="mobile-topic-outline" name="outline" value={form.outline} onChange={(event) => change('outline', event.target.value)} className="min-h-48 w-full resize-y rounded-xl border border-studio-border-soft bg-studio-bg p-3 text-sm leading-6 outline-none focus:border-studio-cyan" placeholder="列出内容结构、核心观点和素材方向" /></label></section>
    {draftStorageUnavailable ? <p role="status" className="px-1 text-sm text-studio-coral-contrast">本机存储不可用，草稿未能保存；请检查设备存储后重试。</p> : null}
    {notice ? <p role="status" className="px-1 text-sm text-studio-text-secondary">{notice}</p> : null}
    <div className="grid grid-cols-2 gap-3"><button type="button" onClick={saveLocalDraft} disabled={saving} className="xmt-btn xmt-btn-secondary min-h-12 w-full text-sm font-semibold disabled:opacity-50"><Save className="h-4 w-4" />存本地草稿</button><button type="button" onClick={() => void submit()} disabled={saving || networkState !== 'online'} className="xmt-btn xmt-btn-primary min-h-12 w-full text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />{saving ? '提交中…' : networkState === 'offline' ? '等待联网' : '提交选题'}</button></div>
    <SimilarTopicReview
      open={similarTopicReview !== null}
      title={similarTopicReview?.title ?? ''}
      topics={similarTopicReview?.topics ?? []}
      checkFailed={similarTopicReview?.checkFailed}
      continueLabel="仍然提报"
      onCancel={() => setSimilarTopicReview(null)}
      onContinue={continueAfterSimilarityReview}
    />
  </fieldset>
  </>;
}
