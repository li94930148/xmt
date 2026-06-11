import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { getPublishingById, updatePublishing } from '../api';
import { ChevronLeft, FileText, Camera, Send, Calendar, User as UserIcon, Clock, Save, CheckCircle, ArrowRight, MapPin, ExternalLink } from 'lucide-react';
import Editor from '../components/editor/Editor';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { formatBeijingTime, formatBeijingDate } from '../lib/utils';

interface PublishingDetailData {
  id: number;
  topic_id: number;
  topic_title: string;
  topic_description: string;
  topic_platform: string;
  topic_deadline: string;
  topic_status: string;
  platform: string;
  url: string;
  status: string;
  publish_time: string;
  script_content: string | null;
  operator_name: string;
  created_at: string;
  updated_at: string;
  production: {
    id: number;
    version: string;
    content: string;
    content_markdown: string;
    status: string;
    created_at: string;
    operator_name: string;
  } | null;
  shooting: {
    id: number;
    plan_date: string;
    location: string;
    equipment: string;
    status: string;
    operator_name: string;
    created_at: string;
  } | null;
  topicHistory: Array<{
    action: string;
    comment: string;
    created_at: string;
    operator_name: string;
  }>;
}

const WORKFLOW_STEPS = [
  { key: 'topic', label: '选题提交', icon: FileText },
  { key: 'production', label: '创作审核', icon: FileText },
  { key: 'shooting', label: '成片制作', icon: Camera },
  { key: 'publishing', label: '发布管理', icon: Send },
];

const SHOOTING_STATUS_TEXT: Record<string, string> = {
  planned: '计划中',
  in_progress: '制作中',
  completed: '已完成',
  cancelled: '已取消',
};

const PUBLISHING_STATUS_TEXT: Record<string, string> = {
  pending: '待发布',
  published: '已发布',
  failed: '发布失败',
  scheduled: '已预定',
};

