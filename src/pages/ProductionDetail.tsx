import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  ChevronLeft,
  Clock,
  FileText,
  PanelRight,
  PanelRightClose,
  Save,
  Trash2,
} from 'lucide-react';
import { useAppStore, useAuthStore } from '../store';
import {
  deleteProduction,
  getProductionById,
  getProductionHistory,
  updateProduction,
} from '../api';
import type { Production as ProductionType, ProductionHistory, Topic } from '../types';
import { getTopic } from '../api';
import ContentEditor from '../components/ContentEditor';
import { getCollaborationRoomId } from '../collaboration/core/events';
import { cancelDatabaseSync, syncToDatabase } from '../collaboration/core/writeConsistency';
import { getTimelineView, recordTimelineEvent } from '../editor/timeline/unifiedContentTimeline';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { usePermission } from '../hooks/usePermission';
import { formatBeijingTime } from '../lib/utils';
import { setCurrentContentDocument } from '../content/orchestrator/currentContentDocument';
import { editorStateLabel, useEditorEventState } from '../editor/state/editorStateManager';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  review: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  approved: 'bg-green-500/20 text-green-400 border-green-500/30',
  rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const STATUS_TEXT: Record<string, string> = {
  draft: '草稿',
  review: '审核中',
  approved: '已通过',
  rejected: '已驳回',
};

const NEXT_STATUSES: Record<string, string> = {
  draft: 'review',
  review: 'approved',
  approved: 'approved',
  rejected: 'draft',
};

type HistoryVersion = ProductionHistory & {
  content_markdown?: string;
  content_json?: string;
};

type VersionEntry = {
  id: string;
  version: string;
  changeType: 'minor' | 'major' | 'current';
  content: string;
  contentMarkdown: string;
  status: string;
  operatorName?: string;
  createdAt: string;
  isCurrent: boolean;
};

function normalizeVersionContent(contentMarkdown?: string, content?: string) {
  return contentMarkdown || content || '<p class="text-gray-500">暂无内容</p>';
}

function parseVersionParts(version: string) {
  const match = String(version || 'v1.0').match(/^v?(\d+)\.(\d+)$/);

  if (!match) {
    return { major: 1, minor: 0 };
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
  };
}

