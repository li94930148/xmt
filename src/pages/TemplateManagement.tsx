import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { createTemplate, deleteTemplate, getTemplateMutationStatus, getTemplates, TemplateMutationHttpError, updateTemplate, type ManagedTemplate } from '../api/templates';
import { ActionButton, EmptyState, GlassPanel, PageHeader, PageShell } from '../components/studio';
import LoadingState from '../components/common/LoadingState';
import { useAuthStore } from '../store';
import {
  markTopicTemplateMutationRecoveryRejected,
  normalizeTopicTemplateCreatePayload,
  normalizeTopicTemplateUpdatePayload,
  persistTopicTemplateMutationRecovery,
  readTopicTemplateMutationRecovery,
  removeTopicTemplateMutationRecovery,
  sameTopicTemplateMutationRecovery,
  topicTemplateMutationFingerprint,
  type TopicTemplateCreatePayload,
  type TopicTemplateDraft,
  type TopicTemplateMutationOperation,
  type TopicTemplateMutationPayload,
  type TopicTemplateMutationRecovery,
  type TopicTemplateRecoveryStorage,
  type TopicTemplateUpdatePayload,
} from './topicTemplateMutationRecovery';

type RecoveryState = 'checking' | 'submitting' | 'not_found' | 'target_missing' | 'conflict' | 'unavailable' | 'processed_cleanup' | 'target_missing_cleanup' | 'rejected_cleanup' | 'rejected_mark_failed' | 'storage_blocked' | null;
const emptyForm: TopicTemplateDraft = { name: '', platform: '', description: '', template_data: '' };

function getRecoveryStorage(): { session: TopicTemplateRecoveryStorage; local: TopicTemplateRecoveryStorage } {
  return { session: window.sessionStorage, local: window.localStorage };
}

function readBrowserRecovery(actorId: number) {
  try {
    const storage = getRecoveryStorage();
    return readTopicTemplateMutationRecovery(actorId, storage.session, storage.local);
  } catch {
    return { kind: 'blocked' as const, recovery: null, reason: 'unavailable' as const };
  }
}

function mutationLabel(operation: TopicTemplateMutationOperation) {
  return operation === 'create' ? '创建模板' : operation === 'update' ? '更新模板' : '删除模板';
}

function payloadMatchesTemplate(template: ManagedTemplate, payload: TopicTemplateMutationPayload) {
  if (!payload || typeof payload !== 'object') return false;
  return Object.entries(payload).every(([key, value]) => template[key as keyof ManagedTemplate] === value);
}

