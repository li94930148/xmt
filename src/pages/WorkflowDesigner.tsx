import { useState, useEffect, useRef } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { usePermission } from '../hooks/usePermission';
import { useAppStore, useAuthStore } from '../store';
import { Plus, Trash2, Edit2, ArrowRight } from 'lucide-react';
import EmptyState from '../components/EmptyState';
import { ConfirmModal, FormModal, LoadingState, PageHeader } from '../components/common';
import ActionButton from '../components/studio/ActionButton';
import { buildWorkflowRuntimeContext, getExplainability, runTransitionCheck } from '@shared/workflow/workflow_runtime';
import { getWorkflowRiskLabel, getWorkflowRuleLabel, localizeWorkflowMessage, mapDecisionToUI, mapExplainToUI } from '../components/workflow/WorkflowUIBridge';
import XMTCard from '../design-system/components/XMTCard';
import { ReactBitsPageScene } from '../features/reactbits-appearance/slots/ReactBitsPageScene';
import { ReactBitsHeadingSlot } from '../features/reactbits-appearance/slots/ReactBitsHeadingSlot';
import { ReactBitsMetricSlot } from '../features/reactbits-appearance/slots/ReactBitsMetricSlot';
import { ReactBitsCardSlot } from '../features/reactbits-appearance/ReactBitsCardSlot';
import { ReactBitsButtonSlot } from '../features/reactbits-appearance/ReactBitsButtonSlot';
import { emitClientLog, safeClientErrorClass } from '../observability/client-logger';
import {
  persistWorkflowTemplateDeleteRecovery,
  readWorkflowTemplateDeleteRecovery,
  removeWorkflowTemplateDeleteRecovery,
  sameWorkflowTemplateDeleteRecovery,
  WORKFLOW_TEMPLATE_DELETE_RECOVERY_VERSION,
  type WorkflowTemplateDeleteRecovery,
  type WorkflowTemplateDeleteRecoveryRead,
} from './workflowTemplateDeleteRecovery';
import {
  createWorkflowTemplateUpdateFingerprint,
  createWorkflowTemplateUpdateRequestFingerprint,
  isWorkflowTemplateUpdatePayload,
  markWorkflowTemplateUpdateRecoveryRejected,
  persistWorkflowTemplateUpdateRecovery,
  readWorkflowTemplateUpdateRecovery,
  removeWorkflowTemplateUpdateRecovery,
  sameWorkflowTemplateUpdateRecovery,
  WORKFLOW_TEMPLATE_REQUEST_ID_PATTERN,
  WORKFLOW_TEMPLATE_UPDATE_RECOVERY_VERSION,
  type WorkflowTemplateUpdateRecovery,
  type WorkflowTemplateUpdateRecoveryRead,
} from './workflowTemplateUpdateRecovery';

interface WorkflowTemplate {
  id: number;
  name: string;
  description: string;
  is_default: boolean;
  node_count: number;
  topic_count: number;
  creator_name: string;
  base_fingerprint?: string;
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

const WORKFLOW_TEMPLATE_CREATE_RECOVERY_VERSION = 1;
const WORKFLOW_TEMPLATE_CREATE_REQUEST_ID_PATTERN = WORKFLOW_TEMPLATE_REQUEST_ID_PATTERN;

interface WorkflowTemplateCreatePayload {
  name: string;
  description: string;
  nodes: WorkflowNode[];
}

interface WorkflowTemplateCreateRecovery {
  version: 1;
  actorId: number;
  requestId: string;
  payload: WorkflowTemplateCreatePayload;
}

type WorkflowTemplateCreateRecoveryRead = WorkflowTemplateCreateRecovery | 'invalid' | null;
type WorkflowTemplateCreateRecoveryState = 'submitting' | 'checking' | 'not_found' | 'unavailable' | 'conflict' | null;
type WorkflowTemplateUpdateRecoveryState = 'submitting' | 'checking' | 'not_found' | 'unavailable' | 'conflict' | 'rejected' | 'confirmed' | null;
type WorkflowTemplateDeleteRecoveryState = 'submitting' | 'checking' | 'unavailable' | null;

function readDeleteRecoveryForActor(actorId: number | null | undefined): WorkflowTemplateDeleteRecoveryRead {
  if (typeof window === 'undefined') return null;
  try {
    return readWorkflowTemplateDeleteRecovery(window.sessionStorage, actorId);
  } catch {
    return 'invalid';
  }
}

function persistDeleteRecovery(recovery: WorkflowTemplateDeleteRecovery) {
  if (typeof window === 'undefined') throw new Error('当前环境无法安全保存删除请求');
  persistWorkflowTemplateDeleteRecovery(window.sessionStorage, recovery);
}

function removeDeleteRecovery(recovery: WorkflowTemplateDeleteRecovery) {
  if (typeof window === 'undefined') return false;
  try {
    return removeWorkflowTemplateDeleteRecovery(window.sessionStorage, recovery);
  } catch {
    return false;
  }
}

function readUpdateRecoveryForActor(actorId: number | null | undefined): WorkflowTemplateUpdateRecoveryRead {
  if (typeof window === 'undefined') return null;
  try {
    let sessionStorage: Storage | null = null;
    let localStorage: Storage | null = null;
    try { sessionStorage = window.sessionStorage; } catch { /* local rejection marker may still be available */ }
    try { localStorage = window.localStorage; } catch { /* unavailable storage is handled fail-closed below */ }
    if (!sessionStorage && !localStorage) return 'invalid';
    return readWorkflowTemplateUpdateRecovery(sessionStorage, actorId, localStorage);
  } catch {
    return 'invalid';
  }
}

function persistUpdateRecovery(recovery: WorkflowTemplateUpdateRecovery) {
  if (typeof window === 'undefined') throw new Error('当前环境无法安全保存更新请求');
  let sessionStorage: Storage | null = null;
  let localStorage: Storage | null = null;
  try { sessionStorage = window.sessionStorage; } catch { /* handled below */ }
  try { localStorage = window.localStorage; } catch { /* rejected fallback is optional during preparation */ }
  persistWorkflowTemplateUpdateRecovery(sessionStorage, localStorage, recovery);
}

function removeUpdateRecovery(recovery: WorkflowTemplateUpdateRecovery) {
  if (typeof window === 'undefined') return false;
  let sessionStorage: Storage | null = null;
  let localStorage: Storage | null = null;
  try { sessionStorage = window.sessionStorage; } catch { /* return false when no marker store can be verified */ }
  try { localStorage = window.localStorage; } catch { /* removal will remain unconfirmed */ }
  return removeWorkflowTemplateUpdateRecovery(sessionStorage, localStorage, recovery);
}

function markUpdateRecoveryRejected(recovery: WorkflowTemplateUpdateRecovery) {
  if (typeof window === 'undefined') return null;
  let sessionStorage: Storage | null = null;
  let localStorage: Storage | null = null;
  try { sessionStorage = window.sessionStorage; } catch { /* independent rejection marker may still be available */ }
  try { localStorage = window.localStorage; } catch { /* handled fail-closed below */ }
  return markWorkflowTemplateUpdateRecoveryRejected(sessionStorage, localStorage, recovery);
}

function workflowTemplateUpdateRecoveryPlaceholder(recovery: WorkflowTemplateUpdateRecovery): WorkflowTemplate {
  return {
    id: recovery.templateId,
    name: recovery.basePayload.name,
    description: recovery.basePayload.description,
    is_default: false,
    node_count: recovery.basePayload.nodes.length,
    topic_count: 0,
    creator_name: '',
    base_fingerprint: recovery.baseFingerprint,
    nodes: recovery.basePayload.nodes,
  };
}

function workflowTemplateCreateRecoveryStorageKey(actorId: number) {
  return `xmt:workflow-template-create-pending:v${WORKFLOW_TEMPLATE_CREATE_RECOVERY_VERSION}:actor:${actorId}`;
}

function isWorkflowTemplateCreatePayload(value: unknown): value is WorkflowTemplateCreatePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.name === 'string'
    && typeof payload.description === 'string'
    && Array.isArray(payload.nodes)
    && payload.nodes.every((node) => {
      if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
      const item = node as Record<string, unknown>;
      return typeof item.name === 'string'
        && Number.isSafeInteger(item.node_order)
        && typeof item.status_from === 'string'
        && typeof item.status_to === 'string'
        && ['role', 'user', 'creator'].includes(String(item.approver_type))
        && typeof item.approver_value === 'string'
        && typeof item.is_required === 'boolean'
        && (item.id === undefined || (Number.isSafeInteger(item.id) && Number(item.id) > 0));
    });
}

function readWorkflowTemplateCreateRecovery(actorId: number | null | undefined): WorkflowTemplateCreateRecoveryRead {
  if (typeof window === 'undefined' || !Number.isSafeInteger(actorId) || Number(actorId) <= 0) return null;
  try {
    const raw = window.sessionStorage.getItem(workflowTemplateCreateRecoveryStorageKey(Number(actorId)));
    if (!raw) return null;
    if (raw.length > 200_000) return 'invalid';
    const value = JSON.parse(raw) as Partial<WorkflowTemplateCreateRecovery> | null;
    if (!value || value.version !== WORKFLOW_TEMPLATE_CREATE_RECOVERY_VERSION
      || value.actorId !== actorId
      || typeof value.requestId !== 'string'
      || !WORKFLOW_TEMPLATE_CREATE_REQUEST_ID_PATTERN.test(value.requestId)
      || !isWorkflowTemplateCreatePayload(value.payload)) return 'invalid';
    return {
      version: WORKFLOW_TEMPLATE_CREATE_RECOVERY_VERSION,
      actorId: Number(actorId),
      requestId: value.requestId.toLowerCase(),
      payload: value.payload,
    };
  } catch {
    return 'invalid';
  }
}

function persistWorkflowTemplateCreateRecovery(recovery: WorkflowTemplateCreateRecovery) {
  if (typeof window === 'undefined') throw new Error('当前环境无法安全保存创建请求编号');
  const key = workflowTemplateCreateRecoveryStorageKey(recovery.actorId);
  window.sessionStorage.setItem(key, JSON.stringify(recovery));
  const stored = readWorkflowTemplateCreateRecovery(recovery.actorId);
  if (!stored || stored === 'invalid' || stored.requestId !== recovery.requestId
    || JSON.stringify(stored.payload) !== JSON.stringify(recovery.payload)) {
    throw new Error('创建请求恢复状态未能完整保存');
  }
}

function removeWorkflowTemplateCreateRecovery(recovery: WorkflowTemplateCreateRecovery) {
  if (typeof window === 'undefined') return;
  try {
    const stored = readWorkflowTemplateCreateRecovery(recovery.actorId);
    if (stored && stored !== 'invalid' && stored.requestId === recovery.requestId) {
      window.sessionStorage.removeItem(workflowTemplateCreateRecoveryStorageKey(recovery.actorId));
    }
  } catch {
    // A stale marker is safe: the next visit performs only an actor-scoped status read.
  }
}