export default function ProductionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const appStore = useAppStore();
  const authStore = useAuthStore();
  const styles = useThemeStyles();
  const { hasPermission } = usePermission();

  const [production, setProduction] = useState<ProductionType | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [history, setHistory] = useState<HistoryVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [editMode, setEditMode] = useState(true);
  const [editData, setEditData] = useState({
    content: '',
    status: 'draft',
  });
  const [selectedVersionId, setSelectedVersionId] = useState<string>('current');
  const lastAutoSavedContentRef = useRef('');

  const canDelete = hasPermission('production:delete');
  const activeDocId = production ? getCollaborationRoomId('production', production.id) : undefined;
  const syncStatus = useEditorEventState(activeDocId);

  const fetchData = async () => {
    if (!id) return;

    setLoading(true);

    try {
      const productionData = await getProductionById(Number.parseInt(id, 10));
      setProduction(productionData);
      setCurrentContentDocument(
        getCollaborationRoomId('production', productionData.id),
        productionData.topic_title || `创作 ${productionData.id}`,
      );
      setEditData({
        content: productionData.content || '',
        status: productionData.status,
      });
      lastAutoSavedContentRef.current = productionData.content || '';

      const [topicData, historyData] = await Promise.all([
        getTopic(productionData.topic_id),
        getProductionHistory(Number.parseInt(id, 10)),
      ]);

      setTopic(topicData);
      setHistory(historyData);
      setSelectedVersionId('current');
    } catch (error) {
      appStore.addNotification({
        title: '获取创作详情失败',
        message: (error as Error).message,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [id]);

  const versionEntries = useMemo<VersionEntry[]>(() => {
    if (!production) {
      return [];
    }

    const currentEntry: VersionEntry = {
      id: 'current',
      version: production.version || 'v1.0',
      changeType: 'current',
      content: production.content || '',
      contentMarkdown: normalizeVersionContent(
        (production as ProductionType & { contentMarkdown?: string; content_markdown?: string }).contentMarkdown ||
          (production as ProductionType & { content_markdown?: string }).content_markdown,
        production.content,
      ),
      status: production.status,
      operatorName: production.operator_name,
      createdAt: production.updated_at || production.created_at,
      isCurrent: true,
    };

    const historyEntries: VersionEntry[] = history.map((record) => ({
      id: `history-${record.id}`,
      version: record.version || 'v1.0',
      changeType: record.change_type === 'major' ? 'major' : 'minor',
      content: record.content || '',
      contentMarkdown: normalizeVersionContent(record.content_markdown, record.content),
      status: record.status,
      operatorName: record.operator_name,
      createdAt: record.created_at,
      isCurrent: false,
    }));

    return [currentEntry, ...historyEntries];
  }, [history, production]);

  const selectedVersion =
    versionEntries.find((entry) => entry.id === selectedVersionId) || versionEntries[0] || null;
  const timelineView = useMemo(() => {
    if (!production) return getTimelineView('production:unknown');
    return getTimelineView(getCollaborationRoomId('production', production.id), {
      versionEvents: versionEntries.map((entry) => ({
        id: entry.id,
        timestamp: new Date(entry.createdAt).getTime(),
        version: entry.version,
        changeType: entry.changeType,
        operatorName: entry.operatorName,
        status: entry.status,
        label: entry.isCurrent ? '当前版本' : '历史版本',
      })),
    });
  }, [production, versionEntries]);

  const majorVersionEntries = useMemo(() => {
    const latestByMajor = new Map<number, VersionEntry>();

    for (const entry of versionEntries) {
      const { major, minor } = parseVersionParts(entry.version);
      const existing = latestByMajor.get(major);

      if (!existing) {
        latestByMajor.set(major, entry);
        continue;
      }

      const existingParts = parseVersionParts(existing.version);
      const isHigherMinor = minor > existingParts.minor;
      const isSameMinorButCurrentPreferred = minor === existingParts.minor && entry.isCurrent && !existing.isCurrent;

      if (isHigherMinor || isSameMinorButCurrentPreferred) {
        latestByMajor.set(major, entry);
      }
    }

    return Array.from(latestByMajor.values()).sort((a, b) => {
      const aParts = parseVersionParts(a.version);
      const bParts = parseVersionParts(b.version);

      if (aParts.major !== bParts.major) {
        return bParts.major - aParts.major;
      }

      return bParts.minor - aParts.minor;
    });
  }, [versionEntries]);

  useEffect(() => {
    if (!production) return;

    const docId = getCollaborationRoomId('production', production.id);
    for (const entry of versionEntries) {
      recordTimelineEvent({
        id: `production:${production.id}:version:${entry.id}`,
        docId,
        timestamp: new Date(entry.createdAt).getTime(),
        type: 'version',
        source: 'version',
        userId: entry.operatorName,
        payload: {
          version: entry.version,
          changeType: entry.changeType,
          status: entry.status,
          label: entry.isCurrent ? '当前版本' : '历史版本',
        },
      });
    }
  }, [production, versionEntries]);

  const startEditing = () => {
    if (!production) return;
    setSelectedVersionId('current');
    setEditData({
      content: production.content || editData.content || '',
      status: production.status,
    });
    setEditMode(true);
  };

  useEffect(() => {
    if (!production || selectedVersionId !== 'current') return;
    if (editData.content === lastAutoSavedContentRef.current) return;

    syncToDatabase({
      docId: getCollaborationRoomId('production', production.id),
      content: editData.content,
      previousContent: lastAutoSavedContentRef.current,
      persist: (content) => updateProduction(production.id, {
        topic_id: production.topic_id,
        version: production.version,
        content,
        status: editData.status,
        version_action: 'none',
      }).then(() => undefined),
      onSynced: (content) => {
        lastAutoSavedContentRef.current = content;
      },
      onError: () => {
        // 手动保存仍会展示完整错误提示，这里保持静默避免多人输入时打断。
      },
    });

    return () => {
      cancelDatabaseSync(getCollaborationRoomId('production', production.id));
    };
  }, [editData.content, editData.status, production, selectedVersionId]);

  const handleVersionedSave = async (versionAction: 'minor' | 'major') => {
    if (!production) return;

    try {
      const result = await updateProduction(production.id, {
        topic_id: production.topic_id,
        version: production.version,
        content: editData.content,
        status: editData.status,
        change_type: versionAction,
        version_action: versionAction,
      });

      appStore.addNotification({
        title: versionAction === 'major' ? '已另开新版' : '小修改已保存',
        message: `当前版本已更新为 ${result.version || production.version}`,
        type: 'success',
      });

      setEditMode(true);
      await fetchData();
    } catch (error) {
      appStore.addNotification({
        title: '保存失败',
        message: (error as Error).message,
        type: 'error',
      });
    }
  };

  const handleSubmitReview = async () => {
    if (!production) return;

    try {
      await updateProduction(production.id, {
        topic_id: production.topic_id,
        version: production.version,
        content: editData.content,
        status: 'review',
        version_action: 'none',
      });

      appStore.addNotification({
        title: '提交成功',
        message: '创作内容已提交审核',
        type: 'success',
      });

      setEditMode(true);
      await fetchData();
    } catch (error) {
      appStore.addNotification({
        title: '提交失败',
        message: (error as Error).message,
        type: 'error',
      });
    }
  };

  const handleStatusUpdate = async (status: string) => {
    if (!production) return;

    try {
      await updateProduction(production.id, {
        topic_id: production.topic_id,
        version: production.version,
        content: production.content,
        status,
        version_action: 'none',
      });

      appStore.addNotification({
        title: '状态更新成功',
        message: '创作状态已同步',
        type: 'success',
      });

      await fetchData();
    } catch (error) {
      appStore.addNotification({
        title: '更新失败',
        message: (error as Error).message,
        type: 'error',
      });
    }
  };

  const handleDelete = async () => {
    if (!production) return;

    try {
      await deleteProduction(production.id);
      appStore.addNotification({
        title: '删除成功',
        message: '创作记录已删除',
        type: 'success',
      });
      navigate('/production');
    } catch (error) {
      appStore.addNotification({
        title: '删除失败',
        message: (error as Error).message,
        type: 'error',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!production) {
    return <p className="text-gray-400 text-center py-8">创作记录不存在</p>;
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-4">
      <style>{`
        .production-preview mark {
          border-radius: 2px;
          padding: 0 2px;
        }
        .production-preview mark[data-color="yellow"] { background-color: ${styles.isDark ? '#713f12' : '#fef08a'}; }
        .production-preview mark[data-color="green"] { background-color: ${styles.isDark ? '#166534' : '#bbf7d0'}; }
        .production-preview mark[data-color="blue"] { background-color: ${styles.isDark ? '#1e40af' : '#bfdbfe'}; }
        .production-preview mark[data-color="red"] { background-color: ${styles.isDark ? '#991b1b' : '#fecaca'}; }
        .production-preview mark[data-color="purple"] { background-color: ${styles.isDark ? '#6b21a8' : '#ddd6fe'}; }
        .production-preview mark[data-color="orange"] { background-color: ${styles.isDark ? '#9a3412' : '#fed7aa'}; }
        .production-preview mark[data-color="gray"] { background-color: ${styles.isDark ? '#4b5563' : '#e5e7eb'}; }
        .production-preview mark[data-color="cyan"] { background-color: ${styles.isDark ? '#155e75' : '#a5f3fc'}; }
        .production-preview mark:not([data-color]) { background-color: ${styles.isDark ? '#713f12' : '#fef08a'}; }
      `}</style>
      <div className={`sticky top-16 z-30 shrink-0 border-b ${styles.border} px-3 py-2 ${styles.bgPrimary} backdrop-blur`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate('/production')}
              className={`p-2 rounded-lg ${styles.hoverBg} transition-colors`}
            >
              <ChevronLeft className={`w-5 h-5 ${styles.textSecondary}`} />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <h1 className={`text-base font-semibold truncate ${styles.textPrimary}`}>
                  {production.topic_title || '创作详情'}
                </h1>
                <span className={`text-xs ${styles.textMuted}`}>{production.version || 'v1.0'}</span>
                <button
                  onClick={() => navigate(`/topics/${production.topic_id}`)}
                  className="max-w-[220px] truncate text-xs text-blue-400 hover:text-blue-300"
                >
                  {topic?.title || production.topic_title || '关联选题'}
                </button>
                <span className={`text-xs ${styles.textMuted}`}>{formatBeijingTime(production.updated_at)}</span>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${STATUS_COLORS[production.status]}`}>
                  {STATUS_TEXT[production.status] || production.status}
                </span>
                <span className={`text-xs ${syncStatus === 'conflicted' ? 'text-red-400' : syncStatus === 'saving' ? 'text-blue-400' : styles.textMuted}`}>
                  {editorStateLabel(syncStatus)}
                </span>
                <span className={`text-xs ${styles.textMuted}`}>时间轴 {timelineView.timeline.length} 个节点</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowSidebar((prev) => !prev)}
              className={`p-2 rounded-lg ${styles.hoverBg} transition-colors`}
              title={showSidebar ? '折叠版本历史' : '展开版本历史'}
            >
              {showSidebar ? (
                <PanelRightClose className={`w-4 h-4 ${styles.textSecondary}`} />
              ) : (
                <PanelRight className={`w-4 h-4 ${styles.textSecondary}`} />
              )}
            </button>

            <button
              onClick={startEditing}
              className={`px-3 py-1.5 rounded-lg text-xs ${selectedVersionId === 'current' ? styles.buttonSecondary : styles.buttonPrimary}`}
            >
              编辑当前版本
            </button>

            {production.status !== 'approved' && (
              <button
                onClick={() => handleStatusUpdate(NEXT_STATUSES[production.status])}
                className="px-3 py-1.5 rounded-lg text-xs bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors flex items-center gap-1.5"
              >
                <ArrowRight className="w-4 h-4" />
                {production.status === 'draft'
                  ? '提交审核'
                  : production.status === 'review'
                    ? '审核通过'
                    : '重新编辑'}
              </button>
            )}

            {production.status === 'approved' && (
              <button
                onClick={() => navigate('/shooting')}
                className="px-3 py-1.5 rounded-lg text-xs bg-purple-600 text-white font-medium hover:bg-purple-700 transition-colors flex items-center gap-1.5"
              >
                <ArrowRight className="w-4 h-4" />
                进入成片制作
              </button>
            )}

            {canDelete && (
              <button
                onClick={() => setShowDeleteModal(true)}
                className={`p-2 rounded-lg ${styles.buttonDanger} transition-colors`}
                title="删除创作记录"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-h-0 flex-col">
            <div className={`sticky top-[calc(4rem+53px)] z-20 px-6 py-2 border-b ${styles.border} ${styles.bgPrimary} flex items-center justify-between gap-3 backdrop-blur`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className={`text-base font-semibold ${styles.textPrimary}`}>
                      {selectedVersion?.version || production.version}
                    </span>
                    {selectedVersion && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          selectedVersion.changeType === 'major'
                            ? 'bg-purple-500/20 text-purple-400'
                            : selectedVersion.changeType === 'minor'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-emerald-500/20 text-emerald-400'
                        }`}
                      >
                        {selectedVersion.changeType === 'major'
                          ? '另开新版'
                          : selectedVersion.changeType === 'minor'
                            ? '小修改'
                            : '当前生效'}
                      </span>
                    )}
                    {!selectedVersion?.isCurrent && (
                      <span className={`text-xs ${styles.textMuted}`}>
                        历史版本只读预览
                      </span>
                    )}
                  </div>
                </div>

                {!selectedVersion?.isCurrent && (
                  <button
                    onClick={() => setSelectedVersionId('current')}
                    className={`px-3 py-1.5 rounded-lg text-sm ${styles.buttonSecondary}`}
                  >
                    回到当前版本
                  </button>
                )}
              </div>

            </div>

            <div className="min-h-0">
              {selectedVersion?.isCurrent ? (
                <div className="min-h-[calc(100vh-13rem)]">
                  <ContentEditor
                    value={editData.content}
                    onChange={(content) => setEditData((prev) => ({ ...prev, content }))}
                    mode="rich"
                    collaborationKey={getCollaborationRoomId('production', production.id)}
                    persistenceStatus={syncStatus}
                    immersive
                  />
                </div>
              ) : (
                <div className="p-6 lg:p-8">
                  <div
                    className={`production-preview tiptap max-w-none ${styles.textPrimary} leading-relaxed prose ${styles.isDark ? 'prose-invert' : ''}`}
                    dangerouslySetInnerHTML={{
                      __html:
                        selectedVersion?.contentMarkdown ||
                        normalizeVersionContent(
                          (production as ProductionType & {
                            contentMarkdown?: string;
                            content_markdown?: string;
                          }).contentMarkdown ||
                            (production as ProductionType & { content_markdown?: string }).content_markdown,
                          production.content,
                        ),
                    }}
                  />
                </div>
              )}
            </div>
          </div>

        </div>

        {showSidebar && (
          <aside className={`${styles.bgSecondary} border ${styles.border} rounded-2xl w-80 shrink-0 hidden xl:flex xl:flex-col`}>
            <div className={`px-5 py-4 border-b ${styles.border} flex items-center justify-between`}>
              <div>
                <p className={`text-xs uppercase tracking-[0.24em] ${styles.textMuted}`}>版本历史</p>
                <h2 className={`text-sm font-semibold mt-1 ${styles.textPrimary}`}>版本切换面板</h2>
              </div>
              <button
                onClick={() => setShowSidebar(false)}
                className={`p-2 rounded-lg ${styles.hoverBg}`}
              >
                <PanelRightClose className={`w-4 h-4 ${styles.textSecondary}`} />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="flex items-center justify-between gap-2">
                <p className={`text-xs uppercase tracking-[0.24em] ${styles.textMuted}`}>
                  版本历史
                </p>
                <span className={`text-[11px] ${styles.textMuted}`}>
                  版本已纳入统一时间轴
                </span>
              </div>
              <div className="space-y-2">
                {majorVersionEntries.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => {
                      setSelectedVersionId(entry.id);
                    }}
                    className={`w-full text-left rounded-xl border px-3 py-3 transition-colors ${
                      selectedVersionId === entry.id
                        ? 'border-blue-500 bg-blue-500/10'
                        : `${styles.border} ${styles.bgTertiary} ${styles.hoverBg}`
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-semibold ${
                        selectedVersionId === entry.id ? 'text-blue-400' : styles.textPrimary
                      }`}>
                        {entry.version}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] ${
                          entry.changeType === 'major'
                            ? 'bg-purple-500/20 text-purple-400'
                            : entry.changeType === 'minor'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-emerald-500/20 text-emerald-400'
                        }`}
                      >
                        {entry.changeType === 'major'
                          ? '另开新版'
                          : entry.changeType === 'minor'
                            ? '小修改'
                            : '当前'}
                      </span>
                    </div>
                    <p className={`text-[11px] mt-2 ${styles.textMuted}`}>
                      {formatBeijingTime(entry.createdAt)}
                    </p>
                  </button>
                ))}
                {majorVersionEntries.length === 0 && (
                  <div className={`rounded-xl ${styles.bgTertiary} px-3 py-3 text-sm ${styles.textMuted}`}>
                    暂无版本历史
                  </div>
                )}
              </div>

              <div className={`pt-4 border-t ${styles.border} space-y-2`}>
                <p className={`text-xs uppercase tracking-[0.18em] ${styles.textMuted}`}>版本操作</p>
                <button
                  onClick={startEditing}
                  className={`w-full px-3 py-2 rounded-lg text-xs ${styles.buttonSecondary}`}
                >
                  当前版本查看 / 编辑
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleVersionedSave('minor')}
                    className="px-3 py-2 rounded-lg text-xs bg-blue-600 hover:bg-blue-700 text-white transition-colors inline-flex items-center justify-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    小修改保存
                  </button>
                  <button
                    onClick={() => handleVersionedSave('major')}
                    className="px-3 py-2 rounded-lg text-xs bg-purple-600 hover:bg-purple-700 text-white transition-colors inline-flex items-center justify-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    另开新版
                  </button>
                </div>
                {editData.status === 'draft' && (
                  <button
                    onClick={handleSubmitReview}
                    className="w-full px-3 py-2 rounded-lg text-xs bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-medium hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    提交审核
                  </button>
                )}
              </div>

              <div className={`pt-4 border-t ${styles.border} space-y-3`}>
                <div>
                  <p className={`text-xs uppercase tracking-[0.18em] ${styles.textMuted}`}>关联选题</p>
                  <button
                    onClick={() => navigate(`/topics/${production.topic_id}`)}
                    className="mt-2 text-left text-sm text-blue-400 hover:text-blue-300"
                  >
                    {topic?.title || production.topic_title || '-'}
                  </button>
                </div>
                <div>
                  <p className={`text-xs uppercase tracking-[0.18em] ${styles.textMuted}`}>审核状态</p>
                  <p className={`mt-2 text-sm ${styles.textSecondary}`}>{STATUS_TEXT[production.status] || production.status}</p>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`${styles.modal} p-6 w-full max-w-md mx-4`}>
            <h2 className={`text-xl font-bold ${styles.textPrimary} mb-2`}>确认删除</h2>
            <p className={`${styles.textSecondary} mb-6`}>
              确定要删除这条创作记录吗？该操作会同时移除相关版本历史。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm ${styles.buttonSecondary}`}
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm bg-red-600 hover:bg-red-700 text-white transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
