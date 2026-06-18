import { useState, useEffect } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { usePermission } from '../hooks/usePermission';
import { useAppStore, useAuthStore } from '../store';
import { Plus, Trash2, Edit2, ArrowRight } from 'lucide-react';
import EmptyState from '../components/EmptyState';
import { ConfirmModal, FormModal, LoadingState, PageHeader } from '../components/common';
import { buildWorkflowRuntimeContext, getExplainability, runTransitionCheck } from '@shared/workflow/workflow_runtime';
import { mapDecisionToUI, mapExplainToUI } from '../components/workflow/WorkflowUIBridge';

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

interface WorkflowShadowLog {
  id: number;
  topic_id?: number | null;
  node_id?: number | null;
  from_state?: string | null;
  to_state?: string | null;
  user_id?: number | null;
  action?: string | null;
  reason?: string | null;
  created_at: string;
}

const STATUS_OPTIONS = [
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '宸查€氳繃' },
  { value: 'rejected', label: '已驳回' },
  { value: 'production', label: '创作中' },
  { value: 'shooting', label: '拍摄中' },
  { value: 'publishing', label: '发布中' },
  { value: 'completed', label: '已完成' },
];

const APPROVER_TYPES = [
  { value: 'role', label: '瑙掕壊' },
  { value: 'user', label: '鎸囧畾鐢ㄦ埛' },
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
  const [deleteTarget, setDeleteTarget] = useState<WorkflowTemplate | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [shadowLogs, setShadowLogs] = useState<WorkflowShadowLog[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    nodes: [] as WorkflowNode[],
  });

  useEffect(() => {
    void fetchTemplates();
    void fetchShadowLogs();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/workflow-templates', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      }
    } catch (error) {
      console.error('鑾峰彇瀹℃壒娴佹ā鏉垮け璐?', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplateDetail = async (id: number) => {
    try {
      const response = await fetch(`/api/workflow-templates/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        return data;
      }
    } catch (error) {
      console.error('鑾峰彇妯℃澘璇︽儏澶辫触:', error);
    }
    return null;
  };

  const fetchShadowLogs = async () => {
    try {
      const response = await fetch('/api/workflow/shadow-logs', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setShadowLogs(data);
      }
    } catch (error) {
      console.error('鑾峰彇 Workflow Shadow 鏃ュ織澶辫触:', error);
    }
  };

  const resetEditorState = () => {
    setShowCreateForm(false);
    setEditingTemplate(null);
  };

  const handleCreate = async () => {
    const invalidNode = getFirstInvalidNode();
    if (invalidNode) {
      appStore.addNotification({ title: '娴佺▼閰嶇疆涓嶅彲淇濆瓨', message: invalidNode.reason, type: 'error' });
      return;
    }

    try {
      const response = await fetch('/api/workflow-templates', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        appStore.addNotification({ title: '鍒涘缓鎴愬姛', message: '瀹℃壒娴佹ā鏉垮凡鍒涘缓', type: 'success' });
        resetEditorState();
        setFormData({ name: '', description: '', nodes: [] });
        void fetchTemplates();
      } else {
        const data = await response.json();
        appStore.addNotification({ title: '鍒涘缓澶辫触', message: data.message, type: 'error' });
      }
    } catch (error) {
      appStore.addNotification({ title: '鍒涘缓澶辫触', message: '缃戠粶閿欒', type: 'error' });
    }
  };

  const handleUpdate = async () => {
    if (!editingTemplate) return;

    const invalidNode = getFirstInvalidNode();
    if (invalidNode) {
      appStore.addNotification({ title: '娴佺▼閰嶇疆涓嶅彲淇濆瓨', message: invalidNode.reason, type: 'error' });
      return;
    }

    try {
      const response = await fetch(`/api/workflow-templates/${editingTemplate.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        appStore.addNotification({ title: '鏇存柊鎴愬姛', message: '瀹℃壒娴佹ā鏉垮凡鏇存柊', type: 'success' });
        resetEditorState();
        setFormData({ name: '', description: '', nodes: [] });
        void fetchTemplates();
      } else {
        const data = await response.json();
        appStore.addNotification({ title: '鏇存柊澶辫触', message: data.message, type: 'error' });
      }
    } catch (error) {
      appStore.addNotification({ title: '鏇存柊澶辫触', message: '缃戠粶閿欒', type: 'error' });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`/api/workflow-templates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        appStore.addNotification({ title: '鍒犻櫎鎴愬姛', message: '瀹℃壒娴佹ā鏉垮凡鍒犻櫎', type: 'success' });
        void fetchTemplates();
      } else {
        const data = await response.json();
        appStore.addNotification({ title: '鍒犻櫎澶辫触', message: data.message, type: 'error' });
      }
    } catch (error) {
      appStore.addNotification({ title: '鍒犻櫎澶辫触', message: '缃戠粶閿欒', type: 'error' });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;

    setDeleteLoading(true);
    try {
      await handleDelete(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const startEdit = async (template: WorkflowTemplate) => {
    const detail = await fetchTemplateDetail(template.id);
    if (detail) {
      setEditingTemplate(detail);
      setFormData({
        name: detail.name,
        description: detail.description || '',
        nodes: detail.nodes || [],
      });
    }
  };

  const addNode = () => {
    setFormData((prev) => ({
      ...prev,
      nodes: [
        ...prev.nodes,
        {
          name: '',
          node_order: prev.nodes.length + 1,
          status_from: 'pending',
          status_to: 'approved',
          approver_type: 'role',
          approver_value: 'director',
          is_required: true,
        },
      ],
    }));
  };

  const updateNode = (index: number, field: keyof WorkflowNode, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node, currentIndex) =>
        currentIndex === index ? { ...node, [field]: value } : node,
      ),
    }));
  };

  const removeNode = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const getStatusLabel = (value: string) => {
    return STATUS_OPTIONS.find((status) => status.value === value)?.label || value;
  };

  const getNodePolicyResult = (node: WorkflowNode) => {
    return runTransitionCheck({
      from: node.status_from,
      to: node.status_to,
      node,
      logs: shadowLogs,
      source: 'designer',
    });
  };

  const getFirstInvalidNode = () => {
    for (let index = 0; index < formData.nodes.length; index += 1) {
      const node = formData.nodes[index];
      const policyResult = getNodePolicyResult(node);
      if (policyResult && !policyResult.allowed) {
        return {
          index,
          reason: `节点 ${index + 1}: ${getNodeExplainability(node).blockExplain.blockedReason}`,
        };
      }
    }

    return null;
  };

  const getNodeRuntimeContext = (node: WorkflowNode) => {
    return buildWorkflowRuntimeContext({
      from: node.status_from,
      to: node.status_to,
      node,
      logs: shadowLogs,
      source: 'designer',
    });
  };

  const getNodeExplainability = (node: WorkflowNode) => {
    return getExplainability({
      from: node.status_from,
      to: node.status_to,
      node,
      logs: shadowLogs,
      source: 'designer',
    });
  };

  const getNodeShadowSummary = (node: WorkflowNode) => {
    const runtimeContext = getNodeRuntimeContext(node);
    const explainability = getNodeExplainability(node);
    const explainUI = mapExplainToUI(explainability.explain);

    return [
      explainUI.tooltip,
      `Shadow logs: ${runtimeContext.shadowCount || 0}`,
      `Risk score: ${runtimeContext.risk}`,
      `Blocked reason: ${explainability.blockExplain.blockedReason}`,
      `Failed rule: ${explainability.blockExplain.failedRule}`,
      `Suggestion: ${explainability.blockExplain.suggestion}`,
    ].join('\n');
  };

  const getRiskBadgeClass = (level: string) => {
    if (level === 'high') return 'bg-red-500/15 text-red-400 border-red-500/30';
    if (level === 'medium') return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  };

  const getNodeCardClass = (node: WorkflowNode) => {
    const policyResult = getNodePolicyResult(node);
    const uiState = mapDecisionToUI(getNodeRuntimeContext(node));

    if (!policyResult.allowed || uiState.status === 'blocked') {
      return 'border-red-500/60 bg-red-500/5';
    }

    if (uiState.status === 'warning') {
      return 'border-amber-500/60 bg-amber-500/5';
    }

    return `${styles.bgTertiary} ${styles.border}`;
  };

  const showEditor = showCreateForm || Boolean(editingTemplate);

  if (loading) {
    return <LoadingState type="page" text="姝ｅ湪鍔犺浇瀹℃壒娴佹ā鏉?.." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="审批流设计"
        description="自定义选题审批流程"
        actions={
          hasPermission('system:template') ? (
            <button
              onClick={() => {
                setShowCreateForm(true);
                setFormData({ name: '', description: '', nodes: [] });
              }}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 ${styles.buttonPrimary}`}
            >
              <Plus className="w-4 h-4" />
              新建模板
            </button>
          ) : null
        }
      />

      {templates.length === 0 ? (
        <div className={styles.card}>
          <EmptyState
            title="暂无审批流模板"
            description="当前还没有可用的审批流模板，创建后会显示在这里。"
          />
        </div>
      ) : (
        <div className="grid gap-4">
          {templates.map((template) => (
            <div key={template.id} className={`rounded-2xl p-4 ${styles.card}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      template.is_default
                        ? 'bg-brand-500/10 text-brand-500'
                        : 'bg-theme-tertiary text-theme-text-secondary'
                    }`}
                  >
                    <ArrowRight className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${styles.textPrimary}`}>{template.name}</span>
                      {template.is_default ? (
                        <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-xs text-brand-500">
                          榛樿
                        </span>
                      ) : null}
                    </div>
                    <p className={`text-sm ${styles.textMuted}`}>{template.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-4 text-sm">
                    <span className={styles.textMuted}>{template.node_count} 个节点</span>
                    <span className={styles.textMuted}>{template.topic_count} 涓€夐浣跨敤</span>
                  </div>
                  {hasPermission('system:template') ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void startEdit(template)}
                        className={`rounded-lg p-2 ${styles.hoverBg} ${styles.textMuted}`}
                        title="缂栬緫"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {!template.is_default ? (
                        <button
                          onClick={() => setDeleteTarget(template)}
                          className="rounded-lg p-2 text-red-400 hover:bg-red-500/10"
                          title="鍒犻櫎"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <FormModal
        open={showEditor}
        onCancel={resetEditorState}
        onSubmit={editingTemplate ? handleUpdate : handleCreate}
        title={editingTemplate ? '编辑审批流' : '新建审批流'}
        submitText={editingTemplate ? '淇濆瓨' : '鍒涘缓'}
        cancelText="鍙栨秷"
        size="xl"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>妯℃澘鍚嶇О</label>
              <input
                type="text"
                value={formData.name}
                onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                className={`w-full rounded-xl px-4 py-2 ${styles.input}`}
                placeholder="濡傦細鏍囧噯閫夐娴佺▼"
              />
            </div>
            <div>
              <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>鎻忚堪</label>
              <input
                type="text"
                value={formData.description}
                onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
                className={`w-full rounded-xl px-4 py-2 ${styles.input}`}
                placeholder="娴佺▼鎻忚堪"
              />
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <label className={`text-sm font-medium ${styles.textSecondary}`}>瀹℃壒鑺傜偣</label>
              <button
                onClick={addNode}
                className={`flex items-center gap-1 rounded-lg px-3 py-1 text-sm ${styles.buttonSecondary}`}
              >
                <Plus className="w-4 h-4" />
                娣诲姞鑺傜偣
              </button>
            </div>

            <div className="space-y-3">
              {formData.nodes.map((node, index) => (
                <div
                  key={index}
                  className={`rounded-xl border p-4 ${getNodeCardClass(node)}`}
                  data-policy-reason={getNodePolicyResult(node)?.reason}
                  title={getNodeShadowSummary(node)}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-sm font-medium ${styles.textPrimary}`}>鑺傜偣 {index + 1}</span>
                      {(() => {
                        const policyResult = getNodePolicyResult(node);
                        const runtimeContext = getNodeRuntimeContext(node);
                        const explainability = getNodeExplainability(node);
                        const explainUI = mapExplainToUI(explainability.explain);
                        const uiState = mapDecisionToUI(runtimeContext);
                        if (uiState.status === 'normal' && policyResult.allowed) return null;

                        return (
                          <>
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${getRiskBadgeClass(uiState.risk)}`}>
                              {uiState.risk} 路 {Math.round(runtimeContext.confidence * 100)}%
                            </span>
                            {uiState.status === 'warning' ? (
                              <span className={`text-[11px] ${uiState.risk === 'high' ? 'text-red-400' : 'text-amber-400'}`}>寤鸿澶嶆牳</span>
                            ) : null}
                            {!policyResult.allowed || uiState.status === 'blocked' ? (
                              <span className="text-[11px] text-red-400">必须修复：{explainability.blockExplain.blockedReason}</span>
                            ) : null}
                            {runtimeContext.suggestedTransition ? (
                              <button
                                type="button"
                                onClick={() => updateNode(index, 'status_to', runtimeContext.suggestedTransition)}
                                className={`rounded-full border px-2 py-0.5 text-[11px] ${styles.border} ${styles.hoverBg} text-blue-400`}
                                title={explainUI.tooltip}
                              >
                                应用建议：{getStatusLabel(runtimeContext.suggestedTransition)}
                              </button>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                    <button
                      onClick={() => removeNode(index)}
                      className="rounded p-1 text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`mb-1 block text-xs ${styles.textMuted}`}>鑺傜偣鍚嶇О</label>
                      <input
                        type="text"
                        value={node.name}
                        onChange={(event) => updateNode(index, 'name', event.target.value)}
                        className={`w-full rounded-lg px-3 py-1.5 text-sm ${styles.input}`}
                        placeholder="濡傦細鍐呭瀹℃牳"
                      />
                    </div>
                    <div>
                      <label className={`mb-1 block text-xs ${styles.textMuted}`}>瀹℃壒绫诲瀷</label>
                      <select
                        value={node.approver_type}
                        onChange={(event) => updateNode(index, 'approver_type', event.target.value)}
                        className={`w-full rounded-lg px-3 py-1.5 text-sm ${styles.input}`}
                      >
                        {APPROVER_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={`mb-1 block text-xs ${styles.textMuted}`}>从状态</label>
                      <select
                        value={node.status_from}
                        onChange={(event) => updateNode(index, 'status_from', event.target.value)}
                        className={`w-full rounded-lg px-3 py-1.5 text-sm ${styles.input}`}
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={`mb-1 block text-xs ${styles.textMuted}`}>到状态</label>
                      <select
                        value={node.status_to}
                        onChange={(event) => updateNode(index, 'status_to', event.target.value)}
                        className={`w-full rounded-lg px-3 py-1.5 text-sm ${styles.input}`}
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={`mb-1 block text-xs ${styles.textMuted}`}>审批人值</label>
                      <input
                        type="text"
                        value={node.approver_value}
                        onChange={(event) => updateNode(index, 'approver_value', event.target.value)}
                        className={`w-full rounded-lg px-3 py-1.5 text-sm ${styles.input}`}
                        placeholder="瑙掕壊鐮佹垨鐢ㄦ埛ID"
                      />
                    </div>
                    <div className="flex items-center">
                      <label className={`flex items-center gap-2 text-sm ${styles.textPrimary}`}>
                        <input
                          type="checkbox"
                          checked={node.is_required}
                          onChange={(event) => updateNode(index, 'is_required', event.target.checked)}
                          className="rounded border-gray-300"
                        />
                        蹇呴』瀹℃壒
                      </label>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-xs">
                    <span className={`rounded px-2 py-1 ${styles.bgSecondary} ${styles.textPrimary}`}>
                      {getStatusLabel(node.status_from)}
                    </span>
                    <ArrowRight className="w-4 h-4 text-theme-text-muted" />
                    <span className={`rounded px-2 py-1 ${styles.bgSecondary} ${styles.textPrimary}`}>
                      {getStatusLabel(node.status_to)}
                    </span>
                  </div>
                </div>
              ))}

              {formData.nodes.length === 0 ? (
                <div className={`py-8 text-center ${styles.textMuted}`}>
                  暂无审批节点，点击“添加节点”开始设计流程。
                </div>
              ) : null}
            </div>
          </div>

          {formData.nodes.length > 0 ? (
            <div>
              <label className={`mb-3 block text-sm font-medium ${styles.textSecondary}`}>流程预览</label>
              <div className="flex flex-wrap items-center gap-2">
                {formData.nodes.map((node, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className={`rounded-lg border px-3 py-2 ${styles.bgTertiary} ${styles.border}`}>
                      <p className={`text-xs font-medium ${styles.textPrimary}`}>{node.name || `节点${index + 1}`}</p>
                      <p className={`text-xs ${styles.textMuted}`}>
                        {getStatusLabel(node.status_from)} → {getStatusLabel(node.status_to)}
                      </p>
                    </div>
                    {index < formData.nodes.length - 1 ? (
                      <ArrowRight className="w-4 h-4 flex-shrink-0 text-theme-text-muted" />
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </FormModal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        loading={deleteLoading}
        variant="danger"
        title="确认删除"
        confirmText="确认删除"
        cancelText="取消"
        description={
          deleteTarget ? `确定删除审批流模板“${deleteTarget.name}”吗？` : ''
        }
      />
    </div>
  );
}