function createWorkflowTemplateRequestId() {
  if (typeof window === 'undefined' || !window.crypto?.getRandomValues) {
    throw new Error('当前浏览器无法生成安全的创建请求编号');
  }
  if (window.crypto.randomUUID) return window.crypto.randomUUID();
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

async function createWorkflowTemplateRequestFingerprint(payload: WorkflowTemplateCreatePayload) {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    throw new Error('当前浏览器无法安全核实创建内容');
  }
  const normalizedNodes = payload.nodes.map((node) => [
    node.name,
    node.status_from,
    node.status_to,
    node.approver_type || 'role',
    node.approver_value || '',
    node.is_required !== false,
  ]);
  const serializedPayload = JSON.stringify([
    payload.name,
    payload.description || '',
    normalizedNodes,
  ]);
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(serializedPayload));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function isWorkflowTemplateDetail(value: unknown, templateId: number): value is WorkflowTemplate & { nodes: WorkflowNode[] } {
  if (!value || typeof value !== 'object') return false;
  const detail = value as Record<string, unknown>;
  return detail.id === templateId
    && typeof detail.name === 'string'
    && typeof detail.base_fingerprint === 'string'
    && /^[0-9a-f]{64}$/i.test(detail.base_fingerprint)
    && Array.isArray(detail.nodes)
    && detail.nodes.every((node) => (
      Boolean(node)
      && typeof node === 'object'
      && typeof (node as Record<string, unknown>).name === 'string'
      && typeof (node as Record<string, unknown>).node_order === 'number'
      && typeof (node as Record<string, unknown>).status_from === 'string'
      && typeof (node as Record<string, unknown>).status_to === 'string'
      && ['role', 'user', 'creator'].includes(String((node as Record<string, unknown>).approver_type))
      && typeof (node as Record<string, unknown>).approver_value === 'string'
      && [true, false, 0, 1].includes((node as Record<string, unknown>).is_required as boolean | number)
    ));
}

