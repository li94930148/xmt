import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore, useAppStore } from '../store';
import { getTopic, getTopicOutlineVersions, repairCurrentTopicStageRecord, auditTopic, updateTopicStatus, updateTopic, getProduction, createProduction } from '../api';
import { celebrateMilestone } from '../utils/confetti';
import { getUsers } from '../api';
import { Topic, User } from '../types';
import type { WorkflowDocumentVersion } from '../api';
import { ChevronLeft, Clock, User as UserIcon, Calendar, FileText, CheckCircle, XCircle, ArrowRight, Save, AlertTriangle, Camera, Scissors, Send, List, FileText as FileIcon } from 'lucide-react';
import ContentEditor from '../components/ContentEditor';
import BaseModal from '../components/common/BaseModal';
import { createTopicDetailManualAdapter } from '../editor/adapters/topicDetailManualAdapter';
import type { ContentEditorRuntimeHandle, ContentEditorSaveContext } from '../editor/contracts/contentEditorAdapter';
import { getCurrentTopicEditorModePolicy } from '../editor/topic/topicEditorModePolicy';
import { useTopicDetailLeaveGuard } from '../hooks/useTopicDetailLeaveGuard';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { normalizeLegacyEditorHtmlTheme } from '../utils/editorTheme';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { usePermission } from '../hooks/usePermission';
import { STATUS_COLORS, STATUS_TEXT } from '../constants';
import { formatBeijingTime, formatBeijingDate } from '../lib/utils';
import {
  TopicDetailAggregateSaveGate,
  buildTopicDetailDescription,
  buildTopicDetailUpdatePayload,
  cloneTopicDetailDraft,
  createTopicDetailDraft,
  topicDetailDraftEquals,
  type TopicDetailAggregateDraft,
  type TopicDetailFields,
  type TopicDetailParsedFields,
} from './topicDetailAggregateDraft';
import { canSaveTopicDetailDraft, resolveTopicDetailEditorBranch, type TopicDetailEditorBranch } from './topicDetailEditorBranch';
import TopicResourcesPanel from '../components/topic/TopicResourcesPanel';
import TopicAssetDimensionsPanel from '../components/topics/TopicAssetDimensionsPanel';
import { startOrResumeTopicProduction } from '../utils/topicProductionHandoff';
import { ActionButton } from '../components/studio';