export default function TemplateManagement() {
  const actorId = useAuthStore((state) => Number(state.user?.id) || 0);
  const [templates, setTemplates] = useState<ManagedTemplate[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingBaseline, setEditingBaseline] = useState<TopicTemplateMutationRecovery['baseline']>(null);
  const [form, setForm] = useState<TopicTemplateDraft>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);
  const [baselineConflicted, setBaselineConflicted] = useState(false);
  const [pendingRecovery, setPendingRecovery] = useState<TopicTemplateMutationRecovery | null>(() => {
    const initialActor = Number(useAuthStore.getState().user?.id) || 0;
    const stored = initialActor > 0 ? readBrowserRecovery(initialActor) : null;
    return stored?.kind === 'ready' ? stored.recovery : null;
  });
  const [recoveryState, setRecoveryState] = useState<RecoveryState>(() => {
    const initialActor = Number(useAuthStore.getState().user?.id) || 0;
    const stored = initialActor > 0 ? readBrowserRecovery(initialActor) : null;
    return stored?.kind === 'ready' ? stored.recovery.rejected ? 'rejected_cleanup' : 'checking' : stored?.kind === 'blocked' ? 'storage_blocked' : null;
  });
  const [recoveryError, setRecoveryError] = useState('');
  const operationLockRef = useRef(false);
  const mutationGenerationRef = useRef(0);
  const mutationActorRef = useRef(actorId);
  const recoveryRef = useRef<TopicTemplateMutationRecovery | null>(pendingRecovery);
  const listRequestSequenceRef = useRef(0);
  const editingIdRef = useRef(editingId);
  editingIdRef.current = editingId;
  const activeRecovery = pendingRecovery?.actorId === actorId ? pendingRecovery : null;
  const storageBlocked = recoveryState === 'storage_blocked';
  const writesLocked = busy || Boolean(activeRecovery) || storageBlocked || baselineConflicted;

  const load = useCallback(async () => {
    const requestSequence = ++listRequestSequenceRef.current;
    const requestActorId = Number(useAuthStore.getState().user?.id) || 0;
    try {
      const rows = await getTemplates();
      if (requestSequence !== listRequestSequenceRef.current || Number(useAuthStore.getState().user?.id) !== requestActorId) return null;
      setTemplates(rows);
      setInitialLoadFailed(false);
      return true;
    } catch {
      if (requestSequence !== listRequestSequenceRef.current || Number(useAuthStore.getState().user?.id) !== requestActorId) return null;
      setInitialLoadFailed(true);
      setRefreshFailed(true);
      return false;
    } finally {
      if (requestSequence === listRequestSequenceRef.current && Number(useAuthStore.getState().user?.id) === requestActorId) setLoading(false);
    }
  }, []);

  const readCurrentTemplates = useCallback(async () => {
    const requestSequence = ++listRequestSequenceRef.current;
    const requestActorId = Number(useAuthStore.getState().user?.id) || 0;
    try {
      const rows = await getTemplates();
      if (requestSequence !== listRequestSequenceRef.current || Number(useAuthStore.getState().user?.id) !== requestActorId) return null;
      setTemplates(rows);
      setInitialLoadFailed(false);
      setRefreshFailed(false);
      setLoading(false);
      return rows;
    } catch {
      if (requestSequence !== listRequestSequenceRef.current || Number(useAuthStore.getState().user?.id) !== requestActorId) return null;
      setRefreshFailed(true);
      setLoading(false);
      return null;
    }
  }, []);

  useEffect(() => {
    if (mutationActorRef.current === actorId) return;
    mutationActorRef.current = actorId;
    mutationGenerationRef.current += 1;
    listRequestSequenceRef.current += 1;
    operationLockRef.current = false;
    setBusy(false);
  }, [actorId]);

  const setRecovery = (recovery: TopicTemplateMutationRecovery, state: RecoveryState) => {
    recoveryRef.current = recovery;
    setPendingRecovery(recovery);
    setRecoveryState(state);
    setRecoveryError('');
  };

  const isCurrentRecovery = (recovery: TopicTemplateMutationRecovery, isActive: () => boolean = () => true) => (
    isActive()
    && Number(useAuthStore.getState().user?.id) === recovery.actorId
    && sameTopicTemplateMutationRecovery(recoveryRef.current, recovery)
  );

  const clearRecovery = useCallback((
    recovery: TopicTemplateMutationRecovery,
    isActive: () => boolean = () => true,
    failureState: RecoveryState = recovery.rejected ? 'rejected_cleanup' : 'processed_cleanup',
  ) => {
    if (!isCurrentRecovery(recovery, isActive)) return false;
    let removed = false;
    try {
      const storage = getRecoveryStorage();
      removed = removeTopicTemplateMutationRecovery(recovery, storage.session, storage.local);
    } catch { removed = false; }
    if (!removed) {
      setRecoveryState(failureState);
      setRecoveryError('恢复标记尚未安全清除，模板写操作继续锁定。');
      return false;
    }
    recoveryRef.current = null;
    setPendingRecovery(null);
    setRecoveryState(null);
    setRecoveryError('');
    return true;
  }, []);

  const releaseRejectedRecovery = useCallback((recovery: TopicTemplateMutationRecovery, message: string, baselineChanged = false) => {
    if (!isCurrentRecovery(recovery)) return false;
    let persisted = false;
    try {
      const storage = getRecoveryStorage();
      persisted = markTopicTemplateMutationRecoveryRejected(recovery, storage.session, storage.local);
    } catch { persisted = false; }
    if (!persisted) {
      setRecoveryState('rejected_mark_failed');
      setRecoveryError('服务器已拒绝本次操作，但拒绝标记未能安全保存。模板写操作保持锁定，请重试保存拒绝标记。');
      return false;
    }
    const rejected = { ...recovery, rejected: true };
    recoveryRef.current = rejected;
    setPendingRecovery(rejected);
    if (!clearRecovery(rejected)) return false;
    if (baselineChanged && recovery.operation === 'update') setBaselineConflicted(true);
    setNotice(message);
    setRefreshFailed(false);
    return true;
  }, [clearRecovery]);

  const finishMissingTarget = useCallback(async (
    recovery: TopicTemplateMutationRecovery,
    isActive: () => boolean = () => true,
  ) => {
    if (!isCurrentRecovery(recovery, isActive)) return false;
    const rows = await readCurrentTemplates();
    if (!isCurrentRecovery(recovery, isActive)) return false;
    if (rows) setTemplates(rows.filter((template) => template.id !== recovery.targetId));
    else setTemplates((current) => current.filter((template) => template.id !== recovery.targetId));
    if (editingIdRef.current === recovery.targetId) {
      setEditingId(null);
      setEditingBaseline(null);
    }
    if (!clearRecovery(recovery, isActive, 'target_missing_cleanup')) return false;
    setNotice('模板已不存在；本次操作未确认成功，可以继续处理其他模板。');
    setRefreshFailed(!rows);
    return true;
  }, [clearRecovery, readCurrentTemplates]);

  const completeProcessedRecovery = useCallback(async (
    recovery: TopicTemplateMutationRecovery,
    createdTargetId?: number,
    isActive: () => boolean = () => true,
  ) => {
    if (!isCurrentRecovery(recovery, isActive)) return false;
    const rows = await readCurrentTemplates();
    if (!isCurrentRecovery(recovery, isActive)) return false;
    const resolvedId = recovery.operation === 'create' ? createdTargetId : recovery.targetId;
    if (recovery.operation === 'create' && (!Number.isSafeInteger(resolvedId) || Number(resolvedId) <= 0)) {
      setRecoveryState('unavailable');
      setRecoveryError('服务端确认创建，但没有返回可核实的模板编号。写操作继续锁定。');
      return false;
    }
    const currentTemplate = rows?.find((template) => template.id === resolvedId);
    const changedAgain = recovery.operation === 'update' && currentTemplate && !payloadMatchesTemplate(currentTemplate, recovery.payload);
    const message = changedAgain
      ? '本次更新已保存；模板随后又有变化，请重新读取当前内容后再编辑。'
      : recovery.operation === 'create'
        ? '模板已创建。'
        : recovery.operation === 'update'
          ? '模板已保存。'
          : '模板已删除。';
    if (recovery.operation !== 'delete') {
      setEditingId(null);
      setEditingBaseline(null);
      setForm(emptyForm);
    } else if (editingIdRef.current === recovery.targetId) {
      setEditingId(null);
      setEditingBaseline(null);
      setForm(emptyForm);
    }
    if (!clearRecovery(recovery, isActive)) return false;
    setNotice(rows ? message : `${message.replace(/[。]$/, '')}；列表刷新失败，请重新加载列表确认。`);
    setRefreshFailed(!rows);
    setBaselineConflicted(false);
    return true;
  }, [clearRecovery, readCurrentTemplates]);

  const verifyRecovery = useCallback(async (
    recovery: TopicTemplateMutationRecovery,
    isActive: () => boolean = () => true,
  ): Promise<'processed' | 'not_found' | 'target_missing' | 'conflict' | 'unavailable' | null> => {
    if (recovery.rejected) {
      if (!isCurrentRecovery(recovery, isActive)) return null;
      if (!clearRecovery(recovery, isActive)) return 'unavailable';
      setNotice('上次模板操作已被服务器拒绝，原表单内容仍保留；请核对后再提交。');
      return 'unavailable';
    }
    setRecoveryState('checking');
    setRecoveryError('');
    try {
      const result = await getTemplateMutationStatus(recovery.requestId, recovery.operation, recovery.requestFingerprint, recovery.targetId);
      if (!isCurrentRecovery(recovery, isActive)) return null;
      if (result.state === 'processed') {
        if (recovery.operation === 'create' && !result.targetId) {
          setRecoveryState('unavailable');
          setRecoveryError('服务端未返回已创建模板的编号，当前继续锁定。');
          return 'unavailable';
        }
        await completeProcessedRecovery(recovery, result.targetId, isActive);
        return 'processed';
      }
      if (result.state === 'target_missing') {
        await finishMissingTarget(recovery, isActive);
        return 'target_missing';
      }
      if (result.state === 'conflict') {
        setRecoveryState('conflict');
        setRecoveryError('请求编号与操作者、操作、模板或载荷不匹配。为避免覆盖，模板写操作保持锁定，只能只读核实。');
        return 'conflict';
      }
      if (recovery.operation === 'create') {
        setRecoveryState('not_found');
        setRecoveryError('服务端尚未找到这次创建记录。只有明确点击“使用原请求重试”才会用相同请求编号提交。');
        return 'not_found';
      }
      const rows = await readCurrentTemplates();
      if (!isCurrentRecovery(recovery, isActive)) return null;
      if (!rows) {
        setRecoveryState('unavailable');
        setRecoveryError('无法读取当前模板版本，不能安全判断是否可以重试。');
        return 'unavailable';
      }
      const current = rows.find((template) => template.id === recovery.targetId);
      if (!current) {
        await finishMissingTarget(recovery, isActive);
        return 'target_missing';
      }
      if (current.base_fingerprint !== recovery.baseFingerprint) {
        releaseRejectedRecovery(recovery, '模板已被其他操作更新，本次请求未写入。当前表单内容已保留；请重新读取后核对。', recovery.operation === 'update');
        if (recovery.operation === 'update') setTemplates(rows);
        return 'not_found';
      }
      setRecoveryState('not_found');
      setRecoveryError('服务端尚未找到这次操作记录，且模板版本未变化。只有明确点击下方按钮才会重用原请求编号与载荷。');
      return 'not_found';
    } catch (error) {
      if (!isCurrentRecovery(recovery, isActive)) return null;
      setRecoveryState('unavailable');
      setRecoveryError(error instanceof Error ? error.message : '暂时无法核实模板操作结果');
      return 'unavailable';
    }
  }, [clearRecovery, completeProcessedRecovery, finishMissingTarget, readCurrentTemplates, releaseRejectedRecovery]);

  const finishRejectedMarkerCleanup = useCallback((recovery: TopicTemplateMutationRecovery) => {
    if (!isCurrentRecovery(recovery)) return false;
    return clearRecovery(recovery);
  }, [clearRecovery]);

  useEffect(() => {
    void load();
    return () => { listRequestSequenceRef.current += 1; };
  }, [actorId, load]);

  useEffect(() => {
    if (actorId <= 0) {
      recoveryRef.current = null;
      setPendingRecovery(null);
      setRecoveryState(null);
      setRecoveryError('');
      return undefined;
    }
    let active = true;
    const stored = readBrowserRecovery(actorId);
    if (stored.kind === 'blocked') {
      recoveryRef.current = stored.recovery;
      setPendingRecovery(stored.recovery);
      setRecoveryState('storage_blocked');
      setRecoveryError(stored.reason === 'conflict'
        ? '浏览器中的模板恢复标记不一致，写操作保持锁定。'
        : stored.reason === 'invalid'
          ? '浏览器中的模板恢复标记无法识别，写操作保持锁定。'
          : '浏览器存储暂不可用，无法安全检查待核实的模板操作。');
      return () => { active = false; };
    }
    if (stored.kind === 'none') {
      recoveryRef.current = null;
      setPendingRecovery(null);
      setRecoveryState(null);
      setRecoveryError('');
      return () => { active = false; };
    }
    recoveryRef.current = stored.recovery;
    setPendingRecovery(stored.recovery);
    if (stored.recovery.operation === 'create' && stored.recovery.formSnapshot) {
      setEditingId(null);
      setEditingBaseline(null);
      setForm(stored.recovery.formSnapshot);
    } else if (stored.recovery.operation === 'update' && stored.recovery.formSnapshot) {
      setEditingId(stored.recovery.targetId);
      setEditingBaseline(stored.recovery.baseline);
      setForm(stored.recovery.formSnapshot);
    }
    setRecoveryError('');
    if (stored.recovery.rejected) {
      setRecoveryState('rejected_cleanup');
      finishRejectedMarkerCleanup(stored.recovery);
    } else {
      setRecoveryState('checking');
      void verifyRecovery(stored.recovery, () => active);
    }
    return () => { active = false; };
  }, [actorId, finishRejectedMarkerCleanup, verifyRecovery]);

  function edit(template: ManagedTemplate) {
    setEditingId(template.id);
    setEditingBaseline(template.base_fingerprint ? { id: template.id, base_fingerprint: template.base_fingerprint } : null);
    setBaselineConflicted(false);
    setForm({ name: template.name, platform: template.platform || '', description: template.description || '', template_data: template.template_data || '' });
    setNotice('');
    setRefreshFailed(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingBaseline(null);
    setForm(emptyForm);
    setBaselineConflicted(false);
  }

  const executeMutation = async (recovery: TopicTemplateMutationRecovery, explicitRetry = false, lockAlreadyHeld = false) => {
    const generation = mutationGenerationRef.current;
    if (!lockAlreadyHeld) {
      if (operationLockRef.current || (activeRecovery && !sameTopicTemplateMutationRecovery(activeRecovery, recovery)) || storageBlocked) return;
      operationLockRef.current = true;
      setBusy(true);
    }
    const stillCurrent = () => isCurrentRecovery(recovery);
    try {
      if (!stillCurrent() || recovery.rejected) return;
      if (explicitRetry && recovery.operation !== 'create') {
        const rows = await readCurrentTemplates();
        if (!stillCurrent()) return;
        if (!rows) {
          setRecoveryState('unavailable');
          setRecoveryError('无法读取当前模板版本，不能安全重试。');
          return;
        }
        const current = rows.find((template) => template.id === recovery.targetId);
        if (!current) {
          await finishMissingTarget(recovery);
          return;
        }
        if (current.base_fingerprint !== recovery.baseFingerprint) {
          releaseRejectedRecovery(recovery, '模板已被其他操作更新，本次请求未重发。当前表单内容已保留，请重新读取核对。', recovery.operation === 'update');
          return;
        }
      }
      setRecoveryState('submitting');
      setRecoveryError('');
      setNotice(`正在${mutationLabel(recovery.operation)}…`);
      const identity = {
        client_request_id: recovery.requestId,
        request_fingerprint: recovery.requestFingerprint,
        ...(recovery.baseFingerprint ? { base_fingerprint: recovery.baseFingerprint } : {}),
      };
      let createdTargetId: number | undefined;
      if (recovery.operation === 'create') {
        const response = await createTemplate(recovery.payload as TopicTemplateCreatePayload, identity);
        createdTargetId = Number(response.id);
      } else if (recovery.operation === 'update') {
        await updateTemplate(recovery.targetId as number, recovery.payload as TopicTemplateUpdatePayload, identity);
      } else {
        await deleteTemplate(recovery.targetId as number, identity);
      }
      if (!stillCurrent()) return;
      await completeProcessedRecovery(recovery, createdTargetId);
    } catch (error) {
      if (!stillCurrent()) return;
      const apiError = error instanceof TemplateMutationHttpError ? error : null;
      const code = apiError?.code;
      const baselineConflict = code === 'TOPIC_TEMPLATE_UPDATE_BASE_CONFLICT' || code === 'TOPIC_TEMPLATE_DELETE_BASE_CONFLICT';
      if (baselineConflict) {
        releaseRejectedRecovery(recovery, '模板已被其他操作更新，本次修改未写入。当前表单内容已保留，请重新读取后核对。', recovery.operation === 'update');
        void readCurrentTemplates();
      } else if (apiError?.status === 409) {
        setRecoveryState('conflict');
        setRecoveryError(apiError.message || '模板请求编号发生冲突。所有模板写操作保持锁定，只能只读核实。');
      } else if (code === 'TOPIC_TEMPLATE_MUTATION_TARGET_MISSING') {
        await finishMissingTarget(recovery);
      } else if (apiError && [400, 401, 403, 404, 422].includes(apiError.status)) {
        releaseRejectedRecovery(recovery, apiError.message || `${mutationLabel(recovery.operation)}被服务器拒绝，原表单内容已保留。`);
      } else {
        await verifyRecovery(recovery);
      }
    } finally {
      if (generation === mutationGenerationRef.current) {
        operationLockRef.current = false;
        setBusy(false);
      }
    }
  };

  async function startMutation(
    operation: 'create' | 'update',
    draft: TopicTemplateDraft,
    baseline: TopicTemplateMutationRecovery['baseline'] = null,
  ) {
    if (loading || operationLockRef.current || activeRecovery || storageBlocked || baselineConflicted) return;
    if (!draft.name.trim()) { setNotice('请填写模板名称'); return; }
    if (!draft.template_data.trim()) { setNotice('请填写模板正文'); return; }
    if (operation === 'update' && (!baseline || !/^[0-9a-f]{64}$/.test(baseline.base_fingerprint))) {
      setNotice('当前模板缺少有效版本标记，请重新加载后再编辑。');
      return;
    }
    const generation = mutationGenerationRef.current;
    operationLockRef.current = true;
    setBusy(true);
    setRefreshFailed(false);
    setNotice(`正在${mutationLabel(operation)}…`);
    try {
      const normalizedPayload = operation === 'create'
        ? normalizeTopicTemplateCreatePayload(draft)
        : normalizeTopicTemplateUpdatePayload(draft);
      const targetId = operation === 'create' ? null : baseline?.id ?? null;
      const baseFingerprint = operation === 'create' ? null : baseline?.base_fingerprint ?? null;
      const requestId = window.crypto.randomUUID().toLowerCase();
      const requestFingerprint = await topicTemplateMutationFingerprint(operation, targetId, baseFingerprint, normalizedPayload);
      if (Number(useAuthStore.getState().user?.id) !== actorId) return;
      const stored = readBrowserRecovery(actorId);
      if (stored.kind === 'blocked') {
        setRecoveryState('storage_blocked');
        setRecoveryError('浏览器中已有无法核实的模板操作恢复信息，因此没有发送本次请求。');
        return;
      }
      if (stored.kind === 'ready') {
        setRecovery(stored.recovery, stored.recovery.rejected ? 'rejected_cleanup' : 'checking');
        if (stored.recovery.rejected) finishRejectedMarkerCleanup(stored.recovery);
        else void verifyRecovery(stored.recovery);
        return;
      }
      const recovery: TopicTemplateMutationRecovery = {
        schemaVersion: 1,
        actorId,
        operation,
        requestId,
        requestFingerprint,
        targetId,
        baseFingerprint,
        payload: normalizedPayload,
        baseline,
        formSnapshot: { ...draft },
        rejected: false,
      };
      let persisted = false;
      try {
        const storage = getRecoveryStorage();
        persisted = persistTopicTemplateMutationRecovery(recovery, storage.session, storage.local);
      } catch { persisted = false; }
      if (!persisted) {
        const current = readBrowserRecovery(actorId);
        if (current.kind === 'ready') setRecovery(current.recovery, 'storage_blocked');
        else {
          setRecoveryState('storage_blocked');
          setRecoveryError('浏览器无法保存模板恢复信息，因此没有发送请求。请检查浏览器存储后重试。');
        }
        return;
      }
      setRecovery(recovery, 'submitting');
      await executeMutation(recovery, false, true);
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : '无法准备安全请求，因此没有发送操作。');
      setNotice('无法安全提交模板操作；原表单内容已保留。');
    } finally {
      if (generation === mutationGenerationRef.current) {
        operationLockRef.current = false;
        setBusy(false);
      }
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (editingId === null) await startMutation('create', form);
    else await startMutation('update', form, editingBaseline);
  }

  async function remove(template: ManagedTemplate) {
    if (operationLockRef.current || activeRecovery || storageBlocked || !template.base_fingerprint) {
      if (!template.base_fingerprint) setNotice('当前模板缺少有效版本标记，请重新加载后再删除。');
      return;
    }
    if (!window.confirm(`删除“${template.name}”？已有选题不会被删除。`)) return;
    const generation = mutationGenerationRef.current;
    operationLockRef.current = true;
    setBusy(true);
    setRefreshFailed(false);
    setNotice('正在删除模板…');
    try {
      const targetId = template.id;
      const baseline = { id: targetId, base_fingerprint: template.base_fingerprint };
      const requestId = window.crypto.randomUUID().toLowerCase();
      const requestFingerprint = await topicTemplateMutationFingerprint('delete', targetId, template.base_fingerprint, null);
      if (Number(useAuthStore.getState().user?.id) !== actorId) return;
      const stored = readBrowserRecovery(actorId);
      if (stored.kind === 'blocked') {
        setRecoveryState('storage_blocked');
        setRecoveryError('浏览器中已有无法核实的模板操作恢复信息，因此没有发送删除请求。');
        return;
      }
      if (stored.kind === 'ready') {
        setRecovery(stored.recovery, stored.recovery.rejected ? 'rejected_cleanup' : 'checking');
        if (stored.recovery.rejected) finishRejectedMarkerCleanup(stored.recovery);
        else void verifyRecovery(stored.recovery);
        return;
      }
      const recovery: TopicTemplateMutationRecovery = {
        schemaVersion: 1, actorId, operation: 'delete', requestId, requestFingerprint,
        targetId, baseFingerprint: template.base_fingerprint, payload: null, baseline, formSnapshot: null, rejected: false,
      };
      let persisted = false;
      try {
        const storage = getRecoveryStorage();
        persisted = persistTopicTemplateMutationRecovery(recovery, storage.session, storage.local);
      } catch { persisted = false; }
      if (!persisted) {
        const current = readBrowserRecovery(actorId);
        if (current.kind === 'ready') setRecovery(current.recovery, 'storage_blocked');
        else {
          setRecoveryState('storage_blocked');
          setRecoveryError('浏览器无法保存删除恢复信息，因此没有发送删除请求。');
        }
        return;
      }
      setRecovery(recovery, 'submitting');
      await executeMutation(recovery, false, true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法准备安全删除请求；模板未删除。');
    } finally {
      if (generation === mutationGenerationRef.current) {
        operationLockRef.current = false;
        setBusy(false);
      }
    }
  }

  async function retryRefresh() {
    if (operationLockRef.current) return;
    operationLockRef.current = true;
    setBusy(true);
    setNotice('正在重新加载模板列表…');
    try {
      const rows = await load();
      if (rows) {
        setRefreshFailed(false);
        setNotice('模板列表已重新加载');
      } else {
        setRefreshFailed(true);
        setNotice('模板列表仍无法刷新，请稍后重试；不要重复提交已确认的操作。');
      }
    } finally {
      operationLockRef.current = false;
      setBusy(false);
    }
  }

  const retryStatusCheck = () => {
    if (!activeRecovery || busy || recoveryState === 'checking' || recoveryState === 'submitting') return;
    void verifyRecovery(activeRecovery);
  };

  const retryOriginalRequest = () => {
    if (!activeRecovery || activeRecovery.rejected || recoveryState !== 'not_found' || busy) return;
    void executeMutation(activeRecovery, true);
  };

  function retryRecoveryCleanup() {
    if (!activeRecovery || busy) return;
    if (activeRecovery.rejected || recoveryState === 'rejected_mark_failed') {
      try {
        const storage = getRecoveryStorage();
        if (!markTopicTemplateMutationRecoveryRejected(activeRecovery, storage.session, storage.local)) {
          setRecoveryError('拒绝标记仍未能安全保存，模板写操作继续锁定。');
          return;
        }
        const rejected = { ...activeRecovery, rejected: true };
        recoveryRef.current = rejected;
        setPendingRecovery(rejected);
        clearRecovery(rejected);
      } catch {
        setRecoveryError('浏览器存储暂不可用，无法清理拒绝标记。');
      }
    } else {
      clearRecovery(activeRecovery, () => true, recoveryState === 'target_missing_cleanup' ? 'target_missing_cleanup' : 'processed_cleanup');
    }
  }

  const retryConflictedDraft = () => {
    if (editingId === null || busy || activeRecovery) return;
    const current = templates.find((template) => template.id === editingId);
    if (current) edit(current);
  };

  const updateRecoveryDescription = recoveryState === 'not_found'
    ? '服务端尚未找到这次模板操作。核对保留的表单内容后，只有明确点击下方按钮才会使用原请求编号重试。'
    : recoveryState === 'conflict'
      ? '模板请求编号与操作者、操作、模板或载荷不匹配。为避免覆盖，所有模板写操作保持锁定。'
      : recoveryState === 'unavailable'
        ? '模板操作结果暂时无法核实。请勿重复操作；所有模板写操作保持锁定。'
        : recoveryState === 'processed_cleanup'
          ? '服务器已确认模板操作，但恢复标记尚未安全清除。模板写操作继续锁定。'
          : recoveryState === 'target_missing_cleanup'
            ? '目标模板已不存在，但恢复标记尚未安全清除。模板写操作继续锁定。'
            : recoveryState === 'rejected_cleanup'
              ? '服务器已拒绝这次模板操作。不会自动重试，恢复标记尚未安全清除。'
              : recoveryState === 'rejected_mark_failed'
                ? '服务器已拒绝这次模板操作，但浏览器未能保存拒绝标记。请重试保存标记。'
                : recoveryState === 'storage_blocked'
                  ? '浏览器恢复信息无法安全读取或保存，因此没有发送新的模板写请求。'
                  : recoveryState === 'submitting'
                    ? '正在提交或恢复模板操作，其他模板写操作暂时锁定。'
                    : '正在只读核实上次模板操作结果，其他模板写操作暂时锁定。';

  return <PageShell>
    <div><PageHeader title="选题模板" /><p className="mt-2 text-sm text-studio-text-secondary">管理团队可复用的选题内容结构。</p></div>
    {activeRecovery ? <div role="alert" data-testid="template-mutation-recovery" className="space-y-3 rounded-xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast">
      <p className="font-medium">{updateRecoveryDescription}</p>
      <div className="rounded-lg border border-studio-border-soft bg-studio-surface/70 p-3 text-studio-text-secondary">
        <p>操作：{mutationLabel(activeRecovery.operation)}{activeRecovery.targetId ? ` · 模板 #${activeRecovery.targetId}` : ''}</p>
        <p className="mt-1">原请求编号：<span className="font-mono text-xs">{activeRecovery.requestId}</span></p>
        {activeRecovery.operation !== 'delete' ? <p className="mt-1">原表单内容仍保留在左侧，重试会使用保存时的规范化载荷。</p> : null}
      </div>
      {recoveryError ? <p className="text-studio-text-secondary">{recoveryError}</p> : null}
      <div className="flex flex-wrap gap-2">
        {recoveryState === 'not_found' && !activeRecovery.rejected ? <ActionButton type="button" variant="primary" disabled={busy} onClick={retryOriginalRequest}>使用原请求重试</ActionButton> : null}
        {recoveryState === 'processed_cleanup' || recoveryState === 'target_missing_cleanup' || recoveryState === 'rejected_cleanup' || recoveryState === 'rejected_mark_failed' ? <ActionButton type="button" variant="secondary" disabled={busy} onClick={retryRecoveryCleanup}>{recoveryState === 'rejected_mark_failed' ? '重试保存拒绝标记' : '重试清理恢复标记'}</ActionButton> : null}
        {recoveryState !== 'processed_cleanup' && recoveryState !== 'target_missing_cleanup' && recoveryState !== 'rejected_cleanup' && recoveryState !== 'rejected_mark_failed' && recoveryState !== 'storage_blocked' ? <ActionButton type="button" variant="secondary" disabled={busy || recoveryState === 'checking' || recoveryState === 'submitting'} onClick={retryStatusCheck}>{recoveryState === 'checking' ? '正在核实…' : '只读重新核实'}</ActionButton> : null}
        {recoveryState === 'storage_blocked' ? <ActionButton type="button" variant="secondary" onClick={() => window.location.reload()}>重新检查</ActionButton> : null}
      </div>
    </div> : recoveryState === 'storage_blocked' ? <div role="alert" className="space-y-3 rounded-xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast"><p className="font-medium">{updateRecoveryDescription}</p>{recoveryError ? <p>{recoveryError}</p> : null}<ActionButton type="button" variant="secondary" onClick={() => window.location.reload()}>重新检查</ActionButton></div> : null}
    {notice ? <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-3 text-sm text-studio-text-primary"><span>{notice}</span>{refreshFailed ? <ActionButton type="button" variant="ghost" disabled={busy || Boolean(activeRecovery)} onClick={() => void retryRefresh()}>重新加载列表</ActionButton> : null}</div> : null}
    {baselineConflicted ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-button border border-studio-amber/30 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast"><span>当前模板已被其他操作更新；本次没有覆盖新版本，表单草稿仍保留。请重新读取模板后再继续。</span><ActionButton type="button" variant="secondary" disabled={busy} onClick={retryConflictedDraft}>重新读取当前模板</ActionButton></div> : null}
    <div className="grid gap-6 lg:grid-cols-2">
      <GlassPanel className="studio-sheen p-6">
        <h2 className="mb-5 text-lg font-semibold text-studio-text-primary">{editingId === null ? '新建模板' : '编辑模板'}</h2>
        <form onSubmit={(event) => void save(event)} className="space-y-4" aria-busy={writesLocked || loading}>
          <fieldset disabled={writesLocked || loading} className="m-0 min-w-0 space-y-4 border-0 p-0">
            <label className="block text-sm text-studio-text-secondary">名称<input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="xmt-field mt-2 w-full" /></label>
            <label className="block text-sm text-studio-text-secondary">平台<input value={form.platform} onChange={(event) => setForm((current) => ({ ...current, platform: event.target.value }))} placeholder="留空表示通用" className="xmt-field mt-2 w-full" /></label>
            <label className="block text-sm text-studio-text-secondary">说明<textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={2} className="xmt-field mt-2 w-full" /></label>
            <label className="block text-sm text-studio-text-secondary">模板正文<textarea required value={form.template_data} onChange={(event) => setForm((current) => ({ ...current, template_data: event.target.value }))} rows={8} className="xmt-field mt-2 w-full" /></label>
            <div className="flex flex-wrap gap-3"><ActionButton disabled={writesLocked || loading || baselineConflicted} type="submit" variant="primary">保存模板</ActionButton>{editingId !== null ? <ActionButton type="button" disabled={writesLocked || loading} onClick={cancelEdit}>取消编辑</ActionButton> : null}</div>
          </fieldset>
        </form>
      </GlassPanel>
      <GlassPanel className="studio-sheen p-6">
        <h2 className="mb-5 text-lg font-semibold text-studio-text-primary">已有模板</h2>
        {loading ? <LoadingState text="正在加载模板…" /> : initialLoadFailed && templates.length === 0 ? <p role="status" className="text-sm text-studio-text-secondary">列表读取失败，暂时无法确认已有模板。请使用上方按钮重新加载。</p> : templates.length === 0 ? <EmptyState icon={FileText} title="还没有选题模板" description="在左侧创建团队的第一个选题模板。" /> : <ul className="space-y-3">{templates.map((template) => <li key={template.id} className="rounded-card border border-studio-border-soft bg-studio-surface-soft p-4 transition-colors hover:border-studio-border-active"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="font-medium text-studio-text-primary">{template.name}</p><p className="mt-1 text-sm text-studio-text-secondary">{template.platform || '通用'} · {template.creator_name || '团队成员'}</p>{template.description ? <p className="mt-2 text-sm text-studio-text-secondary">{template.description}</p> : null}</div><div className="flex shrink-0 gap-2"><ActionButton type="button" variant="ghost" disabled={busy || Boolean(activeRecovery) || storageBlocked} onClick={() => edit(template)}>编辑</ActionButton><ActionButton type="button" variant="danger" disabled={busy || Boolean(activeRecovery) || storageBlocked} onClick={() => void remove(template)}>删除</ActionButton></div></div></li>)}</ul>}
      </GlassPanel>
    </div>
  </PageShell>;
}
