import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store';
import { getTopics, createTopic, deleteTopic, auditTopic } from '../api';
import { Topic } from '../types';
import { Plus, Search, Filter, Trash2, Eye, CheckCircle, XCircle, Clock, AlertTriangle, FileText, Camera, Send, Edit, ArrowUpDown, ArrowUp, ArrowDown, Square, CheckSquare } from 'lucide-react';
import RichEditor from '../components/RichTextEditor';
import { SkeletonTable } from '../components/Skeleton';
import Pagination from '../components/Pagination';
import BatchActions from '../components/BatchActions';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useDebounce } from '../hooks/useDebounce';
import { useLoading } from '../hooks/useLoading';
import { useSocket } from '../hooks/useSocket';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { showRealtimeToast } from '../components/RealtimeToast';
import { STATUS_COLORS, STATUS_TEXT, WORKFLOW_STEPS } from '../constants';
import { formatBeijingTime, formatBeijingDate } from '../lib/utils';

const statusColors = STATUS_COLORS;
const statusText = STATUS_TEXT;
const workflowSteps = WORKFLOW_STEPS;

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="w-4 h-4" />, approved: <CheckCircle className="w-4 h-4" />,
  rejected: <XCircle className="w-4 h-4" />, production: <FileText className="w-4 h-4" />,
  shooting: <Camera className="w-4 h-4" />,
  publishing: <Send className="w-4 h-4" />, completed: <CheckCircle className="w-4 h-4" />,
};

type SortField = 'title' | 'created_at' | 'deadline' | 'status' | 'submitted_at';
type SortDir = 'asc' | 'desc';