export default function PublishingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const appStore = useAppStore();
  const styles = useThemeStyles();

  const [data, setData] = useState<PublishingDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [scriptContent, setScriptContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await getPublishingById(parseInt(id!));
        setData(result);
        // 优先使用本地编辑的剧本，其次使用创作管理的剧本
        const content = result.script_content || result.production?.content || result.production?.content_markdown || '';
        setScriptContent(content);
      } catch (error) {
        appStore.addNotification({ title: '获取数据失败', message: (error as Error).message, type: 'error' });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleSaveScript = async () => {
    if (!data) return;
    setSaving(true);
    try {
      await updatePublishing(data.id, { script_content: scriptContent });
      setData({ ...data, script_content: scriptContent });
      setEditMode(false);
      appStore.addNotification({ title: '保存成功', message: '剧本内容已保存（仅在发布管理及资源库存档中生效）', type: 'success' });
    } catch (error) {
      appStore.addNotification({ title: '保存失败', message: (error as Error).message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (data) {
      const content = data.script_content || data.production?.content || data.production?.content_markdown || '';
      setScriptContent(content);
    }
    setEditMode(false);
  };

  // 判断当前流程步骤
  const getStepStatus = (stepKey: string) => {
    if (!data) return 'pending';
    const stepOrder = ['topic', 'production', 'shooting', 'publishing'];
    const currentIdx = stepOrder.indexOf('publishing'); // 当前在发布阶段
    const stepIdx = stepOrder.indexOf(stepKey);
    if (stepIdx < currentIdx) return 'completed';
    if (stepIdx === currentIdx) return 'current';
    return 'pending';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className={styles.textMuted}>发布记录不存在</p>
      </div>
    );
  }

  const hasLocalEdit = data.script_content !== null && data.script_content !== undefined;
  const displayContent = scriptContent || '<p class="text-gray-500">暂无剧本内容</p>';

  return (
    <div className="space-y-6">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/publishing')}
          className={`flex items-center gap-2 ${styles.textSecondary} hover:text-blue-400 transition-colors`}
        >
          <ChevronLeft className="w-5 h-5" />
          返回发布管理
        </button>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border ${
            data.status === 'published' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
            data.status === 'failed' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
            data.status === 'scheduled' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
            'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
          }`}>
            {PUBLISHING_STATUS_TEXT[data.status] || data.status}
          </span>
        </div>
      </div>

      {/* 标题卡片 */}
      <div className={`${styles.card} p-6`}>
        <h1 className={`text-2xl font-bold ${styles.textPrimary} flex items-center gap-2`}>
          <Send className="w-6 h-6 text-blue-400" />
          {data.topic_title}
        </h1>
        <p className={`${styles.textSecondary} mt-1`}>发布管理详情 · 关联选题 #{data.topic_id}</p>
      </div>

      {/* 流程进度条 */}
      <div className={`${styles.card} p-6`}>
        <h2 className={`text-lg font-semibold ${styles.textPrimary} mb-4`}>选题流转进度</h2>
        <div className="flex items-center gap-2">
          {WORKFLOW_STEPS.map((step, index) => {
            const status = getStepStatus(step.key);
            const Icon = step.icon;
            return (
              <div key={step.key} className="flex items-center flex-1">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg flex-1 ${
                  status === 'completed' ? 'bg-green-500/10 border border-green-500/30' :
                  status === 'current' ? 'bg-blue-500/10 border border-blue-500/30 ring-2 ring-blue-500/20' :
                  `${styles.bgTertiary} border ${styles.border}`
                }`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    status === 'completed' ? 'bg-green-500 text-white' :
                    status === 'current' ? 'bg-blue-500 text-white' :
                    'bg-gray-600 text-gray-400'
                  }`}>
                    {status === 'completed' ? <CheckCircle className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  </div>
                  <span className={`text-xs font-medium ${
                    status === 'current' ? 'text-blue-400' :
                    status === 'completed' ? styles.textPrimary :
                    styles.textMuted
                  }`}>
                    {step.label}
                  </span>
                </div>
                {index < WORKFLOW_STEPS.length - 1 && (
                  <ArrowRight className={`w-4 h-4 mx-1 flex-shrink-0 ${
                    getStepStatus(WORKFLOW_STEPS[index + 1].key) !== 'pending' ? 'text-green-500' : styles.textMuted
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 详细信息网格 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 选题信息 */}
        <div className={`${styles.card} p-6`}>
          <h2 className={`text-lg font-semibold ${styles.textPrimary} mb-4 flex items-center gap-2`}>
            <FileText className="w-5 h-5 text-blue-400" />
            选题信息
          </h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>平台</span>
              <span className={`text-sm ${styles.textPrimary}`}>{data.topic_platform || '-'}</span>
            </div>
            <div className="flex items-start gap-3">
              <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>截止日期</span>
              <span className={`text-sm ${styles.textPrimary}`}>{data.topic_deadline || '-'}</span>
            </div>
            {data.topic_description && (
              <div className="flex items-start gap-3">
                <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>描述</span>
                <span className={`text-sm ${styles.textSecondary}`}>{data.topic_description}</span>
              </div>
            )}
          </div>
        </div>

        {/* 发布信息 */}
        <div className={`${styles.card} p-6`}>
          <h2 className={`text-lg font-semibold ${styles.textPrimary} mb-4 flex items-center gap-2`}>
            <Send className="w-5 h-5 text-green-400" />
            发布信息
          </h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>平台</span>
              <span className={`text-sm ${styles.textPrimary}`}>{data.platform || '-'}</span>
            </div>
            <div className="flex items-start gap-3">
              <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>发布时间</span>
              <span className={`text-sm ${styles.textPrimary}`}>{data.publish_time ? formatBeijingDate(data.publish_time) : '-'}</span>
            </div>
            <div className="flex items-start gap-3">
              <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>发布链接</span>
              {data.url ? (
                <a href={data.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  查看 <ExternalLink className="w-3 h-3" />
                </a>
              ) : <span className={`text-sm ${styles.textPrimary}`}>-</span>}
            </div>
            <div className="flex items-start gap-3">
              <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>操作人</span>
              <span className={`text-sm ${styles.textPrimary}`}>{data.operator_name || '-'}</span>
            </div>
          </div>
        </div>

        {/* 成片制作信息 */}
        <div className={`${styles.card} p-6`}>
          <h2 className={`text-lg font-semibold ${styles.textPrimary} mb-4 flex items-center gap-2`}>
            <Camera className="w-5 h-5 text-purple-400" />
            成片制作
          </h2>
          {data.shooting ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>状态</span>
                <span className={`text-sm ${styles.textPrimary}`}>{SHOOTING_STATUS_TEXT[data.shooting.status] || data.shooting.status}</span>
              </div>
              <div className="flex items-start gap-3">
                <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>计划日期</span>
                <span className={`text-sm ${styles.textPrimary}`}>{data.shooting.plan_date ? formatBeijingDate(data.shooting.plan_date) : '-'}</span>
              </div>
              <div className="flex items-start gap-3">
                <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>地点</span>
                <span className={`text-sm ${styles.textPrimary}`}>{data.shooting.location || '-'}</span>
              </div>
              <div className="flex items-start gap-3">
                <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>设备</span>
                <span className={`text-sm ${styles.textPrimary}`}>{data.shooting.equipment || '-'}</span>
              </div>
            </div>
          ) : (
            <p className={`text-sm ${styles.textMuted}`}>暂无成片制作记录</p>
          )}
        </div>

        {/* 创作信息 */}
        <div className={`${styles.card} p-6`}>
          <h2 className={`text-lg font-semibold ${styles.textPrimary} mb-4 flex items-center gap-2`}>
            <FileText className="w-5 h-5 text-orange-400" />
            创作审核
          </h2>
          {data.production ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>版本</span>
                <span className={`text-sm ${styles.textPrimary}`}>{data.production.version || '-'}</span>
              </div>
              <div className="flex items-start gap-3">
                <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>状态</span>
                <span className="text-sm text-green-400">已通过</span>
              </div>
              <div className="flex items-start gap-3">
                <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>操作人</span>
                <span className={`text-sm ${styles.textPrimary}`}>{data.production.operator_name || '-'}</span>
              </div>
              {hasLocalEdit && (
                <div className="mt-2 px-3 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <p className="text-xs text-blue-400">📝 已有本地编辑版本（不回写创作管理）</p>
                </div>
              )}
            </div>
          ) : (
            <p className={`text-sm ${styles.textMuted}`}>暂无创作记录</p>
          )}
        </div>
      </div>

      {/* 剧本内容区域 */}
      <div className={`${styles.card} overflow-hidden`}>
        <div className={`flex items-center justify-between px-6 py-4 border-b ${styles.border}`}>
          <h2 className={`text-lg font-semibold ${styles.textPrimary} flex items-center gap-2`}>
            <FileText className="w-5 h-5 text-blue-400" />
            剧本内容
            {hasLocalEdit && (
              <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full">本地编辑版</span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <button
                  onClick={handleCancelEdit}
                  className={`px-4 py-2 text-sm rounded-lg ${styles.buttonSecondary} transition-colors`}
                >
                  取消
                </button>
                <button
                  onClick={handleSaveScript}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? '保存中...' : '保存'}
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditMode(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                <FileText className="w-4 h-4" />
                编辑剧本
              </button>
            )}
          </div>
        </div>

        <div className="p-0">
          {editMode ? (
            <div style={{ height: '500px' }}>
              <Editor
                value={scriptContent}
                onChange={setScriptContent}
                onSave={handleSaveScript}
              />
            </div>
          ) : (
            <div className="p-6">
              <div
                className={`tiptap max-w-none ${styles.textPrimary} leading-relaxed prose ${styles.isDark ? 'prose-invert' : ''}`}
                dangerouslySetInnerHTML={{ __html: displayContent }}
              />
              {!scriptContent && (
                <div className={`text-center py-8 ${styles.textMuted}`}>
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>暂无剧本内容</p>
                  <p className="text-xs mt-1">点击"编辑剧本"按钮添加内容</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 提示信息 */}
        <div className={`px-6 py-3 border-t ${styles.border} ${styles.bgTertiary}`}>
          <p className={`text-xs ${styles.textMuted}`}>
            💡 此处编辑的剧本内容仅在发布管理及后续资源库存档的成片批注中生效，不会同步到创作管理模块。
          </p>
        </div>
      </div>

      {/* 流转历史 */}
      {data.topicHistory && data.topicHistory.length > 0 && (
        <div className={`${styles.card} p-6`}>
          <h2 className={`text-lg font-semibold ${styles.textPrimary} mb-4 flex items-center gap-2`}>
            <Clock className="w-5 h-5 text-gray-400" />
            选题流转记录
          </h2>
          <div className="space-y-0">
            {data.topicHistory.map((h, i) => (
              <div key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full ${i === 0 ? 'bg-blue-500' : 'bg-gray-500'} mt-1.5`} />
                  {i < data.topicHistory.length - 1 && <div className={`w-px flex-1 ${styles.border} my-1`} />}
                </div>
                <div className="pb-4 flex-1">
                  <p className={`text-sm font-medium ${styles.textPrimary}`}>{h.comment || h.action}</p>
                  <div className={`flex items-center gap-2 text-xs ${styles.textMuted} mt-1`}>
                    <span>{h.operator_name}</span>
                    <span>{formatBeijingTime(h.created_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
