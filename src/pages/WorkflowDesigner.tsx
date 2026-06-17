import { useState, useEffect } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { usePermission } from '../hooks/usePermission';
import { useAppStore, useAuthStore } from '../store';
import {
  Plus, Trash2, Edit2, X, ChevronDown, ChevronRight, ArrowRight, Save, Copy
} from 'lucide-react';

interface WorkflowTemplate {
  id: number;
  name: string;
  description: string;
  is_default: boolean;
  node_count: number;
  topic_count: number;
  creator_name: string;
  nodes?: WorkflowNode[];
}

interface WorkflowNode {
  id?: number;
  name: string;
  node_order: number;
  status_from: string;
  status_to: string;
  approver_type: 'role' | 'user' | 'creator';
  approver_value: string;
  is_required: boolean;
}

const STATUS_OPTIONS = [
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
  { value: 'production', label: '创作中' },
  { value: 'shooting', label: '拍摄中' },
  { value: 'publishing', label: '发布中' },
  { value: 'completed', label: '已完成' },
];

const APPROVER_TYPES = [
  { value: 'role', label: '角色' },
  { value: 'user', label: '指定用户' },
  { value: 'creator', label: '创建者' },
];

export default function WorkflowDesigner() {
  const styles = useThemeStyles();
  const appStore = useAppStore();
  const { hasPermission } = usePermission();
  const token = useAuthStore((state) => state.token);

  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<WorkflowTemplate | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    nodes: [] as WorkflowNode[]
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/workflow-templates', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      }
    } catch (error) {
      console.error('获取审批流模板失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplateDetail = async (id: number) => {
    try {
      const response = await fetch(`/api/workflow-templates/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        return data;
      }
    } catch (error) {
      console.error('获取模板详情失败:', error);
    }
    return null;
  };

  const handleCreate = async () => {
    try {
      const response = await fetch('/api/workflow-templates', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        appStore.addNotification({ title: '创建成功', message: '审批流模板已创建', type: 'success' });
        setShowCreateForm(false);
        setFormData({ name: '', description: '', nodes: [] });
        fetchTemplates();
      } else {
        const data = await response.json();
        appStore.addNotification({ title: '创建失败', message: data.message, type: 'error' });
      }
    } catch (error) {
      appStore.addNotification({ title: '创建失败', message: '网络错误', type: 'error' });
    }
  };

  const handleUpdate = async () => {
    if (!editingTemplate) return;

    try {
      const response = await fetch(`/api/workflow-templates/${editingTemplate.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        appStore.addNotification({ title: '更新成功', message: '审批流模板已更新', type: 'success' });
        setEditingTemplate(null);
        setFormData({ name: '', description: '', nodes: [] });
        fetchTemplates();
      } else {
        const data = await response.json();
        appStore.addNotification({ title: '更新失败', message: data.message, type: 'error' });
      }
    } catch (error) {
      appStore.addNotification({ title: '更新失败', message: '网络错误', type: 'error' });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此审批流模板？')) return;

    try {
      const response = await fetch(`/api/workflow-templates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        appStore.addNotification({ title: '删除成功', message: '审批流模板已删除', type: 'success' });
        fetchTemplates();
      } else {
        const data = await response.json();
        appStore.addNotification({ title: '删除失败', message: data.message, type: 'error' });
      }
    } catch (error) {
      appStore.addNotification({ title: '删除失败', message: '网络错误', type: 'error' });
    }
  };

  const startEdit = async (template: WorkflowTemplate) => {
    const detail = await fetchTemplateDetail(template.id);
    if (detail) {
      setEditingTemplate(detail);
      setFormData({
        name: detail.name,
        description: detail.description || '',
        nodes: detail.nodes || []
      });
    }
  };

  const addNode = () => {
    setFormData(prev => ({
      ...prev,
      nodes: [...prev.nodes, {
        name: '',
        node_order: prev.nodes.length + 1,
        status_from: 'pending',
        status_to: 'approved',
        approver_type: 'role',
        approver_value: 'director',
        is_required: true
      }]
    }));
  };

  const updateNode = (index: number, field: keyof WorkflowNode, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      nodes: prev.nodes.map((node, i) =>
        i === index ? { ...node, [field]: value } : node
      )
    }));
  };

  const removeNode = (index: number) => {
    setFormData(prev => ({
      ...prev,
      nodes: prev.nodes.filter((_, i) => i !== index)
    }));
  };

  const getStatusLabel = (value: string) => {
    return STATUS_OPTIONS.find(s => s.value === value)?.label || value;
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-64 ${styles.textMuted}`}>
        <div className={`animate-spin rounded-8 h-8 w-8 border-2 ${styles.spinner} border-t-transparent`} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={styles.pageTitle}>审批流设计</h1>
          <p className={styles.subtitle}>自定义选题审批流程</p>
        </div>
        {hasPermission('system:template') && (
          <button
            onClick={() => { setShowCreateForm(true); setFormData({ name: '', description: '', nodes: [] }); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl ${styles.buttonPrimary}`}
          >
            <Plus className="w-4 h-4" />
            新建模板
          </button>
        )}
      </div>

      {/* 模板列表 */}
      <div className="grid gap-4">
        {templates.map(template => (
          <div key={template.id} className={`p-4 rounded-2xl ${styles.card}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  template.is_default ? 'bg-brand-500/10 text-brand-500' : 'bg-theme-tertiary text-theme-text-secondary'
                }`}>
                  <ArrowRight className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${styles.textPrimary}`}>{template.name}</span>
                    {template.is_default && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500">
                        默认
                      </span>
                    )}
                  </div>
                  <p className={`text-sm ${styles.textMuted}`}>{template.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-4 text-sm">
                  <span className={styles.textMuted}>
                    {template.node_count} 个节点
                  </span>
                  <span className={styles.textMuted}>
                    {template.topic_count} 个选题使用
                  </span>
                </div>
                {hasPermission('system:template') && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startEdit(template)}
                      className={`p-2 rounded-lg ${styles.hoverBg} ${styles.textMuted}`}
                      title="编辑"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {!template.is_default && (
                      <button
                        onClick={() => handleDelete(template.id)}
                        className={`p-2 rounded-lg hover:bg-red-500/10 text-red-400`}
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 创建/编辑弹窗 */}
      {(showCreateForm || editingTemplate) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className={`w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl ${styles.modal} p-6`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-xl font-bold ${styles.textPrimary}`}>
                {editingTemplate ? '编辑审批流' : '新建审批流'}
              </h2>
              <button
                onClick={() => { setShowCreateForm(false); setEditingTemplate(null); }}
                className={`p-2 rounded-lg ${styles.hoverBg} ${styles.textMuted}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${styles.textSecondary}`}>模板名称</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className={`w-full px-4 py-2 rounded-xl ${styles.input}`}
                    placeholder="如 标准选题流程"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${styles.textSecondary}`}>描述</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className={`w-full px-4 py-2 rounded-xl ${styles.input}`}
                    placeholder="流程描述"
                  />
                </div>
              </div>

              {/* 审批节点 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className={`text-sm font-medium ${styles.textSecondary}`}>审批节点</label>
                  <button
                    onClick={addNode}
                    className={`flex items-center gap-1 text-sm px-3 py-1 rounded-lg ${styles.buttonSecondary}`}
                  >
                    <Plus className="w-4 h-4" />
                    添加节点
                  </button>
                </div>

                <div className="space-y-3">
                  {formData.nodes.map((node, index) => (
                    <div key={index} className={`p-4 rounded-xl ${styles.bgTertiary} border ${styles.border}`}>
                      <div className="flex items-center justify-between mb-3">
                        <span className={`text-sm font-medium ${styles.textPrimary}`}>
                          节点 {index + 1}
                        </span>
                        <button
                          onClick={() => removeNode(index)}
                          className={`p-1 rounded hover:bg-red-500/10 text-red-400`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={`block text-xs mb-1 ${styles.textMuted}`}>节点名称</label>
                          <input
                            type="text"
                            value={node.name}
                            onChange={(e) => updateNode(index, 'name', e.target.value)}
                            className={`w-full px-3 py-1.5 rounded-lg text-sm ${styles.input}`}
                            placeholder="如 内容审核"
                          />
                        </div>
                        <div>
                          <label className={`block text-xs mb-1 ${styles.textMuted}`}>审批类型</label>
                          <select
                            value={node.approver_type}
                            onChange={(e) => updateNode(index, 'approver_type', e.target.value)}
                            className={`w-full px-3 py-1.5 rounded-lg text-sm ${styles.input}`}
                          >
                            {APPROVER_TYPES.map(type => (
                              <option key={type.value} value={type.value}>{type.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={`block text-xs mb-1 ${styles.textMuted}`}>从状态</label>
                          <select
                            value={node.status_from}
                            onChange={(e) => updateNode(index, 'status_from', e.target.value)}
                            className={`w-full px-3 py-1.5 rounded-lg text-sm ${styles.input}`}
                          >
                            {STATUS_OPTIONS.map(status => (
                              <option key={status.value} value={status.value}>{status.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={`block text-xs mb-1 ${styles.textMuted}`}>到状态</label>
                          <select
                            value={node.status_to}
                            onChange={(e) => updateNode(index, 'status_to', e.target.value)}
                            className={`w-full px-3 py-1.5 rounded-lg text-sm ${styles.input}`}
                          >
                            {STATUS_OPTIONS.map(status => (
                              <option key={status.value} value={status.value}>{status.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={`block text-xs mb-1 ${styles.textMuted}`}>审批人值</label>
                          <input
                            type="text"
                            value={node.approver_value}
                            onChange={(e) => updateNode(index, 'approver_value', e.target.value)}
                            className={`w-full px-3 py-1.5 rounded-lg text-sm ${styles.input}`}
                            placeholder="角色码或用户ID"
                          />
                        </div>
                        <div className="flex items-center">
                          <label className={`flex items-center gap-2 text-sm ${styles.textPrimary}`}>
                            <input
                              type="checkbox"
                              checked={node.is_required}
                              onChange={(e) => updateNode(index, 'is_required', e.target.checked)}
                              className="rounded border-gray-300"
                            />
                            必须审批
                          </label>
                        </div>
                      </div>
                      {/* 流程可视化 */}
                      <div className="mt-3 flex items-center gap-2 text-xs">
                        <span className={`px-2 py-1 rounded ${styles.bgSecondary} ${styles.textPrimary}`}>
                          {getStatusLabel(node.status_from)}
                        </span>
                        <ArrowRight className="w-4 h-4 text-theme-text-muted" />
                        <span className={`px-2 py-1 rounded ${styles.bgSecondary} ${styles.textPrimary}`}>
                          {getStatusLabel(node.status_to)}
                        </span>
                      </div>
                    </div>
                  ))}

                  {formData.nodes.length === 0 && (
                    <div className={`text-center py-8 ${styles.textMuted}`}>
                      暂无审批节点，点击"添加节点"开始设计流程
                    </div>
                  )}
                </div>
              </div>

              {/* 流程预览 */}
              {formData.nodes.length > 0 && (
                <div>
                  <label className={`block text-sm font-medium mb-3 ${styles.textSecondary}`}>流程预览</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {formData.nodes.map((node, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <div className={`px-3 py-2 rounded-lg ${styles.bgTertiary} border ${styles.border}`}>
                          <p className={`text-xs font-medium ${styles.textPrimary}`}>{node.name || `节点${index + 1}`}</p>
                          <p className={`text-xs ${styles.textMuted}`}>
                            {getStatusLabel(node.status_from)} → {getStatusLabel(node.status_to)}
                          </p>
                        </div>
                        {index < formData.nodes.length - 1 && (
                          <ArrowRight className="w-4 h-4 text-theme-text-muted flex-shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => { setShowCreateForm(false); setEditingTemplate(null); }}
                  className={`px-4 py-2 rounded-xl ${styles.buttonSecondary}`}
                >
                  取消
                </button>
                <button
                  onClick={editingTemplate ? handleUpdate : handleCreate}
                  className={`px-4 py-2 rounded-xl ${styles.buttonPrimary}`}
                >
                  {editingTemplate ? '保存' : '创建'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
