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
import { useRouteNavigationGuard, type RouteNavigationAttempt } from '@/hooks/useRouteNavigationGuard';
import ConfirmModal from '@/components/common/ConfirmModal';
import { formatBeijingDate } from '@/lib/utils';
import TopicAssetDimensionsPanel from '@/components/topics/TopicAssetDimensionsPanel';
import { startOrResumeTopicProduction } from '@/utils/topicProductionHandoff';
import { ActionButton } from '@/components/studio';
import { sanitizeHtml } from '@/utils/sanitizeHtml';
import {
  clearInvalidMobileTopicEditRecovery,
  markMobileTopicEditRecoveryUncertain,
  persistMobileTopicEditRecovery,
  readMobileTopicEditRecovery,
  removeMobileTopicEditRecovery,
  sameMobileTopicEditValues,
  type MobileTopicEditRecovery,
  type MobileTopicEditValues,
} from './mobileTopicEditRecovery';

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
  publishing_douyin_link_changed: '抖音作品关联调整',
};
type TopicEditDraft = MobileTopicEditValues;
type TopicStageRecord = 'production' | 'shooting' | 'publishing';
type PendingStatusWrite = { before: TopicStatus; target: TopicStatus; kind: 'audit' | 'advance' };

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
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedOutlineVersion = searchParams.get('outlineVersion')?.trim() || '';
  const auditRequested = searchParams.get('action') === 'audit';
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
  const [pendingLeaveAttempt, setPendingLeaveAttempt] = useState<Pick<RouteNavigationAttempt, 'proceed' | 'stay'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [topicLoadFailure, setTopicLoadFailure] = useState<'not-found' | 'unavailable' | null>(null);
  const [saving, setSaving] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [submittingAudit, setSubmittingAudit] = useState(false);
  const [startingProduction, setStartingProduction] = useState(false);
  const [repairingStageRecord, setRepairingStageRecord] = useState(false);
  const [uncertainStatusWrite, setUncertainStatusWrite] = useState<PendingStatusWrite | null>(null);
  const [verifyingStatusWrite, setVerifyingStatusWrite] = useState(false);
  const [uncertainEditWrite, setUncertainEditWrite] = useState<MobileTopicEditRecovery | null>(null);
  const [verifyingEditWrite, setVerifyingEditWrite] = useState(false);
  const [editConflict, setEditConflict] = useState<MobileTopicEditValues | null>(null);
  const [notice, setNotice] = useState('');
  const [outlineVersions, setOutlineVersions] = useState<WorkflowDocumentVersion[]>([]);
  const [outlineVersionLoadState, setOutlineVersionLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [outlineVersionRetry, setOutlineVersionRetry] = useState(0);
  const [showAudit, setShowAudit] = useState(false);
  const [auditStatus, setAuditStatus] = useState<'approved' | 'rejected'>('approved');
  const [auditComment, setAuditComment] = useState('');
  const startProductionInFlight = useRef(false);
  const saveInFlightRef = useRef(false);
  const advanceInFlightRef = useRef(false);
  const auditSubmissionInFlightRef = useRef(false);
  const repairStageRecordInFlightRef = useRef(false);
  const uncertainStatusWriteRef = useRef<PendingStatusWrite | null>(null);
  const statusVerificationInFlightRef = useRef(false);
  const uncertainEditWriteRef = useRef<MobileTopicEditRecovery | null>(null);
  const editVerificationInFlightRef = useRef(false);
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
  const handleRouteNavigationAttempt = useCallback(({ proceed, stay }: RouteNavigationAttempt) => {
    if (saving) {
      appStore.addNotification({ title: '保存尚未完成', message: '当前选题保存完成前不能离开，请稍候再试。', type: 'warning' });
      stay();
      return;
    }
    if (edited) {
      setPendingLeaveAttempt({ proceed, stay });
      return;
    }
    proceed();
  }, [appStore, edited, saving]);
  useRouteNavigationGuard(Boolean(topic && canEditTopic && (edited || saving)), handleRouteNavigationAttempt);

  useEffect(() => {
    if (!edited && !saving) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [edited, saving]);
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

  const rememberUncertainEditWrite = useCallback((pending: MobileTopicEditRecovery | null) => {
    uncertainEditWriteRef.current = pending;
    setUncertainEditWrite(pending);
  }, []);

  const applyEditWriteReadback = useCallback((pending: MobileTopicEditRecovery, latest: Topic) => {
    const latestValues = { title: latest.title, description: latest.description ?? '' };
    setTopic(latest);
    rememberUncertainEditWrite(null);
    removeMobileTopicEditRecovery(pending);
    if (sameMobileTopicEditValues(latestValues, pending.target)) {
      setEditConflict(null);
      if (draftKey) clearSafeDraft(draftKey);
      setTitle(latestValues.title);
      setDescription(latestValues.description);
      setEdited(false);
      setNotice('只读核实已确认选题内容保存成功；没有重复提交。');
      return;
    }

    setTitle(pending.target.title);
    setDescription(pending.target.description);
    setEdited(true);
    if (draftKey) writeSafeDraft<TopicEditDraft>(draftKey, pending.target);
    if (sameMobileTopicEditValues(latestValues, pending.baseline)) {
      setEditConflict(null);
      setNotice('只读核实确认服务端内容仍是原版本；本次没有保存，也没有自动重发。请核对本地修改后再明确点击保存。');
    } else {
      setEditConflict(latestValues);
      setNotice('服务端内容已发生变化；最新记录已载入，本地修改仍保留。请核对后再决定是否再次保存。');
    }
  }, [draftKey, rememberUncertainEditWrite]);

  const verifyUncertainEditWrite = async () => {
    const pending = uncertainEditWriteRef.current;
    if (!pending || editVerificationInFlightRef.current) return;
    editVerificationInFlightRef.current = true;
    setVerifyingEditWrite(true);
    try {
      const latest = await getTopic(pending.topicId);
      applyEditWriteReadback(pending, latest);
    } catch (error) {
      if (error instanceof TopicApiError && error.status === 404) {
        removeMobileTopicEditRecovery(pending);
        rememberUncertainEditWrite(null);
        setTopic(null);
        setNotice('选题已不存在；本地修改仍保留，没有重复提交。');
      } else {
        setNotice('保存结果仍暂时无法确认。选题内容及相关操作已锁定；请使用只读核实，不会自动重发。');
      }
    } finally {
      editVerificationInFlightRef.current = false;
      setVerifyingEditWrite(false);
    }
  };

  const adoptServerEditConflict = () => {
    if (!editConflict) return;
    setTitle(editConflict.title);
    setDescription(editConflict.description);
    setEdited(false);
    setEditConflict(null);
    if (draftKey) clearSafeDraft(draftKey);
    setNotice('已采用服务端最新内容；本地修改已清除，没有发送写入。');
  };

  const continueWithLocalEditDraft = () => {
    setEditConflict(null);
    setEdited(true);
    setNotice('已保留本地修改；你可以继续编辑，只有再次明确点击保存时才会提交。');
  };

  const load = useCallback(async (purpose: 'initial' | 'refresh' = 'refresh') => {
    if (!id) return false;
    setLoading(true);
    if (purpose === 'initial') {
      setTopic(null);
      setTopicLoadFailure(null);
      setNotice('');
    }
    try {
      const result = await getTopic(Number(id));
      setTopic(result);
      setTopicLoadFailure(null);
      const canEditFetchedTopic = canUpdateTopics && (
        ['admin', 'editor', 'copywriter', 'post_production', 'camera'].includes(user?.role ?? '') ||
        Number(result.creator_id) === user?.id || Number(result.assignee_id) === user?.id
      );
      const recovered = canEditFetchedTopic && draftKey ? readSafeDraftValue<TopicEditDraft>(draftKey) : null;
      const pending = canEditFetchedTopic ? readMobileTopicEditRecovery(user?.id, result.id) : null;
      if (pending && pending !== 'invalid') {
        applyEditWriteReadback(pending, result);
      } else if (pending === 'invalid') {
        setEditConflict(null);
        clearInvalidMobileTopicEditRecovery(user?.id, result.id);
        setTitle(recovered?.title ?? result.title);
        setDescription(recovered?.description ?? result.description ?? '');
        setEdited(Boolean(recovered));
        if (recovered) setNotice('上次保存核实记录无法读取；已重新读取服务端内容并保留本地修改，请核对后再决定是否保存。');
      } else {
        setEditConflict(null);
        setTitle(recovered?.title ?? result.title);
        setDescription(recovered?.description ?? result.description ?? '');
        setEdited(Boolean(recovered));
        if (recovered) setNotice('已恢复未提交的本地修改；确认后再保存到服务器。');
      }
      return true;
    } catch (error) {
      if (error instanceof TopicApiError && [401, 403, 404].includes(error.status)) {
        if (draftKey) clearSafeDraft(draftKey);
        setTopic(null);
        setTitle('');
        setDescription('');
      }
      if (purpose === 'initial') {
        setTopicLoadFailure(error instanceof TopicApiError && error.status === 404 ? 'not-found' : 'unavailable');
        setNotice('');
      } else {
        setNotice(error instanceof Error ? error.message : '加载选题失败；请确认权限后重试。');
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, [applyEditWriteReadback, canUpdateTopics, draftKey, id, user?.id, user?.role]);

  useEffect(() => { void load('initial'); }, [load]);
  useEffect(() => {
    if (!auditRequested || loading || permissionsLoading) return;

    if (topic?.status === 'pending' && canAudit) setShowAudit(true);
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      nextParams.delete('action');
      return nextParams;
    }, { replace: true });
  }, [auditRequested, canAudit, loading, permissionsLoading, setSearchParams, topic?.status]);
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
    if (saveInFlightRef.current) return;
    if (uncertainEditWriteRef.current) { setNotice('请先只读核实上一次选题内容保存结果；核实前不会再次提交。'); return; }
    if (editConflict) { setNotice('请先选择采用服务端内容或保留本地修改，再继续操作。'); return; }
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

    const target = { title: title.trim(), description };
    const recovery: MobileTopicEditRecovery = {
      version: 1,
      userId: Number(user?.id),
      topicId: topic.id,
      baseline: { title: topic.title, description: topic.description ?? '' },
      target,
      phase: 'sending',
    };
    saveInFlightRef.current = true;
    setSaving(true);
    setNotice('');
    try {
      if (draftKey) writeSafeDraft<TopicEditDraft>(draftKey, target);
      persistMobileTopicEditRecovery(recovery);
      await updateTopic(topic.id, target);
      removeMobileTopicEditRecovery(recovery);
      rememberUncertainEditWrite(null);
      setTopic((current) => current ? { ...current, ...target } : current);
      if (draftKey) clearSafeDraft(draftKey);
      setEdited(false);
      setNotice('已保存');
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('本次选题修改未发送：')) {
        removeMobileTopicEditRecovery(recovery);
        setNotice(error.message);
      } else if (error instanceof TopicApiError && error.status >= 400 && error.status < 500
        && ![408, 409, 425, 429].includes(error.status)) {
        removeMobileTopicEditRecovery(recovery);
        rememberUncertainEditWrite(null);
        setNotice(error.message || '保存选题失败；本次修改未被接受。');
      } else {
        const pending = { ...recovery, phase: 'uncertain' as const };
        markMobileTopicEditRecoveryUncertain(recovery);
        rememberUncertainEditWrite(pending);
        await verifyUncertainEditWrite();
      }
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  const rememberUncertainStatusWrite = (pending: PendingStatusWrite | null) => {
    uncertainStatusWriteRef.current = pending;
    setUncertainStatusWrite(pending);
  };

  const verifyUncertainStatusWrite = async () => {
    const pending = uncertainStatusWriteRef.current;
    if (!pending || !id || statusVerificationInFlightRef.current) return;
    statusVerificationInFlightRef.current = true;
    setVerifyingStatusWrite(true);
    try {
      const latest = await getTopic(Number(id));
      setTopic(latest);
      rememberUncertainStatusWrite(null);
      if (latest.status === pending.target) {
        if (pending.kind === 'audit') {
          setShowAudit(false);
          setAuditComment('');
        }
        setNotice(pending.kind === 'audit'
          ? '只读核实已确认审核结果；没有重复提交。'
          : `只读核实已确认状态为${statusName[latest.status]}；没有重复提交。`);
        if (latest.status === 'shooting' || latest.status === 'completed') celebrateMilestone();
      } else if (latest.status === pending.before) {
        setNotice(`只读核实确认选题仍为${statusName[latest.status]}；本次未改变状态，如需重试请再次明确点击。`);
      } else {
        setNotice(`服务端显示选题当前为${statusName[latest.status]}；已同步最新状态，没有重复提交。`);
      }
    } catch (error) {
      if (error instanceof TopicApiError && error.status === 404) {
        setTopic(null);
        rememberUncertainStatusWrite(null);
        setNotice('选题已不存在；没有重复提交。');
        return;
      }
      setNotice('审核或状态结果仍暂时无法确认。相关状态操作已锁定；请使用只读核实，不会自动重发。');
    } finally {
      statusVerificationInFlightRef.current = false;
      setVerifyingStatusWrite(false);
    }
  };

  const isDefiniteStatusRejection = (error: unknown): error is TopicApiError => error instanceof TopicApiError
    && error.status >= 400
    && error.status < 500
    && ![408, 425, 429].includes(error.status);

  const advance = async () => {
    if (advanceInFlightRef.current) return;
    if (!topic) return;
    if (editConflict) { setNotice('请先处理选题内容并发变化，再推进阶段。'); return; }
    if (uncertainEditWriteRef.current) { setNotice('请先只读核实上一次选题内容保存结果；核实前不会推进阶段。'); return; }
    if (uncertainStatusWriteRef.current) { setNotice('请先只读核实上一次审核或状态操作结果；核实前不会再次提交。'); return; }
    if (missingCurrentStageRecord) { setNotice('请先补齐当前阶段记录，再推进到下一阶段。'); return; }
    if (!canAdvanceWorkflow) { setNotice('当前阶段暂不支持在移动端推进，请使用有权限的工作流操作。'); return; }
    const next = nextStatus[topic.status];
    if (!next) { setNotice(topic.status === 'pending' ? '待审核选题需由有审核权限的成员处理。' : '当前阶段没有可推进的后续状态。'); return; }
    if (networkState !== 'online') { setNotice('当前网络未恢复，尚未推进状态。'); return; }
    advanceInFlightRef.current = true;
    setAdvancing(true);
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
      if (isDefiniteStatusRejection(error)) {
        setNotice(error.message || '状态推进失败，请检查权限或当前阶段。');
        return;
      }
      rememberUncertainStatusWrite({ before: topic.status, target: next, kind: 'advance' });
      await verifyUncertainStatusWrite();
    } finally {
      advanceInFlightRef.current = false;
      setAdvancing(false);
      setSaving(false);
    }
  };
  const startProduction = async () => {
    if (!topic || !canStartProduction || startProductionInFlight.current) return;
    if (editConflict) { setNotice('请先处理选题内容并发变化，再开始创作。'); return; }
    if (uncertainEditWriteRef.current) { setNotice('请先只读核实上一次选题内容保存结果；核实前不会开始创作。'); return; }
    if (uncertainStatusWriteRef.current) { setNotice('请先只读核实上一次审核或状态操作结果；核实前不会开始创作。'); return; }
    if (networkState !== 'online') { setNotice('目前离线，尚未创建创作草稿。'); return; }
    startProductionInFlight.current = true;
    setStartingProduction(true);
    setNotice('');
    try {
      const result = await startOrResumeTopicProduction(topic, {
        advanceTopic: updateTopicStatus,
        getTopicStatus: async (topicId) => (await getTopic(topicId)).status,
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
    if (!topic || !canEditTopic || repairStageRecordInFlightRef.current) return;
    if (editConflict) { setNotice('请先处理选题内容并发变化，再补齐阶段记录。'); return; }
    if (uncertainEditWriteRef.current) { setNotice('请先只读核实上一次选题内容保存结果；核实前不会补齐阶段记录。'); return; }
    if (networkState !== 'online') { setNotice('目前离线，尚未补建阶段记录。'); return; }
    repairStageRecordInFlightRef.current = true;
    setRepairingStageRecord(true);
    setNotice('');
    try {
      let result: Awaited<ReturnType<typeof repairCurrentTopicStageRecord>>;
      try {
        result = await repairCurrentTopicStageRecord(topic.id);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : '补齐阶段记录失败，请稍后重试。');
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
      }
    } finally {
      repairStageRecordInFlightRef.current = false;
      setRepairingStageRecord(false);
    }
  };
  const audit = async () => {
    if (auditSubmissionInFlightRef.current) return;
    if (editConflict) { setNotice('请先处理选题内容并发变化，再继续审核。'); return; }
    if (uncertainEditWriteRef.current) { setNotice('请先只读核实上一次选题内容保存结果；核实前不会再次审核。'); return; }
    if (uncertainStatusWriteRef.current) { setNotice('请先只读核实上一次审核或状态操作结果；核实前不会再次审核。'); return; }
    if (!topic || topic.status !== 'pending' || !canAudit) {
      setNotice('当前账号没有审核该选题的权限，或选题已不在待审核状态。');
      return;
    }
    if (networkState !== 'online') { setNotice('当前网络未恢复，审核结果尚未提交。'); return; }
    auditSubmissionInFlightRef.current = true;
    setSubmittingAudit(true);
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
      if (isDefiniteStatusRejection(error)) {
        setNotice(error.message || '审核失败，请检查权限或当前状态。');
        return;
      }
      rememberUncertainStatusWrite({ before: topic.status, target: auditStatus, kind: 'audit' });
      await verifyUncertainStatusWrite();
    } finally {
      auditSubmissionInFlightRef.current = false;
      setSubmittingAudit(false);
      setSaving(false);
    }
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
    {loading || (topic !== null && topic.id !== Number(id)) ? <p role="status" className="text-sm text-studio-text-secondary">正在加载选题…</p> : topic ? <>
      <div className="flex items-center justify-between rounded-2xl border border-studio-border-soft bg-studio-surface p-4"><span className="text-sm text-studio-text-secondary">当前状态</span><span className={`rounded-full border px-3 py-1 text-sm ${currentStatusColors.bg} ${currentStatusColors.text} ${currentStatusColors.border}`}>{statusName[topic.status] || '状态待确认'}</span></div>
      {uncertainEditWrite ? <div role="alert" className="space-y-3 rounded-2xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast">
        <p>上一次选题内容保存结果暂时无法确认。核实前会暂停内容编辑、再次保存及相关流程操作，不会自动重发。</p>
        <ActionButton type="button" variant="secondary" disabled={verifyingEditWrite} onClick={() => { void verifyUncertainEditWrite(); }} className="min-h-11 w-full justify-center">
          {verifyingEditWrite ? '正在只读核实…' : '只读核实保存结果'}
        </ActionButton>
      </div> : null}
      {editConflict ? <div role="alert" className="space-y-3 rounded-2xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast">
        <p>服务端内容已变化。以下是服务端最新版本；当前输入仍保留你的本地修改，请选择如何继续。</p>
        <div className="space-y-2 rounded-xl border border-studio-border-soft bg-studio-surface p-3">
          <p><span className="font-semibold">服务端标题：</span>{editConflict.title}</p>
          <p className="whitespace-pre-wrap"><span className="font-semibold">服务端说明：</span>{editConflict.description || '（空）'}</p>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <ActionButton type="button" variant="secondary" onClick={adoptServerEditConflict} className="min-h-11 w-full justify-center">采用服务端内容</ActionButton>
          <ActionButton type="button" variant="primary" onClick={continueWithLocalEditDraft} className="min-h-11 w-full justify-center">保留本地修改继续编辑</ActionButton>
        </div>
      </div> : null}
      {uncertainStatusWrite ? <div role="alert" className="space-y-3 rounded-2xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast">
        <p>上一次{uncertainStatusWrite.kind === 'audit' ? '审核' : '状态更新'}结果暂时无法确认。核实前会暂停此选题的再次审核、状态推进和开始创作，不会自动重发。</p>
        <ActionButton type="button" variant="secondary" disabled={verifyingStatusWrite} onClick={() => { void verifyUncertainStatusWrite(); }} className="min-h-11 w-full justify-center">
          {verifyingStatusWrite ? '正在只读核实…' : '只读核实'}
        </ActionButton>
      </div> : null}
      {missingCurrentStageRecord && requiredStageRecord ? <section role="alert" className="space-y-3 rounded-2xl border border-studio-border-soft bg-studio-amber-soft p-4"><div><h2 className="text-sm font-semibold text-studio-amber-contrast">当前阶段缺少{requiredStageRecordLabel}记录</h2><p className="mt-1 text-sm leading-6 text-studio-text-secondary">{topic.status === 'completed' ? '选题已完成，请先核对发布历史；系统不会自动补建历史发布数据。' : '请先补齐当前阶段记录，再推进到下一阶段。补齐不会改变选题状态，操作会记入历史。'}</p></div>{topic.status !== 'completed' && canEditTopic ? <ActionButton type="button" variant="primary" disabled={repairingStageRecord || networkState !== 'online' || Boolean(uncertainEditWrite) || Boolean(editConflict)} onClick={() => void repairStageRecord()} className="min-h-11 w-full justify-center">{repairingStageRecord ? '正在补齐…' : `补齐${requiredStageRecordLabel}记录`}</ActionButton> : null}</section> : null}
      <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl border border-studio-border-soft p-3"><p className="text-xs text-studio-text-secondary">创建人</p><p className="mt-1 truncate">{topic.creator_name ?? '—'}</p></div><div className="rounded-xl border border-studio-border-soft p-3"><p className="text-xs text-studio-text-secondary">更新时间</p><p className="mt-1 truncate">{topic.updated_at ? formatBeijingDate(topic.updated_at) : '—'}</p></div></div>
      <label className="block rounded-2xl border border-studio-border-soft bg-studio-surface p-4"><span className="mb-2 block text-sm font-semibold">选题标题</span><input id="mobile-topic-title" name="topicTitle" value={title} disabled={!canEditTopic || permissionsLoading || saving || Boolean(uncertainEditWrite) || Boolean(editConflict)} onChange={(event) => { setEdited(true); setTitle(event.target.value); }} className="min-h-11 w-full rounded-xl border border-studio-border-soft bg-studio-bg px-3 text-sm outline-none focus:border-studio-cyan disabled:opacity-60" /></label>
      <label className="block rounded-2xl border border-studio-border-soft bg-studio-surface p-4"><span className="mb-2 block text-sm font-semibold">选题说明</span><textarea id="mobile-topic-description" name="topicDescription" value={description} disabled={!canEditTopic || permissionsLoading || saving || Boolean(uncertainEditWrite) || Boolean(editConflict)} onChange={(event) => { setEdited(true); setDescription(event.target.value); }} className="min-h-40 w-full resize-y rounded-xl border border-studio-border-soft bg-studio-bg p-3 text-sm leading-6 outline-none focus:border-studio-cyan disabled:opacity-60" placeholder="补充选题背景、目标受众和创作思路" /></label>
      {requestedOutlineVersion ? (() => {
        const exactVersion = outlineVersions.find((version) => !version.is_baseline && version.version === requestedOutlineVersion);
        return (
          <section aria-label="来源大纲版本" className="space-y-3 rounded-2xl border border-studio-border-soft bg-studio-surface p-4">
            <h2 className="text-sm font-semibold">创作初稿引用的大纲版本</h2>
            {outlineVersionLoadState === 'loading' ? <p role="status" className="text-sm text-studio-text-secondary">正在读取来源大纲版本 {requestedOutlineVersion}…</p> : null}
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
                ) : <p className="text-sm text-studio-text-secondary">该来源大纲版本保存时为空。</p>}
              </>
            ) : null}
            {outlineVersionLoadState === 'ready' && !exactVersion ? (
              <p role="alert" className="text-sm text-studio-amber-contrast">来源大纲版本 {requestedOutlineVersion} 当前无法定位；没有回退到最新大纲。</p>
            ) : null}
          </section>
        );
      })() : null}
      <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl border border-studio-border-soft p-3"><p className="text-xs text-studio-text-secondary">负责人</p><p className="mt-1">{topic.assignee_name ?? '未分配'}</p></div><div className="rounded-xl border border-studio-border-soft p-3"><p className="text-xs text-studio-text-secondary">截止日期</p><p className="mt-1">{topic.deadline ? formatBeijingDate(topic.deadline) : '未设置'}</p></div></div>
      <section className="rounded-2xl border border-studio-border-soft bg-studio-surface p-4">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold"><FolderOpen className="h-4 w-4 text-studio-cyan" />关联资料</h2>
        {resourcesLoading ? <p role="status" className="mt-2 text-sm text-studio-text-secondary">正在读取关联资料…</p> : resourcesError ? (
          <div className="mt-3 space-y-2">
            <p role="alert" className="text-sm text-studio-coral-contrast">关联资料读取失败：{resourcesError}</p>
            <button type="button" disabled={resourcesLoading || networkState !== 'online'} onClick={() => { if (topic) void loadResources(topic.id); }} className="xmt-btn-secondary inline-flex min-h-10 items-center gap-1.5 disabled:opacity-50">
              <RefreshCw className="h-3.5 w-3.5" />重新加载资料
            </button>
          </div>
        ) : resources.length ? (
          <div className="mt-3 space-y-2">{resources.map((resource) => <p key={resource.id} className="truncate rounded-lg bg-studio-bg px-3 py-2 text-sm">{resource.title}</p>)}</div>
        ) : <p className="mt-2 text-sm text-studio-text-secondary">暂无关联资料</p>}
      </section>
      <TopicAssetDimensionsPanel key={topic.id} topicId={topic.id} canManage={canEditTopic} />
      {topic.history?.length ? <section className="rounded-2xl border border-studio-border-soft bg-studio-surface p-4"><h2 className="inline-flex items-center gap-2 text-sm font-semibold"><Clock3 className="h-4 w-4 text-studio-cyan" />协作动态</h2><div className="mt-3 space-y-3">{topic.history.slice(0, 5).map((record) => <div key={record.id} className="border-l border-studio-border-soft pl-3 text-sm"><p>{record.operator_name ?? '成员'} · {historyActionName[record.action] ?? record.action}</p><p className="mt-1 text-xs text-studio-text-secondary">{record.comment || record.created_at}</p></div>)}</div></section> : null}
      {topic.status === 'pending' && canAudit ? <section className="space-y-3 rounded-2xl border border-studio-border-soft bg-studio-surface p-4"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">选题审核</h2><p className="mt-1 text-xs text-studio-text-secondary">审核操作独立于选题内容编辑权限。</p></div><button type="button" disabled={saving || networkState !== 'online' || Boolean(uncertainStatusWrite) || Boolean(uncertainEditWrite) || Boolean(editConflict)} onClick={() => setShowAudit((current) => !current)} className="min-h-10 rounded-xl bg-studio-primary-button px-3 text-sm font-semibold text-white disabled:opacity-50">{showAudit ? '收起审核' : '开始审核'}</button></div>{showAudit ? <><div className="grid grid-cols-2 gap-2"><button type="button" aria-pressed={auditStatus === 'approved'} disabled={submittingAudit || Boolean(uncertainStatusWrite) || Boolean(uncertainEditWrite) || Boolean(editConflict)} onClick={() => setAuditStatus('approved')} className={`min-h-10 rounded-xl border text-sm font-semibold disabled:opacity-60 ${auditStatus === 'approved' ? 'border-studio-success bg-studio-success/15 text-studio-success-contrast' : 'border-studio-border-soft text-studio-text-secondary'}`}>通过</button><button type="button" aria-pressed={auditStatus === 'rejected'} disabled={submittingAudit || Boolean(uncertainStatusWrite) || Boolean(uncertainEditWrite) || Boolean(editConflict)} onClick={() => setAuditStatus('rejected')} className={`min-h-10 rounded-xl border text-sm font-semibold disabled:opacity-60 ${auditStatus === 'rejected' ? 'border-studio-coral bg-studio-coral/10 text-studio-coral-contrast' : 'border-studio-border-soft text-studio-text-secondary'}`}>驳回</button></div><label className="block"><span className="mb-2 block text-sm font-medium">审核意见（选填）</span><textarea value={auditComment} onChange={(event) => setAuditComment(event.target.value)} disabled={submittingAudit || Boolean(uncertainStatusWrite) || Boolean(uncertainEditWrite) || Boolean(editConflict)} className="min-h-24 w-full rounded-xl border border-studio-border-soft bg-studio-bg p-3 text-sm disabled:opacity-60" placeholder="填写通过说明或需要修改的内容" /></label><button type="button" disabled={saving || networkState !== 'online' || Boolean(uncertainStatusWrite) || Boolean(uncertainEditWrite) || Boolean(editConflict)} onClick={() => void audit()} className="min-h-11 w-full rounded-xl bg-studio-primary-button text-sm font-semibold text-white disabled:opacity-50">{submittingAudit ? '正在提交审核…' : auditStatus === 'approved' ? '确认通过选题' : '确认驳回选题'}</button></> : null}</section> : null}
      {notice ? <p role="status" className="px-1 text-sm text-studio-text-secondary">{notice}</p> : null}
      {permissionsLoading ? <p role="status" className="text-sm text-studio-text-secondary">正在确认操作权限…</p> : null}
      {!permissionsLoading && !canEditTopic ? <p className="text-sm text-studio-text-secondary">当前为只读查看；如需修改，请联系管理员或选题负责人。</p> : null}
      {!permissionsLoading && (canEditTopic || canStartProduction) ? <div className={`sticky z-sticky -mx-1 grid ${canEditTopic ? 'grid-cols-2' : 'grid-cols-1'} gap-3 bg-studio-bg px-1 py-2`} style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}>
        {canEditTopic ? <button type="button" disabled={saving || startingProduction || Boolean(uncertainEditWrite) || Boolean(editConflict)} onClick={() => void save()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-studio-border-soft text-sm font-semibold disabled:opacity-50"><Save className="h-4 w-4" />{saving ? '保存中…' : '保存修改'}</button> : null}
        {canStartProduction ? <button type="button" disabled={saving || startingProduction || networkState !== 'online' || Boolean(uncertainStatusWrite) || Boolean(uncertainEditWrite) || Boolean(editConflict)} onClick={() => void startProduction()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-studio-primary-button text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />{startingProduction ? '正在准备…' : topic.status === 'approved' ? '开始创作' : '进入创作'}</button> : canAdvanceWorkflow ? <button type="button" disabled={saving || networkState !== 'online' || Boolean(uncertainStatusWrite) || Boolean(uncertainEditWrite) || Boolean(editConflict)} onClick={() => void advance()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-studio-primary-button text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />{advancing ? '正在推进阶段…' : statusLabel[topic.status] ?? '推进阶段'}</button> : null}
      </div> : null}
    </> : topicLoadFailure === 'not-found' ? <p role="status" className="text-sm text-studio-text-secondary">未找到该选题，或记录当前不可访问。</p>
      : topicLoadFailure === 'unavailable' ? <section role="alert" className="space-y-3 rounded-2xl border border-studio-coral/30 bg-studio-coral/10 p-4 text-sm text-studio-coral-contrast">
        <p>选题详情暂时无法读取；当前无法确认记录是否存在，读取失败不代表选题已删除。</p>
        <ActionButton type="button" variant="primary" disabled={loading} onClick={() => { void load('initial'); }} className="min-h-11 w-full justify-center">{loading ? '正在重新加载…' : '重新加载选题详情'}</ActionButton>
      </section>
      : <p role="status" className="text-sm text-studio-text-secondary">暂时无法确认选题状态，请返回列表重试。</p>}
    <ConfirmModal
      open={pendingLeaveAttempt !== null}
      title="选题修改已保存在本机"
      description="离开后仍可重新进入此选题继续编辑。"
      confirmText="离开选题"
      cancelText="继续编辑"
      variant="warning"
      onCancel={() => {
        pendingLeaveAttempt?.stay();
        setPendingLeaveAttempt(null);
      }}
      onConfirm={() => {
        const attempt = pendingLeaveAttempt;
        setPendingLeaveAttempt(null);
        attempt?.proceed();
      }}
    />
  </div>;
}
