import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { getShootingById, updateShooting, getTopics } from '../api';
import { Shooting as ShootingType, Topic } from '../types';
import { ChevronLeft, Calendar, MapPin, Camera, User as UserIcon, CheckCircle, AlertCircle, Clock, Save, FileText, ArrowRight } from 'lucide-react';
import Editor from '../components/editor/Editor';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { formatBeijingTime, formatBeijingDate } from '../lib/utils';

interface ShootingDetailData extends ShootingType {
  production: {
    id: number;
    version: string;
    content: string;
    content_markdown: string;
    status: string;
    operator_name: string;
  } | null;
  script_content?: string | null;
}

const WORKFLOW_STEPS = [
  { key: 'topic', label: '选题提交', icon: FileText },
  { key: 'production', label: '创作审核', icon: FileText },
  { key: 'shooting', label: '成片制作', icon: Camera },
  { key: 'publishing', label: '发布管理', icon: ArrowRight },
];

export default function ShootingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const appStore = useAppStore();
  const styles = useThemeStyles();

  const [shooting, setShooting] = useState<ShootingDetailData | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({
    topic_id: '',
    plan_date: '',
    location: '',
    equipment: '',
    status: 'planned'
  });

  // 剧本编辑状态
  const [scriptEditMode, setScriptEditMode] = useState(false);
  const [scriptContent, setScriptContent] = useState('');
  const [scriptSaving, setScriptSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await getShootingById(parseInt(id!));
        setShooting(result);
        setEditData({
          topic_id: result.topic_id.toString(),
          plan_date: result.plan_date || '',
          location: result.location || '',
          equipment: result.equipment || '',
          status: result.status || 'planned'
        });

        // 初始化剧本内容：优先使用本地编辑版，其次使用创作管理审核通过的内容
        const content = result.script_content || result.production?.content || result.production?.content_markdown || '';
        setScriptContent(content);

        const topicList = await getTopics();
        setTopics(topicList.data.filter(t => t.status === 'approved' || t.status === 'production' || t.status === 'shooting'));
      } catch (error) {
        appStore.addNotification({ title: '获取数据失败', message: (error as Error).message, type: 'error' });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const handleSave = async () => {
    try {
      await updateShooting(parseInt(id!), {
        topic_id: parseInt(editData.topic_id),
        plan_date: editData.plan_date,
        location: editData.location,
        equipment: editData.equipment,
        status: editData.status
      });

      const updated = await getShootingById(parseInt(id!));
      setShooting(updated);
      setEditMode(false);
      appStore.addNotification({ title: '保存成功', message: '成片制作记录已更新', type: 'success' });
    } catch (error) {
      appStore.addNotification({ title: '保存失败', message: (error as Error).message, type: 'error' });
    }
  };

  const handleSaveScript = async () => {
    if (!shooting) return;
    setScriptSaving(true);
    try {
      await updateShooting(shooting.id, { script_content: scriptContent });
      setShooting({ ...shooting, script_content: scriptContent });
      setScriptEditMode(false);
      appStore.addNotification({ title: '保存成功', message: '剧本内容已保存（仅在成片制作及后续流程中生效）', type: 'success' });
    } catch (error) {
      appStore.addNotification({ title: '保存失败', message: (error as Error).message, type: 'error' });
    } finally {
      setScriptSaving(false);
    }
  };

  const handleCancelScriptEdit = () => {
    if (shooting) {
      const content = shooting.script_content || shooting.production?.content || shooting.production?.content_markdown || '';
      setScriptContent(content);
    }
    setScriptEditMode(false);
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      await updateShooting(parseInt(id!), {
        topic_id: parseInt(editData.topic_id),
        plan_date: editData.plan_date,
        location: editData.location,
        equipment: editData.equipment,
        status: newStatus
      });

      const updated = await getShootingById(parseInt(id!));
      setShooting(updated);
      setEditData({ ...editData, status: newStatus });

      if (newStatus === 'completed') {
        appStore.addNotification({ title: '制作完成', message: '成片制作已完成，自动流转到发布管理', type: 'success' });
      } else {
        appStore.addNotification({ title: '状态更新', message: '状态已更新', type: 'success' });
      }
    } catch (error) {
      appStore.addNotification({ title: '更新失败', message: (error as Error).message, type: 'error' });
    }
  };

  const statusColors: Record<string, string> = {
    planned: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    in_progress: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    completed: 'bg-green-500/20 text-green-400 border-green-500/30',
    cancelled: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };

  const statusText: Record<string, string> = {
    planned: '计划中',
    in_progress: '制作中',
    completed: '已完成',
    cancelled: '已取消',
  };

  const getStepStatus = (stepKey: string) => {
    if (!shooting) return 'pending';
    const stepOrder = ['topic', 'production', 'shooting', 'publishing'];
    const currentIdx = stepOrder.indexOf('shooting');
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

  if (!shooting) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">成片制作记录不存在</p>
      </div>
    );
  }

  const hasLocalScriptEdit = shooting.script_content !== null && shooting.script_content !== undefined;
  const displayContent = scriptContent || '<p class="text-gray-500">暂无剧本内容</p>';

  return (
    <div className="space-y-6">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/shooting')}
          className={`flex items-center gap-2 ${styles.textSecondary} hover:text-blue-400 transition-colors`}
        >
          <ChevronLeft className="w-5 h-5" />
          返回成片制作
        </button>

        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border ${statusColors[shooting.status]}`}>
            {statusText[shooting.status]}
          </span>
          {editMode ? (
            <>
              <button
                onClick={() => {
                  setEditMode(false);
                  setEditData({
                    topic_id: shooting.topic_id.toString(),
                    plan_date: shooting.plan_date || '',
                    location: shooting.location || '',
                    equipment: shooting.equipment || '',
                    status: shooting.status
                  });
                }}
                className={`px-4 py-2 ${styles.bgTertiary} ${styles.hoverBg} ${styles.textPrimary} rounded-lg transition-colors`}
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Save className="w-4 h-4" />
                保存
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditMode(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              编辑
            </button>
          )}
        </div>
      </div>

      {/* 标题卡片 */}
      <div className={`${styles.bgSecondary} rounded-xl ${styles.border} overflow-hidden`}>
        <div className={`p-6 border-b ${styles.border}`}>
          <h1 className={`text-2xl font-bold ${styles.textPrimary} flex items-center gap-2`}>
            <Camera className="w-6 h-6 text-blue-400" />
            {shooting.topic_title || '成片制作'}
          </h1>
          <p className={`${styles.textSecondary} mt-1`}>关联选题：{shooting.topic_title}</p>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className={`block text-sm font-medium ${styles.textSecondary} mb-2`}>计划日期</label>
              {editMode ? (
                <input
                  type="date"
                  value={editData.plan_date}
                  onChange={(e) => setEditData({ ...editData, plan_date: e.target.value })}
                  className={`w-full px-3 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
              ) : (
                <div className={`flex items-center gap-2 ${styles.textPrimary}`}>
                  <Calendar className={`w-4 h-4 ${styles.textSecondary}`} />
                  {formatBeijingDate(shooting.plan_date)}
                </div>
              )}
            </div>

            <div>
              <label className={`block text-sm font-medium ${styles.textSecondary} mb-2`}>制作地点</label>
              {editMode ? (
                <input
                  type="text"
                  value={editData.location}
                  onChange={(e) => setEditData({ ...editData, location: e.target.value })}
                  className={`w-full px-3 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="输入制作地点"
                />
              ) : (
                <div className={`flex items-center gap-2 ${styles.textPrimary}`}>
                  <MapPin className={`w-4 h-4 ${styles.textSecondary}`} />
                  {shooting.location || '-'}
                </div>
              )}
            </div>

            <div>
              <label className={`block text-sm font-medium ${styles.textSecondary} mb-2`}>设备清单</label>
              {editMode ? (
                <textarea
                  value={editData.equipment}
                  onChange={(e) => setEditData({ ...editData, equipment: e.target.value })}
                  rows={3}
                  className={`w-full px-3 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none`}
                  placeholder="输入设备清单"
                />
              ) : (
                <div className={`${styles.textPrimary} whitespace-pre-wrap`}>{shooting.equipment || '-'}</div>
              )}
            </div>

            <div>
              <label className={`block text-sm font-medium ${styles.textSecondary} mb-2`}>关联选题</label>
              {editMode ? (
                <select
                  value={editData.topic_id}
                  onChange={(e) => setEditData({ ...editData, topic_id: e.target.value })}
                  className={`w-full px-3 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="">选择选题</option>
                  {topics.map(topic => (
                    <option key={topic.id} value={topic.id}>{topic.title}</option>
                  ))}
                </select>
              ) : (
                <div className={`flex items-center gap-2 ${styles.textPrimary}`}>
                  <FileText className={`w-4 h-4 ${styles.textSecondary}`} />
                  {shooting.topic_title || '-'}
                </div>
              )}
            </div>
          </div>

          <div className={`pt-4 border-t ${styles.border}`}>
            <div className="flex items-center justify-between">
              <div className={`flex items-center gap-4 ${styles.textSecondary}`}>
                <span className="flex items-center gap-2">
                  <UserIcon className="w-4 h-4" />
                  创建人：{shooting.operator_name}
                </span>
                <span className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  创建时间：{formatBeijingTime(shooting.created_at)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 流程进度条 */}
      <div className={`${styles.bgSecondary} rounded-xl ${styles.border} p-6`}>
        <h2 className={`text-lg font-semibold ${styles.textPrimary} mb-4`}>选题流转进度</h2>
        <div className="flex items-center gap-2">
          {WORKFLOW_STEPS.map((step, index) => {
            const stepStatus = getStepStatus(step.key);
            const Icon = step.icon;
            return (
              <div key={step.key} className="flex items-center flex-1">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg flex-1 ${
                  stepStatus === 'completed' ? 'bg-green-500/10 border border-green-500/30' :
                  stepStatus === 'current' ? 'bg-blue-500/10 border border-blue-500/30 ring-2 ring-blue-500/20' :
                  `${styles.bgTertiary} border ${styles.border}`
                }`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    stepStatus === 'completed' ? 'bg-green-500 text-white' :
                    stepStatus === 'current' ? 'bg-blue-500 text-white' :
                    'bg-gray-600 text-gray-400'
                  }`}>
                    {stepStatus === 'completed' ? <CheckCircle className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  </div>
                  <span className={`text-xs font-medium ${
                    stepStatus === 'current' ? 'text-blue-400' :
                    stepStatus === 'completed' ? styles.textPrimary :
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

      {/* 剧本内容区域 */}
      <div className={`${styles.bgSecondary} rounded-xl ${styles.border} overflow-hidden`}>
        <div className={`flex items-center justify-between px-6 py-4 border-b ${styles.border}`}>
          <h2 className={`text-lg font-semibold ${styles.textPrimary} flex items-center gap-2`}>
            <FileText className="w-5 h-5 text-blue-400" />
            剧本内容
            {shooting.production?.version && (
              <span className={`text-xs ${styles.textMuted} ml-1`}>（创作版本: {shooting.production.version}）</span>
            )}
            {hasLocalScriptEdit && (
              <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full ml-2">本地编辑版</span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            {scriptEditMode ? (
              <>
                <button
                  onClick={handleCancelScriptEdit}
                  className={`px-4 py-2 text-sm rounded-lg ${styles.buttonSecondary} transition-colors`}
                >
                  取消
                </button>
                <button
                  onClick={handleSaveScript}
                  disabled={scriptSaving}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {scriptSaving ? '保存中...' : '保存剧本'}
                </button>
              </>
            ) : (
              <button
                onClick={() => setScriptEditMode(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                <FileText className="w-4 h-4" />
                编辑剧本
              </button>
            )}
          </div>
        </div>

        <div className="p-0">
          {scriptEditMode ? (
            <div style={{ height: '500px' }}>
              <Editor
                value={scriptContent}
                onChange={setScriptContent}
                onSave={handleSaveScript}
              />
            </div>
          ) : (
            <div className="p-6">
              {scriptContent ? (
                <div
                  className={`tiptap max-w-none ${styles.textPrimary} leading-relaxed prose ${styles.isDark ? 'prose-invert' : ''}`}
                  dangerouslySetInnerHTML={{ __html: displayContent }}
                />
              ) : (
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
            💡 此处编辑的剧本内容仅在成片制作及后续发布管理中生效，不会同步回创作管理模块。
          </p>
        </div>
      </div>

      {/* 流程操作 */}
      <div className={`${styles.bgSecondary} rounded-xl ${styles.border} overflow-hidden`}>
        <div className={`px-6 py-4 border-b ${styles.border}`}>
          <h2 className={`text-lg font-medium ${styles.textPrimary}`}>流程操作</h2>
        </div>
        <div className="p-6">
          <div className="flex flex-wrap gap-3">
            {shooting.status === 'planned' && (
              <>
                <button
                  onClick={() => handleStatusChange('in_progress')}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <Camera className="w-4 h-4" />
                  开始制作
                </button>
                <button
                  onClick={() => handleStatusChange('cancelled')}
                  className={`flex items-center gap-2 px-4 py-2 ${styles.bgTertiary} ${styles.hoverBg} ${styles.textPrimary} rounded-lg transition-colors`}
                >
                  <AlertCircle className="w-4 h-4" />
                  取消计划
                </button>
              </>
            )}

            {shooting.status === 'in_progress' && (
              <button
                onClick={() => handleStatusChange('completed')}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                完成制作
              </button>
            )}

            {shooting.status === 'cancelled' && (
              <button
                onClick={() => handleStatusChange('planned')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Clock className="w-4 h-4" />
                重新计划
              </button>
            )}

            {shooting.status === 'completed' && (
              <span className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                已完成
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
