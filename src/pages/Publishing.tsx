import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { getPublishing, createPublishing, updatePublishing, deletePublishing, getTopics } from '../api';
import { Publishing as PublishingType, Topic } from '../types';
import { Plus, Search, FileText, Calendar, Link2, Send, Edit3, CheckCircle, XCircle, Clock, Play, Heart, Share2, MessageCircle, BarChart3, Trash2 } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { STATUS_COLORS, STATUS_TEXT } from '../constants';
import { formatBeijingDate } from '../lib/utils';

export default function Publishing() {
  const [publishings, setPublishings] = useState<PublishingType[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPublishing, setEditingPublishing] = useState<PublishingType | null>(null);
  const [formData, setFormData] = useState({ 
    topic_id: '', 
    platform: '', 
    url: '', 
    status: 'pending', 
    publish_time: '',
    views: '',
    likes: '',
    shares: '',
    comments: ''
  });
  
  const navigate = useNavigate();
  const appStore = useAppStore();
  const styles = useThemeStyles();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await getPublishing();
        setPublishings(result);
        
        const topicList = await getTopics();
        setTopics(topicList.data.filter(t => t.status === 'publishing' || t.status === 'shooting'));
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
      if (editingPublishing) {
        await updatePublishing(editingPublishing.id, { 
          platform: formData.platform, 
          url: formData.url, 
          status: formData.status, 
          publish_time: formData.publish_time,
          views: parseInt(formData.views) || 0,
          likes: parseInt(formData.likes) || 0,
          shares: parseInt(formData.shares) || 0,
          comments: parseInt(formData.comments) || 0
        });
        appStore.addNotification({ title: '更新成功', message: '发布记录已更新', type: 'success' });
      } else {
        await createPublishing({ 
          topic_id: parseInt(formData.topic_id), 
          platform: formData.platform, 
          url: formData.url, 
          status: formData.status, 
          publish_time: formData.publish_time,
          views: parseInt(formData.views) || 0,
          likes: parseInt(formData.likes) || 0,
          shares: parseInt(formData.shares) || 0,
          comments: parseInt(formData.comments) || 0
        });
        
        const message = formData.status === 'published' 
          ? '发布记录已添加，选题已归档到资源库' 
          : '发布记录已添加';
        appStore.addNotification({ title: '创建成功', message: message, type: 'success' });
      }
      
      setShowCreateModal(false);
      resetForm();
      
      const result = await getPublishing();
      setPublishings(result);
    } catch (error) {
      appStore.addNotification({ title: '操作失败', message: (error as Error).message, type: 'error' });
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('确定要删除这条发布记录吗？')) {
      try {
        await deletePublishing(id);
        appStore.addNotification({ title: '删除成功', message: '发布记录已删除', type: 'success' });
        const result = await getPublishing();
        setPublishings(result);
      } catch (error) {
        appStore.addNotification({ title: '删除失败', message: (error as Error).message, type: 'error' });
      }
    }
  };

  const resetForm = () => {
    setFormData({ 
      topic_id: '', 
      platform: '', 
      url: '', 
      status: 'pending', 
      publish_time: '',
      views: '',
      likes: '',
      shares: '',
      comments: ''
    });
    setEditingPublishing(null);
  };

  const handleEdit = (publishing: PublishingType) => {
    setEditingPublishing(publishing);
    setFormData({
      topic_id: publishing.topic_id.toString(),
      platform: publishing.platform || '',
      url: publishing.url || '',
      status: publishing.status,
      publish_time: publishing.publish_time ? new Date(publishing.publish_time).toISOString().slice(0, 16) : '',
      views: (publishing as any).views?.toString() || '',
      likes: (publishing as any).likes?.toString() || '',
      shares: (publishing as any).shares?.toString() || '',
      comments: (publishing as any).comments?.toString() || ''
    });
    setShowCreateModal(true);
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    published: 'bg-green-500/20 text-green-400 border-green-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
    scheduled: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };

  const statusText: Record<string, string> = {
    pending: '待发布',
    published: '已发布',
    failed: '发布失败',
    scheduled: '已预定',
  };

  const filteredPublishings = publishings.filter(p => 
    p.topic_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.platform?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${styles.textPrimary}`}>发布管理</h1>
          <p className={`${styles.textSecondary} mt-1`}>管理内容发布记录及数据</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowCreateModal(true);
          }}
          className={`flex items-center gap-2 px-5 py-2.5 ${styles.buttonPrimary} rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]`}
        >
          <Plus className="w-4 h-4" />
          <span className="font-medium text-sm">添加发布记录</span>
        </button>
      </div>

      <div className={`${styles.card} p-4`}>
        <div className="relative">
          <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${styles.textMuted}`} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜索选题标题或发布平台..."
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
                <th className={`text-left px-6 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>发布平台</th>
                <th className={`text-left px-6 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>发布链接</th>
                <th className={`text-left px-6 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>发布时间</th>
                <th className={`text-left px-6 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>数据统计</th>
                <th className={`text-left px-6 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>状态</th>
                <th className={`text-left px-6 py-3.5 ${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className={`w-8 h-8 border-4 ${styles.spinner} border-t-transparent rounded-full animate-spin mx-auto`}></div>
                  </td>
                </tr>
              ) : filteredPublishings.length === 0 ? (
                <tr>
                  <td colSpan={7} className={`px-6 py-12 text-center ${styles.textSecondary}`}>暂无发布记录</td>
                </tr>
              ) : (
                filteredPublishings.map((publishing) => (
                  <tr key={publishing.id} className={`border-t ${styles.tableRow} ${styles.tableHover}`}>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => navigate(`/publishing/${publishing.id}`)}
                        className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
                        title="点击查看详情"
                      >
                        <FileText className="w-4 h-4" />
                        <span className={`${styles.textPrimary} font-medium`}>{publishing.topic_title}</span>
                      </button>
                    </td>
                    <td className={`px-6 py-4 ${styles.textSecondary}`}>{publishing.platform || '-'}</td>
                    <td className="px-6 py-4">
                      {publishing.url ? (
                        <a href={publishing.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
                          <Link2 className="w-4 h-4" />
                          <span className="truncate max-w-xs">查看</span>
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className={`px-6 py-4 ${styles.textSecondary}`}>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {formatBeijingDate(publishing.publish_time)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3 text-sm">
                        <span className="flex items-center gap-1 text-blue-400" title="播放量">
                          <Play className="w-3 h-3" />
                          {(publishing as any).views ? (publishing as any).views.toLocaleString() : 0}
                        </span>
                        <span className="flex items-center gap-1 text-red-400" title="点赞量">
                          <Heart className="w-3 h-3" />
                          {(publishing as any).likes ? (publishing as any).likes.toLocaleString() : 0}
                        </span>
                        <span className="flex items-center gap-1 text-green-400" title="分享量">
                          <Share2 className="w-3 h-3" />
                          {(publishing as any).shares ? (publishing as any).shares.toLocaleString() : 0}
                        </span>
                        <span className="flex items-center gap-1 text-purple-400" title="评论量">
                          <MessageCircle className="w-3 h-3" />
                          {(publishing as any).comments ? (publishing as any).comments.toLocaleString() : 0}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border ${statusColors[publishing.status]}`}>
                        {statusText[publishing.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEdit(publishing)}
                          className={`p-2 ${styles.buttonInfo} rounded-lg transition-colors`}
                          title="编辑"
                        >
                          <Edit3 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(publishing.id)}
                          className={`p-2 ${styles.buttonDanger} rounded-lg transition-colors`}
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
          <div className={`${styles.bgSecondary} rounded-xl p-6 w-full max-w-2xl mx-4 border ${styles.border} max-h-[90vh] overflow-y-auto`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-xl font-bold ${styles.textPrimary}`}>
                {editingPublishing ? '编辑发布记录' : '添加发布记录'}
              </h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
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
                  disabled={!!editingPublishing}
                >
                  <option value="">请选择选题</option>
                  {topics.map(topic => (
                    <option key={topic.id} value={topic.id}>{topic.title}</option>
                  ))}
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>发布平台</label>
                  <input
                    type="text"
                    value={formData.platform}
                    onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                    className={`w-full px-4 py-2 ${styles.bgInput} border ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing}`}
                    placeholder="如：抖音、快手、微信视频号"
                  />
                </div>
                <div>
                  <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>发布链接</label>
                  <input
                    type="text"
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    className={`w-full px-4 py-2 ${styles.bgInput} border ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing}`}
                    placeholder="请输入发布链接"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>发布时间</label>
                  <div className="space-y-2">
                    <input
                      type="date"
                      value={formData.publish_time}
                      onChange={(e) => setFormData({ ...formData, publish_time: e.target.value })}
                      className={`w-full px-4 py-2 ${styles.bgInput} border ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing} ${formData.status !== 'pending' ? 'opacity-50 cursor-not-allowed' : ''}`}
                      disabled={formData.status !== 'pending'}
                    />
                    {formData.status === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setFormData({ ...formData, publish_time: new Date().toISOString().split('T')[0] })}
                          className={`px-3 py-1 text-xs ${styles.buttonSecondary} rounded-md transition-colors`}
                        >
                          今天
                        </button>
                        <button
                          onClick={() => {
                            const tomorrow = new Date();
                            tomorrow.setDate(tomorrow.getDate() + 1);
                            setFormData({ ...formData, publish_time: tomorrow.toISOString().split('T')[0] });
                          }}
                          className={`px-3 py-1 text-xs ${styles.buttonSecondary} rounded-md transition-colors`}
                        >
                          明天
                        </button>
                        <button
                          onClick={() => {
                            const weekLater = new Date();
                            weekLater.setDate(weekLater.getDate() + 7);
                            setFormData({ ...formData, publish_time: weekLater.toISOString().split('T')[0] });
                          }}
                          className={`px-3 py-1 text-xs ${styles.buttonSecondary} rounded-md transition-colors`}
                        >
                          一周后
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>状态</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className={`w-full px-4 py-2 ${styles.bgInput} border ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing}`}
                  >
                    <option value="pending">待发布</option>
                    <option value="published">已发布</option>
                    <option value="failed">发布失败</option>
                    <option value="scheduled">已定时</option>
                  </select>
                </div>
              </div>
              
              <div className={`border-t ${styles.border} pt-4 mt-4`}>
                <h3 className={`text-lg font-semibold ${styles.textPrimary} mb-4 flex items-center gap-2`}>
                  <BarChart3 className="w-5 h-5 text-blue-400" />
                  数据统计（与数据复盘同步）
                </h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block ${styles.textSecondary} text-sm font-medium mb-2 flex items-center gap-1`}>
                      <Play className="w-4 h-4 text-blue-400" />
                      播放量
                    </label>
                    <input
                      type="number"
                      value={formData.views}
                      onChange={(e) => setFormData({ ...formData, views: e.target.value })}
                      className={`w-full px-4 py-2 ${styles.bgInput} border ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing}`}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className={`block ${styles.textSecondary} text-sm font-medium mb-2 flex items-center gap-1`}>
                      <Heart className="w-4 h-4 text-red-400" />
                      点赞量
                    </label>
                    <input
                      type="number"
                      value={formData.likes}
                      onChange={(e) => setFormData({ ...formData, likes: e.target.value })}
                      className={`w-full px-4 py-2 ${styles.bgInput} border ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing}`}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className={`block ${styles.textSecondary} text-sm font-medium mb-2 flex items-center gap-1`}>
                      <Share2 className="w-4 h-4 text-green-400" />
                      分享量
                    </label>
                    <input
                      type="number"
                      value={formData.shares}
                      onChange={(e) => setFormData({ ...formData, shares: e.target.value })}
                      className={`w-full px-4 py-2 ${styles.bgInput} border ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing}`}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className={`block ${styles.textSecondary} text-sm font-medium mb-2 flex items-center gap-1`}>
                      <MessageCircle className="w-4 h-4 text-purple-400" />
                      评论量
                    </label>
                    <input
                      type="number"
                      value={formData.comments}
                      onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                      className={`w-full px-4 py-2 ${styles.bgInput} border ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.focusRing}`}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    resetForm();
                  }}
                  className={`flex-1 px-4 py-2 ${styles.buttonSecondary} rounded-lg transition-colors`}
                >
                  取消
                </button>
                <button
                  onClick={handleCreate}
                  className={`flex-1 px-4 py-2 ${styles.buttonPrimary} rounded-lg transition-colors`}
                >
                  {editingPublishing ? '更新' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
