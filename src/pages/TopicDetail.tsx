import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore, useAppStore } from '../store';
import { getTopic, auditTopic, updateTopicStatus, updateTopic } from '../api';
import { getUsers } from '../api';
import { Topic, User } from '../types';
import { ChevronLeft, Clock, User as UserIcon, Calendar, FileText, CheckCircle, XCircle, ArrowRight, Save, AlertTriangle, Camera, Scissors, Send, List, FileText as FileIcon } from 'lucide-react';
import ContentEditor from '../components/ContentEditor';
import BaseModal from '../components/common/BaseModal';
import { createTopicDetailManualAdapter } from '../editor/adapters/topicDetailManualAdapter';
import type { ContentEditorRuntimeHandle, ContentEditorSaveContext } from '../editor/contracts/contentEditorAdapter';
import { getCurrentTopicEditorModePolicy } from '../editor/topic/topicEditorModePolicy';
import { useTopicDetailLeaveGuard } from '../hooks/useTopicDetailLeaveGuard';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { normalizeLegacyEditorHtmlTheme } from '../utils/editorTheme';
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
import { resolveTopicDetailEditorBranch, type TopicDetailEditorBranch } from './topicDetailEditorBranch';

export default function TopicDetail() {
  const { id } = useParams<{ id: string }>();
  const topicEditorModePolicy = useMemo(() => getCurrentTopicEditorModePolicy(), []);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuditModal, setShowAuditModal] = useState(false);
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
  ) => Promise<void>>(async () => {
    throw new Error('Topic aggregate save command is not ready');
  });
  const [hasTopicManualRuntimeHandle, setHasTopicManualRuntimeHandle] = useState(false);
  const [topicEditorBranch, setTopicEditorBranch] = useState<TopicDetailEditorBranch>(() => (
    resolveTopicDetailEditorBranch(0, true, topicEditorModePolicy)
  ));
  
  const navigate = useNavigate();
  const authStore = useAuthStore();
  const appStore = useAppStore();
  const styles = useThemeStyles();
  const { hasPermission, loading: permissionsLoading } = usePermission();
  const contentEditRoles = new Set(['admin', 'editor', 'copywriter', 'post_production', 'camera']);
  const persistTopicManualBridge = useCallback(async (_content: string, context: ContentEditorSaveContext) => {
    const snapshot = manualSaveSnapshotsRef.current.get(context.contentRevision);
    if (!snapshot) throw new Error('Topic manual save snapshot is unavailable');
    await aggregatePersistCommandRef.current(snapshot, context.contentRevision);
  }, []);
  const handleTopicRuntimeHandleChange = useCallback((handle: ContentEditorRuntimeHandle | null) => {
    topicRuntimeHandleRef.current = handle;
    setHasTopicManualRuntimeHandle(Boolean(handle?.manualSave));
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const topicData = await getTopic(parseInt(id!));
        setTopic(topicData);
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
        appStore.addNotification({ title: '获取选题详情失败', message: (error as Error).message, type: 'error' });
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [id]);

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
    try {
      await auditTopic(parseInt(id!), auditData);
      appStore.addNotification({ 
        title: '审核成功', 
        message: auditData.status === 'approved' ? '选题已通过审核' : '选题已驳回', 
        type: 'success' 
      });
      setShowAuditModal(false);
      const topicData = await getTopic(parseInt(id!));
      setTopic(topicData);
    } catch (error) {
      appStore.addNotification({ title: '审核失败', message: (error as Error).message, type: 'error' });
    }
  };

  const handleUpdateStatus = async (status: string) => {
    try {
      await updateTopicStatus(parseInt(id!), status);
      appStore.addNotification({ title: '状态更新成功', message: '选题状态已更新', type: 'success' });
      const topicData = await getTopic(parseInt(id!));
      setTopic(topicData);
    } catch (error) {
      appStore.addNotification({ title: '更新失败', message: (error as Error).message, type: 'error' });
    }
  };

  const persistTopicAggregate = (saveSnapshot: TopicDetailAggregateDraft, saveRevision: number) => (
    aggregateSaveGateRef.current.run(async () => {
      setIsAggregateSaving(true);
      try {
        await updateTopic(parseInt(id!), buildTopicDetailUpdatePayload(saveSnapshot));
        const topicData = await getTopic(parseInt(id!));
        setTopic(topicData);
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
          // A stale response confirms only an older snapshot. Keep the current
          // baseline so that it cannot clear or redefine a newer local draft.
          setIsTopicDirty(!baselineDraftRef.current || !topicDetailDraftEquals(draftRef.current, baselineDraftRef.current));
        }
        appStore.addNotification({ title: '保存成功', message: '选题信息已更新', type: 'success' });
      } catch (error) {
        appStore.addNotification({ title: '保存失败', message: (error as Error).message, type: 'error' });
        throw error;
      } finally {
        setIsAggregateSaving(false);
      }
    })
  );

  aggregatePersistCommandRef.current = persistTopicAggregate;

  const performTopicManualSave = (): Promise<void> => {
    const saveRevision = aggregateRevisionRef.current;
    const saveSnapshot = cloneTopicDetailDraft(draftRef.current);

    if (!topicEditorBranch.usesRuntimeManualSave) {
      return persistTopicAggregate(saveSnapshot, saveRevision);
    }
    const runtimeHandle = topicRuntimeHandleRef.current;

    if (!runtimeHandle?.manualSave) {
      appStore.addNotification({ title: '保存不可用', message: '编辑器保存能力尚未就绪，请稍后重试。', type: 'error' });
      return Promise.reject(new Error('Topic manual save is unavailable'));
    }

    manualSaveSnapshotsRef.current.set(saveRevision, saveSnapshot);
    return runtimeHandle.manualSave(saveSnapshot.outline, saveRevision).then((result) => {
      manualSaveSnapshotsRef.current.delete(saveRevision);
      if (result.status === 'saved') return;
      if (result.status === 'failed') throw result.error;
      if (result.status === 'already_destroyed') {
        appStore.addNotification({ title: '保存失败', message: '编辑器已释放，未能保存当前修改。', type: 'error' });
        throw new Error('Topic manual save was destroyed');
      }
      throw new Error('Topic manual save was cancelled');
    });
  };

  const handleSave = () => {
    void performTopicManualSave().catch(() => undefined);
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
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    approved: 'bg-green-500/20 text-green-400 border-green-500/30',
    rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
    production: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    shooting: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    publishing: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    completed: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
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

  const canAudit = hasPermission('topic:audit');
  const canEditTopicPermission = hasPermission('topic:update');
  const canEditTopic = Boolean(
    topic &&
      canEditTopicPermission &&
      (
        contentEditRoles.has(authStore.user?.role || '') ||
        Number(topic.creator_id) === authStore.user?.id ||
        Number(topic.assignee_id) === authStore.user?.id
      ),
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
        title: '无编辑权限',
        message: '当前账号没有编辑选题的权限。',
        type: 'warning',
      });
      return;
    }

    setEditTitle(true);
    setEditDetails(true);
    setEditDescription(true);
    setEditOutline(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!topic) {
    return <p className="text-gray-400 text-center py-8">选题不存在</p>;
  }

  const isEditing = editTitle || editDetails || editDescription || editOutline;
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
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
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
                  className={`text-2xl font-bold ${styles.textPrimary} ${styles.bgInput} border border-blue-500 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 w-96`}
                  autoFocus
                />
              ) : (
                <h1
                  className={`text-2xl font-bold ${styles.textPrimary} cursor-pointer hover:text-blue-400 transition-colors`}
                  onClick={() => {
                    if (canEditTopic) setEditTitle(true);
                  }}
                >
                  {title}
                </h1>
              )}
              {isOverdue && (
                <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded-full border border-red-500/30 flex items-center gap-1">
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
                className={`w-full px-3 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
              >
                <option value={0}>未分配</option>
                {users.filter(u => u.enabled).map(user => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            ) : (
              <p
                className={`${styles.textPrimary} font-medium cursor-pointer hover:text-blue-400 transition-colors`}
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
                className={`w-full px-3 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
            ) : (
              <p
                className={`font-medium cursor-pointer transition-colors ${isOverdue ? 'text-red-400 hover:text-red-300' : `${styles.textPrimary} hover:text-blue-400`}`}
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
                className={`w-full px-3 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500 ${styles.textPlaceholder}`}
                placeholder="输入发布平台"
              />
            ) : (
              <p
                className={`${styles.textPrimary} font-medium cursor-pointer hover:text-blue-400 transition-colors`}
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
                <button onClick={() => setEditDescription(true)} className="text-xs text-blue-400 hover:text-blue-300">编辑</button>
              )}
            </div>
            {editDescription ? (
              <textarea
                value={parsedFields.projectBackground}
                onChange={(e) => changeParsedFields({ ...parsedFields, projectBackground: e.target.value })}
                rows={4}
                className={`w-full px-3 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none`}
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
                <button onClick={() => setEditDescription(true)} className="text-xs text-blue-400 hover:text-blue-300">编辑</button>
              )}
            </div>
            {editDescription ? (
              <textarea
                value={parsedFields.targetAudience}
                onChange={(e) => changeParsedFields({ ...parsedFields, targetAudience: e.target.value })}
                rows={4}
                className={`w-full px-3 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none`}
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
                <button onClick={() => setEditOutline(true)} className="text-xs text-blue-400 hover:text-blue-300">编辑大纲</button>
              )}
            </div>
          </div>
          {editOutline ? (
            activeTopicEditorBranch.usesRuntimeManualSave ? (
              <ContentEditor
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
                value={scriptContent}
                onChange={changeOutline}
                mode={activeTopicEditorBranch.contentEditorMode}
                readOnly={activeTopicEditorBranch.readonly}
                collaborationEnabled={false}
              />
            )
          ) : (
            <div className={`editor-content-preview tiptap ${styles.bgTertiary} rounded-lg p-6 ${styles.textPrimary} min-h-[200px] leading-relaxed`} dangerouslySetInnerHTML={{ __html: normalizeLegacyEditorHtmlTheme(scriptContent || '暂无大纲内容') }}></div>
          )}
        </div>

        {isEditing && (
          <div className="flex gap-3 mb-6">
            <button
              onClick={handleSave}
              disabled={isAggregateSaving}
              className={`px-4 py-2 bg-blue-600 hover:bg-blue-700 ${styles.textPrimary} rounded-lg transition-colors flex items-center gap-2`}
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

        <div className="mb-6">
          <h3 className={`${styles.textSecondary} text-sm mb-4`}>流程进度</h3>
          <div className="flex items-center gap-2">
            {workflowSteps.map((step, index) => {
              const isCompleted = workflowSteps.findIndex(s => s.status === topic.status) >= index;
              const isCurrent = step.status === topic.status;
              const Icon = step.icon;
              
              return (
                <div key={step.status} className="flex items-center">
                  <div className={`flex flex-col items-center ${isCurrent ? 'scale-110' : ''}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isCurrent ? 'bg-blue-600 text-white' : isCompleted ? 'bg-green-500/20 text-green-400' : `${styles.bgTertiary} text-gray-500`
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className={`text-xs mt-2 ${
                      isCurrent ? 'text-blue-400 font-medium' :
                      isCompleted ? 'text-green-400' :
                      'text-gray-500'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                  {index < workflowSteps.length - 1 && (
                    <div className={`w-16 h-1 mx-2 rounded-full ${isCompleted ? 'bg-green-500' : styles.progressBg}`}></div>
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
                className={`px-4 py-2 bg-blue-600 hover:bg-blue-700 ${styles.textPrimary} rounded-lg transition-colors flex items-center gap-2`}
              >
                <CheckCircle className="w-4 h-4" />
                审核选题
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
                <span className={`px-4 py-2 ${styles.bgTertiary} ${styles.textSecondary} rounded-lg flex items-center gap-2`}>
                  <FileText className="w-4 h-4" />
                  无编辑权限
                </span>
              )
            )}
            {canEditTopic && topic.status !== 'completed' && topic.status !== 'rejected' && (
              <button
                onClick={() => handleUpdateStatus(nextStatuses[topic.status])}
                className={`px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 ${styles.textPrimary} font-semibold rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2`}
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`${styles.bgSecondary} rounded-xl p-6 w-full max-w-lg mx-4 ${styles.border}`}>
            <h2 className={`text-xl font-bold ${styles.textPrimary} mb-6`}>审核选题</h2>
            
            <div className="space-y-4">
              <div>
                <label className={`block text-gray-300 text-sm font-medium mb-2`}>审核结果</label>
                <div className="flex gap-4">
                  <button
                    onClick={() => setAuditData({ ...auditData, status: 'approved' })}
                    className={`flex-1 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
                      auditData.status === 'approved' 
                        ? 'bg-green-600 text-white' 
                        : `${styles.bgTertiary} text-gray-300 ${styles.hoverBg}`
                    }`}
                  >
                    <CheckCircle className="w-5 h-5" />
                    审核通过
                  </button>
                  <button
                    onClick={() => setAuditData({ ...auditData, status: 'rejected' })}
                    className={`flex-1 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
                      auditData.status === 'rejected' 
                        ? 'bg-red-600 text-white' 
                        : `${styles.bgTertiary} text-gray-300 ${styles.hoverBg}`
                    }`}
                  >
                    <XCircle className="w-5 h-5" />
                    驳回修改
                  </button>
                </div>
              </div>
              
              {auditData.status === 'approved' && (
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">指派负责人</label>
                  <select
                    value={auditData.assignee_id}
                    onChange={(e) => setAuditData({ ...auditData, assignee_id: parseInt(e.target.value) })}
                    className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  >
                    <option value={0}>请选择负责人</option>
                    {users.filter(u => u.enabled && u.role !== 'admin').map(user => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                  </select>
                </div>
              )}
              
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">审核意见</label>
                <textarea
                  value={auditData.comment}
                  onChange={(e) => setAuditData({ ...auditData, comment: e.target.value })}
                  rows={3}
                  className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${styles.textPlaceholder}`}
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
                    auditData.status === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                  } text-white`}
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
              className="rounded-xl bg-red-600 px-4 py-2.5 text-sm text-white transition-colors hover:bg-red-700 disabled:opacity-60"
            >
              放弃离开
            </button>
            <button
              type="button"
              onClick={() => { void saveTopicAndLeave(); }}
              disabled={topicLeaveState === 'saving'}
              className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm text-white transition-colors hover:bg-brand-400 disabled:opacity-60"
            >
              {topicLeaveState === 'saving' ? '正在保存…' : '保存并离开'}
            </button>
          </div>
        }
      >
        <p className={`text-sm leading-6 ${styles.textSecondary}`}>
          当前提示只依据 TopicDetail 的 aggregate draft 是否相对 baseline 发生变化；不会使用编辑器 Runtime dispose 结果判断保存完成。
        </p>
      </BaseModal>
    </div>
  );
}
