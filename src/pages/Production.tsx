import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { getProduction, createProduction, getTopics, updateProduction } from '../api';
import { Production as ProductionType, Topic } from '../types';
import { Plus, Search, FileText, Edit3, ChevronLeft, ChevronRight } from 'lucide-react';
import { ActionButton, ResponsiveTableShell } from '@/components/studio';
import BaseModal from '../components/common/BaseModal';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useSocket } from '../hooks/useSocket';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { formatBeijingDate } from '../lib/utils';

const PAGE_SIZE = 20;

const useAutoResizeTextarea = (value: string, minHeight = 100, maxHeight = 300) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const resize = () => {
      textarea.style.height = 'auto';
      const computedStyle = window.getComputedStyle(textarea);
      const paddingTop = parseInt(computedStyle.paddingTop) || 0;
      const paddingBottom = parseInt(computedStyle.paddingBottom) || 0;
      const scrollHeight = textarea.scrollHeight;
      const newHeight = Math.min(Math.max(scrollHeight + paddingTop + paddingBottom, minHeight), maxHeight);
      textarea.style.height = `${newHeight}px`;
    };

    resize();

    const observer = new MutationObserver(resize);
    if (textarea.parentNode) {
      observer.observe(textarea.parentNode, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    return () => observer.disconnect();
  }, [value, minHeight, maxHeight]);

  return textareaRef;
};

