import { ArrowLeft, Clock3, FolderOpen, RefreshCw, Save, Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { auditTopic, createProduction, getProduction, getTopic, getTopicOutlineVersions, repairCurrentTopicStageRecord, TopicApiError, updateTopic, updateTopicStatus } from '@/api';
import type { WorkflowDocumentVersion } from '@/api';
import type { Topic, TopicStatus } from '@/types';
import { getTopicResources, type TopicResource } from '@/api/topics';
import { clearSafeDraft, readSafeDraftValue, userSafeDraftKey, writeSafeDraft } from '@/platform/safe-draft';
import { useNetworkState } from '@/platform/network';
import { celebrateMilestone } from '@/utils/confetti';
import { STATUS_COLORS } from '@/constants';
import { usePermission } from '@/hooks/usePermission';
import { useAppStore, useAuthStore } from '@/store';
import { formatBeijingDate } from '@/lib/utils';
import TopicAssetDimensionsPanel from '@/components/topics/TopicAssetDimensionsPanel';
import { startOrResumeTopicProduction } from '@/utils/topicProductionHandoff';
import { ActionButton } from '@/components/studio';
import { sanitizeHtml } from '@/utils/sanitizeHtml';

const nextStatus: Partial<Record<TopicStatus, TopicStatus>> = {
  rejected: 'pending', approved: 'production', production: 'shooting', shooting: 'publishing', publishing: 'completed',
};
const statusLabel: Partial<Record<TopicStatus, string>> = {
  pending: '待审核', rejected: '重新提交', approved: '进入创作', production: '进入拍摄', shooting: '进入发布', publishing: '标记完成',
};
const statusName: Record<TopicStatus, string> = {
  pending: '待审核', approved: '已通过', rejected: '已驳回', production: '创作中', shooting: '拍摄中', publishing: '发布中', completed: '已完成',
};
const historyActionName: Record<string, string> = {
  created: '创建选题', approved: '审核通过', rejected: '审核驳回',
  status_production: '进入创作', status_shooting: '进入拍摄',
  status_publishing: '进入发布', status_completed: '完成归档', stage_record_repaired: '补齐阶段记录',
  production_status_changed: '创作状态调整', shooting_status_changed: '成片状态调整', publishing_status_changed: '发布状态调整',
};
type TopicEditDraft = Pick<Topic, 'title' | 'description'>;
type TopicStageRecord = 'production' | 'shooting' | 'publishing';

function currentStageRecord(status: TopicStatus): TopicStageRecord | null {
  if (status === 'approved' || status === 'production') return 'production';
  if (status === 'shooting') return 'shooting';
  if (status === 'publishing' || status === 'completed') return 'publishing';
  return null;
}

export default function MobileTopicDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedOutlineVersion = searchParams.get('outlineVersion')?.trim() || '';
  const mobileReturnTo = (location.state as { mobileReturnTo?: unknown } | null)?.mobileReturnTo;
  const returnPath = ['/calendar', '/inspirations', '/topics?view=board'].includes(String(mobileReturnTo)) ? String(mobileReturnTo) : '/topics';
  const returnLabel = returnPath === '/calendar' ? '返回日历' : returnPath === '/inspirations' ? '返回灵感' : '返回选题';
  const [topic, setTopic] = useState<Topic | null>(null);
  const [resources, setResources] = useState<TopicResource[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(true);
  const [resourcesError, setResourcesError] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [edited, setEdited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [startingProduction, setStartingProduction] = useState(false);
  const [repairingStageRecord, setRepairingStageRecord] = useState(false);
  const [notice, setNotice] = useState('');
  const [outlineVersions, setOutlineVersions] = useState<WorkflowDocumentVersion[]>([]);
  const [outlineVersionLoadState, setOutlineVersionLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [outlineVersionRetry, setOutlineVersionRetry] = useState(0);
  const [showAudit, setShowAudit] = useState(false);
  const [auditStatus, setAuditStatus] = useState<'approved' | 'rejected'>('approved');
  const [auditComment, setAuditComment] = useState('');
  const startProductionInFlight = useRef(false);
  const resourcesRequestSequenceRef = useRef(0);
  const networkState = useNetworkState();
  const appStore = useAppStore();
  const user = useAuthStore((state) => state.user);
  const draftKey = id ? userSafeDraftKey(user?.id, `topic:${id}:edit`) : null;
  const { permissions, loading: permissionsLoading } = usePermission();
  const canUpdateTopics = !permissionsLoading && (user?.role === 'admin' || permissions.includes('topic:update') || permissions.includes('*'));
  const canAudit = !requestedOutlineVersion && !permissionsLoading && (user?.role === 'admin' || permissions.includes('topic:audit') || permissions.includes('*'));
  const canEditTopic = Boolean(!requestedOutlineVersion && topic && canUpdateTopics && (
    ['admin', 'editor', 'copywriter', 'post_production', 'camera'].includes(user?.role ?? '') ||
    Number(topic.creator_id) === user?.id || Number(topic.assignee_id) === user?.id
  ));
  const canStartProduction = Boolean(
    !requestedOutlineVersion
    && !permissionsLoading
    && topic
    && (permissions.includes('production:update') || permissions.includes('*'))
    && (
      ['admin', 'editor', 'copywriter', 'post_production', 'camera'].includes(user?.role ?? '')
      || Number(topic.creator_id) === user?.id
      || Number(topic.assignee_id) === user?.id
      || Number((topic as Topic & { participant_id?: number }).participant_id) === user?.id
    )
    && ['approved', 'production'].includes(topic.status),
  );

  const loadResources = useCallback(async (topicId: number) => {
    const requestSequence = ++resourcesRequestSequenceRef.current;
    setResourcesLoading(true);
    setResourcesError('');
    try {
      const result = await getTopicResources(topicId);
      if (requestSequence !== resourcesRequestSequenceRef.current) return;
      setResources(result);
    } catch (error) {
      if (requestSequence !== resourcesRequestSequenceRef.current) return;
      setResourcesError(error instanceof Error ? error.message : '关联资料暂不可用，请稍后重试。');
    } finally {
      if (requestSequence === resourcesRequestSequenceRef.current) setResourcesLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (!id) return false;
    setLoading(true);
    try {
      const result = await getTopic(Number(id));
      setTopic(result);
      const canEditFetchedTopic = canUpdateTopics && (
        ['admin', 'editor', 'copywriter', 'post_production', 'camera'].includes(user?.role ?? '') ||
        Number(result.creator_id) === user?.id || Number(result.assignee_id) === user?.id
      );
      const recovered = canEditFetchedTopic && draftKey ? readSafeDraftValue<TopicEditDraft>(draftKey) : null;
      setTitle(recovered?.title ?? result.title);
      setDescription(recovered?.description ?? result.description ?? '');
      setEdited(Boolean(recovered));
      if (recovered) setNotice('已恢复未提交的本地修改；确认后再保存到服务器。');
      return true;
    } catch (error) {
      if (error instanceof TopicApiError && [401, 403, 404].includes(error.status)) {
        if (draftKey) clearSafeDraft(draftKey);
        setTopic(null);
        setTitle('');
        setDescription('');
      }
      setNotice(error instanceof Error ? error.message : '加载选题失败；请确认权限后重试。');
      return false;
    } finally {
      setLoading(false);
    }
  }, [canUpdateTopics, draftKey, id, user?.id, user?.role]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!id || !requestedOutlineVersion) {
      setOutlineVersions([]);
      setOutlineVersionLoadState('ready');
      return;
    }
    let active = true;
    setOutlineVersionLoadState('loading');
    void getTopicOutlineVersions(Number(id)).then((versions) => {
      if (!active) return;
      setOutlineVersions(versions);
      setOutlineVersionLoadState('ready');
    }).catch(() => {
      if (!active) return;
      setOutlineVersions([]);
      setOutlineVersionLoadState('error');
    });
    return () => { active = false; };
  }, [id, requestedOutlineVersion, outlineVersionRetry]);
  useEffect(() => {
    if (!id) return;
    void loadResources(Number(id));
    return () => { resourcesRequestSequenceRef.current += 1; };
  }, [id, loadResources]);
  useEffect(() => {
    if (!draftKey || loading || !canEditTopic || !edited || !title.trim()) return;
    writeSafeDraft<TopicEditDraft>(draftKey, { title, description });
  }, [canEditTopic, description, draftKey, edited, loading, title]);

  const save = async () => {
    if (!canEditTopic) { setNotice('当前账号没有编辑该选题的权限。'); return; }
    if (!topic || !title.trim()) {
      setNotice('选题标题不能为空');
      return;
    }
    if (networkState !== 'online') {
      if (draftKey) writeSafeDraft<TopicEditDraft>(draftKey, { title, description });
      setNotice('当前网络未恢复，修改已保存为本地草稿，尚未提交。');
      return;
    }
    setSaving(true);
    setNotice('');
    try {
      await updateTopic(topic.id, { title: title.trim(), description });
      setTopic((current) => current ? { ...current, title: title.trim(), description } : current);
      if (draftKey) clearSafeDraft(draftKey);
      setEdited(false);
      setNotice('已保存');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存选题失败');
    } finally {
      setSaving(false);
    }
  };
  const advance = async () => {
    if (!topic) return;
    if (missingCurrentStageRecord) { setNotice('请先补齐当前阶段记录，再推进到下一阶段。'); return; }
    if (!canAdvanceWorkflow) { setNotice('当前阶段暂不支持在移动端推进，请使用有权限的工作流操作。'); return; }
    const next = nextStatus[topic.status];
    if (!next) { setNotice(topic.status === 'pending' ? '待审核选题需由有审核权限的成员处理。' : '当前阶段没有可推进的后续状态。'); return; }
    if (networkState !== 'online') { setNotice('当前网络未恢复，尚未推进状态。'); return; }
    setSaving(true); setNotice('');
    try {
      await updateTopicStatus(topic.id, next);
      setTopic((current) => {
        if (!current) return current;
        const stage = currentStageRecord(next);
        const stageRecordPresence = current.stage_record_presence ?? {
          production: false,
          shooting: false,
          publishing: false,
        };
        return {
          ...current,
          status: next,
          stage_record_presence: stage ? { ...stageRecordPresence, [stage]: true } : stageRecordPresence,
        };
      });
      setNotice(`已推进至${statusName[next]}`);
      if (next === 'shooting' || next === 'completed') celebrateMilestone();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '状态推进失败');
    } finally { setSaving(false); }
  };
  const startProduction = async () => {
    if (!topic || !canStartProduction || startProductionInFlight.current) return;
    if (networkState !== 'online') { setNotice('目前离线，尚未创建创作草稿。'); return; }
    startProductionInFlight.current = true;
    setStartingProduction(true);
    setNotice('');
    try {
      const result = await startOrResumeTopicProduction(topic, {
        advanceTopic: updateTopicStatus,
        listProductions: async (topicId) => getProduction({ topic_id: topicId }),
        createDraft: createProduction,
      });
      if (result.advanced) setTopic((currentTopic) => currentTopic ? { ...currentTopic, status: 'production' } : currentTopic);
      if (result.created || result.advanced) {
        appStore.addNotification({
          title: result.created ? (result.advanced ? '创作已建立' : '创作草稿已补齐') : '已进入创作',
          message: result.created
            ? '已带入选题大纲，可以直接开始写稿。'
            : '选题阶段已同步，继续已有稿件。',
          type: 'success',
        });
      }
      navigate(`/production/content/${result.productionId}`, { state: { mobileReturnTo: `/topics/${topic.id}` } });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '开始创作失败，请稍后重试。');
    } finally {
      startProductionInFlight.current = false;
      setStartingProduction(false);
    }
  };
  const repairStageRecord = async () => {
    if (!topic || !canEditTopic || repairingStageRecord) return;
    if (networkState !== 'online') { setNotice('目前离线，尚未补建阶段记录。'); return; }
    setRepairingStageRecord(true);
    setNotice('');
    let result: Awaited<ReturnType<typeof repairCurrentTopicStageRecord>>;
    try {
      result = await repairCurrentTopicStageRecord(topic.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '补齐阶段记录失败，请稍后重试。');
      setRepairingStageRecord(false);
      return;
    }

    try {
      const refreshed = await getTopic(topic.id);
      setTopic(refreshed);
      setNotice(result.created ? '阶段记录已补齐；选题阶段未变更，操作已记入历史。' : '阶段记录已存在，未重复创建。');
    } catch {
      setNotice(result.created
        ? '服务端已确认阶段记录补齐；页面刷新失败，请重新加载确认当前状态，不要重复操作。'
        : '服务端已确认阶段记录存在；页面刷新失败，请重新加载确认当前状态。');
    } finally {
      setRepairingStageRecord(false);
    }
  };
  const audit = async () => {
    if (!topic || topic.status !== 'pending' || !canAudit) {
      setNotice('当前账号没有审核该选题的权限，或选题已不在待审核状态。');
      return;
    }
    if (networkState !== 'online') { setNotice('当前网络未恢复，审核结果尚未提交。'); return; }
    setSaving(true);
    setNotice('');
    try {
      await auditTopic(topic.id, { status: auditStatus, comment: auditComment.trim() });
      setTopic((current) => current ? { ...current, status: auditStatus } : current);
      setShowAudit(false);
      setAuditComment('');
      setNotice(auditStatus === 'approved' ? '选题审核已通过' : '选题已驳回，审核意见已记录');
      const refreshed = await load();
      if (!refreshed) setNotice('审核结果已提交；页面刷新失败，请重新加载确认当前状态，不要重复审核。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '审核失败；选题状态未确认更新，请刷新后检查。');
    } finally { setSaving(false); }
  };
  const currentStatusColors = topic
    ? STATUS_COLORS[topic.status] || {
        bg: 'bg-studio-surface-soft',
        text: 'text-studio-text-secondary',
        border: 'border-studio-border-soft',
      }
    : STATUS_COLORS.pending;
  const requiredStageRecord = topic ? currentStageRecord(topic.status) : null;
  const requiredStageRecordLabel = requiredStageRecord === 'production'
    ? '创作稿'
    : requiredStageRecord === 'shooting'
      ? '成片制作'
      : requiredStageRecord === 'publishing'
        ? '发布'
        : '';
  const missingCurrentStageRecord = Boolean(
    topic && requiredStageRecord && topic.stage_record_presence && !topic.stage_record_presence[requiredStageRecord],
  );
  const canAdvanceWorkflow = Boolean(
    topic && canEditTopic && !missingCurrentStageRecord && ['shooting', 'publishing'].includes(topic.status),
  );

  return <div className="space-y-4">
    <button type="button" onClick={() => navigate(returnPath)} className="inline-flex min-h-11 items-center gap-2 text-sm text-studio-cyan-contrast"><ArrowLeft className="h-4 w-4" />{returnLabel}</button>
    {loading ? <p className="text-sm text-studio-text-muted">正在加载选题…</p> : topic ? <>
      <div className="flex items-center justify-between rounded-2xl border border-studio-border-soft bg-studio-surface p-4"><span className="text-sm text-studio-text-muted">当前状态</span><span className={`rounded-full border px-3 py-1 text-sm ${currentStatusColors.bg} ${currentStatusColors.text} ${currentStatusColors.border}`}>{statusName[topic.status] || '状态待确认'}</span></div>
      {missingCurrentStageRecord && requiredStageRecord ? <section role="alert" className="space-y-3 rounded-2xl border border-studio-border-soft bg-studio-amber-soft p-4"><div><h2 className="text-sm font-semibold text-studio-amber-contrast">当前阶段缺少{requiredStageRecordLabel}记录</h2><p className="mt-1 text-sm leading-6 text-studio-text-secondary">{topic.status === 'completed' ? '选题已完成，请先核对发布历史；系统不会自动补建历史发布数据。' : '请先补齐当前阶段记录，再推进到下一阶段。补齐不会改变选题状态，操作会记入历史。'}</p></div>{topic.status !== 'completed' && canEditTopic ? <ActionButton type="button" variant="primary" disabled={repairingStageRecord || networkState !== 'online'} onClick={() => void repairStageRecord()} className="min-h-11 w-full justify-center">{repairingStageRecord ? '正在补齐…' : `补齐${requiredStageRecordLabel}记录`}</ActionButton> : null}</section> : null}
      <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl border border-studio-border-soft p-3"><p className="text-xs text-studio-text-muted">创建人</p><p className="mt-1 truncate">{topic.creator_name ?? '—'}</p></div><div className="rounded-xl border border-studio-border-soft p-3"><p className="text-xs text-studio-text-muted">更新时间</p><p className="mt-1 truncate">{topic.updated_at ? formatBeijingDate(topic.updated_at) : '—'}</p></div></div>
      <label className="block rounded-2xl border border-studio-border-soft bg-studio-surface p-4"><span className="mb-2 block text-sm font-semibold">选题标题</span><input value={title} disabled={!canEditTopic || permissionsLoading} onChange={(event) => { setEdited(true); setTitle(event.target.value); }} className="min-h-11 w-full rounded-xl border border-studio-border-soft bg-studio-bg px-3 text-sm outline-none focus:border-studio-cyan disabled:opacity-60" /></label>
      <label className="block rounded-2xl border border-studio-border-soft bg-studio-surface p-4"><span className="mb-2 block text-sm font-semibold">选题说明</span><textarea value={description} disabled={!canEditTopic || permissionsLoading} onChange={(event) => { setEdited(true); setDescription(event.target.value); }} className="min-h-40 w-full resize-y rounded-xl border border-studio-border-soft bg-studio-bg p-3 text-sm leading-6 outline-none focus:border-studio-cyan disabled:opacity-60" placeholder="补充选题背景、目标受众和创作思路" /></label>
      {requestedOutlineVersion ? (() => {
        const exactVersion = outlineVersions.find((version) => !version.is_baseline && version.version === requestedOutlineVersion);
        return (
          <section aria-label="来源大纲版本" className="space-y-3 rounded-2xl border border-studio-border-soft bg-studio-surface p-4">
            <h2 className="text-sm font-semibold">创作初稿引用的大纲版本</h2>
            {outlineVersionLoadState === 'loading' ? <p role="status" className="text-sm text-studio-text-muted">正在读取来源大纲版本 {requestedOutlineVersion}…</p> : null}
            {outlineVersionLoadState === 'error' ? (
              <div className="space-y-2">
                <p role="alert" className="text-sm text-studio-coral-contrast">来源大纲版本 {requestedOutlineVersion} 读取失败；不会用当前大纲替代。</p>
                <button type="button" onClick={() => setOutlineVersionRetry((current) => current + 1)} className="xmt-btn-secondary min-h-10 px-3 text-sm">重新加载大纲历史</button>
              </div>
            ) : null}
            {outlineVersionLoadState === 'ready' && exactVersion ? (
              <>
                <p role="status" className="text-xs font-medium text-studio-cyan-contrast">准确来源版本：{exactVersion.version} · 只读</p>
                {exactVersion.content ? (
                  <div className="editor-content-preview tiptap max-h-96 overflow-auto rounded-xl border border-studio-border-soft bg-studio-surface-soft p-3 text-sm leading-6 text-studio-text-secondary" dangerouslySetInnerHTML={{ __html: sanitizeHtml(exactVersion.content) }} />
                ) : <p className="text-sm text-studio-text-muted">该来源大纲版本保存时为空。</p>}
              </>
            ) : null}
            {outlineVersionLoadState === 'ready' && !exactVersion ? (
              <p role="alert" className="text-sm text-studio-amber-contrast">来源大纲版本 {requestedOutlineVersion} 当前无法定位；没有回退到最新大纲。</p>
            ) : null}
          </section>
        );
      })() : null}
      <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl border border-studio-border-soft p-3"><p className="text-xs text-studio-text-muted">负责人</p><p className="mt-1">{topic.assignee_name ?? '未分配'}</p></div><div className="rounded-xl border border-studio-border-soft p-3"><p className="text-xs text-studio-text-muted">截止日期</p><p className="mt-1">{topic.deadline ? formatBeijingDate(topic.deadline) : '未设置'}</p></div></div>
      <section className="rounded-2xl border border-studio-border-soft bg-studio-surface p-4">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold"><FolderOpen className="h-4 w-4 text-studio-cyan" />关联资料</h2>
        {resourcesLoading ? <p role="status" className="mt-2 text-sm text-studio-text-muted">正在读取关联资料…</p> : resourcesError ? (
          <div className="mt-3 space-y-2">
            <p role="alert" className="text-sm text-studio-coral-contrast">关联资料读取失败：{resourcesError}</p>
            <button type="button" disabled={resourcesLoading || networkState !== 'online'} onClick={() => { if (topic) void loadResources(topic.id); }} className="xmt-btn-secondary inline-flex min-h-9 items-center gap-1.5 disabled:opacity-50">
              <RefreshCw className="h-3.5 w-3.5" />重新加载资料
            </button>
          </div>
        ) : resources.length ? (
          <div className="mt-3 space-y-2">{resources.map((resource) => <p key={resource.id} className="truncate rounded-lg bg-studio-bg px-3 py-2 text-sm">{resource.title}</p>)}</div>
        ) : <p className="mt-2 text-sm text-studio-text-muted">暂无关联资料</p>}
      </section>
      <TopicAssetDimensionsPanel key={topic.id} topicId={topic.id} canManage={canEditTopic} />
      {topic.history?.length ? <section className="rounded-2xl border border-studio-border-soft bg-studio-surface p-4"><h2 className="inline-flex items-center gap-2 text-sm font-semibold"><Clock3 className="h-4 w-4 text-studio-cyan" />协作动态</h2><div className="mt-3 space-y-3">{topic.history.slice(0, 5).map((record) => <div key={record.id} className="border-l border-studio-border-soft pl-3 text-sm"><p>{record.operator_name ?? '成员'} · {historyActionName[record.action] ?? record.action}</p><p className="mt-1 text-xs text-studio-text-muted">{record.comment || record.created_at}</p></div>)}</div></section> : null}
      {topic.status === 'pending' && canAudit ? <section className="space-y-3 rounded-2xl border border-studio-border-soft bg-studio-surface p-4"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">选题审核</h2><p className="mt-1 text-xs text-studio-text-muted">审核操作独立于选题内容编辑权限。</p></div><button type="button" disabled={saving || networkState !== 'online'} onClick={() => setShowAudit((current) => !current)} className="min-h-10 rounded-xl bg-studio-primary-button px-3 text-sm font-semibold text-white disabled:opacity-50">{showAudit ? '收起审核' : '开始审核'}</button></div>{showAudit ? <><div className="grid grid-cols-2 gap-2"><button type="button" aria-pressed={auditStatus === 'approved'} onClick={() => setAuditStatus('approved')} className={`min-h-10 rounded-xl border text-sm font-semibold ${auditStatus === 'approved' ? 'border-studio-success bg-studio-success/15 text-studio-success-contrast' : 'border-studio-border-soft text-studio-text-secondary'}`}>通过</button><button type="button" aria-pressed={auditStatus === 'rejected'} onClick={() => setAuditStatus('rejected')} className={`min-h-10 rounded-xl border text-sm font-semibold ${auditStatus === 'rejected' ? 'border-studio-coral bg-studio-coral/10 text-studio-coral-contrast' : 'border-studio-border-soft text-studio-text-secondary'}`}>驳回</button></div><label className="block"><span className="mb-2 block text-sm font-medium">审核意见（选填）</span><textarea value={auditComment} onChange={(event) => setAuditComment(event.target.value)} disabled={saving} className="min-h-24 w-full rounded-xl border border-studio-border-soft bg-studio-bg p-3 text-sm disabled:opacity-60" placeholder="填写通过说明或需要修改的内容" /></label><button type="button" disabled={saving || networkState !== 'online'} onClick={() => void audit()} className="min-h-11 w-full rounded-xl bg-studio-primary-button text-sm font-semibold text-white disabled:opacity-50">{saving ? '正在提交审核…' : auditStatus === 'approved' ? '确认通过选题' : '确认驳回选题'}</button></> : null}</section> : null}
      {notice ? <p role="status" className="px-1 text-sm text-studio-text-secondary">{notice}</p> : null}
      {permissionsLoading ? <p role="status" className="text-sm text-studio-text-muted">正在确认操作权限…</p> : null}
      {!permissionsLoading && !canEditTopic ? <p className="text-sm text-studio-text-muted">当前为只读查看；如需修改，请联系管理员或选题负责人。</p> : null}
      {!permissionsLoading && (canEditTopic || canStartProduction) ? <div className={`sticky z-sticky -mx-1 grid ${canEditTopic ? 'grid-cols-2' : 'grid-cols-1'} gap-3 bg-studio-bg px-1 py-2`} style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}>
        {canEditTopic ? <button type="button" disabled={saving || startingProduction} onClick={() => void save()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-studio-border-soft text-sm font-semibold disabled:opacity-50"><Save className="h-4 w-4" />{saving ? '保存中…' : '保存修改'}</button> : null}
        {canStartProduction ? <button type="button" disabled={saving || startingProduction || networkState !== 'online'} onClick={() => void startProduction()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-studio-primary-button text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />{startingProduction ? '正在准备…' : topic.status === 'approved' ? '开始创作' : '进入创作'}</button> : canAdvanceWorkflow ? <button type="button" disabled={saving || networkState !== 'online'} onClick={() => void advance()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-studio-primary-button text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />{statusLabel[topic.status] ?? '推进阶段'}</button> : null}
      </div> : null}
    </> : <p className="text-sm text-studio-text-secondary">未找到该选题。</p>}
  </div>;
}
