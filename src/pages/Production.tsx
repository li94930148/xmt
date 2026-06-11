import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { getProduction, createProduction, getTopics } from '../api';
import { Production as ProductionType, Topic } from '../types';
import { Plus, Search, FileText, Edit3, CheckCircle, XCircle, Clock, ChevronLeft } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useSocket } from '../hooks/useSocket';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { STATUS_COLORS, STATUS_TEXT } from '../constants';
import { formatBeijingDate } from '../lib/utils';

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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState({ topic_id: '', version: '', content: '', status: 'draft' });
  const [editingProduction, setEditingProduction] = useState<ProductionType | null>(null);
  
  const createTextareaRef = useAutoResizeTextarea(formData.content, 100, 300);
  const editTextareaRef = useAutoResizeTextarea(formData.content, 100, 300);
  
  const navigate = useNavigate();
  const appStore = useAppStore();
  const styles = useThemeStyles();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await getProduction();
        setProductions(result);
        
        const topicList = await getTopics();
        setTopics(topicList.data.filter(t => t.status === 'approved' || t.status === 'production'));
      } catch (error) {
        appStore.addNotification({ title: '获取数据失败', message: (error as Error).message, type: 'error' });
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  const socket = useSocket();

  // ===== 实时协作 =====
  useRealtimeSync({
    room: 'production',
    socket,
    events: {
      'production:created': () => {
        // 有人创建了创作记录，刷新列表
        getProduction().then(setProductions).catch(() => {});
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
    if (!formData.topic_id) {
      appStore.addNotification({ title: '创建失败', message: '请选择关联选题', type: 'error' });
      return;
    }
    
    try {
      await createProduction({ 
        topic_id: parseInt(formData.topic_id), 
        version: formData.version, 
        content: formData.content, 
        status: formData.status 
      });
      appStore.addNotification({ title: '创建成功', message: '创作记录已添加', type: 'success' });
      setShowCreateModal(false);
      setFormData({ topic_id: '', version: '', content: '', status: 'draft' });
      
      const result = await getProduction();
      setProductions(result);
    } catch (error) {
      appStore.addNotification({ title: '创建失败', message: (error as Error).message, type: 'error' });
    }
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
    if (!editingProduction || !formData.topic_id) {
      appStore.addNotification({ title: '更新失败', message: '请选择关联选题', type: 'error' });
      return;
    }
    
    try {
      await createProduction({ 
        topic_id: parseInt(formData.topic_id), 
        version: formData.version, 
        content: formData.content, 
        status: formData.status 
      });
      setShowEditModal(false);
      setEditingProduction(null);
      setFormData({ topic_id: '', version: '', content: '', status: 'draft' });
      
      const result = await getProduction();
      setProductions(result);
    } catch (error) {
      appStore.addNotification({ title: '更新失败', message: (error as Error).message, type: 'error' });
    }
  };

  const topicStatusColors: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    approved: 'bg-green-500/20 text-green-400 border-green-500/30',
    rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
    production: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    shooting: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    publishing: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    completed: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
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
    draft: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    review: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    approved: 'bg-green-500/20 text-green-400 border-green-500/30',
    rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  const productionStatusText: Record<string, string> = {
    draft: '草稿',
    review: '审核中',
    approved: '已通过',
    rejected: '已驳回',
  };

  const filteredProductions = productions.filter(p => 
    p.topic_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.version.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

      <div className={`${styles.card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={styles.tableHeader}>
                <th className={`text-left px-6 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>关联选题</th>
                <th className={`text-left px-6 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>版本</th>
                <th className={`text-left px-6 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>状态</th>
                <th className={`text-left px-6 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>操作</th>
                <th className={`text-left px-6 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>创建时间</th>
                <th className={`text-left px-6 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className={`w-8 h-8 border-4 ${styles.spinner} border-t-transparent rounded-full animate-spin mx-auto`}></div>
                  </td>
                </tr>
              ) : filteredProductions.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`px-6 py-12 text-center ${styles.textSecondary}`}>暂无创作记录</td>
                </tr>
              ) : (
                filteredProductions.map((production) => (
                  <tr key={production.id} className={`border-t ${styles.tableRow} ${styles.tableHover}`}>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => navigate(`/production/${production.id}`)}
                        className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
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
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigate(`/production/${production.id}`)}
                          className={`p-2 ${styles.buttonInfo} rounded-lg transition-colors`}
                          title="查看详情"
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
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`${styles.bgSecondary} rounded-xl p-6 w-full max-w-lg mx-4 border ${styles.border}`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-xl font-bold ${styles.textPrimary}`}>添加创作记录</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className={`${styles.textSecondary} hover:${styles.textPrimary}`}
              >
                <span className="text-2xl">&times;</span>
              </button>
            </div>
            
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
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className={`flex-1 px-4 py-2 ${styles.buttonSecondary} rounded-lg transition-colors`}
                >
                  取消
                </button>
                <button
                  onClick={handleCreate}
                  className={`flex-1 px-4 py-2 ${styles.buttonPrimary} rounded-lg transition-colors`}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`${styles.bgSecondary} rounded-xl p-6 w-full max-w-lg mx-4 border ${styles.border}`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-xl font-bold ${styles.textPrimary}`}>编辑创作记录</h2>
              <button
                onClick={() => { setShowEditModal(false); setEditingProduction(null); }}
                className={`${styles.textSecondary} hover:${styles.textPrimary}`}
              >
                <span className="text-2xl">&times;</span>
              </button>
            </div>
            
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
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setShowEditModal(false); setEditingProduction(null); }}
                  className={`flex-1 px-4 py-2 ${styles.buttonSecondary} rounded-lg transition-colors`}
                >
                  取消
                </button>
                <button
                  onClick={handleUpdate}
                  className={`flex-1 px-4 py-2 ${styles.buttonPrimary} rounded-lg transition-colors`}
                >
                  更新
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}