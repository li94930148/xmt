import { useMemo, useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { getShootingById, updateShooting } from '../api';
import { Shooting as ShootingType } from '../types';
import { ChevronLeft, Calendar, MapPin, Camera, User as UserIcon, CheckCircle, Clock, FileText, ArrowRight, PanelRight, PanelRightClose } from 'lucide-react';
import ContentEditor from '../components/ContentEditor';
import { getCollaborationRoomId } from '../collaboration/core/events';
import { cancelDatabaseSync, syncToDatabase } from '../collaboration/core/writeConsistency';
import { getTimelineView } from '../editor/timeline/unifiedContentTimeline';
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
  const [loading, setLoading] = useState(true);

  // 剧本编辑状态
  const [scriptContent, setScriptContent] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'saving' | 'error'>('synced');
  const lastAutoSavedScriptRef = useRef('');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await getShootingById(parseInt(id!));
        setShooting(result);

        // 初始化剧本内容：优先使用本地编辑版，其次使用创作管理审核通过的内容
        const content = result.script_content || result.production?.content || result.production?.content_markdown || '';
        setScriptContent(content);
        lastAutoSavedScriptRef.current = content;
        setSyncStatus('synced');
      } catch (error) {
        appStore.addNotification({ title: '获取数据失败', message: (error as Error).message, type: 'error' });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  useEffect(() => {
    if (!shooting) return;
    if (scriptContent === lastAutoSavedScriptRef.current) return;

    syncToDatabase({
      docId: getCollaborationRoomId('shooting', shooting.id),
      content: scriptContent,
      previousContent: lastAutoSavedScriptRef.current,
      persist: (content) => updateShooting(shooting.id, { script_content: content }).then(() => undefined),
      onStatusChange: setSyncStatus,
      onSynced: (content) => {
        lastAutoSavedScriptRef.current = content;
      },
      onError: () => {
        // 保持静默，手动保存会给出明确反馈。
      },
    });

    return () => {
      cancelDatabaseSync(getCollaborationRoomId('shooting', shooting.id));
    };
  }, [scriptContent, shooting]);

  const handleStatusChange = async (newStatus: string) => {
    if (!shooting) return;

    try {
      await updateShooting(parseInt(id!), {
        topic_id: shooting.topic_id,
        plan_date: shooting.plan_date || '',
        location: shooting.location || '',
        equipment: shooting.equipment || '',
        status: newStatus
      });

      const updated = await getShootingById(parseInt(id!));
      setShooting(updated);

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

  const timelineView = useMemo(() => {
    if (!shooting) {
      return getTimelineView(getCollaborationRoomId('shooting', 0), { versionEvents: [] });
    }

    return getTimelineView(getCollaborationRoomId('shooting', shooting.id), {
      versionEvents: shooting.production ? [{
        id: `production-version-${shooting.production.id}`,
        timestamp: new Date(shooting.updated_at || shooting.created_at).getTime(),
        version: shooting.production.version,
        status: shooting.production.status,
        operatorName: shooting.production.operator_name,
        label: '关联创作版本',
      }] : [],
    });
  }, [shooting]);

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

  return (
    <div className="flex flex-col gap-3" style={{ height: 'calc(100vh - 96px)' }}>
      <div className={`shrink-0 border-b ${styles.border} px-3 py-2`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => navigate('/shooting')}
              className={`p-2 rounded-lg ${styles.hoverBg} transition-colors`}
            >
              <ChevronLeft className={`w-5 h-5 ${styles.textSecondary}`} />
            </button>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className={`truncate text-base font-semibold ${styles.textPrimary}`}>
                {shooting.topic_title || '成片制作'}
              </h1>
              {shooting.production?.version && (
                <span className={`text-xs ${styles.textMuted}`}>创作版本 {shooting.production.version}</span>
              )}
              <span className={`text-xs ${styles.textMuted}`}>{formatBeijingDate(shooting.plan_date)}</span>
              <span className={`text-xs ${styles.textMuted}`}>{formatBeijingTime(shooting.updated_at || shooting.created_at)}</span>
              <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${statusColors[shooting.status]}`}>
                {statusText[shooting.status]}
              </span>
              {hasLocalScriptEdit && (
                <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-400">本地编辑版</span>
              )}
              <span className={`text-xs ${syncStatus === 'error' ? 'text-red-400' : syncStatus === 'saving' ? 'text-blue-400' : styles.textMuted}`}>
                {syncStatus === 'saving' ? '正在保存...' : syncStatus === 'error' ? '同步失败' : '已同步'}
              </span>
              <span className={`text-xs ${styles.textMuted}`}>时间轴 {timelineView.timeline.length} 个节点</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setShowSidebar((prev) => !prev)}
              className={`p-2 rounded-lg ${styles.hoverBg} transition-colors`}
              title={showSidebar ? '收起信息栏' : '展开信息栏'}
            >
              {showSidebar ? (
                <PanelRightClose className={`w-4 h-4 ${styles.textSecondary}`} />
              ) : (
                <PanelRight className={`w-4 h-4 ${styles.textSecondary}`} />
              )}
            </button>
            {shooting.status === 'planned' && (
              <button
                onClick={() => handleStatusChange('in_progress')}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
              >
                <Camera className="w-4 h-4" />
                开始制作
              </button>
            )}

            {shooting.status === 'in_progress' && (
              <button
                onClick={() => handleStatusChange('completed')}
                className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700"
              >
                <CheckCircle className="w-4 h-4" />
                完成制作
              </button>
            )}

            {shooting.status === 'cancelled' && (
              <button
                onClick={() => handleStatusChange('planned')}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
              >
                <Clock className="w-4 h-4" />
                重新计划
              </button>
            )}

            {shooting.status === 'completed' && (
              <span className="flex items-center gap-1.5 rounded-lg bg-green-500/20 px-3 py-1.5 text-xs text-green-400">
                <CheckCircle className="w-4 h-4" />
                已完成
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        <main className="min-w-0 flex-1 overflow-hidden">
          <ContentEditor
            value={scriptContent}
            onChange={setScriptContent}
            mode="rich"
            collaborationKey={getCollaborationRoomId('shooting', shooting.id)}
            persistenceStatus={syncStatus === 'error' ? 'error' : syncStatus === 'saving' ? 'saving' : 'synced'}
            immersive
            className="h-full"
            placeholder="开始编写剧本..."
          />
        </main>

        {showSidebar && (
          <aside className={`${styles.bgSecondary} border ${styles.border} hidden w-80 shrink-0 overflow-y-auto rounded-2xl xl:block`}>
            <div className={`flex items-center justify-between border-b ${styles.border} px-5 py-4`}>
              <div>
                <p className={`text-xs uppercase tracking-[0.24em] ${styles.textMuted}`}>信息栏</p>
                <h2 className={`mt-1 text-sm font-semibold ${styles.textPrimary}`}>成片制作状态</h2>
              </div>
              <button onClick={() => setShowSidebar(false)} className={`rounded-lg p-2 ${styles.hoverBg}`}>
                <PanelRightClose className={`w-4 h-4 ${styles.textSecondary}`} />
              </button>
            </div>
            <div className="space-y-5 p-5">
              <section className="space-y-2">
                <p className={`text-xs uppercase tracking-[0.18em] ${styles.textMuted}`}>版本入口</p>
                <div className={`rounded-xl ${styles.bgTertiary} p-3`}>
                  <p className={`text-sm font-medium ${styles.textPrimary}`}>
                    当前创作版本：{shooting.production?.version || '-'}
                  </p>
                  <p className={`mt-1 text-xs ${styles.textMuted}`}>版本已纳入统一时间轴，当前页保留本地剧本编辑版。</p>
                </div>
                <button
                  onClick={() => shooting.production?.id && navigate(`/production/${shooting.production.id}`)}
                  disabled={!shooting.production?.id}
                  className={`w-full rounded-lg px-3 py-2 text-xs ${styles.buttonSecondary} disabled:opacity-50`}
                >
                  查看创作版本历史
                </button>
              </section>
              <section className="space-y-2">
                <p className={`text-xs uppercase tracking-[0.18em] ${styles.textMuted}`}>选题关联</p>
                <p className={`text-sm ${styles.textPrimary}`}>{shooting.topic_title || '-'}</p>
              </section>
              <section className="space-y-2">
                <p className={`text-xs uppercase tracking-[0.18em] ${styles.textMuted}`}>制作信息</p>
                <p className={`flex items-center gap-2 text-sm ${styles.textSecondary}`}>
                  <Calendar className="h-4 w-4" />
                  {formatBeijingDate(shooting.plan_date)}
                </p>
                <p className={`flex items-center gap-2 text-sm ${styles.textSecondary}`}>
                  <MapPin className="h-4 w-4" />
                  {shooting.location || '-'}
                </p>
                <p className={`flex items-center gap-2 text-sm ${styles.textSecondary}`}>
                  <UserIcon className="h-4 w-4" />
                  {shooting.operator_name || '-'}
                </p>
              </section>
              <section className="space-y-2">
                <p className={`text-xs uppercase tracking-[0.18em] ${styles.textMuted}`}>审核流程状态</p>
                <div className="space-y-2">
                  {WORKFLOW_STEPS.map((step) => {
                    const stepStatus = getStepStatus(step.key);
                    const Icon = step.icon;
                    return (
                      <div key={step.key} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${styles.bgTertiary}`}>
                        <Icon className={`h-4 w-4 ${stepStatus === 'current' ? 'text-blue-400' : styles.textMuted}`} />
                        <span className={stepStatus === 'current' ? 'text-blue-400' : styles.textSecondary}>
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="space-y-2">
                <p className={`text-xs uppercase tracking-[0.18em] ${styles.textMuted}`}>设备清单</p>
                <p className={`whitespace-pre-wrap text-sm ${styles.textSecondary}`}>{shooting.equipment || '-'}</p>
              </section>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
