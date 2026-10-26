import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppStore, useAuthStore } from '../store';
import { getUsers } from '../api';
import ContentEditor from '../components/ContentEditor';
import { ChevronLeft, FileText, List, Send, Save, Eye, EyeOff } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { formatBeijingDate } from '../lib/utils';
import { getPlatformLabel } from '../platform/platform-labels';
import { normalizeLegacyEditorHtmlTheme } from '../utils/editorTheme';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { celebrateMilestone } from '../utils/confetti';
import SimilarTopicReview from '../components/topics/SimilarTopicReview';
import CreatorTopicSuggestionReference from '../components/topics/CreatorTopicSuggestionReference';
import TopicDraftPicker from '../components/topics/TopicDraftPicker';
import { findSimilarTopicsByTitle, normalizeTopicTitle, type SimilarTopic } from '../utils/topic-title-similarity';
import { creatorTopicSuggestionSourceFromDraft } from '../utils/creatorTopicSuggestionSource';
import { emitClientLog, safeClientErrorClass } from '../observability/client-logger';
import { hasTopicDraftContent } from '../utils/topicDraft';
import { useTopicDraftCollection } from '../hooks/useTopicDraftCollection';
import { useTopicCreateRecovery } from '../hooks/useTopicCreateRecovery';
import type { TopicCreatePayload, TopicCreateRecovery } from '../utils/topicCreateRecovery';
import type { User } from '../types';
import { ActionButton } from '../components/studio';