export default function Topics() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({ 
    title: '', description: '', platform: '', deadline: '',
    projectBackground: '', targetAudience: '', expectedGoal: '', budget: '',
    outline1: '', outline2: '', outline3: '', outline4: '',
  });
  
  const navigate = useNavigate();
  const appStore = useAppStore();
  const [searchParams] = useSearchParams();
  const styles = useThemeStyles();
  const debouncedSearch = useDebounce(searchTerm, 400);
  const socket = useSocket();
  const [newTopicIds, setNewTopicIds] = useState<Set<number>>(new Set());
  const newTopicIdsRef = useRef(new Set<number>());

  // 排序逻辑（前端排序，因为 API 返回当前页数据）
  const sortedTopics = useMemo(() => {
    const sorted = [...topics].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'title': cmp = (a.title || '').localeCompare(b.title || ''); break;
        case 'created_at': cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break;
        case 'deadline': cmp = new Date(a.deadline || '9999').getTime() - new Date(b.deadline || '9999').getTime(); break;
        case 'status': cmp = (a.status || '').localeCompare(b.status || ''); break;
        case 'submitted_at': cmp = new Date(a.submitted_at || '9999').getTime() - new Date(b.submitted_at || '9999').getTime(); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [topics, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-[#5c7cfa]" /> : <ArrowDown className="w-3 h-3 text-[#5c7cfa]" />;
  };

  // 全选/取消全选
  const allSelected = sortedTopics.length > 0 && sortedTopics.every(t => selected.has(t.id));
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sortedTopics.map(t => t.id)));
    }
  };
  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    const status = searchParams.get('status') || '';
    setStatusFilter(status);
    setPage(1);
  }, [searchParams]);

  useEffect(() => {
    const fetchTopics = async () => {
      setLoading(true);
      try {
        const result = await getTopics({ status: statusFilter, search: debouncedSearch, page, limit });
        setTopics(result.data);
        setTotal(result.total);
      } catch (error) {
        appStore.addNotification({ title: '获取选题列表失败', message: (error as Error).message, type: 'error' });
      } finally {
        setLoading(false);
      }
    };
    fetchTopics();
  }, [debouncedSearch, statusFilter, page]);

  // ===== 实时协作 =====
  useRealtimeSync({
    room: 'topics',
    socket,
    events: {
      'topic:created': (data) => {
        setTopics(prev => {
          if (prev.some(t => t.id === data.id)) return prev;
          return [data, ...prev];
        });
        newTopicIdsRef.current.add(data.id);
        setNewTopicIds(new Set(newTopicIdsRef.current));
        setTimeout(() => {
          newTopicIdsRef.current.delete(data.id);
          setNewTopicIds(new Set(newTopicIdsRef.current));
        }, 2000);
        showRealtimeToast({ title: '新选题', message: `「${data.title}」已提交`, icon: <FileText className="w-5 h-5 text-blue-400" /> });
      },
      'topic:updated': (data) => {
        setTopics(prev => prev.map(t => t.id === data.id ? data : t));
      },
      'topic:deleted': (data) => {
        setTopics(prev => prev.filter(t => t.id !== data.id));
      },
      'topic:audited': (data) => {
        setTopics(prev => prev.map(t => t.id === data.id ? { ...t, status: data.status } : t));
      },
    },
  });

  // 创建选题（带 loading）
  const { loading: creating, run: handleCreate } = useLoading(useCallback(async () => {
    if (!formData.title) {
      appStore.addNotification({ title: '创建失败', message: '选题标题不能为空', type: 'error' });
      return;
    }
    await createTopic(formData);
    appStore.addNotification({ title: '创建成功', message: '选题已提交审核', type: 'success' });
    setShowCreateModal(false);
    setFormData({ title: '', description: '', platform: '', deadline: '', projectBackground: '', targetAudience: '', expectedGoal: '', budget: '', outline1: '', outline2: '', outline3: '', outline4: '' });
    const result = await getTopics({ status: statusFilter, search: debouncedSearch, page, limit });
    setTopics(result.data);
    setTotal(result.total);
  }, [formData, statusFilter, debouncedSearch, page, limit, appStore]));

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个选题吗？')) return;
    try {
      await deleteTopic(id);
      appStore.addNotification({ title: '删除成功', message: '选题已删除', type: 'success' });
      setTopics(prev => prev.filter(t => t.id !== id));
      setTotal(t => t - 1);
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    } catch (error) {
      appStore.addNotification({ title: '删除失败', message: (error as Error).message, type: 'error' });
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (!confirm(`确定删除选中的 ${selected.size} 个选题？`)) return;
    let success = 0;
    for (const id of selected) {
      try { await deleteTopic(id); success++; } catch {}
    }
    appStore.addNotification({ title: '批量删除完成', message: `成功 ${success}/${selected.size}`, type: 'success' });
    setSelected(new Set());
    const result = await getTopics({ status: statusFilter, search: debouncedSearch, page, limit });
    setTopics(result.data);
    setTotal(result.total);
  };

  // 批量审核
  const handleBatchAudit = async (status: 'approved' | 'rejected') => {
    let success = 0;
    for (const id of selected) {
      try { await auditTopic(id, { status, comment: '批量审核' }); success++; } catch {}
    }
    appStore.addNotification({ title: '批量审核完成', message: `成功 ${success}/${selected.size}`, type: 'success' });
    setSelected(new Set());
    const result = await getTopics({ status: statusFilter, search: debouncedSearch, page, limit });
    setTopics(result.data);
    setTotal(result.total);
  };

  const getWorkflowProgress = (status: string) => {
    const idx = workflowSteps.findIndex(s => s.status === status);
    return { currentIndex: idx, total: workflowSteps.length - 1 };
  };

  const isOverdue = (deadline: string) => {
    return deadline && new Date(deadline) < new Date() && !['completed', 'rejected'].includes(statusFilter);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${styles.textPrimary}`}>选题管理</h1>
          <p className={`${styles.textSecondary} mt-1`}>管理所有选题的提报、审核和流转</p>
        </div>
        <button
          onClick={() => navigate('/topics/add')}
          className={`flex items-center gap-2 px-5 py-2.5 ${styles.buttonPrimary} rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]`}
        >
          <Plus className="w-4 h-4" />
          <span className="font-medium text-sm">提报选题</span>
        </button>
      </div>

      {/* 搜索和筛选 */}
      <div className={`${styles.card} p-4`}>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${styles.textMuted}`} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              placeholder="搜索选题标题或描述..."
              className={`w-full pl-10 pr-4 py-2.5 ${styles.input} text-sm`}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className={`w-4 h-4 ${styles.textMuted}`} />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className={`px-4 py-2.5 ${styles.input} text-sm`}
            >
              <option value="">全部状态</option>
              <option value="pending">待审核</option>
              <option value="approved">已通过</option>
              <option value="rejected">已驳回</option>
              <option value="production">创作中</option>
              <option value="shooting">拍摄中</option>
              <option value="publishing">发布中</option>
              <option value="completed">已完成</option>
            </select>
          </div>
        </div>
      </div>

      {/* 表格 */}
      <div className={`${styles.card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={styles.tableHeader}>
                <th className="px-4 py-3.5 w-10">
                  <button onClick={toggleSelectAll} className="p-1">
                    {allSelected ? <CheckSquare className="w-4 h-4 text-[#5c7cfa]" /> : <Square className={`w-4 h-4 ${styles.textMuted}`} />}
                  </button>
                </th>
                <th className={`text-left px-4 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>
                  <button onClick={() => toggleSort('title')} className="flex items-center gap-1 hover:text-[#5c7cfa] transition-colors">
                    标题 <SortIcon field="title" />
                  </button>
                </th>
                <th className={`text-left px-4 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>提报人</th>
                <th className={`text-left px-4 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>负责人</th>
                <th className={`text-left px-4 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>平台</th>
                <th className={`text-left px-4 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>
                  <button onClick={() => toggleSort('submitted_at')} className="flex items-center gap-1 hover:text-[#5c7cfa] transition-colors">
                    提交时间 <SortIcon field="submitted_at" />
                  </button>
                </th>
                <th className={`text-left px-4 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>
                  <button onClick={() => toggleSort('deadline')} className="flex items-center gap-1 hover:text-[#5c7cfa] transition-colors">
                    截止时间 <SortIcon field="deadline" />
                  </button>
                </th>
                <th className={`text-left px-4 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>流程</th>
                <th className={`text-left px-4 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>
                  <button onClick={() => toggleSort('status')} className="flex items-center gap-1 hover:text-[#5c7cfa] transition-colors">
                    状态 <SortIcon field="status" />
                  </button>
                </th>
                <th className={`text-left px-4 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-0"><SkeletonTable rows={5} cols={10} /></td></tr>
              ) : sortedTopics.length === 0 ? (
                <tr><td colSpan={10} className={`px-6 py-12 text-center ${styles.textSecondary}`}>暂无选题</td></tr>
              ) : (
                sortedTopics.map((topic) => {
                  const progress = getWorkflowProgress(topic.status);
                  const isSelected = selected.has(topic.id);
                  return (
                    <tr key={topic.id} className={`border-t ${styles.tableRow} ${styles.tableHover} ${isSelected ? (styles.isDark ? 'bg-[#5c7cfa]/5' : 'bg-[#4263eb]/5') : ''} ${newTopicIds.has(topic.id) ? 'animate-new-item new-item-highlight' : ''}`}>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleSelect(topic.id)} className="p-1">
                          {isSelected ? <CheckSquare className="w-4 h-4 text-[#5c7cfa]" /> : <Square className={`w-4 h-4 ${styles.textMuted}`} />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isOverdue(topic.deadline) && <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                          <button onClick={() => navigate(`/topics/${topic.id}`)} className={`${styles.textPrimary} font-medium truncate max-w-[200px] hover:text-blue-400 transition-colors text-left`}>{topic.title}</button>
                        </div>
                      </td>
                      <td className={`px-4 py-3 ${styles.textSecondary} text-sm`}>{topic.creator_name}</td>
                      <td className={`px-4 py-3 ${styles.textSecondary} text-sm`}>{topic.assignee_name || '未指派'}</td>
                      <td className={`px-4 py-3 ${styles.textSecondary} text-sm`}>{topic.platform || '-'}</td>
                      <td className={`px-4 py-3 ${styles.textSecondary} text-sm`}>
                        {formatBeijingTime(topic.submitted_at)}
                      </td>
                      <td className={`px-4 py-3 text-sm ${isOverdue(topic.deadline) ? 'text-red-400' : styles.textSecondary}`}>
                        {formatBeijingDate(topic.deadline)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {workflowSteps.map((step, index) => (
                            <div key={step.status} className="flex items-center">
                              <div className={`w-2 h-2 rounded-full ${index <= progress.currentIndex ? step.color : styles.pendingStep}`} />
                              {index < workflowSteps.length - 1 && <div className={`w-4 h-0.5 ${index < progress.currentIndex ? step.color : styles.pendingStep}`} />}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border ${(statusColors[topic.status] || statusColors.pending).bg} ${(statusColors[topic.status] || statusColors.pending).text} ${(statusColors[topic.status] || statusColors.pending).border}`}>
                          {statusText[topic.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => navigate(`/topics/${topic.id}`)} className={`p-1.5 ${styles.buttonInfo} rounded-lg transition-colors`} title="查看详情">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(topic.id)} className={`p-1.5 ${styles.buttonDanger} rounded-lg transition-colors`} title="删除">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        <Pagination page={page} total={total} limit={limit} onChange={setPage} />
      </div>

      {/* 批量操作浮动栏 */}
      <BatchActions
        selectedCount={selected.size}
        onBatchDelete={handleBatchDelete}
        onBatchStatusChange={handleBatchAudit}
        onClearSelection={() => setSelected(new Set())}
      />

      {/* 创建弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}>
          <div className={`${styles.bgSecondary} rounded-xl p-6 w-full max-w-lg mx-4 border ${styles.border} max-h-[90vh] overflow-y-auto`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-xl font-bold ${styles.textPrimary}`}>提报选题</h2>
              <button onClick={() => setShowCreateModal(false)} className={`${styles.textSecondary} hover:${styles.textPrimary} text-2xl leading-none`}>
                &times;
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>选题标题 *</label>
                <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.input}`} placeholder="请输入选题标题" autoFocus />
              </div>
              
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>选题描述</label>
                <RichEditor value={formData.description} onChange={(v) => setFormData({ ...formData, description: v })}
                  placeholder="请输入选题描述..." />
              </div>
              
              <div className={`${styles.bgTertiary} rounded-lg p-4 border ${styles.border}`}>
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-5 h-5 text-blue-400" />
                  <span className={`${styles.textSecondary} font-medium`}>项目资料</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={`block ${styles.textSecondary} text-xs mb-1`}>项目背景</label>
                    <input type="text" value={formData.projectBackground} onChange={(e) => setFormData({ ...formData, projectBackground: e.target.value })} className={`w-full px-3 py-1.5 ${styles.input} text-sm`} /></div>
                  <div><label className={`block ${styles.textSecondary} text-xs mb-1`}>目标受众</label>
                    <input type="text" value={formData.targetAudience} onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })} className={`w-full px-3 py-1.5 ${styles.input} text-sm`} /></div>
                  <div><label className={`block ${styles.textSecondary} text-xs mb-1`}>预期目标</label>
                    <input type="text" value={formData.expectedGoal} onChange={(e) => setFormData({ ...formData, expectedGoal: e.target.value })} className={`w-full px-3 py-1.5 ${styles.input} text-sm`} /></div>
                  <div><label className={`block ${styles.textSecondary} text-xs mb-1`}>预算范围</label>
                    <input type="text" value={formData.budget} onChange={(e) => setFormData({ ...formData, budget: e.target.value })} className={`w-full px-3 py-1.5 ${styles.input} text-sm`} /></div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>发布平台</label>
                  <input type="text" value={formData.platform} onChange={(e) => setFormData({ ...formData, platform: e.target.value })} className={`w-full px-4 py-2 ${styles.input}`} placeholder="如：抖音、快手" />
                </div>
                <div>
                  <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>截止时间</label>
                  <input type="date" value={formData.deadline} onChange={(e) => setFormData({ ...formData, deadline: e.target.value })} className={`w-full px-4 py-2 ${styles.input}`} />
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowCreateModal(false)} className={`flex-1 px-4 py-2 ${styles.buttonSecondary} rounded-lg`}>取消</button>
                <button onClick={handleCreate} disabled={creating} className={`flex-1 px-4 py-2 ${styles.buttonPrimary} rounded-lg disabled:opacity-50`}>
                  {creating ? '提交中...' : '提交审核'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
