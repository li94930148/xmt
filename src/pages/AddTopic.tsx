import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, useAuthStore } from '../store';
import { createTopic, getUsers } from '../api';
import ContentEditor from '../components/ContentEditor';
import { ChevronLeft, FileText, List, Calendar, User as UserIcon, Send, Save, Eye, EyeOff } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { formatBeijingDate } from '../lib/utils';
import { normalizeLegacyEditorHtmlTheme } from '../utils/editorTheme';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { celebrateMilestone } from '../utils/confetti';
import { clearSafeDraft, readSafeDraftValue, writeSafeDraft } from '../platform/safe-draft';

const emptyFormData = {
  title: '',
  platform: '',
  deadline: '',
  assignee_id: '',
  projectBackground: '',
  targetAudience: '',
  expectedGoal: '',
  budget: '',
  outline: '',
};

type TopicDraft = typeof emptyFormData;

function readTopicDraft(key: string | null): TopicDraft | null {
  if (!key) return null;
  const draft = readSafeDraftValue<unknown>(key);
  if (!draft || typeof draft !== 'object') return null;
  const values = draft as Record<string, unknown>;
  if (!Object.keys(emptyFormData).every((field) => typeof values[field] === 'string')) return null;
  return draft as TopicDraft;
}

export default function AddTopic() {
  const navigate = useNavigate();
  const appStore = useAppStore();
  const authStore = useAuthStore();
  const styles = useThemeStyles();
  
  const draftKey = authStore.user?.id ? `topic:new:desktop:${authStore.user.id}` : null;
  const [formData, setFormData] = useState<TopicDraft>(() => readTopicDraft(draftKey) ?? emptyFormData);
  const [hasLocalDraft, setHasLocalDraft] = useState(() => Boolean(readTopicDraft(draftKey)));
  
  const [users, setUsers] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const draft = readTopicDraft(draftKey);
    setFormData(draft ?? emptyFormData);
    setHasLocalDraft(Boolean(draft));
  }, [draftKey]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const userList = await getUsers();
        setUsers(userList.data);
      } catch (error) {
        console.error('获取用户列表失败:', error);
      }
    };
    fetchUsers();
  }, []);

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      appStore.addNotification({ title: '提示', message: '请输入选题标题', type: 'warning' });
      return;
    }

    setSubmitting(true);
    try {
      // description 只存项目背景和目标受众
      const parts: string[] = [];
      if (formData.projectBackground) parts.push(`【项目背景】\n${formData.projectBackground}`);
      if (formData.targetAudience) parts.push(`【目标受众】\n${formData.targetAudience}`);

      const result = await createTopic({
        title: formData.title,
        description: parts.join('\n\n'),
        outline: formData.outline || undefined,
        platform: formData.platform,
        deadline: formData.deadline,
        assignee_id: formData.assignee_id ? parseInt(formData.assignee_id) : null,
      });

      appStore.addNotification({ title: '提报成功', message: '选题已成功提交审核', type: 'success' });
      if (draftKey) clearSafeDraft(draftKey);
      setHasLocalDraft(false);
      celebrateMilestone();
      navigate(`/topics/${result.topicId}`);
    } catch (error) {
      appStore.addNotification({ title: '提报失败', message: (error as Error).message, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveDraft = () => {
    if (!draftKey) {
      appStore.addNotification({ title: '保存失败', message: '请重新登录后保存草稿', type: 'error' });
      return;
    }
    if (!Object.values(formData).some((value) => value.trim())) {
      appStore.addNotification({ title: '保存失败', message: '请先填写选题内容', type: 'warning' });
      return;
    }
    if (!writeSafeDraft(draftKey, formData)) {
      appStore.addNotification({ title: '保存失败', message: '本机无法保存草稿，请检查浏览器存储空间', type: 'error' });
      return;
    }
    setHasLocalDraft(true);
    appStore.addNotification({ title: '已存本机草稿', message: '下次在这台设备打开提报页可继续编辑；尚未提交审核', type: 'success' });
  };

  return (
    <div className="space-y-6">
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
                ? 'bg-studio-primary text-white' 
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
            onClick={handleSubmit}
            disabled={submitting}
            className="flex shrink-0 items-center gap-2 whitespace-nowrap px-6 py-2 bg-studio-primary hover:bg-studio-primary disabled:bg-studio-surface-soft text-white rounded-lg transition-colors"
          >
            <Send className="w-4 h-4" />
            {submitting ? '提交中...' : '提报选题'}
          </button>
        </div>
      </div>

      {hasLocalDraft && (
        <p role="status" className="rounded-panel border border-studio-border-soft bg-studio-surface-soft px-4 py-3 text-sm text-studio-text-secondary">
          当前设备和账号有一份选题草稿；修改后需再次点击“存本机草稿”。提报后才会创建选题。
        </p>
      )}

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
                    className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing}`}
                  >
                    <option value="">选择负责人</option>
                    {users.map(user => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                  </select>
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
                <p className={`${styles.textSecondary}`}>{formData.platform || '-'}</p>
              </div>
              <div>
                <p className={`text-xs text-studio-text-muted mb-1`}>截止日期</p>
                <p className={`${styles.textSecondary}`}>{formatBeijingDate(formData.deadline)}</p>
              </div>
              <div>
                <p className={`text-xs text-studio-text-muted mb-1`}>负责人</p>
                <p className={`${styles.textSecondary}`}>
                  {formData.assignee_id 
                    ? users.find(u => u.id === parseInt(formData.assignee_id))?.name 
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
                    <span className={`${formData.title ? 'text-studio-success' : 'text-studio-text-muted'}`}>
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
                    <span className={`${formData.projectBackground || formData.targetAudience || formData.expectedGoal || formData.budget ? 'text-studio-success' : 'text-studio-text-muted'}`}>
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
                    <span className={`${formData.outline.includes('请输入') ? 'text-studio-text-muted' : 'text-studio-success'}`}>
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
    </div>
  );
}
