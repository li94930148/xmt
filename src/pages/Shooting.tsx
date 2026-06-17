import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { getShooting, createShooting, getTopics, updateShooting } from '../api';
import { useAuthStore } from '../store';
import { Shooting as ShootingType, Topic } from '../types';
import { Plus, Search, FileText, Calendar, MapPin, Camera, Edit3, CheckCircle, XCircle, Clock, Trash2, ArrowRight } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { STATUS_COLORS, STATUS_TEXT } from '../constants';
import { formatBeijingDate } from '../lib/utils';

export default function Shooting() {
  const [shootings, setShootings] = useState<ShootingType[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({ topic_id: '', plan_date: '', location: '', equipment: '', status: 'planned' });
  
  const navigate = useNavigate();
  const appStore = useAppStore();
  const styles = useThemeStyles();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await getShooting();
        setShootings(result);
        
        const topicList = await getTopics();
        setTopics(topicList.data.filter(t => t.status === 'approved' || t.status === 'production' || t.status === 'shooting'));
      } catch (error) {
        appStore.addNotification({ title: '获取数据失败', message: (error as Error).message, type: 'error' });
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  const handleCreate = async () => {
    if (!formData.topic_id) {
      appStore.addNotification({ title: '创建失败', message: '请选择关联选题', type: 'error' });
      return;
    }
    
    try {
      await createShooting({ 
        topic_id: parseInt(formData.topic_id), 
        plan_date: formData.plan_date, 
        location: formData.location, 
        equipment: formData.equipment, 
        status: formData.status 
      });
      appStore.addNotification({ title: '创建成功', message: '拍摄计划已添加', type: 'success' });
      setShowCreateModal(false);
      setFormData({ topic_id: '', plan_date: '', location: '', equipment: '', status: 'planned' });
      
      const result = await getShooting();
      setShootings(result);
    } catch (error) {
      appStore.addNotification({ title: '创建失败', message: (error as Error).message, type: 'error' });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个成片制作计划吗？')) return;
    
    try {
      const token = useAuthStore.getState().token;
      const response = await fetch('/api/workflow/shooting/' + id, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('删除失败');
      }
      
      appStore.addNotification({ title: '删除成功', message: '成片制作计划已删除', type: 'success' });
      
      const result = await getShooting();
      setShootings(result);
    } catch (error) {
      appStore.addNotification({ title: '删除失败', message: (error as Error).message, type: 'error' });
    }
  };

  const handleComplete = async (shooting: ShootingType) => {
    if (!confirm(`确定要将「${shooting.topic_title}」标记为完成吗？完成后将自动流转到发布管理环节。`)) return;
    
    try {
      await updateShooting(shooting.id, { 
        topic_id: shooting.topic_id,
        status: 'completed'
      });
      appStore.addNotification({ title: '完成成功', message: '成片制作已完成，已流转到发布管理环节', type: 'success' });
      
      const result = await getShooting();
      setShootings(result);
    } catch (error) {
      appStore.addNotification({ title: '操作失败', message: (error as Error).message, type: 'error' });
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

  const shootingStatusColors: Record<string, string> = {
    planned: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    in_progress: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    completed: 'bg-green-500/20 text-green-400 border-green-500/30',
    cancelled: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  };

  const shootingStatusText: Record<string, string> = {
    planned: '计划中',
    in_progress: '制作中',
    completed: '已完成',
    cancelled: '已取消',
    pending: '计划中',
  };

  const filteredShootings = shootings.filter(s => 
    s.topic_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.location?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">成片制作</h1>
          <p className={`mt-1 ${styles.textSecondary}`}>管理成片制作计划和进度</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className={`flex items-center gap-2 px-5 py-2.5 ${styles.buttonPrimary} rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]`}
        >
          <Plus className="w-4 h-4" />
          <span className="font-medium text-sm">添加制作计划</span>
        </button>
      </div>

      <div className={`${styles.card} p-4`}>
        <div className="relative">
          <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${styles.textMuted}`} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜索选题标题或拍摄地点..."
            className={`w-full pl-10 pr-4 py-2.5 ${styles.input} text-sm`}
          />
        </div>
      </div>

      <div className={`${styles.card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={styles.tableHeader}>
                <th className={`text-left px-6 py-3.5 text-xs font-semibold uppercase tracking-wider ${styles.textMuted}`}>关联选题</th>
                <th className={`text-left px-6 py-3.5 text-xs font-semibold uppercase tracking-wider ${styles.textMuted}`}>计划日期</th>
                <th className={`text-left px-6 py-3.5 text-xs font-semibold uppercase tracking-wider ${styles.textMuted}`}>拍摄地点</th>
                <th className={`text-left px-6 py-3.5 text-xs font-semibold uppercase tracking-wider ${styles.textMuted}`}>设备</th>
                <th className={`text-left px-6 py-3.5 text-xs font-semibold uppercase tracking-wider ${styles.textMuted}`}>选题状态</th>
                <th className={`text-left px-6 py-3.5 text-xs font-semibold uppercase tracking-wider ${styles.textMuted}`}>制作状态</th>
                <th className={`text-left px-6 py-3.5 text-xs font-semibold uppercase tracking-wider ${styles.textMuted}`}>操作</th>
                <th className={`text-left px-6 py-3.5 text-xs font-semibold uppercase tracking-wider ${styles.textMuted}`}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <div className={`w-8 h-8 border-[3px] ${styles.spinner}/20 border-t-${styles.spinner} rounded-full animate-spin mx-auto`} style={{ borderColor: `var(--color-border)`, borderTopColor: `var(--color-accent)` }}></div>
                  </td>
                </tr>
              ) : filteredShootings.length === 0 ? (
                <tr>
                  <td colSpan={8} className={`px-6 py-12 text-center ${styles.textSecondary}`}>暂无拍摄计划</td>
                </tr>
              ) : (
                filteredShootings.map((shooting) => (
                  <tr key={shooting.id} className={`border-t ${styles.tableRow} ${styles.tableHover}`}>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => navigate(`/shooting/${shooting.id}`)}
                        className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
                        title="点击查看详情"
                      >
                        <FileText className="w-4 h-4" />
                        <span className="font-medium">{shooting.topic_title}</span>
                      </button>
                    </td>
                    <td className={`px-6 py-4 ${styles.textSecondary}`}>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {formatBeijingDate(shooting.plan_date)}
                      </span>
                    </td>
                    <td className={`px-6 py-4 ${styles.textSecondary}`}>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {shooting.location || '-'}
                      </span>
                    </td>
                    <td className={`px-6 py-4 ${styles.textSecondary}`}>{shooting.equipment || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border ${topicStatusColors[shooting.topic_status || 'shooting']}`}>
                        {topicStatusText[shooting.topic_status || 'shooting']}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border ${shootingStatusColors[shooting.status]}`}>
                        {shootingStatusText[shooting.status]}
                      </span>
                    </td>
                    <td className={`px-6 py-4 ${styles.textSecondary}`}>{shooting.operator_name}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigate(`/shooting/${shooting.id}`)}
                          className={`p-2 text-blue-400 hover:text-blue-300 ${styles.hoverBg} rounded-lg transition-colors`}
                          title="查看详情"
                        >
                          <Edit3 className="w-5 h-5" />
                        </button>
                        {shooting.status !== 'completed' && (
                          <button
                            onClick={() => handleComplete(shooting)}
                            className={`p-2 text-green-400 hover:text-green-300 ${styles.hoverBg} rounded-lg transition-colors`}
                            title="标记完成"
                          >
                            <CheckCircle className="w-5 h-5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(shooting.id)}
                          className={`p-2 text-red-400 hover:text-red-300 ${styles.hoverBg} rounded-lg transition-colors`}
                          title="删除"
                        >
                          <Trash2 className="w-5 h-5" />
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
          <div className={`${styles.bgSecondary} rounded-xl p-6 w-full max-w-lg mx-4 ${styles.border}`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">添加拍摄计划</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className={styles.textSecondary}
              >
                <span className="text-2xl">&times;</span>
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${styles.textSecondary}`}>关联选题 *</label>
                <select
                  value={formData.topic_id}
                  onChange={(e) => setFormData({ ...formData, topic_id: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="">请选择选题</option>
                  {topics.map(topic => (
                    <option key={topic.id} value={topic.id}>{topic.title}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className={`block text-sm font-medium mb-2 ${styles.textSecondary}`}>计划日期</label>
                <input
                  type="date"
                  value={formData.plan_date}
                  onChange={(e) => setFormData({ ...formData, plan_date: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
              </div>
              
              <div>
                <label className={`block text-sm font-medium mb-2 ${styles.textSecondary}`}>拍摄地点</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="请输入拍摄地点"
                />
              </div>
              
              <div>
                <label className={`block text-sm font-medium mb-2 ${styles.textSecondary}`}>设备清单</label>
                <textarea
                  value={formData.equipment}
                  onChange={(e) => setFormData({ ...formData, equipment: e.target.value })}
                  rows={2}
                  className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none`}
                  placeholder="请输入设备清单"
                />
              </div>
              
              <div>
                <label className={`block text-sm font-medium mb-2 ${styles.textSecondary}`}>状态</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="planned">计划中</option>
                  <option value="in_progress">拍摄中</option>
                  <option value="completed">已完成</option>
                  <option value="cancelled">已取消</option>
                </select>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleCreate}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}