export default function TopicDetail() {
  const { id } = useParams<{ id: string }>();
  const currentTopicIdRef = useRef(id);
  currentTopicIdRef.current = id;
  const topicEditorModePolicy = useMemo(() => getCurrentTopicEditorModePolicy(), []);
  const [topic, setTopic] = useState<Topic | null>(null);
  const detailRequestSequenceRef = useRef(0);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [startingProduction, setStartingProduction] = useState(false);
  const [repairingStageRecord, setRepairingStageRecord] = useState(false);
  const startProductionInFlight = useRef(false);
  const [auditData, setAuditData] = useState({ status: 'approved' as 'approved' | 'rejected', comment: '', assignee_id: 0 });
  
  const [editTitle, setEditTitle] = useState(false);
  const [editDetails, setEditDetails] = useState(false);
  const [editDescription, setEditDescription] = useState(false);
  const [editOutline, setEditOutline] = useState(false);
  
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState<TopicDetailFields>({ assignee_id: 0, deadline: '', platform: '' });
  const [description, setDescription] = useState('');
  const [scriptContent, setScriptContent] = useState('');
  const [parsedFields, setParsedFields] = useState<TopicDetailParsedFields>({ projectBackground: '', targetAudience: '' });
  const [isTopicDirty, setIsTopicDirty] = useState(false);
  const [isAggregateSaving, setIsAggregateSaving] = useState(false);
  const [topicSaveFeedback, setTopicSaveFeedback] = useState<string | null>(null);
  const [outlineVersions, setOutlineVersions] = useState<WorkflowDocumentVersion[]>([]);
  const [outlineVersionsLoadState, setOutlineVersionsLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const requestedOutlineCardRef = useRef<HTMLLIElement | null>(null);
  const pendingTopicVersionActionRef = useRef<'minor' | 'major' | null>(null);
  const baselineDraftRef = useRef<TopicDetailAggregateDraft | null>(null);
  const draftRef = useRef<TopicDetailAggregateDraft>({
    title: '', description: '', details: { assignee_id: 0, deadline: '', platform: '' }, outline: '',
    parsedFields: { projectBackground: '', targetAudience: '' },
  });
  const aggregateRevisionRef = useRef(0);
  const aggregateSaveGateRef = useRef(new TopicDetailAggregateSaveGate());
  const topicRuntimeHandleRef = useRef<ContentEditorRuntimeHandle | null>(null);
  const manualSaveSnapshotsRef = useRef(new Map<number, TopicDetailAggregateDraft>());
  const aggregatePersistCommandRef = useRef<(
    snapshot: TopicDetailAggregateDraft,
    revision: number,
    versionAction?: 'minor' | 'major',
  ) => Promise<void>>(async () => {
    throw new Error('Topic aggregate save command is not ready');
  });
  const [hasTopicManualRuntimeHandle, setHasTopicManualRuntimeHandle] = useState(false);
  const [topicEditorBranch, setTopicEditorBranch] = useState<TopicDetailEditorBranch>(() => (
    resolveTopicDetailEditorBranch(0, true, topicEditorModePolicy)
  ));
  
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const authStore = useAuthStore();
  const appStore = useAppStore();
  const styles = useThemeStyles();
  const { hasPermission, loading: permissionsLoading } = usePermission();
  const requestedOutlineVersion = searchParams.get('outlineVersion')?.trim() || '';
  const canAudit = !requestedOutlineVersion && hasPermission('topic:audit');
  const auditRequested = searchParams.get('action') === 'audit';
  const contentEditRoles = new Set(['admin', 'editor', 'copywriter', 'post_production', 'camera']);
  const persistTopicManualBridge = useCallback(async (_content: string, context: ContentEditorSaveContext) => {
    const snapshot = manualSaveSnapshotsRef.current.get(context.contentRevision);
    if (!snapshot) throw new Error('Topic manual save snapshot is unavailable');
    await aggregatePersistCommandRef.current(snapshot, context.contentRevision, pendingTopicVersionActionRef.current ?? undefined);
  }, []);
  const handleTopicRuntimeHandleChange = useCallback((handle: ContentEditorRuntimeHandle | null) => {
    topicRuntimeHandleRef.current = handle;
    setHasTopicManualRuntimeHandle(Boolean(handle?.manualSave));
  }, []);

  useEffect(() => {
    const requestId = ++detailRequestSequenceRef.current;
    const fetchData = async () => {
      setLoading(true);
      setOutlineVersionsLoadState('loading');
      try {
        const topicData = await getTopic(parseInt(id!));
        if (requestId !== detailRequestSequenceRef.current || Number(currentTopicIdRef.current) !== Number(id)) return;
        setTopic(topicData);
        try {
          const versions = await getTopicOutlineVersions(topicData.id);
          if (requestId !== detailRequestSequenceRef.current || Number(currentTopicIdRef.current) !== Number(id)) return;
          setOutlineVersions(versions);
          setOutlineVersionsLoadState('ready');
        } catch {
          if (requestId !== detailRequestSequenceRef.current || Number(currentTopicIdRef.current) !== Number(id)) return;
          setOutlineVersions([]);
          setOutlineVersionsLoadState('error');
        }
        // Resolve once per loaded Topic. The policy is static for the page
        // lifetime, so a dirty draft can never hot-switch editor renderers.
        setTopicEditorBranch(resolveTopicDetailEditorBranch(
          topicData.id,
          true,
          topicEditorModePolicy,
        ));
        setTitle(topicData.title);
        setDescription(topicData.description);

        // 从 description 解析结构化字段（只存项目背景和目标受众）
        const desc = topicData.description || '';
        const bgMatch = desc.match(/【项目背景】\n([\s\S]*?)(?=\n\n【|$)/);
        const audienceMatch = desc.match(/【目标受众】\n([\s\S]*?)(?=\n\n【|$)/);

        setParsedFields({
          projectBackground: bgMatch ? bgMatch[1].trim() : '',
          targetAudience: audienceMatch ? audienceMatch[1].trim() : '',
        });

        setDetails({
          assignee_id: topicData.assignee_id,
          deadline: topicData.deadline,
          platform: topicData.platform
        });

        const usersData = await getUsers();
        if (requestId !== detailRequestSequenceRef.current || Number(currentTopicIdRef.current) !== Number(id)) return;
        setUsers(usersData.data);

        // 大纲内容从 topic 取
        const draft = createTopicDetailDraft(topicData);
        baselineDraftRef.current = cloneTopicDetailDraft(draft);
        draftRef.current = cloneTopicDetailDraft(draft);
        aggregateRevisionRef.current = 0;
        setTitle(draft.title);
        setDescription(draft.description);
        setDetails(draft.details);
        setParsedFields(draft.parsedFields);
        setScriptContent(draft.outline);
        setIsTopicDirty(false);
      } catch (error) {
        if (requestId === detailRequestSequenceRef.current && Number(currentTopicIdRef.current) === Number(id)) {
          appStore.addNotification({ title: '获取选题详情失败', message: (error as Error).message, type: 'error' });
        }
      } finally {
        if (requestId === detailRequestSequenceRef.current && Number(currentTopicIdRef.current) === Number(id)) setLoading(false);
      }
    };
    
    void fetchData();
    return () => { detailRequestSequenceRef.current += 1; };
  }, [id]);

  const reloadOutlineVersions = async () => {
    if (!topic || outlineVersionsLoadState === 'loading') return;
    const requestedTopicId = topic.id;
    const requestId = detailRequestSequenceRef.current;
    setOutlineVersionsLoadState('loading');
    try {
      const versions = await getTopicOutlineVersions(requestedTopicId);
      if (requestId !== detailRequestSequenceRef.current || Number(currentTopicIdRef.current) !== requestedTopicId) return;
      setOutlineVersions(versions);
      setOutlineVersionsLoadState('ready');
    } catch {
      if (requestId !== detailRequestSequenceRef.current || Number(currentTopicIdRef.current) !== requestedTopicId) return;
      setOutlineVersionsLoadState('error');
    }
  };

  const requestedOutlineVersionEntry = outlineVersions.find((version) => (
    !version.is_baseline && version.version === requestedOutlineVersion
  ));

  useEffect(() => {
    if (!requestedOutlineVersionEntry || outlineVersionsLoadState !== 'ready') return;
    requestedOutlineCardRef.current?.scrollIntoView({ block: 'center' });
  }, [outlineVersionsLoadState, requestedOutlineVersionEntry]);

  useEffect(() => {
    if (!auditRequested || loading || permissionsLoading) return;

    if (topic?.status === 'pending' && canAudit) setShowAuditModal(true);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('action');
    setSearchParams(nextParams, { replace: true });
  }, [auditRequested, canAudit, loading, permissionsLoading, searchParams, setSearchParams, topic?.status]);

  const applyDraft = (draft: TopicDetailAggregateDraft) => {
    draftRef.current = cloneTopicDetailDraft(draft);
    setTitle(draft.title);
    setDescription(draft.description);
    setDetails(draft.details);
    setParsedFields(draft.parsedFields);
    setScriptContent(draft.outline);
  };

  const recordDraftChange = (nextDraft: TopicDetailAggregateDraft) => {
    draftRef.current = cloneTopicDetailDraft(nextDraft);
    aggregateRevisionRef.current += 1;
    setIsTopicDirty(!baselineDraftRef.current || !topicDetailDraftEquals(nextDraft, baselineDraftRef.current));
  };

  const isCurrentDraftDirty = useCallback(() => (
    !baselineDraftRef.current || !topicDetailDraftEquals(draftRef.current, baselineDraftRef.current)
  ), []);

  const changeTitle = (nextTitle: string) => {
    const nextDraft = { ...draftRef.current, title: nextTitle };
    setTitle(nextTitle);
    recordDraftChange(nextDraft);
  };

  const changeDetails = (nextDetails: TopicDetailFields) => {
    const nextDraft = { ...draftRef.current, details: { ...nextDetails } };
    setDetails(nextDetails);
    recordDraftChange(nextDraft);
  };

  const changeParsedFields = (nextFields: TopicDetailParsedFields) => {
    const nextDescription = buildTopicDetailDescription(nextFields);
    const nextDraft = { ...draftRef.current, description: nextDescription, parsedFields: { ...nextFields } };
    setParsedFields(nextFields);
    setDescription(nextDescription);
    recordDraftChange(nextDraft);
  };

  const changeOutline = (nextOutline: string) => {
    const nextDraft = { ...draftRef.current, outline: nextOutline };
    setScriptContent(nextOutline);
    recordDraftChange(nextDraft);
  };

  const handleAudit = async () => {
    const requestedTopicId = Number(id);
    try {
      await auditTopic(requestedTopicId, auditData);
    } catch (error) {
      appStore.addNotification({ title: '审核失败', message: (error as Error).message, type: 'error' });
      return;
    }

    if (Number(currentTopicIdRef.current) === requestedTopicId) setShowAuditModal(false);
    try {
      const refreshed = await getTopic(requestedTopicId);
      if (Number(currentTopicIdRef.current) === requestedTopicId) setTopic(refreshed);
      appStore.addNotification({
        title: '审核成功',
        message: auditData.status === 'approved' ? '选题已通过审核' : '选题已驳回',
        type: 'success',
      });
    } catch {
      setTopic((current) => current?.id === requestedTopicId ? { ...current, status: auditData.status } : current);
      appStore.addNotification({ title: '审核已提交', message: '审核操作已成功提交，但详情暂时未能刷新；请稍后手动刷新确认最新信息。', type: 'warning' });
    }
  };

  const handleUpdateStatus = async (status: string) => {
    const requestedTopicId = Number(id);
    try {
      await updateTopicStatus(requestedTopicId, status);
    } catch (error) {
      appStore.addNotification({ title: '更新失败', message: (error as Error).message, type: 'error' });
      return;
    }

    if (status === 'shooting' || status === 'completed') celebrateMilestone();
    try {
      const refreshed = await getTopic(requestedTopicId);
      if (Number(currentTopicIdRef.current) === requestedTopicId) setTopic(refreshed);
      appStore.addNotification({ title: '状态更新成功', message: '选题状态已更新', type: 'success' });
    } catch {
      setTopic((current) => current?.id === requestedTopicId ? { ...current, status: status as Topic['status'] } : current);
      appStore.addNotification({ title: '状态已更新', message: '状态更新已成功提交，但详情暂时未能刷新；请稍后手动刷新确认最新信息。', type: 'warning' });
    }
  };

  const handleStartProduction = async () => {
    if (!topic || startProductionInFlight.current) return;
    startProductionInFlight.current = true;
    setStartingProduction(true);
    try {
      const result = await startOrResumeTopicProduction(topic, {
        advanceTopic: updateTopicStatus,
        listProductions: async (topicId) => getProduction({ topic_id: topicId }),
        createDraft: createProduction,
      });
      if (result.advanced) setTopic((current) => current ? { ...current, status: 'production' } : current);
      if (result.created || result.advanced) {
        appStore.addNotification({
          title: result.created ? (result.advanced ? '创作已建立' : '创作草稿已补齐') : '已进入创作',
          message: result.created
            ? '已带入选题大纲，可以直接开始写稿。'
            : '选题阶段已同步，继续已有稿件。',
          type: 'success',
        });
      }
      navigate(`/production/${result.productionId}`);
    } catch (error) {
      appStore.addNotification({ title: '开始创作失败', message: (error as Error).message, type: 'error' });
    } finally {
      startProductionInFlight.current = false;
      setStartingProduction(false);
    }
  };

  const handleRepairStageRecord = async () => {
    if (!topic || !canEditTopic || repairingStageRecord) return;
    const requestedTopicId = topic.id;
    setRepairingStageRecord(true);
    let result: Awaited<ReturnType<typeof repairCurrentTopicStageRecord>>;
    try {
      result = await repairCurrentTopicStageRecord(requestedTopicId);
    } catch (error) {
      appStore.addNotification({ title: '补齐阶段记录失败', message: (error as Error).message, type: 'error' });
      setRepairingStageRecord(false);
      return;
    }

    try {
      const refreshed = await getTopic(requestedTopicId);
      if (Number(currentTopicIdRef.current) === requestedTopicId) setTopic(refreshed);
      appStore.addNotification({
        title: result.created ? '阶段记录已补齐' : '阶段记录已存在',
        message: result.created ? '选题阶段保持不变，操作已记入历史记录。' : '没有重复创建记录，页面已刷新。',
        type: 'success',
      });
    } catch {
      appStore.addNotification({
        title: result.created ? '阶段记录已补齐' : '阶段记录已存在',
        message: '服务端已确认结果，但页面刷新失败；请重新加载确认当前状态，不要重复操作。',
        type: 'warning',
      });
    } finally {
      setRepairingStageRecord(false);
    }
  };

  const persistTopicAggregate = (saveSnapshot: TopicDetailAggregateDraft, saveRevision: number, versionAction?: 'minor' | 'major') => {
    const requestedTopicId = Number(id);
    return (
    aggregateSaveGateRef.current.run(async () => {
      setIsAggregateSaving(true);
      const payload = {
        ...buildTopicDetailUpdatePayload(saveSnapshot),
        ...(versionAction ? { version_action: versionAction, expected_content: topic?.outline ?? '' } : {}),
      };
      try {
        await updateTopic(requestedTopicId, payload);
      } catch (error) {
        setIsAggregateSaving(false);
        appStore.addNotification({ title: '保存失败', message: (error as Error).message, type: 'error' });
        throw error;
      }

      if (Number(currentTopicIdRef.current) !== requestedTopicId) {
        setIsAggregateSaving(false);
        appStore.addNotification({ title: '选题信息已保存', message: '服务端已确认保存；页面已切换，未用旧详情覆盖当前内容。', type: 'warning' });
        return;
      }

      const confirmedDraft = cloneTopicDetailDraft(saveSnapshot);
      baselineDraftRef.current = cloneTopicDetailDraft(confirmedDraft);
      setTopic((current) => current ? { ...current, ...payload } : current);
      if (aggregateRevisionRef.current === saveRevision) {
        applyDraft(confirmedDraft);
        setIsTopicDirty(false);
        setEditTitle(false);
        setEditDetails(false);
        setEditDescription(false);
        setEditOutline(false);
      } else {
        setIsTopicDirty(!topicDetailDraftEquals(draftRef.current, confirmedDraft));
      }

      try {
        const topicData = await getTopic(requestedTopicId);
        if (Number(currentTopicIdRef.current) !== requestedTopicId) {
          appStore.addNotification({ title: '选题信息已保存', message: '服务端已确认保存；页面已切换，未用旧详情覆盖当前内容。', type: 'warning' });
          return;
        }
        setTopic(topicData);
        if (versionAction) {
          const versions = await getTopicOutlineVersions(topicData.id).catch(() => outlineVersions);
          if (Number(currentTopicIdRef.current) !== requestedTopicId) {
            appStore.addNotification({ title: '选题信息已保存', message: '服务端已确认保存；页面已切换，未用旧详情覆盖当前内容。', type: 'warning' });
            return;
          }
          setOutlineVersions(versions);
        }
        if (aggregateRevisionRef.current === saveRevision) {
          const refreshedDraft = createTopicDetailDraft(topicData);
          baselineDraftRef.current = cloneTopicDetailDraft(refreshedDraft);
          applyDraft(refreshedDraft);
          setIsTopicDirty(false);
          setEditTitle(false);
          setEditDetails(false);
          setEditDescription(false);
          setEditOutline(false);
        } else {
          // Preserve the confirmed save as the baseline; edits made while the
          // request was in flight remain dirty and cannot be discarded.
          setIsTopicDirty(!topicDetailDraftEquals(draftRef.current, confirmedDraft));
        }
        appStore.addNotification({ title: versionAction ? '版本已保存' : '保存成功', message: versionAction ? `选题大纲已保存为${versionAction === 'major' ? '大版本' : '小版本'}` : '选题信息已更新', type: 'success' });
      } catch {
        appStore.addNotification({ title: '选题信息已保存', message: Number(currentTopicIdRef.current) === requestedTopicId
          ? '服务端已确认保存，但页面刷新失败；当前内容已保留，请稍后重新加载确认，不要重复保存。'
          : '服务端已确认保存；页面已切换，未用旧详情覆盖当前内容。', type: 'warning' });
      } finally {
        setIsAggregateSaving(false);
      }
    })
    );
  };

  aggregatePersistCommandRef.current = persistTopicAggregate;

  const performTopicManualSave = (): Promise<void> => {
    setTopicSaveFeedback(null);
    const saveRevision = aggregateRevisionRef.current;
    const saveSnapshot = cloneTopicDetailDraft(draftRef.current);

    if (!topicEditorBranch.usesRuntimeManualSave || !editOutline) {
      return persistTopicAggregate(saveSnapshot, saveRevision, pendingTopicVersionActionRef.current ?? undefined);
    }
    const runtimeHandle = topicRuntimeHandleRef.current;

    if (!runtimeHandle?.manualSave) {
      const message = '当前无法保存这次修改，请稍后重试。';
      appStore.addNotification({ title: '暂时无法保存', message, type: 'error' });
      return Promise.reject(new Error(message));
    }

    manualSaveSnapshotsRef.current.set(saveRevision, saveSnapshot);
    return runtimeHandle.manualSave(saveSnapshot.outline, saveRevision).then((result) => {
      manualSaveSnapshotsRef.current.delete(saveRevision);
      if (result.status === 'saved') return;
      if (result.status === 'failed') throw result.error;
      if (result.status === 'already_destroyed') {
        const message = '编辑器已关闭，当前修改未保存。';
        appStore.addNotification({ title: '保存未完成', message, type: 'error' });
        throw new Error(message);
      }
      throw new Error('保存已取消，当前修改仍保留。');
    });
  };

  const handleSave = () => {
    void performTopicManualSave().catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : '请检查连接后重试。';
      setTopicSaveFeedback(`保存未完成，当前修改仍保留：${detail}`);
    });
  };

  const handleCreateOutlineVersion = async (versionAction: 'minor' | 'major') => {
    if (!canEditTopic || isAggregateSaving || !editOutline) return;
    pendingTopicVersionActionRef.current = versionAction;
    try {
      await performTopicManualSave();
    } catch (error) {
      const detail = error instanceof Error ? error.message : '请检查连接后重试。';
      setTopicSaveFeedback(`版本未保存，当前修改仍保留：${detail}`);
    } finally {
      pendingTopicVersionActionRef.current = null;
    }
  };

  const handleCancel = () => {
    const baseline = baselineDraftRef.current;
    if (baseline) {
      applyDraft(baseline);
      setIsTopicDirty(false);
    }
    setEditTitle(false);
    setEditDetails(false);
    setEditDescription(false);
    setEditOutline(false);
  };

  const {
    state: topicLeaveState,
    requestLeave: requestTopicLeave,
    saveAndLeave: saveTopicAndLeave,
    discardAndLeave: discardTopicAndLeave,
    continueEditing: continueTopicEditing,
  } = useTopicDetailLeaveGuard({
    isDirty: isCurrentDraftDirty,
    save: performTopicManualSave,
    discard: handleCancel,
  });

  const handleReturnToTopics = useCallback(() => {
    void requestTopicLeave(() => navigate('/topics'));
  }, [navigate, requestTopicLeave]);

  const statusColors: Record<string, string> = {
    pending: 'bg-studio-amber-soft text-studio-amber-contrast border-studio-border-soft',
    approved: 'bg-studio-success-soft text-studio-success-contrast border-studio-border-soft',
    rejected: 'bg-studio-coral-soft text-studio-coral-contrast border-studio-border-soft',
    production: 'bg-studio-primary-soft text-studio-primary-contrast border-studio-border-soft',
    shooting: 'bg-studio-violet-soft text-studio-violet-contrast border-studio-border-soft',
    publishing: 'bg-studio-cyan-soft text-studio-cyan-contrast border-studio-border-soft',
    completed: 'bg-studio-surface-soft text-studio-text-secondary border-studio-border-soft',
  };

  const statusText: Record<string, string> = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已驳回',
    production: '创作中',
    shooting: '成片制作',
    publishing: '发布中',
    completed: '已完成',
  };

  const workflowSteps = [
    { status: 'pending', label: '选题审核', icon: FileText },
    { status: 'approved', label: '审核通过', icon: CheckCircle },
    { status: 'production', label: '创作阶段', icon: FileIcon },
    { status: 'shooting', label: '成片制作', icon: Camera },
    { status: 'publishing', label: '发布阶段', icon: Send },
    { status: 'completed', label: '完成归档', icon: CheckCircle },
  ];

  const nextStatuses: Record<string, string> = {
    pending: 'approved',
    approved: 'production',
    production: 'shooting',
    shooting: 'publishing',
    publishing: 'completed',
    completed: 'completed',
  };

  const canEditTopicPermission = hasPermission('topic:update');
  const canStartProduction = !requestedOutlineVersion && hasPermission('production:update');
  const canManageTopicResources = !requestedOutlineVersion && canEditTopicPermission && hasPermission('resource:view');
  const canEditTopic = Boolean(
    !requestedOutlineVersion && topic &&
      canEditTopicPermission &&
      (
        contentEditRoles.has(authStore.user?.role || '') ||
        Number(topic.creator_id) === authStore.user?.id ||
        Number(topic.assignee_id) === authStore.user?.id
      ),
  );
  const currentStageRecord = topic
    ? topic.status === 'approved' || topic.status === 'production'
      ? 'production'
      : topic.status === 'shooting'
        ? 'shooting'
        : topic.status === 'publishing' || topic.status === 'completed'
          ? 'publishing'
          : null
    : null;
  const currentStageRecordLabel = currentStageRecord === 'production'
    ? '创作稿'
    : currentStageRecord === 'shooting'
      ? '成片制作'
      : currentStageRecord === 'publishing'
        ? '发布'
        : '';
  const missingCurrentStageRecord = Boolean(
    topic && currentStageRecord && topic.stage_record_presence && !topic.stage_record_presence[currentStageRecord],
  );
  const topicDetailManualAdapter = useMemo(() => createTopicDetailManualAdapter({
    documentId: `topic:${topic?.id ?? id ?? 'unbound'}`,
    initialContent: baselineDraftRef.current?.outline || '',
    readonly: !canEditTopic || !editOutline,
    persist: persistTopicManualBridge,
  }), [canEditTopic, editOutline, id, persistTopicManualBridge, topic?.id]);
  const isOverdue = topic?.deadline && new Date(topic.deadline) < new Date() && topic.status !== 'completed' && topic.status !== 'rejected';

  const beginEditingTopic = () => {
    if (!permissionsLoading && !canEditTopic) {
      appStore.addNotification({
        title: '暂不可编辑',
        message: '当前账号仅可查看此选题，如需修改请联系负责人。',
        type: 'warning',
      });
      return;
    }

    setEditTitle(true);
    setEditDetails(true);
    setEditDescription(true);
    setEditOutline(true);
  };

  if (loading || (topic && topic.id !== Number(id))) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-studio-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!topic) {
    return <p className="py-8 text-center text-studio-text-secondary">选题不存在</p>;
  }

  const isEditing = editTitle || editDetails || editDescription || editOutline;
  const canPersistTopicDraft = canSaveTopicDetailDraft(
    topicEditorBranch,
    editOutline,
    hasTopicManualRuntimeHandle,
  );
  // Only readonly varies while this page is active. The renderer mode was
  // captured after Topic load, which prevents a dirty draft from hot-switching.
  const activeTopicEditorBranch: TopicDetailEditorBranch = {
    ...topicEditorBranch,
    readonly: !canEditTopic || !editOutline,
  };

  return (
    <div
      className="space-y-6"
      data-topic-dirty={isTopicDirty ? 'true' : 'false'}
      data-topic-manual-runtime={hasTopicManualRuntimeHandle ? 'ready' : 'unavailable'}
      data-topic-leave-state={topicLeaveState}
      data-topic-editor-mode={topicEditorBranch.topicEditorMode}
    >
      <div className="flex items-center gap-4">
        <button
          onClick={handleReturnToTopics}
          className="flex items-center gap-2 text-studio-text-secondary transition-colors hover:text-studio-text-primary"
        >
          <ChevronLeft className="w-5 h-5" />
          返回列表
        </button>
      </div>

      <div className={`${styles.bgSecondary} rounded-xl p-6 ${styles.border}`}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              {editTitle ? (
                <input
                  type="text"
                  value={title}
                  onChange={(e) => changeTitle(e.target.value)}
                  className={`text-2xl font-bold ${styles.textPrimary} ${styles.bgInput} border border-studio-primary rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-studio-primary w-96`}
                  autoFocus
                />
              ) : (
                <h1
                  className={`text-2xl font-bold ${styles.textPrimary} cursor-pointer hover:text-studio-primary transition-colors`}
                  onClick={() => {
                    if (canEditTopic) setEditTitle(true);
                  }}
                >
                  {title}
                </h1>
              )}
              {isOverdue && (
                <span className="flex items-center gap-1 rounded-full border border-studio-coral/30 bg-studio-coral/15 px-2 py-1 text-xs text-studio-coral-contrast">
                  <AlertTriangle className="w-3 h-3" />
                  已逾期
                </span>
              )}
            </div>
            <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm border ${statusColors[topic.status]}`}>
              {topic.status === 'pending' && <Clock className="w-4 h-4" />}
              {topic.status === 'approved' && <CheckCircle className="w-4 h-4" />}
              {topic.status === 'rejected' && <XCircle className="w-4 h-4" />}
              {statusText[topic.status]}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className={`${styles.bgTertiary} rounded-lg p-4`}>
            <div className={`flex items-center gap-2 ${styles.textSecondary} mb-2`}>
              <UserIcon className="w-4 h-4" />
              <span className="text-sm">提交人</span>
            </div>
            <p className={`${styles.textPrimary} font-medium`}>{topic.creator_name}</p>
          </div>
          <div className={`${styles.bgTertiary} rounded-lg p-4`}>
            <div className={`flex items-center gap-2 ${styles.textSecondary} mb-2`}>
              <UserIcon className="w-4 h-4" />
              <span className="text-sm">负责人</span>
            </div>
            {editDetails ? (
              <select
                value={details.assignee_id}
                onChange={(e) => changeDetails({ ...details, assignee_id: parseInt(e.target.value) })}
                className={`w-full px-3 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-studio-primary`}
              >
                <option value={0}>未分配</option>
                {users.filter(u => u.enabled).map(user => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            ) : (
              <p
                className={`${styles.textPrimary} font-medium cursor-pointer hover:text-studio-primary transition-colors`}
                onClick={() => {
                  if (canEditTopic) setEditDetails(true);
                }}
              >
                {details.assignee_id ? users.find(u => u.id === details.assignee_id)?.name || '未指派' : '未指派'}
              </p>
            )}
          </div>
          <div className={`${styles.bgTertiary} rounded-lg p-4`}>
            <div className={`flex items-center gap-2 ${styles.textSecondary} mb-2`}>
              <Calendar className="w-4 h-4" />
              <span className="text-sm">截止时间</span>
            </div>
            {editDetails ? (
              <input
                type="date"
                value={details.deadline}
                onChange={(e) => changeDetails({ ...details, deadline: e.target.value })}
                className={`w-full px-3 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-studio-primary`}
              />
            ) : (
              <p
                className={`font-medium cursor-pointer transition-colors ${isOverdue ? 'text-studio-coral-contrast hover:opacity-80' : `${styles.textPrimary} hover:text-studio-primary-contrast`}`}
                onClick={() => {
                  if (canEditTopic) setEditDetails(true);
                }}
              >
                {formatBeijingDate(details.deadline)}
              </p>
            )}
          </div>
          <div className={`${styles.bgTertiary} rounded-lg p-4`}>
            <div className={`flex items-center gap-2 ${styles.textSecondary} mb-2`}>
              <FileText className="w-4 h-4" />
              <span className="text-sm">发布平台</span>
            </div>
            {editDetails ? (
              <input
                type="text"
                value={details.platform}
                onChange={(e) => changeDetails({ ...details, platform: e.target.value })}
                className={`w-full px-3 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-studio-primary ${styles.textPlaceholder}`}
                placeholder="输入发布平台"
              />
            ) : (
              <p
                className={`${styles.textPrimary} font-medium cursor-pointer hover:text-studio-primary transition-colors`}
                onClick={() => {
                  if (canEditTopic) setEditDetails(true);
                }}
              >
                {details.platform || '-'}
              </p>
            )}
          </div>
        </div>

        {/* 项目背景 + 目标受众 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className={`${styles.bgTertiary} rounded-lg p-4`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className={`${styles.textSecondary} text-sm font-medium`}>项目背景</h3>
              {canEditTopic && isEditing && (
                <button onClick={() => setEditDescription(true)} className="text-xs text-studio-primary hover:text-studio-primary">编辑</button>
              )}
            </div>
            {editDescription ? (
              <textarea
                value={parsedFields.projectBackground}
                onChange={(e) => changeParsedFields({ ...parsedFields, projectBackground: e.target.value })}
                rows={4}
                className={`w-full px-3 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-studio-primary resize-none`}
                placeholder="项目背景..."
              />
            ) : (
              <p className={`${styles.textPrimary} text-sm leading-relaxed whitespace-pre-wrap`}>
                {parsedFields.projectBackground || '无'}
              </p>
            )}
          </div>
          <div className={`${styles.bgTertiary} rounded-lg p-4`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className={`${styles.textSecondary} text-sm font-medium`}>目标受众</h3>
              {canEditTopic && isEditing && (
                <button onClick={() => setEditDescription(true)} className="text-xs text-studio-primary hover:text-studio-primary">编辑</button>
              )}
            </div>
            {editDescription ? (
              <textarea
                value={parsedFields.targetAudience}
                onChange={(e) => changeParsedFields({ ...parsedFields, targetAudience: e.target.value })}
                rows={4}
                className={`w-full px-3 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-studio-primary resize-none`}
                placeholder="目标受众..."
              />
            ) : (
              <p className={`${styles.textPrimary} text-sm leading-relaxed whitespace-pre-wrap`}>
                {parsedFields.targetAudience || '无'}
              </p>
            )}
          </div>
        </div>

        {/* 剧本大纲 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className={`${styles.textSecondary} text-sm font-medium`}>剧本大纲</h3>
            <div className="flex items-center gap-2">
              {canEditTopic && !editOutline && isEditing && (
                <button onClick={() => setEditOutline(true)} className="text-xs text-studio-primary hover:text-studio-primary">编辑大纲</button>
              )}
            </div>
          </div>
          {editOutline ? (
            activeTopicEditorBranch.usesRuntimeManualSave ? (
              <ContentEditor
                writingGoalKey={`topic:${topic?.id ?? id}`}
                value={scriptContent}
                onChange={changeOutline}
                mode={activeTopicEditorBranch.contentEditorMode}
                readOnly={activeTopicEditorBranch.readonly}
                collaborationEnabled={false}
                adapter={topicDetailManualAdapter}
                onRuntimeHandleChange={handleTopicRuntimeHandleChange}
              />
            ) : (
              <ContentEditor
                writingGoalKey={`topic:${topic?.id ?? id}`}
                value={scriptContent}
                onChange={changeOutline}
                mode={activeTopicEditorBranch.contentEditorMode}
                readOnly={activeTopicEditorBranch.readonly}
                collaborationEnabled={false}
              />
            )
          ) : (
            <div className={`editor-content-preview tiptap ${styles.bgTertiary} rounded-lg p-6 ${styles.textPrimary} min-h-[200px] leading-relaxed`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(normalizeLegacyEditorHtmlTheme(scriptContent || '暂无大纲内容')) }}></div>
          )}
          <section aria-label="大纲版本历史" className="mt-4 rounded-xl border border-studio-border-soft bg-studio-surface-soft/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-studio-text-primary">版本历史</h4>
                <p className="mt-1 text-xs text-studio-text-muted">普通保存会更新当前稿；仅小版本和大版本操作会留档。</p>
              </div>
              {canEditTopic && editOutline && (
                <div className="flex flex-wrap gap-2">
                  <ActionButton type="button" disabled={isAggregateSaving || !canPersistTopicDraft} onClick={() => void handleCreateOutlineVersion('minor')}>小版本保存</ActionButton>
                  <ActionButton type="button" variant="primary" disabled={isAggregateSaving || !canPersistTopicDraft} onClick={() => void handleCreateOutlineVersion('major')}>大版本保存</ActionButton>
                </div>
              )}
            </div>
            {canEditTopic && editOutline && topicEditorBranch.usesRuntimeManualSave && !hasTopicManualRuntimeHandle ? (
              <p role="status" className="mt-2 text-xs text-studio-text-muted">编辑器正在准备，准备完成后即可保存。</p>
            ) : null}
            {requestedOutlineVersion ? (
              <p
                role={outlineVersionsLoadState === 'error' || (outlineVersionsLoadState === 'ready' && !requestedOutlineVersionEntry) ? 'alert' : 'status'}
                className={`mt-3 rounded-lg px-3 py-2 text-sm ${outlineVersionsLoadState === 'error' || (outlineVersionsLoadState === 'ready' && !requestedOutlineVersionEntry) ? 'bg-studio-amber-soft text-studio-amber-contrast' : 'bg-studio-cyan-soft text-studio-cyan-contrast'}`}
              >
                {outlineVersionsLoadState === 'loading'
                  ? `正在读取来源大纲版本 ${requestedOutlineVersion}…`
                  : outlineVersionsLoadState === 'error'
                    ? `来源大纲版本 ${requestedOutlineVersion} 读取失败；不会用当前大纲替代。`
                    : requestedOutlineVersionEntry
                      ? `正在查看创作初稿引用的大纲版本 ${requestedOutlineVersion}。`
                      : `来源大纲版本 ${requestedOutlineVersion} 当前无法定位；没有回退到最新大纲。`}
              </p>
            ) : null}
            {outlineVersionsLoadState === 'error' ? (
              <button type="button" onClick={() => void reloadOutlineVersions()} className="xmt-btn-secondary mt-2 min-h-9 px-3 text-xs">
                重新加载大纲历史
              </button>
            ) : null}
            {outlineVersions.length > 0 ? (
              <ol className="mt-3 space-y-2">
                {outlineVersions.map((version) => (
                  <li
                    key={version.id}
                    ref={!version.is_baseline && version.version === requestedOutlineVersion ? requestedOutlineCardRef : undefined}
                    className={`rounded-lg border border-studio-border-soft bg-studio-surface-soft px-3 py-2 text-xs ${!version.is_baseline && version.version === requestedOutlineVersion ? 'ring-2 ring-studio-focus-ring' : ''}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-studio-text-primary">{version.is_baseline ? '历史原稿（时间未记录）' : `${version.version} · ${version.change_type === 'major' ? '大版本' : '小版本'}`}</span>
                      <span className="text-studio-text-muted">{version.is_baseline ? '旧内容未记录操作人和时间' : `${version.operator_name || '系统记录'} · ${version.created_at || '时间未记录'}`}</span>
                    </div>
                    <details className="mt-2" open={!version.is_baseline && version.version === requestedOutlineVersion}>
                      <summary className="min-h-8 cursor-pointer py-1 font-medium text-studio-primary-contrast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-focus-ring">查看此版本正文</summary>
                      <div className={`editor-content-preview tiptap mt-2 max-h-80 overflow-auto rounded-lg border border-studio-border-soft ${styles.bgTertiary} p-4 leading-relaxed ${styles.textPrimary}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(normalizeLegacyEditorHtmlTheme(version.content)) }} />
                    </details>
                  </li>
                ))}
              </ol>
            ) : <p className="mt-3 text-xs text-studio-text-muted">暂无已保存版本</p>}
          </section>
        </div>

        {isEditing && (
          <div className="flex gap-3 mb-6">
            <button
              onClick={handleSave}
              disabled={isAggregateSaving || !canPersistTopicDraft}
              className="flex items-center gap-2 rounded-lg bg-studio-primary-button px-4 py-2 text-white transition-colors hover:bg-studio-primary-button"
            >
              <Save className="w-4 h-4" />
              保存
            </button>
            <button
              onClick={handleCancel}
              className={`px-4 py-2 ${styles.bgTertiary} ${styles.hoverBg} ${styles.textPrimary} rounded-lg transition-colors flex items-center gap-2`}
            >
              取消
            </button>
          </div>
        )}
        {topicSaveFeedback ? (
          <p role="alert" className="mb-6 rounded-xl border border-studio-coral/30 bg-studio-coral/10 px-4 py-3 text-sm text-studio-coral-contrast">
            {topicSaveFeedback}
          </p>
        ) : null}

        <TopicResourcesPanel topicId={topic.id} canManage={canEditTopic && canManageTopicResources} />
        <TopicAssetDimensionsPanel key={topic.id} topicId={topic.id} canManage={canEditTopic} />

        <div className="mb-6">
          <h3 className={`${styles.textSecondary} text-sm mb-4`}>流程进度</h3>
          {missingCurrentStageRecord && currentStageRecord && (
            <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-studio-border-soft bg-studio-amber-soft p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-studio-amber-contrast" />
                <div>
                  <p className="font-medium text-studio-amber-contrast">当前阶段缺少{currentStageRecordLabel}记录</p>
                  <p className="mt-1 text-sm text-studio-text-secondary">
                    {topic.status === 'completed'
                      ? '选题已完成，请先核对发布历史；系统不会自动补建历史发布数据。'
                      : '请先补齐当前阶段记录，再推进到下一阶段。补齐不会改变选题状态，操作会记入历史。'}
                  </p>
                </div>
              </div>
              {topic.status !== 'completed' && canEditTopic && (
                <ActionButton type="button" variant="primary" disabled={repairingStageRecord} onClick={() => void handleRepairStageRecord()}>
                  {repairingStageRecord ? '正在补齐…' : `补齐${currentStageRecordLabel}记录`}
                </ActionButton>
              )}
            </div>
          )}
          <div role="group" aria-label="选题流程进度" className="flex max-w-full items-center gap-2 overflow-x-auto pb-2">
            {workflowSteps.map((step, index) => {
              const isCompleted = workflowSteps.findIndex(s => s.status === topic.status) >= index;
              const isCurrent = step.status === topic.status;
              const Icon = step.icon;
              
              return (
                <div key={step.status} className="flex items-center">
                  <div className={`flex flex-col items-center ${isCurrent ? 'scale-110' : ''}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isCurrent ? 'bg-studio-primary-button text-white' : isCompleted ? 'bg-studio-success/15 text-studio-success-contrast' : `${styles.bgTertiary} text-studio-text-muted`
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className={`text-xs mt-2 ${
                      isCurrent ? 'text-studio-primary-contrast font-medium' :
                      isCompleted ? 'text-studio-success-contrast' :
                      'text-studio-text-muted'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                  {index < workflowSteps.length - 1 && (
                    <div className={`w-16 h-1 mx-2 rounded-full ${isCompleted ? 'bg-studio-success' : styles.progressBg}`}></div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mb-6">
          <h3 className={`${styles.textSecondary} text-sm mb-4`}>操作</h3>
          <div className="flex flex-wrap gap-3">
            {topic.status === 'pending' && canAudit && (
              <button
                onClick={() => setShowAuditModal(true)}
                className="flex items-center gap-2 rounded-lg bg-studio-primary-button px-4 py-2 text-white transition-colors hover:bg-studio-primary-button"
              >
                <CheckCircle className="w-4 h-4" />
                审核选题
              </button>
            )}
            {canStartProduction && (topic.status === 'approved' || topic.status === 'production') && (
              <button
                onClick={() => { void handleStartProduction(); }}
                disabled={startingProduction}
                className="flex items-center gap-2 rounded-lg bg-studio-primary-button px-4 py-2 font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FileIcon className="h-4 w-4" />
                {startingProduction ? '正在准备…' : topic.status === 'approved' ? '开始创作' : '进入创作'}
              </button>
            )}
            {!isEditing && (
              permissionsLoading || canEditTopic ? (
                <button
                  onClick={beginEditingTopic}
                  className={`px-4 py-2 ${styles.bgTertiary} ${styles.hoverBg} ${styles.textPrimary} rounded-lg transition-colors flex items-center gap-2`}
                >
                  <FileText className="w-4 h-4" />
                  编辑选题
                </button>
              ) : (
                <p role="status" className="text-sm text-studio-text-muted">
                  当前账号仅可查看此选题
                </p>
              )
            )}
            {canEditTopic && !missingCurrentStageRecord && (topic.status === 'shooting' || topic.status === 'publishing') && (
              <button
                onClick={() => handleUpdateStatus(nextStatuses[topic.status])}
                className="xmt-btn xmt-btn-primary"
              >
                <ArrowRight className="w-4 h-4" />
                推进到下一阶段
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={`${styles.bgSecondary} rounded-xl p-6 ${styles.border}`}>
        <h3 className={`text-lg font-semibold ${styles.textPrimary} mb-4`}>历史记录</h3>
        {topic.history && topic.history.length > 0 ? (
          <div className="space-y-3">
            {topic.history.map((record) => (
              <div key={record.id} className={`${styles.bgTertiary} rounded-lg p-4`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`${styles.textPrimary} font-medium`}>{record.operator_name}</span>
                  <span className={`${styles.textSecondary} text-sm`}>{formatBeijingTime(record.created_at)}</span>
                </div>
                <p className={`${styles.textPrimary}`}>{record.comment}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className={`${styles.textSecondary} text-center py-8`}>暂无历史记录</p>
        )}
      </div>

      {showAuditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-modal">
          <div className={`${styles.bgSecondary} rounded-xl p-6 w-full max-w-lg mx-4 ${styles.border}`}>
            <h2 className={`text-xl font-bold ${styles.textPrimary} mb-6`}>审核选题</h2>
            
            <div className="space-y-4">
              <div>
                <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>审核结果</label>
                <div className="flex gap-4">
                  <button
                    onClick={() => setAuditData({ ...auditData, status: 'approved' })}
                    className={`flex-1 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
                      auditData.status === 'approved' 
                        ? 'border border-studio-success/30 bg-studio-success-soft text-studio-success-contrast'
                        : `${styles.bgTertiary} ${styles.textPrimary} ${styles.hoverBg}`
                    }`}
                  >
                    <CheckCircle className="w-5 h-5" />
                    审核通过
                  </button>
                  <button
                    onClick={() => setAuditData({ ...auditData, status: 'rejected' })}
                    className={`flex-1 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
                      auditData.status === 'rejected' 
                        ? 'border border-studio-coral/30 bg-studio-coral-soft text-studio-coral-contrast'
                        : `${styles.bgTertiary} ${styles.textPrimary} ${styles.hoverBg}`
                    }`}
                  >
                    <XCircle className="w-5 h-5" />
                    驳回修改
                  </button>
                </div>
              </div>
              
              {auditData.status === 'approved' && (
                <div>
                  <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>指派负责人</label>
                  <select
                    value={auditData.assignee_id}
                    onChange={(e) => setAuditData({ ...auditData, assignee_id: parseInt(e.target.value) })}
                    className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-studio-primary`}
                  >
                    <option value={0}>请选择负责人</option>
                    {users.filter(u => u.enabled && u.role !== 'admin').map(user => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                  </select>
                </div>
              )}
              
              <div>
                <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>审核意见</label>
                <textarea
                  value={auditData.comment}
                  onChange={(e) => setAuditData({ ...auditData, comment: e.target.value })}
                  rows={3}
                  className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-studio-primary resize-none ${styles.textPlaceholder}`}
                  placeholder="请输入审核意见..."
                />
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowAuditModal(false)}
                  className={`flex-1 px-4 py-2 ${styles.bgTertiary} ${styles.hoverBg} ${styles.textPrimary} rounded-lg transition-colors`}
                >
                  取消
                </button>
                <button
                  onClick={handleAudit}
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                    auditData.status === 'approved'
                      ? 'border border-studio-success/30 bg-studio-success-soft text-studio-success-contrast hover:bg-studio-success-soft'
                      : 'border border-studio-coral/30 bg-studio-coral-soft text-studio-coral-contrast hover:bg-studio-coral-soft'
                  }`}
                >
                  {auditData.status === 'approved' ? '通过审核' : '驳回选题'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <BaseModal
        open={topicLeaveState === 'dirty' || topicLeaveState === 'saving' || topicLeaveState === 'failed'}
        onClose={continueTopicEditing}
        title={topicLeaveState === 'failed' ? '保存失败，无法离开' : '存在未保存的修改'}
        description={topicLeaveState === 'failed'
          ? '保存未完成。您可以重试保存，放弃本次修改后离开，或继续编辑。'
          : '离开前请选择保存当前选题修改，或明确放弃本次修改。'}
        size="sm"
        closeOnOverlayClick={topicLeaveState !== 'saving'}
        footer={
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={continueTopicEditing}
              disabled={topicLeaveState === 'saving'}
              className={`rounded-xl px-4 py-2.5 text-sm disabled:opacity-60 ${styles.buttonSecondary}`}
            >
              继续编辑
            </button>
            <button
              type="button"
              onClick={() => { void discardTopicAndLeave(); }}
              disabled={topicLeaveState === 'saving'}
              className="xmt-btn xmt-btn-danger rounded-xl disabled:opacity-60"
            >
              放弃离开
            </button>
            <button
              type="button"
              onClick={() => { void saveTopicAndLeave(); }}
              disabled={topicLeaveState === 'saving'}
              className="xmt-btn xmt-btn-primary rounded-xl disabled:opacity-60"
            >
              {topicLeaveState === 'saving' ? '正在保存…' : '保存并离开'}
            </button>
          </div>
        }
      >
        <p className={`text-sm leading-6 ${styles.textSecondary}`}>
          系统检测到当前选题还有未保存的修改。保存完成后会自动前往你刚才选择的页面。
        </p>
      </BaseModal>
    </div>
  );
}