function workflowTemplateDetailPayload(detail: WorkflowTemplate & { nodes: WorkflowNode[] }): WorkflowTemplateCreatePayload {
  return {
    name: detail.name,
    description: detail.description || '',
    nodes: detail.nodes.map((node) => ({ ...node, is_required: Boolean(node.is_required) })),
  };
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
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const [initialCreateRecovery] = useState<WorkflowTemplateCreateRecoveryRead>(
    () => readWorkflowTemplateCreateRecovery(useAuthStore.getState().user?.id),
  );
  const [initialUpdateRecovery] = useState<WorkflowTemplateUpdateRecoveryRead>(
    () => readUpdateRecoveryForActor(useAuthStore.getState().user?.id),
  );
  const [initialDeleteRecovery] = useState<WorkflowTemplateDeleteRecoveryRead>(
    () => readDeleteRecoveryForActor(useAuthStore.getState().user?.id),
  );
  const initialValidCreateRecovery = initialCreateRecovery && initialCreateRecovery !== 'invalid'
    ? initialCreateRecovery
    : null;
  const initialValidUpdateRecovery = initialUpdateRecovery && initialUpdateRecovery !== 'invalid'
    ? initialUpdateRecovery
    : null;
  const initialValidDeleteRecovery = initialDeleteRecovery && initialDeleteRecovery !== 'invalid'
    ? initialDeleteRecovery
    : null;

  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [templateListLoadFailed, setTemplateListLoadFailed] = useState(false);
  const [templateListRefreshing, setTemplateListRefreshing] = useState(false);
  const [confirmedTemplateRefreshFailure, setConfirmedTemplateRefreshFailure] = useState<{ action: '创建' | '更新' | '删除'; name: string } | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const templateMutationInFlight = useRef(false);
  const templateListReadInFlight = useRef<Promise<boolean> | null>(null);
  const templateListRequestSequenceRef = useRef(0);
  const activeTemplateListActorRef = useRef<number | null>(currentUserId);
  const fetchShadowLogsRef = useRef<() => Promise<void>>(async () => {});
  const createRecoveryStatusRequestRef = useRef<string | null>(null);
  const updateRecoveryStatusRequestRef = useRef<WorkflowTemplateUpdateRecovery | null>(null);
  const deleteRecoveryStatusRequestRef = useRef<WorkflowTemplateDeleteRecovery | null>(null);
  const activeCreateRecoveryActorRef = useRef<number | null>(currentUserId);
  const activeUpdateRecoveryActorRef = useRef<number | null>(currentUserId);
  const activeDeleteRecoveryActorRef = useRef<number | null>(currentUserId);
  const [pendingCreateRecovery, setPendingCreateRecovery] = useState<WorkflowTemplateCreateRecovery | null>(initialValidCreateRecovery);
  const [createRecoveryState, setCreateRecoveryState] = useState<WorkflowTemplateCreateRecoveryState>(initialValidCreateRecovery ? 'checking' : null);
  const [createRecoveryInvalid, setCreateRecoveryInvalid] = useState(initialCreateRecovery === 'invalid');
  const [createRecoveryNotice, setCreateRecoveryNotice] = useState<string | null>(null);
  const [pendingUpdateRecovery, setPendingUpdateRecovery] = useState<WorkflowTemplateUpdateRecovery | null>(initialValidUpdateRecovery);
  const pendingUpdateRecoveryRef = useRef<WorkflowTemplateUpdateRecovery | null>(initialValidUpdateRecovery);
  pendingUpdateRecoveryRef.current = pendingUpdateRecovery;
  const [updateRecoveryState, setUpdateRecoveryState] = useState<WorkflowTemplateUpdateRecoveryState>(initialValidUpdateRecovery ? 'checking' : null);
  const [updateRecoveryInvalid, setUpdateRecoveryInvalid] = useState(initialUpdateRecovery === 'invalid');
  const [updateRecoveryNotice, setUpdateRecoveryNotice] = useState<string | null>(null);
  const [pendingDeleteRecovery, setPendingDeleteRecovery] = useState<WorkflowTemplateDeleteRecovery | null>(initialValidDeleteRecovery);
  const pendingDeleteRecoveryRef = useRef<WorkflowTemplateDeleteRecovery | null>(initialValidDeleteRecovery);
  pendingDeleteRecoveryRef.current = pendingDeleteRecovery;
  const [deleteRecoveryState, setDeleteRecoveryState] = useState<WorkflowTemplateDeleteRecoveryState>(initialValidDeleteRecovery ? 'checking' : null);
  const [deleteRecoveryInvalid, setDeleteRecoveryInvalid] = useState(initialDeleteRecovery === 'invalid');
  const [deleteRecoveryNotice, setDeleteRecoveryNotice] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<WorkflowTemplate | null>(
    initialValidUpdateRecovery ? workflowTemplateUpdateRecoveryPlaceholder(initialValidUpdateRecovery) : null,
  );
  const [showCreateForm, setShowCreateForm] = useState(Boolean(initialValidCreateRecovery));
  const [deleteTarget, setDeleteTarget] = useState<WorkflowTemplate | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [templateDetailLoadingId, setTemplateDetailLoadingId] = useState<number | null>(null);
  const [templateDetailLoadFailure, setTemplateDetailLoadFailure] = useState<{ id: number; name: string } | null>(null);
  const templateDetailReadInFlight = useRef<number | null>(null);
  const [shadowLogs, setShadowLogs] = useState<WorkflowShadowLog[]>([]);
  const [formData, setFormData] = useState<WorkflowTemplateCreatePayload>(initialValidUpdateRecovery?.payload ?? initialValidCreateRecovery?.payload ?? {
    name: '',
    description: '',
    nodes: [],
  });

  const isCurrentTemplateUpdateRecovery = (recovery: WorkflowTemplateUpdateRecovery) => (
    useAuthStore.getState().user?.id === recovery.actorId
    && activeUpdateRecoveryActorRef.current === recovery.actorId
    && sameWorkflowTemplateUpdateRecovery(pendingUpdateRecoveryRef.current, recovery)
  );
  const isCurrentTemplateUpdateActor = (actorId: number) => (
    useAuthStore.getState().user?.id === actorId
    && activeUpdateRecoveryActorRef.current === actorId
  );
  const isCurrentTemplateDeleteRecovery = (recovery: WorkflowTemplateDeleteRecovery) => (
    useAuthStore.getState().user?.id === recovery.actorId
    && activeDeleteRecoveryActorRef.current === recovery.actorId
    && sameWorkflowTemplateDeleteRecovery(pendingDeleteRecoveryRef.current, recovery)
  );
  const isCurrentTemplateDeleteActor = (actorId: number) => (
    useAuthStore.getState().user?.id === actorId
    && activeDeleteRecoveryActorRef.current === actorId
  );

  useEffect(() => {
    if (activeTemplateListActorRef.current !== currentUserId) {
      activeTemplateListActorRef.current = currentUserId;
      templateListRequestSequenceRef.current += 1;
      templateListReadInFlight.current = null;
      setLoading(true);
    }
    void fetchTemplates(true);
    void fetchShadowLogsRef.current();
  }, [currentUserId]);

  const fetchTemplates = (initialLoad = false): Promise<boolean> => {
    if (templateListReadInFlight.current) return templateListReadInFlight.current;

    const requestActorId = useAuthStore.getState().user?.id ?? null;
    const requestToken = useAuthStore.getState().token || '';
    const requestSequence = ++templateListRequestSequenceRef.current;

    if (initialLoad) setLoading(true);
    else setTemplateListRefreshing(true);

    const request = (async () => {
      try {
        const response = await fetch('/api/workflow-templates', {
          headers: { Authorization: `Bearer ${requestToken}` },
        });

        if (!response.ok) throw new Error('Workflow template list request failed');

        const data: unknown = await response.json();
        if (!Array.isArray(data)) throw new Error('Workflow template list response was invalid');
        if (useAuthStore.getState().user?.id !== requestActorId
          || templateListRequestSequenceRef.current !== requestSequence) return false;

        setTemplates(data as WorkflowTemplate[]);
        setTemplateListLoadFailed(false);
        setConfirmedTemplateRefreshFailure(null);
        return true;
      } catch (error) {
        if (useAuthStore.getState().user?.id !== requestActorId
          || templateListRequestSequenceRef.current !== requestSequence) return false;
        emitClientLog({ event: 'workflow.templates_load_failed', level: 'error', fields: { errorClass: safeClientErrorClass(error) } });
        setTemplateListLoadFailed(true);
        return false;
      } finally {
        if (useAuthStore.getState().user?.id === requestActorId
          && templateListRequestSequenceRef.current === requestSequence) {
          setLoading(false);
          setTemplateListRefreshing(false);
        }
      }
    })();
    const trackedRequest = request.finally(() => {
      if (templateListReadInFlight.current === trackedRequest) {
        templateListReadInFlight.current = null;
      }
    });
    templateListReadInFlight.current = trackedRequest;
    return trackedRequest;
  };

  const isTemplateActionBlocked = () => (
    templateListLoadFailed
    || templateListRefreshing
    || Boolean(confirmedTemplateRefreshFailure)
    || savingTemplate
    || deleteLoading
    || templateDetailLoadingId !== null
    || Boolean(pendingCreateRecovery)
    || createRecoveryInvalid
    || Boolean(pendingUpdateRecovery)
    || updateRecoveryInvalid
    || Boolean(pendingDeleteRecovery)
    || deleteRecoveryInvalid
  );

  const fetchTemplateDetail = async (id: number, authToken = useAuthStore.getState().token || token) => {
    try {
      const response = await fetch(`/api/workflow-templates/${id}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (!response.ok) throw new Error('Workflow template detail request failed');

      const data: unknown = await response.json();
      if (!isWorkflowTemplateDetail(data, id)) throw new Error('Workflow template detail response was invalid');
      return {
        ...data,
        nodes: data.nodes.map((node) => ({
          ...node,
          is_required: Boolean(node.is_required),
        })),
      };
    } catch (error) {
      emitClientLog({ event: 'workflow.template_detail_load_failed', level: 'error', fields: { errorClass: safeClientErrorClass(error) } });
      return null;
    }
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
      emitClientLog({ event: 'workflow.shadow_logs_load_failed', level: 'error', fields: { errorClass: safeClientErrorClass(error) } });
    }
  };
  fetchShadowLogsRef.current = fetchShadowLogs;

  const resetEditorState = () => {
    setShowCreateForm(false);
    setEditingTemplate(null);
  };

  const finishConfirmedTemplateCreate = async (recovery: WorkflowTemplateCreateRecovery, replayed = false) => {
    if (useAuthStore.getState().user?.id !== recovery.actorId) return;
    removeWorkflowTemplateCreateRecovery(recovery);
    setPendingCreateRecovery(null);
    setCreateRecoveryState(null);
    setCreateRecoveryInvalid(false);
    setCreateRecoveryNotice(null);
    resetEditorState();
    setFormData({ name: '', description: '', nodes: [] });
    appStore.addNotification({
      title: replayed ? '创建已核实' : '创建成功',
      message: `审批流模板“${recovery.payload.name}”已创建，不会重复创建。`,
      type: 'success',
    });
    const listRefreshed = await fetchTemplates();
    if (!listRefreshed && useAuthStore.getState().user?.id === recovery.actorId) {
      setConfirmedTemplateRefreshFailure({ action: '创建', name: recovery.payload.name });
    }
  };

  const finishDeletedTemplateCreate = async (recovery: WorkflowTemplateCreateRecovery) => {
    if (useAuthStore.getState().user?.id !== recovery.actorId) return;
    removeWorkflowTemplateCreateRecovery(recovery);
    setPendingCreateRecovery(null);
    setCreateRecoveryState(null);
    setCreateRecoveryInvalid(false);
    setCreateRecoveryNotice(`模板“${recovery.payload.name}”已创建后被删除，不会因为恢复或重试而重新创建。`);
    resetEditorState();
    setFormData({ name: '', description: '', nodes: [] });
    appStore.addNotification({
      title: '模板已删除',
      message: '原创建请求已完成，但对应模板已删除；不会重新创建。',
      type: 'warning',
    });
    await fetchTemplates();
  };

  const releaseRejectedTemplateUpdate = (
    recovery: WorkflowTemplateUpdateRecovery,
    message: string,
    refreshCurrentTemplate = false,
  ) => {
    if (!isCurrentTemplateUpdateRecovery(recovery)) return;
    const rejectedRecovery = markUpdateRecoveryRejected(recovery);
    const markerRemoved = rejectedRecovery ? removeUpdateRecovery(rejectedRecovery) : false;
    if (!markerRemoved) {
      pendingUpdateRecoveryRef.current = rejectedRecovery ?? recovery;
      setPendingUpdateRecovery(rejectedRecovery ?? recovery);
      setUpdateRecoveryState('rejected');
      setUpdateRecoveryNotice('服务器已明确拒绝本次更新，但恢复标记暂时无法安全清理；当前窗口保持锁定，仅可只读核实或重试清理。');
      appStore.addNotification({ title: '更新恢复仍锁定', message: '拒绝结果已收到，但本地恢复标记未能确认清理。为避免误写，当前账号的模板操作继续暂停。', type: 'warning' });
      return;
    }
    pendingUpdateRecoveryRef.current = null;
    setPendingUpdateRecovery(null);
    setUpdateRecoveryState(null);
    setUpdateRecoveryInvalid(false);
    setUpdateRecoveryNotice(null);
    if (refreshCurrentTemplate) {
      setEditingTemplate(null);
      setShowCreateForm(Boolean(pendingCreateRecovery));
      setFormData(pendingCreateRecovery?.payload ?? { name: '', description: '', nodes: [] });
      void fetchTemplates();
    }
    appStore.addNotification({ title: '更新请求已拒绝', message, type: 'error' });
  };

  const finishConfirmedTemplateUpdate = async (recovery: WorkflowTemplateUpdateRecovery): Promise<boolean> => {
    if (!isCurrentTemplateUpdateRecovery(recovery)) return false;
    const currentToken = useAuthStore.getState().token || '';
    const detail = await fetchTemplateDetail(recovery.templateId, currentToken);
    if (!isCurrentTemplateUpdateRecovery(recovery)) return false;
    if (!detail) {
      setUpdateRecoveryState('unavailable');
      setUpdateRecoveryNotice('服务器已记录本次更新，但原模板详情暂时无法读取；当前窗口保持只读。可重新只读核实。');
      return false;
    }

    let contentStillMatches = false;
    try {
      const confirmedPayload: WorkflowTemplateCreatePayload = {
        ...workflowTemplateDetailPayload(detail),
      };
      const [confirmedFingerprint, expectedPayloadFingerprint] = await Promise.all([
        createWorkflowTemplateUpdateFingerprint(confirmedPayload, window.crypto),
        createWorkflowTemplateUpdateFingerprint(recovery.payload, window.crypto),
      ]);
      if (!isCurrentTemplateUpdateRecovery(recovery)) return false;
      if (confirmedFingerprint !== detail.base_fingerprint) {
        setUpdateRecoveryState('unavailable');
        setUpdateRecoveryNotice('原模板详情与服务端快照指纹不一致；为避免错误确认，当前窗口保持只读。可重新只读核实。');
        return false;
      }
      contentStillMatches = confirmedFingerprint === expectedPayloadFingerprint;
    } catch {
      if (isCurrentTemplateUpdateRecovery(recovery)) {
        setUpdateRecoveryState('unavailable');
        setUpdateRecoveryNotice('原模板详情已读取，但暂时无法安全比对内容；当前窗口保持只读。可重新只读核实。');
      }
      return false;
    }

    if (!isCurrentTemplateUpdateRecovery(recovery)) return false;
    const markerRemoved = removeUpdateRecovery(recovery);
    if (!markerRemoved) {
      setUpdateRecoveryState('confirmed');
      setUpdateRecoveryNotice(contentStillMatches
        ? '本次更新已只读核实成功，但恢复标记暂时无法清理；当前窗口保持锁定。可重试清理标记。'
        : '本次已保存，模板后续又变化，请重新读取后编辑。恢复标记暂时无法清理，当前窗口保持锁定。');
      return true;
    }
    pendingUpdateRecoveryRef.current = null;
    setPendingUpdateRecovery(null);
    setUpdateRecoveryState(null);
    setUpdateRecoveryInvalid(false);
    setUpdateRecoveryNotice(null);
    setEditingTemplate(null);
    setShowCreateForm(Boolean(pendingCreateRecovery));
    setFormData(pendingCreateRecovery?.payload ?? { name: '', description: '', nodes: [] });
    appStore.addNotification(contentStillMatches
      ? {
        title: '更新已核实',
        message: `审批流模板“${recovery.payload.name}”的服务端内容已核实，不会重复更新。`,
        type: 'success',
      }
      : {
        title: '模板已再次变化',
        message: '本次已保存，模板后续又变化，请重新读取后编辑。',
        type: 'warning',
      });
    const listRefreshed = await fetchTemplates();
    if (!listRefreshed && useAuthStore.getState().user?.id === recovery.actorId) {
      setConfirmedTemplateRefreshFailure({ action: '更新', name: recovery.payload.name });
    }
    return true;
  };

  const verifyTemplateUpdateStatus = async (
    recovery: WorkflowTemplateUpdateRecovery,
  ): Promise<'updated' | 'not_found' | 'unavailable' | 'conflict'> => {
    if (!isCurrentTemplateUpdateRecovery(recovery)) return 'unavailable';
    if (sameWorkflowTemplateUpdateRecovery(updateRecoveryStatusRequestRef.current, recovery)) return 'unavailable';
    const rejectedRequest = recovery.rejected || updateRecoveryState === 'rejected';
    updateRecoveryStatusRequestRef.current = recovery;
    setUpdateRecoveryState(rejectedRequest ? 'rejected' : 'checking');
    setUpdateRecoveryNotice(null);
    try {
      const [localRequestFingerprint, localBaseFingerprint] = await Promise.all([
        createWorkflowTemplateUpdateRequestFingerprint(recovery.payload, recovery.baseFingerprint, window.crypto),
        createWorkflowTemplateUpdateFingerprint(recovery.basePayload, window.crypto),
      ]);
      if (!isCurrentTemplateUpdateRecovery(recovery)) return 'unavailable';
      if (localRequestFingerprint !== recovery.requestFingerprint || localBaseFingerprint !== recovery.baseFingerprint) {
        setUpdateRecoveryInvalid(true);
        setUpdateRecoveryState('unavailable');
        setUpdateRecoveryNotice('保存的更新内容或原模板快照与原请求指纹不一致；为避免误写，恢复记录保持锁定。');
        return 'unavailable';
      }

      const query = new URLSearchParams({ fingerprint: recovery.requestFingerprint });
      const response = await fetch(
        `/api/workflow-templates/${recovery.templateId}/update-requests/${encodeURIComponent(recovery.requestId)}?${query.toString()}`,
        {
          headers: { Authorization: `Bearer ${useAuthStore.getState().token || ''}` },
          cache: 'no-store',
        },
      );
      if (!isCurrentTemplateUpdateRecovery(recovery)) return 'unavailable';
      if (response.ok) {
        const data: unknown = await response.json().catch(() => null);
        if (!isCurrentTemplateUpdateRecovery(recovery)) return 'unavailable';
        if (!data || typeof data !== 'object') throw new Error('Workflow template update status response was invalid');
        const status = data as Record<string, unknown>;
        if (status.state === 'not_found') {
          if (rejectedRequest) {
            setUpdateRecoveryState('rejected');
            setUpdateRecoveryNotice('服务器未找到更新记录；该请求曾被明确拒绝，因此不会重试。可继续只读核实，或清理已拒绝的恢复标记。');
            return 'not_found';
          }
          const currentDetail = await fetchTemplateDetail(recovery.templateId, useAuthStore.getState().token || '');
          if (!isCurrentTemplateUpdateRecovery(recovery)) return 'unavailable';
          if (!currentDetail) {
            setUpdateRecoveryState('unavailable');
            setUpdateRecoveryNotice('服务器未找到更新记录，但原模板当前状态暂时无法读取；恢复记录保持锁定。可重新只读核实。');
            return 'unavailable';
          }
          const currentPayload = workflowTemplateDetailPayload(currentDetail);
          const currentFingerprint = await createWorkflowTemplateUpdateFingerprint(currentPayload, window.crypto);
          if (!isCurrentTemplateUpdateRecovery(recovery)) return 'unavailable';
          if (currentFingerprint !== currentDetail.base_fingerprint) {
            setUpdateRecoveryState('unavailable');
            setUpdateRecoveryNotice('原模板详情与服务端快照指纹不一致；恢复记录保持锁定，尚未提供重试。');
            return 'unavailable';
          }
          if (currentDetail.base_fingerprint !== recovery.baseFingerprint) {
            releaseRejectedTemplateUpdate(
              recovery,
              '服务器未找到这次更新记录，但原模板已被其他人修改；恢复标记已安全释放。请重新读取模板后再编辑。',
              true,
            );
            return 'conflict';
          }
          setUpdateRecoveryState('not_found');
          setUpdateRecoveryNotice('服务器暂未找到这次更新记录。原内容与请求编号已保留；只有点击“使用同一请求编号安全重试”才会再次提交。');
          setEditingTemplate(workflowTemplateUpdateRecoveryPlaceholder(recovery));
          setFormData(recovery.payload);
          return 'not_found';
        }
        if (status.state !== 'updated' || Number(status.templateId) !== recovery.templateId) {
          throw new Error('Workflow template update status response was invalid');
        }
        const finished = await finishConfirmedTemplateUpdate(recovery);
        return finished ? 'updated' : 'unavailable';
      }
      if (response.status === 409) {
        const data = await response.json().catch(() => null) as { message?: unknown } | null;
        if (isCurrentTemplateUpdateRecovery(recovery)) {
          setUpdateRecoveryState('conflict');
          setUpdateRecoveryNotice(typeof data?.message === 'string'
            ? `${data.message}为避免覆盖或重复写入，恢复记录保持锁定；仅可只读核实。`
            : '服务端记录显示同一编号存在范围或内容冲突；恢复记录保持锁定，仅可只读核实。');
        }
        return 'conflict';
      }
      setUpdateRecoveryState('unavailable');
      setUpdateRecoveryNotice('暂时无法只读核实上次更新结果；恢复记录已保留，当前窗口保持只读。');
      return 'unavailable';
    } catch {
      if (isCurrentTemplateUpdateRecovery(recovery)) {
        setUpdateRecoveryState('unavailable');
        setUpdateRecoveryNotice('暂时无法只读核实上次更新结果；恢复记录已保留，当前窗口保持只读。');
      }
      return 'unavailable';
    } finally {
      if (sameWorkflowTemplateUpdateRecovery(updateRecoveryStatusRequestRef.current, recovery)) {
        updateRecoveryStatusRequestRef.current = null;
      }
    }
  };

  const submitTemplateUpdate = async (
    recovery: WorkflowTemplateUpdateRecovery,
    allowExplicitRetry = false,
  ) => {
    if (templateMutationInFlight.current || !isCurrentTemplateUpdateActor(recovery.actorId)) return;
    if (allowExplicitRetry) {
      if (!isCurrentTemplateUpdateRecovery(recovery) || recovery.rejected || updateRecoveryState !== 'not_found') return;
    } else if (isTemplateActionBlocked() || templateListReadInFlight.current) {
      return;
    }

    try {
      const [requestFingerprint, baseFingerprint] = await Promise.all([
        createWorkflowTemplateUpdateRequestFingerprint(recovery.payload, recovery.baseFingerprint, window.crypto),
        createWorkflowTemplateUpdateFingerprint(recovery.basePayload, window.crypto),
      ]);
      if (!isCurrentTemplateUpdateActor(recovery.actorId)) return;
      if (templateMutationInFlight.current) return;
      if (requestFingerprint !== recovery.requestFingerprint || baseFingerprint !== recovery.baseFingerprint) {
        setUpdateRecoveryInvalid(true);
        setUpdateRecoveryState('unavailable');
        setUpdateRecoveryNotice('更新内容或原模板快照与已保存的请求指纹不一致；为避免重复或覆盖其他改动，当前窗口保持只读。');
        return;
      }
      persistUpdateRecovery(recovery);
    } catch {
      appStore.addNotification({ title: '无法安全更新', message: '浏览器无法完整保存本次更新请求，尚未提交更新操作。', type: 'error' });
      return;
    }

    templateMutationInFlight.current = true;
    pendingUpdateRecoveryRef.current = recovery;
    setPendingUpdateRecovery(recovery);
    setUpdateRecoveryState('submitting');
    setUpdateRecoveryNotice(null);
    setEditingTemplate(workflowTemplateUpdateRecoveryPlaceholder(recovery));
    setFormData(recovery.payload);
    setSavingTemplate(true);
    try {
      const response = await fetch(`/api/workflow-templates/${recovery.templateId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${useAuthStore.getState().token || ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...recovery.payload,
          client_request_id: recovery.requestId,
          base_fingerprint: recovery.baseFingerprint,
        }),
      });
      if (!isCurrentTemplateUpdateRecovery(recovery)) return;

      if (response.status === 409) {
        const data = await response.json().catch(() => null) as { message?: unknown; code?: unknown } | null;
        if (!isCurrentTemplateUpdateRecovery(recovery)) return;
        if (data?.code === 'WORKFLOW_TEMPLATE_UPDATE_BASE_CONFLICT') {
          releaseRejectedTemplateUpdate(
            recovery,
            typeof data.message === 'string'
              ? `${data.message}本次更新未写入；恢复标记已安全释放，请重新读取模板后再编辑。`
              : '原模板已被其他人修改，本次更新未写入；恢复标记已安全释放，请重新读取模板后再编辑。',
            true,
          );
          return;
        }
        setUpdateRecoveryState('conflict');
        setUpdateRecoveryNotice(typeof data?.message === 'string'
          ? `${data.message}结果仍不明确；恢复记录保持锁定，仅可只读核实。`
          : '请求编号存在冲突，结果仍不明确；恢复记录保持锁定，仅可只读核实。');
        await verifyTemplateUpdateStatus(recovery);
        return;
      }

      if (!response.ok && response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
        const data = await response.json().catch(() => null) as { message?: unknown } | null;
        releaseRejectedTemplateUpdate(
          recovery,
          typeof data?.message === 'string' ? data.message : '服务器已明确拒绝本次更新；没有自动重试，恢复标记已安全释放。请检查内容后重新提交。',
        );
        return;
      }
      await verifyTemplateUpdateStatus(recovery);
    } catch {
      if (isCurrentTemplateUpdateRecovery(recovery)) {
        setUpdateRecoveryNotice('更新请求可能已到达服务器，当前没有收到确认。正在只读核实；核实期间不会再次提交。');
        await verifyTemplateUpdateStatus(recovery);
      }
    } finally {
      templateMutationInFlight.current = false;
      if (isCurrentTemplateUpdateActor(recovery.actorId)) setSavingTemplate(false);
    }
  };

  const verifyTemplateUpdateStatusRef = useRef(verifyTemplateUpdateStatus);
  verifyTemplateUpdateStatusRef.current = verifyTemplateUpdateStatus;

  const clearTemplateDeleteRecovery = (recovery: WorkflowTemplateDeleteRecovery) => {
    if (!isCurrentTemplateDeleteRecovery(recovery)) return false;
    if (!removeDeleteRecovery(recovery)) {
      setDeleteRecoveryState('unavailable');
      setDeleteRecoveryNotice('当前删除结果已读取，但本地恢复记录暂时无法清理。为避免重复操作，模板写入继续暂停；可重新只读核实。');
      return false;
    }
    pendingDeleteRecoveryRef.current = null;
    setPendingDeleteRecovery(null);
    setDeleteRecoveryState(null);
    setDeleteRecoveryInvalid(false);
    setDeleteRecoveryNotice(null);
    return true;
  };

  const verifyTemplateDeleteStatus = async (
    recovery: WorkflowTemplateDeleteRecovery,
  ): Promise<'deleted' | 'exists' | 'unavailable'> => {
    if (!isCurrentTemplateDeleteRecovery(recovery)
      || sameWorkflowTemplateDeleteRecovery(deleteRecoveryStatusRequestRef.current, recovery)) return 'unavailable';

    deleteRecoveryStatusRequestRef.current = recovery;
    setDeleteRecoveryState('checking');
    setDeleteRecoveryNotice(null);
    try {
      const response = await fetch(`/api/workflow-templates/${recovery.templateId}`, {
        headers: {
          Authorization: `Bearer ${useAuthStore.getState().token || ''}`,
          'Cache-Control': 'no-store',
        },
      });
      if (!isCurrentTemplateDeleteRecovery(recovery)) return 'unavailable';

      if (response.status === 404) {
        const markerCleared = clearTemplateDeleteRecovery(recovery);
        setDeleteTarget(null);
        setTemplates((current) => current.filter((template) => template.id !== recovery.templateId));
        if (!markerCleared) return 'unavailable';
        appStore.addNotification({
          title: '删除状态已核实',
          message: `审批流模板“${recovery.name}”已不存在；没有重复提交删除。`,
          type: 'success',
        });
        const listRefreshed = await fetchTemplates();
        if (!listRefreshed && useAuthStore.getState().user?.id === recovery.actorId) {
          setConfirmedTemplateRefreshFailure({ action: '删除', name: recovery.name });
        }
        return 'deleted';
      }

      if (response.ok) {
        const detail: unknown = await response.json().catch(() => null);
        if (!isWorkflowTemplateDetail(detail, recovery.templateId)) throw new Error('审批流模板详情读取结果无效');
        const markerCleared = clearTemplateDeleteRecovery(recovery);
        setDeleteTarget(null);
        if (!markerCleared) return 'unavailable';
        appStore.addNotification({
          title: '模板仍然存在',
          message: `审批流模板“${recovery.name}”仍在服务器上，本次删除未确认；如仍需删除，请重新确认操作。`,
          type: 'warning',
        });
        await fetchTemplates();
        return 'exists';
      }

      setDeleteRecoveryState('unavailable');
      setDeleteRecoveryNotice('暂时无法核实上次删除结果；恢复记录已保留，所有模板写入暂停。请重试只读核实，不要重复删除。');
      return 'unavailable';
    } catch {
      if (isCurrentTemplateDeleteRecovery(recovery)) {
        setDeleteRecoveryState('unavailable');
        setDeleteRecoveryNotice('暂时无法核实上次删除结果；恢复记录已保留，所有模板写入暂停。请重试只读核实，不要重复删除。');
      }
      return 'unavailable';
    } finally {
      if (sameWorkflowTemplateDeleteRecovery(deleteRecoveryStatusRequestRef.current, recovery)) {
        deleteRecoveryStatusRequestRef.current = null;
      }
    }
  };

  const verifyTemplateDeleteStatusRef = useRef(verifyTemplateDeleteStatus);
  verifyTemplateDeleteStatusRef.current = verifyTemplateDeleteStatus;

  const handleRetryPendingTemplateUpdate = async () => {
    if (!pendingUpdateRecovery || pendingUpdateRecovery.rejected || updateRecoveryState !== 'not_found' || !hasPermission('system:template')) return;
    await submitTemplateUpdate(pendingUpdateRecovery, true);
  };

  const handleClearTemplateUpdateMarker = () => {
    if (!pendingUpdateRecovery || !['rejected', 'confirmed'].includes(String(updateRecoveryState))
      || !isCurrentTemplateUpdateRecovery(pendingUpdateRecovery)) return;
    const wasConfirmed = updateRecoveryState === 'confirmed';
    const outcomeNotice = updateRecoveryNotice;
    if (!removeUpdateRecovery(pendingUpdateRecovery)) {
      setUpdateRecoveryNotice('恢复标记仍无法确认清理；当前窗口继续锁定。可重新尝试清理，或继续只读核实。');
      return;
    }
    pendingUpdateRecoveryRef.current = null;
    setPendingUpdateRecovery(null);
    setUpdateRecoveryState(null);
    setUpdateRecoveryInvalid(false);
    setUpdateRecoveryNotice(null);
    setEditingTemplate(null);
    setShowCreateForm(Boolean(pendingCreateRecovery));
    setFormData(pendingCreateRecovery?.payload ?? { name: '', description: '', nodes: [] });
    if (wasConfirmed) {
      const changedAgain = Boolean(outcomeNotice?.includes('模板后续又变化'));
      appStore.addNotification({
        title: changedAgain ? '模板已再次变化' : '更新已核实',
        message: outcomeNotice || `审批流模板“${pendingUpdateRecovery.payload.name}”已确认保存。`,
        type: changedAgain ? 'warning' : 'success',
      });
    }
    void fetchTemplates();
  };

  const verifyTemplateCreateStatus = async (
    recovery: WorkflowTemplateCreateRecovery,
    conflictOnMissing = false,
  ): Promise<'created' | 'deleted' | 'not_found' | 'conflict' | 'unavailable'> => {
    if (useAuthStore.getState().user?.id !== recovery.actorId) return 'unavailable';
    if (createRecoveryStatusRequestRef.current === recovery.requestId) return 'unavailable';
    createRecoveryStatusRequestRef.current = recovery.requestId;
    setCreateRecoveryState('checking');
    try {
      const fingerprint = await createWorkflowTemplateRequestFingerprint(recovery.payload);
      const query = new URLSearchParams({ fingerprint });
      const response = await fetch(`/api/workflow-templates/create-requests/${encodeURIComponent(recovery.requestId)}?${query.toString()}`, {
        headers: { Authorization: `Bearer ${useAuthStore.getState().token || ''}` },
        cache: 'no-store',
      });
      if (useAuthStore.getState().user?.id !== recovery.actorId) return 'unavailable';
      if (response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const templateId = data && typeof data === 'object' ? Number((data as Record<string, unknown>).templateId) : NaN;
        if (!Number.isSafeInteger(templateId) || templateId <= 0) throw new Error('Workflow template create status response was invalid');
        await finishConfirmedTemplateCreate(recovery, true);
        return 'created';
      }
      if (response.status === 410) {
        await finishDeletedTemplateCreate(recovery);
        return 'deleted';
      }
      if (response.status === 404) {
        setCreateRecoveryState(conflictOnMissing ? 'conflict' : 'not_found');
        return conflictOnMissing ? 'conflict' : 'not_found';
      }
      if (response.status === 409) {
        setCreateRecoveryState('conflict');
        return 'conflict';
      }
      setCreateRecoveryState('unavailable');
      return 'unavailable';
    } catch {
      if (useAuthStore.getState().user?.id === recovery.actorId) setCreateRecoveryState('unavailable');
      return 'unavailable';
    } finally {
      if (createRecoveryStatusRequestRef.current === recovery.requestId) {
        createRecoveryStatusRequestRef.current = null;
      }
    }
  };

  const verifyTemplateCreateStatusRef = useRef(verifyTemplateCreateStatus);
  verifyTemplateCreateStatusRef.current = verifyTemplateCreateStatus;

  useEffect(() => {
    if (activeCreateRecoveryActorRef.current === currentUserId
      && activeUpdateRecoveryActorRef.current === currentUserId
      && activeDeleteRecoveryActorRef.current === currentUserId) return;
    activeCreateRecoveryActorRef.current = currentUserId;
    activeUpdateRecoveryActorRef.current = currentUserId;
    activeDeleteRecoveryActorRef.current = currentUserId;
    updateRecoveryStatusRequestRef.current = null;
    deleteRecoveryStatusRequestRef.current = null;
    const stored = readWorkflowTemplateCreateRecovery(currentUserId);
    const createRecovery = stored && stored !== 'invalid' ? stored : null;
    const updateStored = readUpdateRecoveryForActor(currentUserId);
    const updateRecovery = updateStored && updateStored !== 'invalid' ? updateStored : null;
    const deleteStored = readDeleteRecoveryForActor(currentUserId);
    const deleteRecovery = deleteStored && deleteStored !== 'invalid' ? deleteStored : null;
    pendingUpdateRecoveryRef.current = updateRecovery;
    pendingDeleteRecoveryRef.current = deleteRecovery;
    setPendingCreateRecovery(createRecovery);
    setCreateRecoveryState(createRecovery ? 'checking' : null);
    setCreateRecoveryInvalid(stored === 'invalid');
    setCreateRecoveryNotice(null);
    setPendingUpdateRecovery(updateRecovery);
    setUpdateRecoveryState(updateRecovery ? 'checking' : null);
    setUpdateRecoveryInvalid(updateStored === 'invalid');
    setUpdateRecoveryNotice(null);
    setPendingDeleteRecovery(deleteRecovery);
    setDeleteRecoveryState(deleteRecovery ? 'checking' : null);
    setDeleteRecoveryInvalid(deleteStored === 'invalid');
    setDeleteRecoveryNotice(null);
    setShowCreateForm(Boolean(createRecovery) && !updateRecovery);
    setEditingTemplate(updateRecovery ? workflowTemplateUpdateRecoveryPlaceholder(updateRecovery) : null);
    setFormData(updateRecovery?.payload ?? createRecovery?.payload ?? { name: '', description: '', nodes: [] });
    setSavingTemplate(false);
    setDeleteLoading(false);
    templateMutationInFlight.current = false;
  }, [currentUserId]);

  useEffect(() => {
    if (!pendingCreateRecovery || createRecoveryState !== 'checking') return;
    void verifyTemplateCreateStatusRef.current(pendingCreateRecovery);
  }, [pendingCreateRecovery, createRecoveryState]);

  useEffect(() => {
    if (!pendingUpdateRecovery || updateRecoveryState !== 'checking') return;
    void verifyTemplateUpdateStatusRef.current(pendingUpdateRecovery);
  }, [pendingUpdateRecovery, updateRecoveryState]);

  useEffect(() => {
    if (!pendingDeleteRecovery || deleteRecoveryState !== 'checking') return;
    void verifyTemplateDeleteStatusRef.current(pendingDeleteRecovery);
  }, [pendingDeleteRecovery, deleteRecoveryState]);

  const submitTemplateCreate = async (recovery: WorkflowTemplateCreateRecovery, allowDuringListFailure = false) => {
    if (templateMutationInFlight.current || useAuthStore.getState().user?.id !== recovery.actorId) return;
    if (!allowDuringListFailure && (isTemplateActionBlocked() || templateListReadInFlight.current)) return;
    if (allowDuringListFailure && (savingTemplate || deleteLoading || templateDetailLoadingId !== null
      || templateListRefreshing || templateListReadInFlight.current)) return;

    try {
      persistWorkflowTemplateCreateRecovery(recovery);
    } catch {
      appStore.addNotification({ title: '无法安全创建', message: '浏览器暂时无法保存本次请求编号，尚未提交创建操作。', type: 'error' });
      return;
    }

    templateMutationInFlight.current = true;
    setPendingCreateRecovery(recovery);
    setCreateRecoveryState('submitting');
    setCreateRecoveryNotice(null);
    setSavingTemplate(true);
    try {
      const response = await fetch('/api/workflow-templates', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...recovery.payload, client_request_id: recovery.requestId }),
      });
      if (useAuthStore.getState().user?.id !== recovery.actorId) return;

      if (response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const id = data && typeof data === 'object' ? Number((data as Record<string, unknown>).id) : NaN;
        if (Number.isSafeInteger(id) && id > 0) {
          await finishConfirmedTemplateCreate(recovery, Boolean((data as Record<string, unknown>).idempotent_replay));
          return;
        }
      } else if (response.status === 410) {
        await finishDeletedTemplateCreate(recovery);
        return;
      }

      let responseMessage = '创建结果尚未确认。请只读核实，确认前不会再次提交。';
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { message?: unknown } | null;
        if (typeof data?.message === 'string') responseMessage = data.message;
      }
      const status = await verifyTemplateCreateStatus(recovery, response.status === 409);
      if (status === 'not_found' && response.status === 400) {
        removeWorkflowTemplateCreateRecovery(recovery);
        setPendingCreateRecovery(null);
        setCreateRecoveryState(null);
        setCreateRecoveryNotice(responseMessage);
        appStore.addNotification({ title: '创建未完成', message: responseMessage, type: 'error' });
      } else if (status === 'unavailable') {
        setCreateRecoveryNotice(`${responseMessage}恢复编号已保留；请使用“只读核实创建结果”，不要重新创建。`);
      } else if (status === 'not_found') {
        setCreateRecoveryNotice('服务器暂未找到对应记录。可使用相同请求编号安全重试；请求内容保持不变。');
      } else if (status === 'conflict') {
        setCreateRecoveryNotice('请求编号对应的账号或内容与当前恢复内容不一致。为避免重复创建，已暂停重试；请核对模板列表和账号。');
      }
    } catch {
      if (useAuthStore.getState().user?.id === recovery.actorId) {
        setCreateRecoveryNotice('创建请求可能已到达服务器，当前没有收到确认。正在只读核实；核实期间不会再次提交。');
        await verifyTemplateCreateStatus(recovery);
      }
    } finally {
      templateMutationInFlight.current = false;
      setSavingTemplate(false);
    }
  };

  const handleCreate = async () => {
    if (isTemplateActionBlocked() || templateListReadInFlight.current || templateMutationInFlight.current
      || pendingCreateRecovery || createRecoveryInvalid) return;

    const invalidNode = getFirstInvalidNode();
    if (invalidNode) {
      appStore.addNotification({ title: '流程配置不可保存', message: invalidNode.reason, type: 'error' });
      return;
    }
    if (!currentUserId) {
      appStore.addNotification({ title: '无法安全创建', message: '当前登录账号尚未确认，请刷新后重试。', type: 'error' });
      return;
    }

    let requestId: string;
    try {
      requestId = createWorkflowTemplateRequestId();
    } catch {
      appStore.addNotification({ title: '无法安全创建', message: '当前浏览器无法生成安全请求编号，尚未提交创建操作。', type: 'error' });
      return;
    }
    const payload: WorkflowTemplateCreatePayload = {
      name: formData.name,
      description: formData.description,
      nodes: formData.nodes.map((node) => ({ ...node })),
    };
    await submitTemplateCreate({
      version: WORKFLOW_TEMPLATE_CREATE_RECOVERY_VERSION,
      actorId: currentUserId,
      requestId,
      payload,
    });
  };

  const handleRetryPendingCreate = async () => {
    if (!pendingCreateRecovery || createRecoveryState !== 'not_found' || !hasPermission('system:template')) return;
    await submitTemplateCreate(pendingCreateRecovery, true);
  };

  const handleUpdate = async () => {
    if (!editingTemplate) return;
    if (isTemplateActionBlocked() || templateListReadInFlight.current || templateMutationInFlight.current) return;

    const invalidNode = getFirstInvalidNode();
    if (invalidNode) {
      appStore.addNotification({ title: '流程配置不可保存', message: invalidNode.reason, type: 'error' });
      return;
    }

    if (!currentUserId) {
      appStore.addNotification({ title: '无法安全更新', message: '当前登录账号尚未确认，请刷新后重试。', type: 'error' });
      return;
    }

    let requestId: string;
    try {
      requestId = createWorkflowTemplateRequestId();
    } catch {
      appStore.addNotification({ title: '无法安全更新', message: '当前浏览器无法生成安全请求编号，尚未提交更新操作。', type: 'error' });
      return;
    }

    const payload: WorkflowTemplateCreatePayload = {
      name: formData.name,
      description: formData.description,
      nodes: formData.nodes.map((node) => ({ ...node })),
    };
    const basePayload: WorkflowTemplateCreatePayload = {
      name: editingTemplate.name,
      description: editingTemplate.description || '',
      nodes: (editingTemplate.nodes || []).map((node) => ({ ...node, is_required: Boolean(node.is_required) })),
    };
    const baseFingerprint = editingTemplate.base_fingerprint;
    if (!isWorkflowTemplateUpdatePayload(basePayload) || !baseFingerprint || !/^[0-9a-f]{64}$/i.test(baseFingerprint)) {
      appStore.addNotification({ title: '无法安全更新', message: '未能读取原模板的完整内容，尚未提交更新操作。请重新读取模板详情。', type: 'error' });
      return;
    }
    try {
      const [localBaseFingerprint, requestFingerprint] = await Promise.all([
        createWorkflowTemplateUpdateFingerprint(basePayload, window.crypto),
        createWorkflowTemplateUpdateRequestFingerprint(payload, baseFingerprint, window.crypto),
      ]);
      if (!isCurrentTemplateUpdateActor(currentUserId)) return;
      if (localBaseFingerprint !== baseFingerprint) {
        appStore.addNotification({ title: '无法安全更新', message: '原模板内容与服务端快照指纹不一致，尚未提交更新操作。请重新读取模板详情。', type: 'error' });
        return;
      }
      const recovery: WorkflowTemplateUpdateRecovery = {
        version: WORKFLOW_TEMPLATE_UPDATE_RECOVERY_VERSION,
        actorId: currentUserId,
        templateId: editingTemplate.id,
        requestId,
        requestFingerprint,
        baseFingerprint,
        payload,
        basePayload,
        rejected: false,
      };
      await submitTemplateUpdate(recovery);
    } catch {
      if (isCurrentTemplateUpdateActor(currentUserId)) {
        appStore.addNotification({ title: '无法安全更新', message: '当前浏览器无法安全核实更新内容，尚未提交更新操作。', type: 'error' });
      }
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || isTemplateActionBlocked() || templateListReadInFlight.current || templateMutationInFlight.current) return;

    const target = deleteTarget;
    if (!currentUserId || !isCurrentTemplateDeleteActor(currentUserId)) {
      appStore.addNotification({ title: '无法安全删除', message: '当前登录账号尚未确认，本次删除未提交。请刷新后重试。', type: 'error' });
      return;
    }
    const recovery: WorkflowTemplateDeleteRecovery = {
      version: WORKFLOW_TEMPLATE_DELETE_RECOVERY_VERSION,
      actorId: currentUserId,
      templateId: target.id,
      name: target.name,
    };
    try {
      persistDeleteRecovery(recovery);
    } catch {
      appStore.addNotification({ title: '无法安全删除', message: '浏览器无法保存删除恢复记录，本次删除未提交。', type: 'error' });
      return;
    }

    templateMutationInFlight.current = true;
    pendingDeleteRecoveryRef.current = recovery;
    setPendingDeleteRecovery(recovery);
    setDeleteRecoveryState('submitting');
    setDeleteRecoveryNotice(null);
    setDeleteLoading(true);
    try {
      const response = await fetch(`/api/workflow-templates/${target.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!isCurrentTemplateDeleteRecovery(recovery)) return;

      if (response.ok) {
        if (!clearTemplateDeleteRecovery(recovery)) return;
        appStore.addNotification({ title: '删除成功', message: '审批流模板已删除', type: 'success' });
        setTemplates((current) => current.filter((template) => template.id !== target.id));
        setDeleteTarget(null);

        const listRefreshed = await fetchTemplates();
        if (!listRefreshed) {
          setConfirmedTemplateRefreshFailure({ action: '删除', name: target.name });
        }
      } else if (response.status >= 500 || response.status === 404 || response.status === 408 || response.status === 429) {
        setDeleteTarget(null);
        setDeleteRecoveryState('checking');
        setDeleteRecoveryNotice('删除响应未能明确确认结果；正在只读核实模板是否仍存在，不会再次提交删除。');
        await verifyTemplateDeleteStatus(recovery);
      } else {
        const data = await response.json().catch(() => null) as { message?: unknown } | null;
        const message = typeof data?.message === 'string' ? data.message : '审批流模板未删除，请检查后重试。';
        if (clearTemplateDeleteRecovery(recovery)) {
          appStore.addNotification({ title: '删除失败', message, type: 'error' });
        }
      }
    } catch {
      if (isCurrentTemplateDeleteRecovery(recovery)) {
        setDeleteTarget(null);
        setDeleteRecoveryState('checking');
        setDeleteRecoveryNotice('删除请求可能已到达服务器，但未收到确认；正在只读核实模板状态，不会自动重试。');
        await verifyTemplateDeleteStatus(recovery);
      }
    } finally {
      templateMutationInFlight.current = false;
      if (isCurrentTemplateDeleteActor(recovery.actorId)) setDeleteLoading(false);
    }
  };

  const loadTemplateForEdit = async (id: number, name: string) => {
    if (isTemplateActionBlocked() || templateListReadInFlight.current || templateMutationInFlight.current || templateDetailReadInFlight.current !== null) return;

    templateDetailReadInFlight.current = id;
    setTemplateDetailLoadingId(id);
    try {
      const detail = await fetchTemplateDetail(id);
      if (!detail) {
        setTemplateDetailLoadFailure({ id, name });
        return;
      }

      setTemplateDetailLoadFailure(null);
      setEditingTemplate(detail);
      setFormData({
        name: detail.name,
        description: detail.description || '',
        nodes: detail.nodes,
      });
    } finally {
      if (templateDetailReadInFlight.current === id) {
        templateDetailReadInFlight.current = null;
        setTemplateDetailLoadingId(null);
      }
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
          reason: `节点 ${index + 1}：${localizeWorkflowMessage(getNodeExplainability(node).blockExplain.blockedReason)}`,
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
    const policyResult = getNodePolicyResult(node);
    const explainability = getNodeExplainability(node);
    const explainUI = mapExplainToUI(explainability.explain);

    return [
      explainUI.tooltip,
      `历史参考记录：${runtimeContext.shadowCount || 0} 条`,
      `风险提示：${getWorkflowRiskLabel(policyResult.risk)}`,
      `需处理原因：${localizeWorkflowMessage(explainability.blockExplain.blockedReason)}`,
      `规则类别：${getWorkflowRuleLabel(explainability.blockExplain.failedRule)}`,
      `处理建议：${localizeWorkflowMessage(explainability.blockExplain.suggestion)}`,
      '历史提示仅供参考；流程变更由你确认并保存。',
    ].join('\n');
  };

  const getRiskBadgeClass = (level: string) => {
    if (level === 'high') return 'bg-studio-coral/15 text-studio-coral-contrast border-studio-coral/30';
    if (level === 'medium') return 'bg-studio-amber/15 text-studio-amber-contrast border-studio-amber/30';
    return 'bg-studio-success/15 text-studio-success-contrast border-studio-success/30';
  };

  const getNodeCardClass = (node: WorkflowNode) => {
    const policyResult = getNodePolicyResult(node);
    const uiState = mapDecisionToUI(getNodeRuntimeContext(node));

    if (!policyResult.allowed || uiState.status === 'blocked') {
      return 'border-studio-coral/60 bg-studio-coral/5';
    }

    if (uiState.status === 'warning') {
      return 'border-studio-amber/60 bg-studio-amber/5';
    }

    return `${styles.bgTertiary} ${styles.border}`;
  };

  const authScopeReady = activeCreateRecoveryActorRef.current === currentUserId
    && activeUpdateRecoveryActorRef.current === currentUserId;
  const showEditor = authScopeReady && (
    (pendingUpdateRecovery?.actorId === currentUserId && Boolean(editingTemplate))
    || (showCreateForm && (!pendingCreateRecovery || pendingCreateRecovery.actorId === currentUserId))
    || (!pendingUpdateRecovery && Boolean(editingTemplate))
  );
  const templateActionsBlocked = !authScopeReady || isTemplateActionBlocked();
  const templateActionDisabledReason = updateRecoveryInvalid
    ? '更新恢复记录无法读取；为避免重复写入，操作已暂停。'
    : pendingUpdateRecovery
      ? '上次模板更新结果尚未核实；原模板已锁定，请先完成只读核实或同请求安全重试。'
      : createRecoveryInvalid
    ? '创建恢复记录无法读取；为避免重复创建，操作已暂停。'
    : pendingCreateRecovery
      ? '上次模板创建结果尚未核实；请先完成只读核实或同请求安全重试。'
      : savingTemplate
    ? '审批流模板正在保存，请稍候。'
    : deleteLoading
      ? '审批流模板正在删除，请稍候。'
      : templateDetailLoadingId !== null
        ? '审批流模板详情正在读取，请稍候。'
        : templateListRefreshing
          ? '审批流模板列表正在重新加载，请稍候。'
          : '审批流模板列表尚未恢复，请先重新加载列表。';

  if (loading) {
    return <LoadingState type="page" text="正在加载审批流模板..." />;
  }

  return (
    <ReactBitsPageScene page="workflow" fallbackClassName="bg-gradient-to-br from-studio-surface-soft/30 to-studio-primary/20">
    <div className="space-y-6">
      <PageHeader
        title={<ReactBitsHeadingSlot>审批流设计</ReactBitsHeadingSlot>}
        description="自定义选题审批流程"
        actions={
          hasPermission('system:template') ? (
            <ReactBitsButtonSlot
              variant="primary"
              disabled={templateActionsBlocked}
              title={templateActionsBlocked ? templateActionDisabledReason : undefined}
              aria-label={templateActionsBlocked ? `新建模板，${templateActionDisabledReason}` : undefined}
              onClick={() => {
                setShowCreateForm(true);
                setFormData({ name: '', description: '', nodes: [] });
              }}
              className="rounded-xl"
            >
              <Plus className="w-4 h-4" />
              新建模板
            </ReactBitsButtonSlot>
          ) : null
        }
      />

      {templateListRefreshing && !templateListLoadFailed ? (
        <p role="status" className="text-sm text-studio-text-secondary">
          正在重新加载审批流模板列表；刷新完成前，暂不能创建、编辑或删除。
        </p>
      ) : null}

      {templateListLoadFailed ? (
        <section role="alert" className="rounded-xl border border-studio-amber/50 bg-studio-amber/10 p-4 text-sm text-studio-text-secondary">
          <p>
            {confirmedTemplateRefreshFailure
              ? confirmedTemplateRefreshFailure.action === '删除'
                ? `服务器已确认模板“${confirmedTemplateRefreshFailure.name}”删除成功，已从当前列表移除，但列表未刷新；请只重新加载列表，不要重复删除。`
                : `服务器已确认模板“${confirmedTemplateRefreshFailure.name}”${confirmedTemplateRefreshFailure.action}成功，内容已保存，但列表未刷新；请只重新加载列表，不要重复提交。`
              : '审批流模板列表读取失败，当前无法确认是否有可用模板。请重新加载列表。'}
          </p>
          <ReactBitsButtonSlot
            type="button"
            variant="secondary"
            disabled={templateListRefreshing}
            onClick={() => void fetchTemplates()}
            aria-label="重新加载审批流模板列表"
            className="mt-3"
          >
            {templateListRefreshing ? '正在重新加载…' : '重新加载列表'}
          </ReactBitsButtonSlot>
        </section>
      ) : null}

      {updateRecoveryInvalid ? (
        <section role="alert" className="rounded-xl border border-studio-coral/40 bg-studio-coral/5 p-4 text-sm text-studio-text-secondary">
          <p>上次审批流更新的恢复信息不可安全读取；为避免重复写入，当前账号的模板操作已暂停。</p>
        </section>
      ) : null}

      {authScopeReady && ((createRecoveryNotice && !pendingCreateRecovery) || createRecoveryInvalid) ? (
        <section role="alert" className="rounded-xl border border-studio-amber/50 bg-studio-amber/10 p-4 text-sm text-studio-text-secondary">
          <p>{createRecoveryInvalid
            ? '上次审批流模板创建恢复记录无法读取。为避免重复创建，创建操作已暂停；请保留当前账号并联系管理员核对模板列表。'
            : createRecoveryNotice}</p>
        </section>
      ) : null}

      {authScopeReady && deleteRecoveryInvalid ? (
        <section role="alert" className="rounded-xl border border-studio-coral/40 bg-studio-coral/5 p-4 text-sm text-studio-text-secondary">
          上次审批流模板删除恢复记录无法安全读取；为避免重复删除，当前账号的模板写入已暂停。
        </section>
      ) : null}

      {authScopeReady && pendingDeleteRecovery ? (
        <section role="alert" className="rounded-xl border border-studio-amber/50 bg-studio-amber/10 p-4 text-sm text-studio-text-secondary">
          <p>{deleteRecoveryNotice || (deleteRecoveryState === 'submitting'
            ? `正在提交删除“${pendingDeleteRecovery.name}”；恢复记录已保存在当前标签页。`
            : '正在只读核实上次审批流模板删除结果；核实期间不会重复提交。')}</p>
          {deleteRecoveryState === 'unavailable' ? (
            <ReactBitsButtonSlot
              type="button"
              variant="secondary"
              disabled={deleteLoading || !hasPermission('system:template')}
              onClick={() => void verifyTemplateDeleteStatus(pendingDeleteRecovery)}
              aria-label="只读核实审批流模板删除结果"
              className="mt-3"
            >
              只读核实删除状态
            </ReactBitsButtonSlot>
          ) : null}
        </section>
      ) : null}

      {templateDetailLoadFailure ? (
        <section role="alert" className="rounded-xl border border-studio-amber/50 bg-studio-amber/10 p-4 text-sm text-studio-text-secondary">
          <p>
            审批流模板“{templateDetailLoadFailure.name}”详情读取失败，编辑器尚未打开，当前内容未修改。可重新读取模板详情；此操作只发送读取请求，不会保存或重复提交。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ReactBitsButtonSlot
              type="button"
              variant="secondary"
              disabled={templateActionsBlocked}
              title={templateActionsBlocked ? templateActionDisabledReason : undefined}
              onClick={() => void loadTemplateForEdit(templateDetailLoadFailure.id, templateDetailLoadFailure.name)}
              aria-label={`重新读取审批流模板“${templateDetailLoadFailure.name}”详情`}
            >
              {templateDetailLoadingId === templateDetailLoadFailure.id ? '正在重新读取…' : '重新读取模板详情'}
            </ReactBitsButtonSlot>
            <ReactBitsButtonSlot
              type="button"
              variant="ghost"
              disabled={templateDetailLoadingId === templateDetailLoadFailure.id}
              onClick={() => setTemplateDetailLoadFailure(null)}
              aria-label={`关闭模板“${templateDetailLoadFailure.name}”详情读取提示`}
            >
              关闭提示
            </ReactBitsButtonSlot>
          </div>
        </section>
      ) : null}

      {templates.length === 0 && !templateListLoadFailed ? (
        <ReactBitsCardSlot semantic="workflow-summary" className={styles.card}>
          <EmptyState
            title="暂无审批流模板"
            description="当前还没有可用的审批流模板，创建后会显示在这里。"
          />
        </ReactBitsCardSlot>
      ) : null}

      {templates.length > 0 ? (
        <div className="grid gap-4">
          {templates.map((template) => (
            <ReactBitsCardSlot key={template.id} semantic="workflow-summary" className="w-full !p-0 !border-0 !bg-transparent !shadow-none">
            <XMTCard className={`min-w-0 p-4 ${styles.card}`}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div
                    data-testid={template.is_default ? 'workflow-default-icon' : undefined}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      template.is_default
                        ? 'bg-studio-primary-soft text-studio-primary-contrast'
                        : 'bg-theme-tertiary text-theme-text-secondary'
                    }`}
                  >
                    <ArrowRight className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${styles.textPrimary}`}>{template.name}</span>
                      {template.is_default ? (
                        <span data-testid="workflow-default-badge" className="rounded-full bg-studio-primary-soft px-2 py-0.5 text-xs text-studio-primary-contrast">
                          默认
                        </span>
                      ) : null}
                    </div>
                    <p className={`text-sm ${styles.textMuted}`}>{template.description}</p>
                  </div>
                </div>
                <div className="flex basis-full flex-wrap items-center justify-end gap-3 sm:basis-auto sm:gap-4">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className={styles.textMuted}><ReactBitsMetricSlot value={template.node_count}>{String(template.node_count)}</ReactBitsMetricSlot> 个节点</span>
                    <span className={styles.textMuted}><ReactBitsMetricSlot value={template.topic_count}>{String(template.topic_count)}</ReactBitsMetricSlot> 个选题使用</span>
                  </div>
                  {hasPermission('system:template') ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={templateActionsBlocked}
                        onClick={() => void loadTemplateForEdit(template.id, template.name)}
                        className={`xmt-btn inline-flex h-10 w-10 min-w-10 shrink-0 !p-0 rounded-lg ${styles.hoverBg} ${styles.textMuted}`}
                        title={templateActionsBlocked ? templateActionDisabledReason : '编辑'}
                        aria-label={templateActionsBlocked
                          ? `编辑审批流 ${template.name}，${templateActionDisabledReason}`
                          : `编辑审批流 ${template.name}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {!template.is_default ? (
                        <button
                          type="button"
                          disabled={templateActionsBlocked}
                          onClick={() => {
                            if (isTemplateActionBlocked() || templateListReadInFlight.current || templateMutationInFlight.current) return;
                            setDeleteTarget(template);
                          }}
                          className="xmt-btn inline-flex h-10 w-10 min-w-10 shrink-0 !p-0 rounded-lg text-studio-coral-contrast hover:bg-studio-coral/10"
                          title={templateActionsBlocked ? templateActionDisabledReason : '删除'}
                          aria-label={templateActionsBlocked
                            ? `删除审批流 ${template.name}，${templateActionDisabledReason}`
                            : `删除审批流 ${template.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </XMTCard>
            </ReactBitsCardSlot>
          ))}
        </div>
      ) : null}

      <FormModal
        open={showEditor}
        loading={savingTemplate || (!pendingCreateRecovery && !pendingUpdateRecovery && templateActionsBlocked)}
        locked={Boolean(pendingCreateRecovery) || createRecoveryInvalid || Boolean(pendingUpdateRecovery) || updateRecoveryInvalid}
        onCancel={resetEditorState}
        onSubmit={editingTemplate ? handleUpdate : handleCreate}
        title={editingTemplate ? '编辑审批流' : '新建审批流'}
        submitText={editingTemplate ? '保存' : '创建'}
        cancelText="取消"
        size="xl"
        footer={pendingUpdateRecovery ? (
          <div role="alert" className="space-y-3 text-sm text-studio-text-secondary">
            <p>
              {updateRecoveryNotice || (updateRecoveryState === 'submitting'
                ? '正在提交本次更新；账号、模板、请求编号、指纹和完整原内容已安全保存。'
                : updateRecoveryState === 'checking'
                  ? '正在只读核实原模板更新结果；原模板编辑器保持锁定。'
                  : updateRecoveryState === 'not_found'
                    ? '服务器暂未找到这次更新记录。原内容、原模板快照与请求编号已保留；如需继续，只能使用相同请求编号和原内容显式重试。'
                    : updateRecoveryState === 'conflict'
                      ? '更新记录与模板当前内容不一致；为避免覆盖其他改动，原模板编辑器保持锁定。'
                      : updateRecoveryState === 'rejected'
                        ? '本次更新已明确被拒绝，但恢复标记仍保留；不会再次提交。可只读核实，或确认清理此标记。'
                        : updateRecoveryState === 'confirmed'
                          ? updateRecoveryNotice || '本次更新结果已核实；恢复标记尚未清理，当前窗口保持锁定。'
                        : '暂时无法核实上次更新结果；恢复记录已保留，原模板编辑器保持锁定。')}
            </p>
            <div className="flex flex-wrap gap-2">
              {updateRecoveryState === 'not_found' && !pendingUpdateRecovery.rejected ? (
                <ReactBitsButtonSlot
                  type="button"
                  variant="primary"
                  disabled={!hasPermission('system:template') || savingTemplate}
                  onClick={() => void handleRetryPendingTemplateUpdate()}
                  aria-label="使用同一请求编号安全重试"
                >
                  使用同一请求编号安全重试
                </ReactBitsButtonSlot>
              ) : null}
              {updateRecoveryState === 'unavailable' || updateRecoveryState === 'conflict' || updateRecoveryState === 'rejected' || updateRecoveryState === 'confirmed' ? (
                <ReactBitsButtonSlot
                  type="button"
                  variant="secondary"
                  disabled={Boolean(updateRecoveryStatusRequestRef.current && sameWorkflowTemplateUpdateRecovery(updateRecoveryStatusRequestRef.current, pendingUpdateRecovery))}
                  onClick={() => void verifyTemplateUpdateStatus(pendingUpdateRecovery)}
                  aria-label="只读核实更新结果"
                >
                  只读核实更新结果
                </ReactBitsButtonSlot>
              ) : null}
              {updateRecoveryState === 'rejected' || updateRecoveryState === 'confirmed' ? (
                <ReactBitsButtonSlot
                  type="button"
                  variant="secondary"
                  onClick={handleClearTemplateUpdateMarker}
                  aria-label={updateRecoveryState === 'confirmed' ? '重试清理已确认的更新恢复标记' : '清理已拒绝的更新恢复标记'}
                >
                  {updateRecoveryState === 'confirmed' ? '重试清理恢复标记' : '清理已拒绝的恢复标记'}
                </ReactBitsButtonSlot>
              ) : null}
            </div>
          </div>
        ) : pendingCreateRecovery ? (
          <div role="alert" className="space-y-3 text-sm text-studio-text-secondary">
            <p>
              {createRecoveryNotice || (createRecoveryState === 'submitting'
                ? '正在提交本次创建；恢复编号与原表单已安全保存。'
                : createRecoveryState === 'checking'
                  ? '正在只读核实上次创建结果；核实期间不会再次提交。'
                  : createRecoveryState === 'not_found'
                    ? '服务器暂未找到对应记录。可使用相同请求编号安全重试；请求内容保持不变。'
                    : createRecoveryState === 'conflict'
                      ? '请求编号存在冲突。为避免重复创建，已暂停重试；请先核对模板列表和账号。'
                      : '暂时无法核实上次创建结果。恢复编号已保留；核实前不会再次提交。')}
            </p>
            <div className="flex flex-wrap gap-2">
              {createRecoveryState === 'not_found' ? (
                <ReactBitsButtonSlot
                  type="button"
                  variant="primary"
                  disabled={!hasPermission('system:template') || savingTemplate}
                  onClick={() => void handleRetryPendingCreate()}
                  aria-label="使用同一请求编号安全重试"
                >
                  使用同一请求编号安全重试
                </ReactBitsButtonSlot>
              ) : null}
              {createRecoveryState === 'unavailable' || createRecoveryState === 'conflict' ? (
                <ReactBitsButtonSlot
                  type="button"
                  variant="secondary"
                  disabled={createRecoveryStatusRequestRef.current === pendingCreateRecovery.requestId}
                  onClick={() => void verifyTemplateCreateStatus(pendingCreateRecovery, createRecoveryState === 'conflict')}
                  aria-label="只读核实创建结果"
                >
                  只读核实创建结果
                </ReactBitsButtonSlot>
              ) : null}
            </div>
          </div>
        ) : updateRecoveryInvalid ? (
          <div role="alert" className="text-sm text-studio-text-secondary">
            上次更新的恢复信息不可读取。为避免重复写入，当前窗口保持锁定。
          </div>
        ) : createRecoveryInvalid ? (
          <div role="alert" className="text-sm text-studio-text-secondary">
            上次创建的恢复信息不可读取。为避免重复创建，当前窗口保持锁定。
          </div>
        ) : undefined}
      >
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="workflow-template-name" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>模板名称</label>
              <input
                id="workflow-template-name"
                type="text"
                value={formData.name}
                onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                className={`w-full rounded-xl px-4 py-2 ${styles.input}`}
                placeholder="例如：标准选题流程"
              />
            </div>
            <div>
              <label htmlFor="workflow-template-description" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>描述</label>
              <input
                id="workflow-template-description"
                type="text"
                value={formData.description}
                onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
                className={`w-full rounded-xl px-4 py-2 ${styles.input}`}
                placeholder="流程描述"
              />
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className={`text-sm font-medium ${styles.textSecondary}`}>审批节点</h3>
              <ActionButton
                type="button"
                variant="secondary"
                onClick={addNode}
                className="rounded-lg px-3"
              >
                <Plus className="w-4 h-4" />
                添加节点
              </ActionButton>
            </div>

            <div className="space-y-3">
              {formData.nodes.map((node, index) => (
                <XMTCard
                  key={index}
                  className={`rounded-xl border p-4 ${getNodeCardClass(node)}`}
                  data-policy-reason={getNodePolicyResult(node)?.reason}
                  title={getNodeShadowSummary(node)}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-sm font-medium ${styles.textPrimary}`}>节点 {index + 1}</span>
                      {(() => {
                        const policyResult = getNodePolicyResult(node);
                        const runtimeContext = getNodeRuntimeContext(node);
                        const explainability = getNodeExplainability(node);
                        const explainUI = mapExplainToUI(explainability.explain);
                        const uiState = mapDecisionToUI(policyResult);
                        if (uiState.status === 'normal' && policyResult.allowed) return null;

                        return (
                          <>
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${getRiskBadgeClass(uiState.risk)}`}>
                              {getWorkflowRiskLabel(uiState.risk)}
                            </span>
                            {uiState.status === 'warning' ? (
                              <span className={`text-[11px] ${uiState.risk === 'high' ? 'text-studio-coral-contrast' : 'text-studio-amber-contrast'}`}>建议复核</span>
                            ) : null}
                            {!policyResult.allowed || uiState.status === 'blocked' ? (
                              <span className="text-[11px] text-studio-coral-contrast">需处理：{localizeWorkflowMessage(explainability.blockExplain.blockedReason)}</span>
                            ) : null}
                            {runtimeContext.suggestedTransition ? (
                              <ActionButton
                                type="button"
                                variant="ghost"
                                onClick={() => updateNode(index, 'status_to', runtimeContext.suggestedTransition)}
                                className={`rounded-full border px-2 py-1 text-xs ${styles.border} ${styles.hoverBg} text-studio-primary-contrast`}
                                title={explainUI.tooltip}
                              >
                                应用建议：{getStatusLabel(runtimeContext.suggestedTransition)}
                              </ActionButton>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                    <button
                      type="button"
                      aria-label={`删除节点 ${index + 1}`}
                      onClick={() => removeNode(index)}
                      className="xmt-btn inline-flex h-10 w-10 min-w-10 shrink-0 !p-0 rounded-lg text-studio-coral-contrast hover:bg-studio-coral/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor={`workflow-node-${index}-name`} className={`mb-1 block text-xs ${styles.textMuted}`}>节点名称</label>
                      <input
                        id={`workflow-node-${index}-name`}
                        type="text"
                        value={node.name}
                        onChange={(event) => updateNode(index, 'name', event.target.value)}
                        className={`w-full rounded-lg px-3 py-1.5 text-sm ${styles.input}`}
                        placeholder="例如：内容审核"
                      />
                    </div>
                    <div>
                      <label htmlFor={`workflow-node-${index}-approver-type`} className={`mb-1 block text-xs ${styles.textMuted}`}>审批类型</label>
                      <select
                        id={`workflow-node-${index}-approver-type`}
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
                      <label htmlFor={`workflow-node-${index}-status-from`} className={`mb-1 block text-xs ${styles.textMuted}`}>从状态</label>
                      <select
                        id={`workflow-node-${index}-status-from`}
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
                      <label htmlFor={`workflow-node-${index}-status-to`} className={`mb-1 block text-xs ${styles.textMuted}`}>到状态</label>
                      <select
                        id={`workflow-node-${index}-status-to`}
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
                      <label htmlFor={`workflow-node-${index}-approver-value`} className={`mb-1 block text-xs ${styles.textMuted}`}>审批人值</label>
                      <input
                        id={`workflow-node-${index}-approver-value`}
                        type="text"
                        value={node.approver_value}
                        onChange={(event) => updateNode(index, 'approver_value', event.target.value)}
                        className={`w-full rounded-lg px-3 py-1.5 text-sm ${styles.input}`}
                        placeholder="角色码或用户 ID"
                      />
                    </div>
                    <div className="flex items-center">
                      <label className={`flex items-center gap-2 text-sm ${styles.textPrimary}`}>
                        <input
                          type="checkbox"
                          checked={node.is_required}
                          onChange={(event) => updateNode(index, 'is_required', event.target.checked)}
                          className="rounded border-studio-border-soft"
                        />
                        必须审批
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
                </XMTCard>
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
              <h3 className={`mb-3 block text-sm font-medium ${styles.textSecondary}`}>流程预览</h3>
              <div className="flex flex-wrap items-center gap-2">
                {formData.nodes.map((node, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <XMTCard className={`px-3 py-2 ${styles.bgTertiary} ${styles.border}`}>
                      <p className={`text-xs font-medium ${styles.textPrimary}`}>{node.name || `节点${index + 1}`}</p>
                      <p className={`text-xs ${styles.textMuted}`}>
                        {getStatusLabel(node.status_from)} → {getStatusLabel(node.status_to)}
                      </p>
                    </XMTCard>
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
        loading={templateActionsBlocked}
        variant="danger"
        title="确认删除"
        confirmText="确认删除"
        cancelText="取消"
        description={
          templateActionsBlocked ? templateActionDisabledReason : deleteTarget ? `确定删除审批流模板“${deleteTarget.name}”吗？` : ''
        }
      />
    </div>
    </ReactBitsPageScene>
  );
}