export default function AddTopic() {
  const navigate = useNavigate();
  const location = useLocation();
  const appStore = useAppStore();
  const authStore = useAuthStore();
  const styles = useThemeStyles();
  const userId = authStore.user?.id;
  const draftState = useTopicDraftCollection(userId, Boolean(userId));
  const formData = draftState.form;
  const setFormData = draftState.setForm;
  const hasLocalDraft = draftState.drafts.some((entry) => entry.id === draftState.activeDraftId);
  const draftStorageUnavailable = draftState.storageUnavailable;
  
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoadState, setUsersLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const usersRequestSequenceRef = useRef(0);
  const userDirectoryScope = `${userId ?? ''}:${authStore.user?.role ?? ''}:${authStore.token ?? ''}`;
  const userDirectoryScopeRef = useRef(userDirectoryScope);
  userDirectoryScopeRef.current = userDirectoryScope;
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
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
    appStore.addNotification({ title: '提报成功', message: recovered ? '服务器已确认选题创建成功。' : '选题已成功提交审核', type: 'success' });
    if (!draftRemoved) {
      appStore.addNotification({
        title: '本机草稿已保留',
        message: '选题已成功创建；为避免删除可能更新过的内容，本机草稿未自动清理，请勿重复提报。',
        type: 'warning',
      });
    }
    celebrateMilestone();
    navigate(`/topics/${topicId}`);
  }, [appStore, draftState, navigate]);
  const createRecovery = useTopicCreateRecovery(userId, finishTopicCreation);

  useEffect(() => {
    setSimilarTopicReview(null);
    reviewedTitle.current = null;
  }, [userId]);

  const loadUsers = useCallback(async (requestScope: string) => {
    const requestId = ++usersRequestSequenceRef.current;
    setUsersLoadState('loading');
    try {
      const userList = await getUsers();
      if (requestId !== usersRequestSequenceRef.current || requestScope !== userDirectoryScopeRef.current) return;
      setUsers(userList.data || []);
      setUsersLoadState('ready');
    } catch (error) {
      if (requestId !== usersRequestSequenceRef.current || requestScope !== userDirectoryScopeRef.current) return;
      emitClientLog({ event: 'topics.user_list_load_failed', level: 'error', fields: { errorClass: safeClientErrorClass(error) } });
      setUsersLoadState('error');
    }
  }, []);

  useEffect(() => {
    setUsers([]);
    void loadUsers(userDirectoryScope);
    return () => { usersRequestSequenceRef.current += 1; };
  }, [loadUsers, userDirectoryScope]);

  const handleSubmit = async (confirmedTitle?: string) => {
    if (submitInFlight.current || createRecovery.locked || !createRecovery.ready) return;
    const submissionActorId = Number(userId);
    if (!Number.isSafeInteger(submissionActorId) || submissionActorId <= 0) return;
    const submittedForm = { ...formData };
    const title = (confirmedTitle ?? formData.title).trim();
    if (!title) {
      appStore.addNotification({ title: '提示', message: '请输入选题标题', type: 'warning' });
      return;
    }

    submitInFlight.current = true;
    setSubmitting(true);
    try {
      if (hasTopicDraftContent(submittedForm)) draftState.saveCurrentDraft();
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

      // description 只存项目背景和目标受众
      const parts: string[] = [];
      if (submittedForm.projectBackground) parts.push(`【项目背景】\n${submittedForm.projectBackground}`);
      if (submittedForm.targetAudience) parts.push(`【目标受众】\n${submittedForm.targetAudience}`);

      const payload: TopicCreatePayload = {
        title,
        description: parts.join('\n\n'),
        outline: submittedForm.outline || undefined,
        platform: submittedForm.platform,
        deadline: submittedForm.deadline,
        assignee_id: submittedForm.assignee_id ? parseInt(submittedForm.assignee_id) : null,
        creator_suggestion_source: creatorTopicSuggestionSourceFromDraft(location.search, submittedForm.projectBackground),
      };
      await createRecovery.create(payload, draftState.activeDraftId, submittedForm);
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
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
    void handleSubmit(title);
  };

  const handleSaveDraft = () => {
    if (!userId) {
      appStore.addNotification({ title: '保存失败', message: '请重新登录后保存草稿', type: 'error' });
      return;
    }
    if (!hasTopicDraftContent(formData)) {
      appStore.addNotification({ title: '保存失败', message: '请先填写选题内容', type: 'warning' });
      return;
    }
    if (!draftState.saveCurrentDraft().saved) {
      appStore.addNotification({ title: '保存失败', message: '本机无法保存草稿，请检查浏览器存储空间', type: 'error' });
      return;
    }
    appStore.addNotification({ title: '已存本机草稿', message: '下次在这台设备打开提报页可继续编辑；尚未提交审核', type: 'success' });
  };

  const draftOperationFailed = () => appStore.addNotification({ title: '草稿未能保存', message: '本机存储暂不可用，请检查浏览器存储空间后重试。', type: 'error' });

  return (
    <>
    {(createRecovery.message || createRecovery.pending) ? (
      <section role="status" aria-live="polite" className="mb-5 rounded-xl border border-studio-amber/30 bg-studio-amber/10 px-4 py-3 text-sm text-studio-text-secondary">
        <p>{createRecovery.message || '选题创建结果尚未核实；为避免重复创建，原表单已锁定。'}</p>
        {createRecovery.pending?.phase === 'uncertain' || createRecovery.pending?.phase === 'rejected' ? (
          <button type="button" onClick={() => void createRecovery.verify()} className="mt-3 rounded-lg border border-studio-border-soft px-3 py-2 font-medium text-studio-text-primary">
            只读重新核实创建状态
          </button>
        ) : null}
        {createRecovery.pending?.phase === 'rejected' && createRecovery.pending.confirmedNotFound ? (
          <button type="button" onClick={createRecovery.releaseRejected} className="mt-3 ml-2 rounded-lg bg-studio-primary-button px-3 py-2 font-medium text-white">
            确认服务端未创建并解除本次锁定
          </button>
        ) : null}
        {createRecovery.pending?.phase === 'cleanup_failed' ? (
          <button type="button" onClick={createRecovery.retryCleanup} className="mt-3 rounded-lg border border-studio-border-soft px-3 py-2 font-medium text-studio-text-primary">
            重试清理恢复记录并继续
          </button>
        ) : null}
        {createRecovery.pending?.phase === 'not_found' ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void createRecovery.retry()} className="rounded-lg bg-studio-primary-button px-3 py-2 font-medium text-white">
              确认用原内容和同一编号重试
            </button>
            <button type="button" onClick={() => void createRecovery.verify()} className="rounded-lg border border-studio-border-soft px-3 py-2 font-medium text-studio-text-primary">
              再次只读核实
            </button>
          </div>
        ) : null}
      </section>
    ) : null}
    <fieldset disabled={submitting || createRecovery.locked} aria-busy={submitting || createRecovery.pending?.phase === 'checking'} className="min-w-0 space-y-6 border-0 p-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <button
            onClick={() => navigate('/topics')}
            className={`flex items-center gap-2 whitespace-nowrap text-studio-text-muted ${styles.textSecondary} transition-colors`}
          >
            <ChevronLeft className="w-5 h-5" />
            返回选题列表
          </button>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-2 rounded-lg transition-colors ${
              showPreview 
                ? 'bg-studio-primary-button text-white'
                : `${styles.buttonSecondary}`
            }`}
          >
            {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showPreview ? '编辑模式' : '预览'}
          </button>
          <button
            onClick={handleSaveDraft}
            disabled={submitting}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-2 ${styles.buttonSecondary} rounded-lg transition-colors`}
          >
            <Save className="w-4 h-4" />
            存本机草稿
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="flex shrink-0 items-center gap-2 whitespace-nowrap px-6 py-2 disabled:bg-studio-surface-soft text-white rounded-lg transition-colors xmt-btn-primary"
          >
            <Send className="w-4 h-4" />
            {submitting ? '提交中...' : '提报选题'}
          </button>
        </div>
      </div>

      {draftStorageUnavailable && (
        <p role="status" className="rounded-panel border border-studio-coral/30 bg-studio-coral/10 px-4 py-3 text-sm text-studio-coral-contrast">
          本机存储不可用，最新内容未能保存；请检查浏览器存储空间。当前页面仍保留输入。
        </p>
      )}

      {hasLocalDraft && (
        <p role="status" className="rounded-panel border border-studio-border-soft bg-studio-surface-soft px-4 py-3 text-sm text-studio-text-secondary">
          当前账号的提报内容会自动保存在本机；提交审核成功后才会创建选题。
        </p>
      )}

      <TopicDraftPicker
        drafts={draftState.drafts}
        activeDraftId={draftState.activeDraftId}
        onSelect={draftState.selectDraft}
        onCreate={draftState.startNewDraft}
        onDelete={draftState.deleteDraft}
        onFailure={draftOperationFailed}
      />

      <CreatorTopicSuggestionReference background={formData.projectBackground} disabled={submitting} onApply={(reference) => setFormData(current => ({ ...current, projectBackground: [current.projectBackground, reference].filter(Boolean).join('\n\n') }))} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className={`${styles.bgSecondary} rounded-xl ${styles.border} overflow-hidden`}>
            <div className={`px-6 py-4 border-b ${styles.border}`}>
              <h2 className={`text-lg font-medium ${styles.textPrimary} flex items-center gap-2`}>
                <FileText className="w-5 h-5 text-studio-primary" />
                基本信息
              </h2>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>选题标题 *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className={`w-full px-4 py-3 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing} text-lg`}
                  placeholder="请输入选题标题"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>发布平台</label>
                  <input
                    type="text"
                    value={formData.platform}
                    onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                    className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing}`}
                    placeholder="如：抖音、快手"
                  />
                </div>
                <div>
                  <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>截止日期</label>
                  <input
                    type="date"
                    value={formData.deadline}
                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                    className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing}`}
                  />
                </div>
                <div>
                  <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>负责人</label>
                  <select
                    value={formData.assignee_id}
                    onChange={(e) => setFormData({ ...formData, assignee_id: e.target.value })}
                    disabled={usersLoadState === 'loading'}
                    className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing}`}
                  >
                    <option value="">选择负责人</option>
                    {formData.assignee_id && !users.some(user => String(user.id) === formData.assignee_id) ? (
                      <option value={formData.assignee_id}>
                        已保存负责人（{usersLoadState === 'error' ? '名单暂不可用' : '暂未匹配'}）
                      </option>
                    ) : null}
                    {users.map(user => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                  </select>
                  {usersLoadState === 'loading' && users.length === 0 ? (
                    <p role="status" className="mt-2 text-xs text-studio-text-secondary">正在读取负责人名单…</p>
                  ) : null}
                  {usersLoadState === 'error' ? (
                    <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-3 py-2 text-xs text-studio-amber-contrast">
                      <span>负责人名单暂时无法读取，可重试后再选择；当前表单和已保存的负责人选择会保留。</span>
                      <ActionButton type="button" variant="ghost" onClick={() => void loadUsers(userDirectoryScope)}>重新加载负责人名单</ActionButton>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className={`${styles.bgSecondary} rounded-xl ${styles.border} overflow-hidden`}>
            <div className={`px-6 py-4 border-b ${styles.border}`}>
              <h2 className={`text-lg font-medium ${styles.textPrimary} flex items-center gap-2`}>
                <FileText className="w-5 h-5 text-studio-primary" />
                项目资料
              </h2>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className={`block ${styles.textSecondary} text-sm mb-2`}>项目背景</label>
                <textarea
                  value={formData.projectBackground}
                  onChange={(e) => setFormData({ ...formData, projectBackground: e.target.value })}
                  rows={6}
                  className={`w-full px-4 py-3 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing} resize-none text-base`}
                  placeholder="请详细描述项目背景，包括选题的由来、市场背景、竞品分析、为什么要做这个选题等..."
                />
              </div>

              <div>
                <label className={`block ${styles.textSecondary} text-sm mb-2`}>目标受众</label>
                <textarea
                  value={formData.targetAudience}
                  onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
                  rows={3}
                  className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing} resize-none`}
                  placeholder="请描述目标受众群体特征，如年龄、性别、兴趣爱好、消费习惯等..."
                />
              </div>
            </div>
          </div>

          <div className={`${styles.bgSecondary} rounded-xl ${styles.border} overflow-hidden`}>
            <div className={`px-6 py-4 border-b ${styles.border}`}>
              <h2 className={`text-lg font-medium ${styles.textPrimary} flex items-center gap-2`}>
                <List className="w-5 h-5 text-studio-success" />
                大纲结构
              </h2>
              <p className={`${styles.textSecondary} text-sm mt-1`}>请根据模板填写内容，可修改结构和添加新内容</p>
            </div>
            <div className="p-6">
              {showPreview ? (
                <div className={`editor-content-preview ${styles.bgTertiary} rounded-lg p-6 min-h-[400px] ${styles.textPrimary}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(normalizeLegacyEditorHtmlTheme(formData.outline)) }}></div>
              ) : (
                <ContentEditor
                  writingGoalKey="topic:new"
                  value={formData.outline}
                  onChange={(value) => setFormData({ ...formData, outline: value })}
                  placeholder="请填写大纲内容..."
                  mode="rich"
                  readOnly={submitting}
                />
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className={`${styles.bgSecondary} rounded-xl ${styles.border} overflow-hidden`}>
            <div className={`px-6 py-4 border-b ${styles.border}`}>
              <h3 className={`text-sm font-medium ${styles.textSecondary}`}>预览信息</h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <p className={`text-xs text-studio-text-muted mb-1`}>选题标题</p>
                <p className={`${styles.textPrimary} font-medium`}>{formData.title || '未输入标题'}</p>
              </div>
              <div>
                <p className={`text-xs text-studio-text-muted mb-1`}>发布平台</p>
                <p className={`${styles.textSecondary}`}>{getPlatformLabel(formData.platform) || '-'}</p>
              </div>
              <div>
                <p className={`text-xs text-studio-text-muted mb-1`}>截止日期</p>
                <p className={`${styles.textSecondary}`}>{formatBeijingDate(formData.deadline)}</p>
              </div>
              <div>
                <p className={`text-xs text-studio-text-muted mb-1`}>负责人</p>
                <p className={`${styles.textSecondary}`}>
                  {formData.assignee_id 
                    ? users.find(u => u.id === parseInt(formData.assignee_id))?.name || '已选择负责人（姓名暂不可用）'
                    : '-'}
                </p>
              </div>
              <div className={`pt-4 border-t ${styles.border}`}>
                <p className={`text-xs text-studio-text-muted mb-1`}>状态</p>
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-studio-amber/20 text-studio-amber-contrast rounded-full text-xs">
                  待审核
                </span>
              </div>
              <div className={`pt-4 border-t ${styles.border}`}>
                <p className={`text-xs text-studio-text-muted mb-1`}>创建人</p>
                <p className={`${styles.textSecondary}`}>{authStore.user?.name}</p>
              </div>
            </div>
          </div>

          <div className={`${styles.bgSecondary} rounded-xl ${styles.border} overflow-hidden`}>
            <div className={`px-6 py-4 border-b ${styles.border}`}>
              <h3 className={`text-sm font-medium ${styles.textSecondary}`}>填写进度</h3>
            </div>
            <div className="p-4">
              <div className="space-y-3">
                <div>
                  <div className={`flex justify-between text-xs mb-1`}>
                    <span className={`${styles.textSecondary}`}>基本信息</span>
                    <span className={`${formData.title ? 'text-studio-success-contrast' : 'text-studio-text-muted'}`}>
                      {formData.title ? '已填写' : '未填写'}
                    </span>
                  </div>
                  <div className={`h-1.5 ${styles.progressBg} rounded-full overflow-hidden`}>
                    <div 
                      className={`h-full rounded-full transition-all ${formData.title ? 'bg-studio-success' : 'bg-studio-surface-soft'}`}
                      style={{ width: formData.title ? '100%' : '0%' }}
                    ></div>
                  </div>
                </div>
                <div>
                  <div className={`flex justify-between text-xs mb-1`}>
                    <span className={`${styles.textSecondary}`}>项目资料</span>
                    <span className={`${formData.projectBackground || formData.targetAudience || formData.expectedGoal || formData.budget ? 'text-studio-success-contrast' : 'text-studio-text-muted'}`}>
                      {formData.projectBackground || formData.targetAudience || formData.expectedGoal || formData.budget ? '已填写' : '未填写'}
                    </span>
                  </div>
                  <div className={`h-1.5 ${styles.progressBg} rounded-full overflow-hidden`}>
                    <div 
                      className={`h-full rounded-full transition-all ${formData.projectBackground || formData.targetAudience || formData.expectedGoal || formData.budget ? 'bg-studio-success' : 'bg-studio-surface-soft'}`}
                      style={{ width: formData.projectBackground || formData.targetAudience || formData.expectedGoal || formData.budget ? '100%' : '0%' }}
                    ></div>
                  </div>
                </div>
                <div>
                  <div className={`flex justify-between text-xs mb-1`}>
                    <span className={`${styles.textSecondary}`}>大纲结构</span>
                    <span className={`${formData.outline.includes('请输入') ? 'text-studio-text-muted' : 'text-studio-success-contrast'}`}>
                      {formData.outline.includes('请输入') ? '未填写' : '已填写'}
                    </span>
                  </div>
                  <div className={`h-1.5 ${styles.progressBg} rounded-full overflow-hidden`}>
                    <div 
                      className={`h-full rounded-full transition-all ${formData.outline.includes('请输入') ? 'bg-studio-surface-soft' : 'bg-studio-success'}`}
                      style={{ width: formData.outline.includes('请输入') ? '0%' : '100%' }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
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
    </>
  );
}