export default function Production() {
  const [productions, setProductions] = useState<ProductionType[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [listLoadAttempt, setListLoadAttempt] = useState(0);
  const [savingRecord, setSavingRecord] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState({ topic_id: '', version: '', content: '', status: 'draft' });
  const [editingProduction, setEditingProduction] = useState<ProductionType | null>(null);
  const pendingRefreshContextRef = useRef<string | null>(null);
  const saveInFlightRef = useRef(false);
  
  const createTextareaRef = useAutoResizeTextarea(formData.content, 100, 300);
  const editTextareaRef = useAutoResizeTextarea(formData.content, 100, 300);
  
  const navigate = useNavigate();
  const addNotification = useAppStore((store) => store.addNotification);
  const styles = useThemeStyles();
  const closeCreateModal = useCallback(() => {
    if (!savingRecord) setShowCreateModal(false);
  }, [savingRecord]);
  const closeEditModal = useCallback(() => {
    if (savingRecord) return;
    setShowEditModal(false);
    setEditingProduction(null);
  }, [savingRecord]);

  const fetchProductionPage = useCallback(async (nextPage: number) => {
    return getProduction({ page: nextPage, limit: PAGE_SIZE });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refreshContext = pendingRefreshContextRef.current;
    pendingRefreshContextRef.current = null;
    setLoading(true);
    setListError('');
    void fetchProductionPage(page).then((result) => {
      if (cancelled) return;
      setProductions(result.data);
      setTotal(result.total);
    }).catch(() => {
      if (cancelled) return;
      setListError(refreshContext
        ? `服务端已确认${refreshContext}，但列表刷新失败；请重新加载列表确认，不要重复提交。`
        : '创作列表读取失败，请重新加载列表。');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [page, listLoadAttempt, fetchProductionPage]);

  useEffect(() => {
    let cancelled = false;
    void getTopics({ page: 1, limit: 100 }).then((topicList) => {
      if (cancelled) return;
      setTopics(topicList.data.filter((topic) => topic.status === 'approved' || topic.status === 'production'));
    }).catch(() => {
      if (!cancelled) addNotification({ title: '选题读取失败', message: '创作列表仍可查看；新增创作暂不可用，请重新加载页面后重试。', type: 'error' });
    });
    return () => { cancelled = true; };
  }, [addNotification]);

  const retryProductionList = () => {
    pendingRefreshContextRef.current = null;
    setListLoadAttempt((attempt) => attempt + 1);
  };

  const refreshAfterConfirmedWrite = (context: string, targetPage = page) => {
    pendingRefreshContextRef.current = context;
    if (targetPage !== page) setPage(targetPage);
    else setListLoadAttempt((attempt) => attempt + 1);
  };

  const socket = useSocket();

  // ===== 实时协作 =====
  useRealtimeSync({
    room: 'production',
    socket,
    events: {
      'production:created': () => {
        void fetchProductionPage(page).then((result) => {
          setProductions(result.data);
          setTotal(result.total);
          setListError('');
        }).catch(() => {
          setListError('创作列表未能实时更新；当前内容可能不是最新的，请重新加载列表。');
        });
      },
      'production:updated': (data) => {
        setProductions(prev => prev.map(p => p.id === data.id ? { ...p, ...data } : p));
      },
      'production:deleted': (data) => {
        setProductions(prev => prev.filter(p => p.id !== data.id));
      },
    },
  });

  const handleCreate = async () => {
    if (saveInFlightRef.current) return;
    if (!formData.topic_id) {
      addNotification({ title: '创建失败', message: '请选择关联选题', type: 'error' });
      return;
    }

    saveInFlightRef.current = true;
    setSavingRecord(true);
    try {
      await createProduction({
        topic_id: parseInt(formData.topic_id), 
        version: formData.version, 
        content: formData.content, 
        status: formData.status,
      });
    } catch (error) {
      addNotification({ title: '创建失败', message: (error as Error).message, type: 'error' });
      return;
    } finally {
      saveInFlightRef.current = false;
      setSavingRecord(false);
    }

    const topicTitle = topics.find((topic) => topic.id === Number(formData.topic_id))?.title ?? '当前选题';
    const versionLabel = formData.version.trim() ? `（${formData.version.trim()}）` : '';
    addNotification({ title: '创建成功', message: `创作记录「${topicTitle}」已添加`, type: 'success' });
    setShowCreateModal(false);
    setFormData({ topic_id: '', version: '', content: '', status: 'draft' });
    setTotal((current) => current + 1);
    refreshAfterConfirmedWrite(`创作记录「${topicTitle}」${versionLabel}已创建`, 1);
  };

  const handleEdit = (production: ProductionType) => {
    setEditingProduction(production);
    setFormData({ 
      topic_id: production.topic_id.toString(), 
      version: production.version, 
      content: production.content, 
      status: production.status 
    });
    setShowEditModal(true);
  };

  const handleUpdate = async () => {
    if (saveInFlightRef.current) return;
    if (!editingProduction || !formData.topic_id) {
      addNotification({ title: '更新失败', message: '请选择关联选题', type: 'error' });
      return;
    }

    const productionToUpdate = editingProduction;
    const nextTopicId = parseInt(formData.topic_id);
    saveInFlightRef.current = true;
    setSavingRecord(true);
    try {
      await updateProduction(productionToUpdate.id, {
        topic_id: nextTopicId,
        version: formData.version, 
        content: formData.content, 
        expected_content: productionToUpdate.content,
        status: formData.status,
        version_action: 'none',
      });
    } catch (error) {
      addNotification({ title: '更新失败', message: (error as Error).message, type: 'error' });
      return;
    } finally {
      saveInFlightRef.current = false;
      setSavingRecord(false);
    }

    const topicTitle = topics.find((topic) => topic.id === nextTopicId)?.title;
    const confirmedTopicTitle = topicTitle ?? productionToUpdate.topic_title ?? '当前选题';
    setProductions((current) => current.map((production) => production.id === productionToUpdate.id
      ? { ...production, topic_id: nextTopicId, topic_title: topicTitle ?? production.topic_title, version: formData.version, content: formData.content, status: formData.status }
      : production));
    addNotification({ title: '更新成功', message: '创作记录已保存', type: 'success' });
    setShowEditModal(false);
    setEditingProduction(null);
    setFormData({ topic_id: '', version: '', content: '', status: 'draft' });
    refreshAfterConfirmedWrite(`创作记录「${confirmedTopicTitle}」${formData.version.trim() ? `（${formData.version.trim()}）` : ''}已保存`);
  };

  const topicStatusColors: Record<string, string> = {
    pending: 'bg-studio-amber-soft text-studio-amber-contrast border-studio-border-soft',
    approved: 'bg-studio-success-soft text-studio-success-contrast border-studio-border-soft',
    rejected: 'bg-studio-coral-soft text-studio-coral-contrast border-studio-border-soft',
    production: 'bg-studio-primary-soft text-studio-primary-contrast border-studio-border-soft',
    shooting: 'bg-studio-violet-soft text-studio-violet-contrast border-studio-border-soft',
    publishing: 'bg-studio-cyan-soft text-studio-cyan-contrast border-studio-border-soft',
    completed: 'bg-studio-surface-soft text-studio-text-muted border-studio-border-soft',
  };

  const topicStatusText: Record<string, string> = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已驳回',
    production: '创作中',
    shooting: '成片制作',
    publishing: '发布中',
    completed: '已完成',
  };

  const productionStatusColors: Record<string, string> = {
    draft: 'bg-studio-amber-soft text-studio-amber-contrast border-studio-border-soft',
    review: 'bg-studio-primary-soft text-studio-primary-contrast border-studio-border-soft',
    approved: 'bg-studio-success-soft text-studio-success-contrast border-studio-border-soft',
    rejected: 'bg-studio-coral-soft text-studio-coral-contrast border-studio-border-soft',
  };

  const productionStatusText: Record<string, string> = {
    draft: '草稿',
    review: '审核中',
    approved: '已通过',
    rejected: '已驳回',
  };

  const normalizedSearchTerm = searchTerm.toLowerCase();
  const filteredProductions = productions.filter((production) =>
    String(production.topic_title ?? '').toLowerCase().includes(normalizedSearchTerm) ||
    String(production.version ?? '').toLowerCase().includes(normalizedSearchTerm),
  );
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight ${styles.textPrimary}`}>创作管理</h1>
          <p className={`${styles.textSecondary} mt-1 text-sm`}>管理创作内容的版本和审核</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className={`flex items-center gap-2 px-5 py-2.5 ${styles.buttonPrimary} rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]`}
        >
          <Plus className="w-4 h-4" />
          <span className="font-medium text-sm">添加创作</span>
        </button>
      </div>

      <div className={`${styles.card} p-4`}>
        <div className="relative">
          <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${styles.textMuted}`} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜索选题标题或版本号..."
            className={`w-full pl-10 pr-4 py-2.5 ${styles.input} text-sm`}
          />
        </div>
      </div>

      {listError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-studio-border-soft bg-studio-coral-soft px-4 py-3 text-sm text-studio-coral-contrast">
        <span>{listError}</span>
        <ActionButton type="button" variant="secondary" onClick={retryProductionList}>重新加载列表</ActionButton>
      </div> : null}

      <ResponsiveTableShell
        className={styles.card}
        footer={(
          <div className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${styles.border}`}>
            <p className={`text-sm ${styles.textMuted}`}>
              共 {total} 条 · 第 {page} / {totalPages} 页{searchTerm ? ` · 当前页匹配 ${filteredProductions.length} 条` : ''}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || loading}
                className={`inline-flex min-h-10 items-center gap-1 rounded-button px-3 py-2 text-sm ${styles.buttonSecondary} disabled:cursor-not-allowed disabled:opacity-45`}
              >
                <ChevronLeft className="h-4 w-4" /> 上一页
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages || loading}
                className={`inline-flex min-h-10 items-center gap-1 rounded-button px-3 py-2 text-sm ${styles.buttonSecondary} disabled:cursor-not-allowed disabled:opacity-45`}
              >
                下一页 <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      >
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className={styles.tableHeader}>
                <th className={`text-left px-6 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>关联选题</th>
                <th className={`text-left px-6 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>版本</th>
                <th className={`text-left px-6 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>状态</th>
                <th className={`text-left px-6 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>负责人</th>
                <th className={`text-left px-6 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>创建时间</th>
                <th className="sticky right-0 z-20 w-[104px] border-l border-studio-border-soft bg-studio-surface-soft px-2 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-studio-text-muted">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className={`w-8 h-8 border-4 ${styles.spinner} border-t-transparent rounded-full animate-spin mx-auto`}></div>
                  </td>
                </tr>
              ) : filteredProductions.length === 0 && listError ? (
                <tr>
                  <td colSpan={6} className={`px-6 py-12 text-center ${styles.textSecondary}`}>列表暂不可用，请先重新加载确认内容。</td>
                </tr>
              ) : filteredProductions.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`px-6 py-12 text-center ${styles.textSecondary}`}>暂无创作记录</td>
                </tr>
              ) : (
                filteredProductions.map((production) => (
                  <tr key={production.id} className={`group border-t ${styles.tableRow} ${styles.tableHover}`}>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => navigate(`/production/${production.id}`)}
                        className="flex items-center gap-2 text-studio-primary hover:text-studio-primary"
                      >
                        <FileText className="w-4 h-4" />
                        <span className={`${styles.textPrimary} font-medium`}>{production.topic_title}</span>
                      </button>
                    </td>
                    <td className={`px-6 py-4 ${styles.textSecondary}`}>{production.version}</td>
                    <td className="px-6 py-4">
                      {(['draft', 'review'] as string[]).includes(production.status) ? (
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border ${productionStatusColors[production.status]}`}>
                          {productionStatusText[production.status]}
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border ${topicStatusColors[production.topic_status || 'production']}`}>
                          {topicStatusText[production.topic_status || 'production']}
                        </span>
                      )}
                    </td>
                    <td className={`px-6 py-4 ${styles.textSecondary}`}>{production.operator_name}</td>
                    <td className={`px-6 py-4 ${styles.textSecondary}`}>{formatBeijingDate(production.created_at)}</td>
                    <td className="sticky right-0 z-10 w-[104px] border-l border-studio-border-soft bg-studio-surface px-2 py-3 transition-colors group-hover:bg-studio-surface-soft">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigate(`/production/${production.id}`)}
                          className={`p-2 ${styles.buttonInfo} rounded-lg transition-colors`}
                          title="查看详情"
                          aria-label={`查看创作记录 ${production.topic_title}`}
                        >
                          <FileText className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleEdit(production)}
                          className={`p-2 ${styles.buttonSecondary} rounded-lg transition-colors`}
                          title="编辑记录"
                          aria-label={`编辑创作记录 ${production.topic_title}`}
                        >
                          <Edit3 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
      </ResponsiveTableShell>

      {showCreateModal && (
        <BaseModal
          open={showCreateModal}
          onClose={closeCreateModal}
          title="添加创作记录"
          size="md"
          closeOnOverlayClick={!savingRecord}
          closeOnEscape={!savingRecord}
          showCloseButton={!savingRecord}
          footer={(
            <div className="flex gap-3">
              <button
                type="button"
                disabled={savingRecord}
                onClick={closeCreateModal}
                className={`flex-1 rounded-button px-4 py-2 ${styles.buttonSecondary} transition-colors disabled:cursor-not-allowed disabled:opacity-50`}
              >
                取消
              </button>
              <button
                type="button"
                disabled={savingRecord}
                onClick={handleCreate}
                className={`flex-1 rounded-button px-4 py-2 ${styles.buttonPrimary} transition-colors disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {savingRecord ? '保存中...' : '保存'}
              </button>
            </div>
          )}
        >
            <div className="space-y-4">
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>关联选题 *</label>
                <select
                  value={formData.topic_id}
                  onChange={(e) => setFormData({ ...formData, topic_id: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.bgInput} border ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing}`}
                >
                  <option value="">请选择选题</option>
                  {topics.map(topic => (
                    <option key={topic.id} value={topic.id}>{topic.title}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>版本</label>
                <input
                  type="text"
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.bgInput} border ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing}`}
                  placeholder="如：v1.0"
                />
              </div>
              
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>内容描述</label>
                <textarea
                  ref={createTextareaRef}
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={1}
                  className={`w-full px-4 py-2 ${styles.bgInput} border ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing} transition-all duration-200 overflow-hidden`}
                  placeholder="请输入创作内容描述"
                  style={{
                    minHeight: '100px',
                    maxHeight: '300px',
                    fontSize: '18px',
                    lineHeight: '1.6'
                  }}
                />
              </div>
              
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>状态</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.bgInput} border ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing}`}
                >
                  <option value="draft">草稿</option>
                  <option value="review">审核中</option>
                  <option value="approved">已通过</option>
                  <option value="rejected">已驳回</option>
                </select>
              </div>
              
            </div>
        </BaseModal>
      )}

      {showEditModal && (
        <BaseModal
          open={showEditModal}
          onClose={closeEditModal}
          title="编辑创作记录"
          size="md"
          closeOnOverlayClick={!savingRecord}
          closeOnEscape={!savingRecord}
          showCloseButton={!savingRecord}
          footer={(
            <div className="flex gap-3">
              <button
                type="button"
                disabled={savingRecord}
                onClick={closeEditModal}
                className={`flex-1 rounded-button px-4 py-2 ${styles.buttonSecondary} transition-colors disabled:cursor-not-allowed disabled:opacity-50`}
              >
                取消
              </button>
              <button
                type="button"
                disabled={savingRecord}
                onClick={handleUpdate}
                className={`flex-1 rounded-button px-4 py-2 ${styles.buttonPrimary} transition-colors disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {savingRecord ? '保存中...' : '更新'}
              </button>
            </div>
          )}
        >
            <div className="space-y-4">
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>关联选题 *</label>
                <select
                  value={formData.topic_id}
                  onChange={(e) => setFormData({ ...formData, topic_id: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.bgInput} border ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing}`}
                >
                  <option value="">请选择选题</option>
                  {topics.map(topic => (
                    <option key={topic.id} value={topic.id}>{topic.title}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>版本</label>
                <input
                  type="text"
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.bgInput} border ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing}`}
                  placeholder="如：v1.0"
                />
              </div>
              
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>内容描述</label>
                <textarea
                  ref={editTextareaRef}
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={3}
                  className={`w-full px-4 py-2 ${styles.bgInput} border ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing} resize-none transition-all duration-200`}
                  placeholder="请输入创作内容描述"
                  style={{
                    minHeight: '100px',
                    maxHeight: '300px',
                    fontSize: '16px',
                    lineHeight: '1.6'
                  }}
                />
              </div>
              
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>状态</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.bgInput} border ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing}`}
                >
                  <option value="draft">草稿</option>
                  <option value="review">审核中</option>
                  <option value="approved">已通过</option>
                  <option value="rejected">已驳回</option>
                </select>
              </div>
              
            </div>
        </BaseModal>
      )}
    </div>
  );
}
