import { Check, GripHorizontal, Link2, Search } from 'lucide-react';
import { FormEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getProductionMaterialDraft,
  getProductionResourceInsertions,
  updateProductionMaterialDraft,
} from '@/api/workflow';
import { searchResourceCenter, type LibraryType, type ResourceCategory } from '@/api/resourceCenter';
import { BaseModal, ErrorState, LoadingState } from '@/components/common';
import ContentEditor, { type EditorCommandHandle } from '@/components/ContentEditor';
import { EmptyState, GlassPanel, SearchBar } from '@/components/studio';
import { useAppStore, useAuthStore } from '@/store';
import { getUserFacingErrorMessage } from '@/lib/userFacingError';
import { clearSafeDraft, readSafeDraftValue, writeSafeDraft } from '@/platform/safe-draft';
import {
  buildMaterialInsertionHtml,
  canPersistMaterialDraft,
  clampMaterialWorkspaceHeight,
  DEFAULT_MATERIAL_WORKSPACE_HEIGHT,
  isProductionMaterialRecoveryDraft,
  materialWorkspaceStorageKey,
  productionMaterialDraftStorageKey,
  type ProductionMaterialRecoveryDraft,
} from './materialWorkspace';
import { getResourceUsageLabel, MAX_REFERENCE_EXCERPT_CHARS, referencedResourceIds, resourceIncludesExcerpt, type ResourceReference } from './resourceReference';

const libraryNames: Record<LibraryType, string> = {
  project: '项目资料库',
  content_archive: '内容档案库',
  knowledge: '知识库',
  media: '素材归档库',
};

type SearchResult = {
  resource_id: number;
  title: string;
  summary: string | null;
  snippet: string;
  library_type: LibraryType;
  category: ResourceCategory | null;
};
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'failed';
type SaveRecoveryPhase = 'checking' | 'unconfirmed' | 'retryable' | 'conflict' | 'followup' | 'restored';
type SaveRecovery = {
  phase: SaveRecoveryPhase;
  content: string;
  generation: number;
  baselineContent: string;
  baselineRevision: number;
};
type MaterialDraftLeaveState = { pending: boolean; canDiscard: boolean };
type MaterialDraftLeaveActions = { discard: () => boolean; copy: () => Promise<boolean> };

function mayHaveCommitted(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status !== 'number' || status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function isMaterialDraft(value: unknown, productionId: number): value is { production_id: number; content_html: string; revision: number } {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Record<string, unknown>;
  return draft.production_id === productionId
    && typeof draft.content_html === 'string'
    && Number.isSafeInteger(draft.revision)
    && Number(draft.revision) >= 0;
}

export default function ProductionResourcesPanel({ productionId, canManage, manuscriptHtml, referenceReady, onInsertReference, onLeaveStateChange, onRegisterLeaveActions }: {
  productionId: number;
  canManage: boolean;
  manuscriptHtml: string;
  referenceReady: boolean;
  onInsertReference: (resource: ResourceReference, excerpt?: string) => boolean;
  onLeaveStateChange?: (state: MaterialDraftLeaveState) => void;
  onRegisterLeaveActions?: (actions: MaterialDraftLeaveActions | null) => void;
}) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectedExcerpt, setSelectedExcerpt] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [editorResetSequence, setEditorResetSequence] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveRecovery, setSaveRecovery] = useState<SaveRecovery | null>(null);
  const [localDraftStorageFailed, setLocalDraftStorageFailed] = useState(false);
  const userId = useAuthStore((state) => state.user?.id || 0);
  const addNotification = useAppStore((state) => state.addNotification);
  const mountedRef = useRef(true);
  const draftReadyRef = useRef(false);
  const loadSequenceRef = useRef(0);
  const addingRef = useRef(false);
  const canManageRef = useRef(canManage);
  canManageRef.current = canManage;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const saveQueuedRef = useRef(false);
  const generationRef = useRef(0);
  const revisionRef = useRef(0);
  const savedContentRef = useRef('');
  const contentRef = useRef('');
  const hasUnsavedRef = useRef(false);
  const saveRecoveryRef = useRef<SaveRecovery | null>(null);
  const unlockRecoveryOnNextEditorReadyRef = useRef(false);
  const saveLatestRef = useRef<() => Promise<void>>(async () => undefined);
  const editorHandleRef = useRef<EditorCommandHandle | null>(null);
  const dragRef = useRef<{ y: number; height: number } | null>(null);
  const workspaceHeightRef = useRef(DEFAULT_MATERIAL_WORKSPACE_HEIGHT);
  const storageKey = useMemo(() => materialWorkspaceStorageKey(userId), [userId]);
  const materialDraftStorageKey = useMemo(() => productionMaterialDraftStorageKey(userId, productionId), [productionId, userId]);
  const [workspaceHeight, setWorkspaceHeight] = useState(DEFAULT_MATERIAL_WORKSPACE_HEIGHT);
  const materialDraftResourceIds = useMemo(() => pickerOpen ? referencedResourceIds(content) : new Set<number>(), [content, pickerOpen]);
  const manuscriptResourceIds = useMemo(() => pickerOpen ? referencedResourceIds(manuscriptHtml) : new Set<number>(), [manuscriptHtml, pickerOpen]);

  const assignSaveRecovery = useCallback((recovery: SaveRecovery | null) => {
    saveRecoveryRef.current = recovery;
    if (mountedRef.current) setSaveRecovery(recovery);
  }, []);

  const persistLocalDraft = useCallback((draftContent: string, baselineContent = savedContentRef.current, baselineRevision = revisionRef.current) => {
    if (!materialDraftStorageKey || !canPersistMaterialDraft(canManageRef.current)) return true;
    const saved = writeSafeDraft<ProductionMaterialRecoveryDraft>(materialDraftStorageKey, {
      version: 1,
      productionId,
      contentHtml: draftContent,
      baselineContentHtml: baselineContent,
      baselineRevision,
    });
    if (mountedRef.current) setLocalDraftStorageFailed(!saved);
    return saved;
  }, [materialDraftStorageKey, productionId]);

  const clearPersistedLocalDraft = useCallback(() => {
    if (!materialDraftStorageKey) return true;
    const cleared = clearSafeDraft(materialDraftStorageKey);
    if (cleared && mountedRef.current) setLocalDraftStorageFailed(false);
    return cleared;
  }, [materialDraftStorageKey]);

  const load = useCallback(async () => {
    if (addingRef.current || savingRef.current || hasUnsavedRef.current) return;
    const sequence = ++loadSequenceRef.current;
    draftReadyRef.current = false;
    setLoading(true);
    setFailed(false);
    try {
      const draft = await getProductionMaterialDraft(productionId);
      if (!mountedRef.current || sequence !== loadSequenceRef.current) return;
      savedContentRef.current = draft.content_html;
      revisionRef.current = draft.revision;
      generationRef.current = 0;
      setLocalDraftStorageFailed(false);
      const localDraft = canPersistMaterialDraft(canManageRef.current) && materialDraftStorageKey
        ? readSafeDraftValue<unknown>(materialDraftStorageKey)
        : null;
      if (isProductionMaterialRecoveryDraft(localDraft, productionId)) {
        if (localDraft.contentHtml === draft.content_html || localDraft.contentHtml === localDraft.baselineContentHtml) {
          clearPersistedLocalDraft();
          contentRef.current = draft.content_html;
          hasUnsavedRef.current = false;
          assignSaveRecovery(null);
          setSaveState('saved');
          setContent(draft.content_html);
        } else {
          contentRef.current = localDraft.contentHtml;
          hasUnsavedRef.current = true;
          generationRef.current = 1;
          const unchangedBaseline = localDraft.baselineRevision === draft.revision
            && localDraft.baselineContentHtml === draft.content_html;
          assignSaveRecovery({
            phase: unchangedBaseline ? 'restored' : 'conflict',
            content: localDraft.contentHtml,
            generation: generationRef.current,
            baselineContent: localDraft.baselineContentHtml,
            baselineRevision: localDraft.baselineRevision,
          });
          setSaveState('failed');
          setContent(localDraft.contentHtml);
        }
      } else {
        if (localDraft !== null && canPersistMaterialDraft(canManageRef.current) && materialDraftStorageKey) clearPersistedLocalDraft();
        contentRef.current = draft.content_html;
        hasUnsavedRef.current = false;
        assignSaveRecovery(null);
        setSaveState('saved');
        setContent(draft.content_html);
      }
      draftReadyRef.current = true;
    } catch {
      if (mountedRef.current && sequence === loadSequenceRef.current) setFailed(true);
    } finally {
      if (mountedRef.current && sequence === loadSequenceRef.current) setLoading(false);
    }
  }, [assignSaveRecovery, clearPersistedLocalDraft, materialDraftStorageKey, productionId]);

  const verifySaveRecovery = useCallback(async (attempt: SaveRecovery) => {
    const checking = { ...attempt, phase: 'checking' as const };
    assignSaveRecovery(checking);
    try {
      const draft = await getProductionMaterialDraft(productionId);
      if (!mountedRef.current || saveRecoveryRef.current !== checking) return;
      if (!isMaterialDraft(draft, productionId)) throw new Error('服务端返回的创作资料草稿信息不完整');

      revisionRef.current = draft.revision;
      savedContentRef.current = draft.content_html;
      if (draft.revision > attempt.baselineRevision && draft.content_html === attempt.content) {
        if (contentRef.current === draft.content_html) {
          hasUnsavedRef.current = false;
          clearPersistedLocalDraft();
          assignSaveRecovery(null);
          setSaveState('saved');
        } else {
          hasUnsavedRef.current = true;
          persistLocalDraft(contentRef.current, draft.content_html, draft.revision);
          assignSaveRecovery({ ...attempt, phase: 'followup' });
          setSaveState('failed');
        }
        return;
      }

      if (draft.revision === attempt.baselineRevision && draft.content_html === attempt.baselineContent) {
        assignSaveRecovery({ ...attempt, phase: 'retryable' });
      } else {
        hasUnsavedRef.current = contentRef.current !== draft.content_html;
        assignSaveRecovery({ ...attempt, phase: 'conflict' });
      }
      setSaveState('failed');
    } catch {
      if (!mountedRef.current || saveRecoveryRef.current !== checking) return;
      assignSaveRecovery({ ...attempt, phase: 'unconfirmed' });
      setSaveState('failed');
    }
  }, [assignSaveRecovery, clearPersistedLocalDraft, persistLocalDraft, productionId]);

  const saveLatest = useCallback(async () => {
    if (saveRecoveryRef.current) return;
    if (!canPersistMaterialDraft(canManage)) {
      hasUnsavedRef.current = false;
      saveQueuedRef.current = false;
      return;
    }
    if (savingRef.current) {
      saveQueuedRef.current = true;
      return;
    }
    savingRef.current = true;
    try {
      do {
        saveQueuedRef.current = false;
        const generation = generationRef.current;
        const snapshot = contentRef.current;
        const baselineContent = savedContentRef.current;
        const baselineRevision = revisionRef.current;
        if (mountedRef.current) setSaveState('saving');
        try {
          const updated = await updateProductionMaterialDraft(productionId, {
            content_html: snapshot,
            revision: revisionRef.current,
          });
          revisionRef.current = updated.revision;
          savedContentRef.current = updated.content_html;
          if (generation === generationRef.current) {
            hasUnsavedRef.current = false;
            clearPersistedLocalDraft();
            if (mountedRef.current) setSaveState('saved');
          } else {
            persistLocalDraft(contentRef.current, updated.content_html, updated.revision);
            saveQueuedRef.current = true;
          }
        } catch (error) {
          if (!mountedRef.current) return;
          setSaveState('failed');
          saveQueuedRef.current = false;
          if (mayHaveCommitted(error)) {
            const attempt: SaveRecovery = { phase: 'checking', content: snapshot, generation, baselineContent, baselineRevision };
            assignSaveRecovery(attempt);
            addNotification({ title: '创作资料保存结果待核实', message: '正在只读核对服务端版本，期间不会自动重发。', type: 'info' });
            await verifySaveRecovery(attempt);
          } else {
            addNotification({ title: '创作资料保存失败', message: getUserFacingErrorMessage(error, '创作资料暂时无法保存，请检查网络或权限后重试。'), type: 'error' });
          }
          return;
        }
      } while (saveQueuedRef.current);
    } finally {
      savingRef.current = false;
    }
  }, [addNotification, assignSaveRecovery, canManage, clearPersistedLocalDraft, persistLocalDraft, productionId, verifySaveRecovery]);

  const scheduleSave = useCallback((nextContent: string) => {
    if (!canPersistMaterialDraft(canManage) || !draftReadyRef.current || saveRecoveryRef.current) return;
    if (!savingRef.current && nextContent === savedContentRef.current) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      contentRef.current = nextContent;
      generationRef.current += 1;
      hasUnsavedRef.current = false;
      saveQueuedRef.current = false;
      clearPersistedLocalDraft();
      setSaveState('saved');
      return;
    }
    if (!contentRef.current.trim() && nextContent === '<p></p>') return;
    contentRef.current = nextContent;
    generationRef.current += 1;
    hasUnsavedRef.current = true;
    persistLocalDraft(nextContent);
    setContent(nextContent);
    setSaveState('dirty');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void saveLatest(), 800);
  }, [canManage, clearPersistedLocalDraft, persistLocalDraft, saveLatest]);

  const handleRecoveryAction = useCallback(() => {
    const recovery = saveRecoveryRef.current;
    if (!recovery || recovery.phase === 'checking' || !canManageRef.current) return;
    if (recovery.phase === 'unconfirmed' || recovery.phase === 'conflict') {
      void verifySaveRecovery(recovery);
      return;
    }
    assignSaveRecovery(null);
    hasUnsavedRef.current = contentRef.current !== savedContentRef.current;
    setSaveState(hasUnsavedRef.current ? 'dirty' : 'saved');
    if (hasUnsavedRef.current) void saveLatestRef.current();
  }, [assignSaveRecovery, verifySaveRecovery]);

  const discardRecoveredDraft = useCallback(() => {
    const recovery = saveRecoveryRef.current;
    if (!recovery || recovery.phase === 'checking' || recovery.phase === 'unconfirmed' || !canManageRef.current) return;
    if (!clearPersistedLocalDraft()) {
      addNotification({ title: '本机草稿仍未清除', message: '浏览器存储当前不可用，已保留本机内容。请先复制内容或恢复存储后重试。', type: 'error' });
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const serverContent = savedContentRef.current;
    contentRef.current = serverContent;
    generationRef.current += 1;
    hasUnsavedRef.current = false;
    saveQueuedRef.current = false;
    unlockRecoveryOnNextEditorReadyRef.current = true;
    setEditorResetSequence((current) => current + 1);
    setContent(serverContent);
    setSaveState('saved');
  }, [addNotification, clearPersistedLocalDraft]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { saveLatestRef.current = saveLatest; }, [saveLatest]);
  useEffect(() => {
    if (canManage) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    hasUnsavedRef.current = false;
    saveQueuedRef.current = false;
    setSaveState((current) => current === 'failed' || current === 'dirty' || current === 'saving' ? 'saved' : current);
  }, [canManage]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (hasUnsavedRef.current) void saveLatestRef.current();
      document.body.style.userSelect = '';
    };
  }, []);
  useEffect(() => {
    const stored = Number.parseInt(localStorage.getItem(storageKey) || '', 10);
    const height = clampMaterialWorkspaceHeight(Number.isFinite(stored) ? stored : DEFAULT_MATERIAL_WORKSPACE_HEIGHT, window.innerHeight);
    workspaceHeightRef.current = height;
    setWorkspaceHeight(height);
  }, [storageKey]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (saveState === 'dirty' || saveState === 'saving' || saveState === 'failed') event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveState]);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (addingRef.current) return;
    const term = keyword.trim();
    if (!term) return;
    setSearching(true);
    try {
      const response = await searchResourceCenter({ keyword: term });
      if (!mountedRef.current) return;
      setResults(response.data);
    } catch (error) {
      if (!mountedRef.current) return;
      addNotification({ title: '搜索失败', message: getUserFacingErrorMessage(error, '暂时无法搜索资料，请稍后重试。'), type: 'error' });
    } finally {
      if (mountedRef.current) setSearching(false);
    }
  };

  const openPicker = (excerpt: string | null) => {
    if (!canManageRef.current || saveRecoveryRef.current || !draftReadyRef.current || !editorHandleRef.current || addingRef.current) return;
    setSelectedExcerpt(excerpt);
    setSelectedIds([]);
    setPickerOpen(true);
  };

  const closePicker = () => {
    if (addingRef.current) return;
    setPickerOpen(false);
    setSelectedExcerpt(null);
  };

  const quoteSelectedExcerpt = () => {
    const excerpt = editorHandleRef.current?.getSelectedText();
    if (!excerpt) {
      addNotification({ title: '请先选中文字', message: '在创作资料中选中要引用的片段，再选择来源资料', type: 'info' });
      return;
    }
    if (excerpt.length > MAX_REFERENCE_EXCERPT_CHARS) {
      addNotification({ title: '选中内容过长', message: `一次最多引用 ${MAX_REFERENCE_EXCERPT_CHARS} 字，请缩小选区`, type: 'info' });
      return;
    }
    openPicker(excerpt);
  };

  const addSelected = async (destination: 'draft' | 'manuscript' | 'excerpt') => {
    if (addingRef.current || saveRecoveryRef.current || !canManageRef.current || !draftReadyRef.current || !editorHandleRef.current || searching) return;
    if (selectedIds.length === 0 || (destination !== 'draft' && selectedIds.length !== 1)) return;
    addingRef.current = true;
    setAdding(true);
    try {
      const response = await getProductionResourceInsertions(productionId, selectedIds);
      if (!mountedRef.current) return;
      if (!canManageRef.current || !draftReadyRef.current || !editorHandleRef.current) {
        throw new Error('当前资料不可编辑，原有内容已保留，请稍后重试。');
      }
      if (destination !== 'draft') {
        const resource = response.data[0];
        if (!resource) {
          addNotification({ title: '资料正文为空', message: '该资料暂无可引用的正文内容', type: 'info' });
          return;
        }
        if (destination === 'excerpt' && (!selectedExcerpt || !resourceIncludesExcerpt(resource, selectedExcerpt))) {
          addNotification({ title: '片段与来源不一致', message: '选中文字未在所选资料原文中找到，请换一条来源或重新选取原文', type: 'error' });
          return;
        }
        if (!onInsertReference(resource, destination === 'excerpt' ? selectedExcerpt || undefined : undefined)) {
          addNotification({ title: '引用失败', message: '当前稿件不可编辑，请稍后重试', type: 'error' });
          return;
        }
        addNotification({ title: '已引用到正文', message: `正文已加入“${resource.title}”${destination === 'excerpt' ? '的选中片段' : '的全文'}及来源链接`, type: 'success' });
      } else {
        const insertion = buildMaterialInsertionHtml(response.data);
        if (insertion) {
          const inserted = editorHandleRef.current?.insertHtmlAtSelectionOrEnd(insertion) ?? false;
          if (!inserted) throw new Error('资料尚未插入，原有草稿已保留，请稍后重试。');
          addNotification({ title: '资料正文已插入', message: `已插入 ${response.data.length} 条资料正文`, type: 'success' });
        }
      }
      if (response.empty_resource_ids.length > 0) {
        addNotification({ title: '部分资料未插入', message: '该资料暂无可插入的正文内容。', type: 'info' });
      }
      setPickerOpen(false);
      setSelectedIds([]);
      setSelectedExcerpt(null);
    } catch (error) {
      if (!mountedRef.current) return;
      addNotification({ title: '插入失败', message: getUserFacingErrorMessage(error, '资料暂时无法插入，请检查权限或稿件状态后重试。'), type: 'error' });
    } finally {
      addingRef.current = false;
      if (mountedRef.current) setAdding(false);
    }
  };

  const onResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = { y: event.clientY, height: workspaceHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.userSelect = 'none';
  };
  const onResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const height = clampMaterialWorkspaceHeight(dragRef.current.height + event.clientY - dragRef.current.y, window.innerHeight);
    workspaceHeightRef.current = height;
    setWorkspaceHeight(height);
  };
  const finishResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    document.body.style.userSelect = '';
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    localStorage.setItem(storageKey, String(workspaceHeightRef.current));
  };
  const resetHeight = () => {
    const height = clampMaterialWorkspaceHeight(DEFAULT_MATERIAL_WORKSPACE_HEIGHT, window.innerHeight);
    workspaceHeightRef.current = height;
    setWorkspaceHeight(height);
    localStorage.setItem(storageKey, String(height));
  };

  const workspaceReady = !loading && !failed && editorReady;
  const workspaceEditable = workspaceReady && !saveRecovery;
  const saveLabel = loading ? '正在读取…' : failed ? '尚未读取' : !editorReady ? '正在准备…'
    : saveRecovery?.phase === 'checking' ? '正在核实保存结果…'
      : saveRecovery?.phase === 'unconfirmed' ? '结果暂未确认'
        : saveRecovery?.phase === 'retryable' ? '结果未记录'
          : saveRecovery?.phase === 'conflict' ? '服务端已有更新'
            : saveRecovery?.phase === 'followup' ? '上次已保存，有新改动待保存'
              : saveRecovery?.phase === 'restored' ? '本机草稿待恢复'
              : saveState === 'failed' ? '保存失败' : saveState === 'saved' || saveState === 'idle' ? '已保存' : '保存中';
  const recoveryActionLabel = saveRecovery?.phase === 'checking' ? '正在核实…'
    : saveRecovery?.phase === 'retryable' ? '确认未记录，重试保存'
      : saveRecovery?.phase === 'followup' ? '保存后续修改'
        : saveRecovery?.phase === 'restored' ? '恢复并保存本机草稿' : '只读重新核实';
  const setEditorHandle = useCallback((handle: EditorCommandHandle | null) => {
    editorHandleRef.current = handle;
    setEditorReady(Boolean(handle));
    if (handle && unlockRecoveryOnNextEditorReadyRef.current) {
      unlockRecoveryOnNextEditorReadyRef.current = false;
      assignSaveRecovery(null);
    }
  }, [assignSaveRecovery]);
  const discardLocalDraftForLeave = useCallback(() => {
    if (savingRef.current || saveRecoveryRef.current?.phase === 'checking') return false;
    if (!clearPersistedLocalDraft()) {
      addNotification({ title: '本机草稿仍未清除', message: '浏览器存储当前不可用，已保留本机内容；请复制内容后重试。', type: 'error' });
      return false;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    hasUnsavedRef.current = false;
    saveQueuedRef.current = false;
    assignSaveRecovery(null);
    setSaveState('saved');
    return true;
  }, [addNotification, assignSaveRecovery, clearPersistedLocalDraft]);
  const copyLocalDraft = useCallback(async () => {
    const parsed = new DOMParser().parseFromString(contentRef.current, 'text/html');
    const text = parsed.body.innerText || parsed.body.textContent || '';
    if (!text.trim()) return false;
    await navigator.clipboard.writeText(text);
    return true;
  }, []);

  useEffect(() => {
    const pending = hasUnsavedRef.current;
    onLeaveStateChange?.({
      pending,
      canDiscard: pending && !savingRef.current && saveRecoveryRef.current?.phase !== 'checking',
    });
  }, [content, onLeaveStateChange, saveRecovery, saveState]);
  useEffect(() => {
    if (!onRegisterLeaveActions) return undefined;
    onRegisterLeaveActions({ discard: discardLocalDraftForLeave, copy: copyLocalDraft });
    return () => onRegisterLeaveActions(null);
  }, [copyLocalDraft, discardLocalDraftForLeave, onRegisterLeaveActions]);

  return <>
    <GlassPanel data-testid="production-resources-panel" className="relative flex min-w-0 flex-col overflow-hidden" style={{ height: workspaceHeight }}>
      <div className="z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-studio-border-soft bg-studio-surface/95 px-5 py-3 backdrop-blur">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-semibold text-studio-text-primary">创作资料</h2>
              <span className={`text-xs ${saveState === 'failed' || saveRecovery ? 'text-studio-coral-contrast' : 'text-studio-text-muted'}`} role={saveRecovery ? 'status' : undefined}>{saveLabel}</span>
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-studio-text-secondary">
              这是独立保存的资料草稿，不会自动修改正式正文；“加入草稿”和“引用到正文”是两项独立操作。原资料更新或移入回收站后，已复制内容仍会保留；回收的资料可能无法打开。
            </p>
          </div>
          {canManage && saveRecovery ? <button type="button" onClick={handleRecoveryAction} disabled={saveRecovery.phase === 'checking'} className="xmt-btn xmt-btn-ghost px-2 py-1 text-xs text-studio-cyan-contrast underline-offset-2 hover:underline">{recoveryActionLabel}</button>
            : canManage && saveState === 'failed' ? <span className="text-xs text-studio-text-muted">请先处理保存错误</span> : null}
          {saveRecovery?.phase === 'retryable' ? <span className="text-xs text-studio-text-secondary">已核实服务端仍是原版本；点击按钮后才会再次保存。</span> : null}
          {saveRecovery?.phase === 'conflict' ? <span className="text-xs text-studio-text-secondary">本地编辑已保留，服务端基线已更新；不会自动覆盖。</span> : null}
          {saveRecovery?.phase === 'unconfirmed' ? <span className="text-xs text-studio-text-secondary">核实请求失败；当前仅可重新核实，不会重发保存。</span> : null}
          {saveRecovery?.phase === 'followup' ? <span className="text-xs text-studio-text-secondary">上次内容已保存；后续编辑仍留在本地。</span> : null}
          {saveRecovery?.phase === 'restored' ? <span className="text-xs text-studio-text-secondary">已找回上次未完成的本机修改；服务端仍是原版本，选择恢复后才会保存。</span> : null}
          {localDraftStorageFailed ? <span role="status" className="text-xs text-studio-coral-contrast">本机恢复副本未能保存，刷新或关闭页面可能丢失这次修改。</span> : null}
        </div>
        {canManage ? <div className="flex flex-wrap items-center gap-2">
          {saveRecovery && ['restored', 'retryable', 'conflict', 'followup'].includes(saveRecovery.phase) ? <button type="button" onClick={discardRecoveredDraft} className="xmt-btn xmt-btn-ghost">采用服务器版本并舍弃本机修改</button> : null}
          <button type="button" onClick={quoteSelectedExcerpt} disabled={!referenceReady || !workspaceEditable || adding} className="xmt-btn xmt-btn-ghost">引用选中片段</button>
          <button type="button" onClick={() => openPicker(null)} disabled={!workspaceEditable || adding} className="xmt-btn xmt-btn-primary"><Link2 className="h-4 w-4" />添加资料</button>
        </div> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[var(--editor-bg)] pb-5">
        {loading ? <div className="p-4"><LoadingState type="table" rows={2} /></div> : failed ? <div className="p-4"><ErrorState onRetry={() => void load()} /></div> : <ContentEditor
          key={`${productionId}:${editorResetSequence}`}
          ariaLabel="创作资料正文"
          value={content}
          onChange={scheduleSave}
          readOnly={!canManage || Boolean(saveRecovery)}
          mode="rich"
          immersive
          toolbarVariant="basic"
          toolbarStickyTop="0px"
          minHeight="100%"
          className="min-h-full [&_.editor-content]:px-5 [&_.editor-content]:py-5 [&_.editor-content]:text-[15px] [&_.editor-content]:leading-7 [&_.editor-content_a]:break-all"
          placeholder="可从资料库插入资料，也可以直接在这里粘贴或整理文字……"
          onEditorCommandHandleChange={setEditorHandle}
        />}
      </div>

      <div
        role="separator"
        aria-label="拖动调整创作资料区域高度，双击恢复默认高度"
        aria-orientation="horizontal"
        aria-valuemin={240}
        aria-valuemax={Math.max(240, Math.floor((typeof window === 'undefined' ? 800 : window.innerHeight) * 0.75))}
        aria-valuenow={workspaceHeight}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            const height = clampMaterialWorkspaceHeight(workspaceHeightRef.current + (event.key === 'ArrowUp' ? -20 : 20), window.innerHeight);
            workspaceHeightRef.current = height;
            setWorkspaceHeight(height);
            localStorage.setItem(storageKey, String(height));
          }
          if (event.key === 'Home') resetHeight();
        }}
        onDoubleClick={resetHeight}
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={finishResize}
        onPointerCancel={finishResize}
        className="absolute inset-x-0 bottom-0 z-20 flex h-5 cursor-ns-resize touch-none items-center justify-center border-t border-studio-border-soft bg-studio-surface/95 text-studio-text-muted"
      ><GripHorizontal className="h-4 w-4" /></div>
    </GlassPanel>

    <BaseModal open={pickerOpen} onClose={closePicker} closeOnOverlayClick={!adding} closeOnEscape={!adding} showCloseButton={!adding} title={selectedExcerpt ? '选择片段来源' : '添加资料'} size="lg">
      {selectedExcerpt ? <p className="mb-3 rounded-card border border-studio-border-soft bg-studio-surface-soft/50 px-3 py-2 text-xs text-studio-text-secondary">已选中 {selectedExcerpt.length} 字，请选择原文所在的资料。只有能在资料原文中找到的片段才能引用。</p> : null}
      <form onSubmit={search} className="flex gap-3">
        <SearchBar value={keyword} onChange={(event) => { if (!addingRef.current) setKeyword(event.target.value); }} disabled={adding} placeholder="搜索资料标题或正文" className="flex-1" />
        <button type="submit" disabled={adding || searching} className="xmt-btn xmt-btn-primary"><Search className="mr-2 inline h-4 w-4" />搜索</button>
      </form>
      {adding ? <p role="status" className="mt-3 text-sm text-studio-text-secondary">正在插入资料，请稍候…</p> : null}
      <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto">
        {searching ? <LoadingState type="inline" /> : results.length ? results.map((result) => {
          const selected = selectedIds.includes(result.resource_id);
          const usageLabel = getResourceUsageLabel(result.resource_id, materialDraftResourceIds, manuscriptResourceIds);
          return <button
            key={result.resource_id}
            type="button"
            disabled={adding}
            onClick={() => {
              if (addingRef.current) return;
              setSelectedIds((current) => selected ? current.filter((id) => id !== result.resource_id) : [...current, result.resource_id]);
            }}
            className={`flex w-full items-start gap-3 rounded-card border p-3 text-left ${selected ? 'border-studio-cyan bg-studio-cyan/5' : 'border-studio-border-soft'}`}
          >
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${selected ? 'border-studio-cyan bg-studio-cyan-soft text-studio-cyan-contrast' : 'border-studio-border-active'}`}>{selected ? <Check className="h-3.5 w-3.5" /> : null}</span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-studio-text-primary">
                <span className="min-w-0 truncate">{result.title}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${usageLabel === '待用' ? 'bg-studio-surface-soft text-studio-text-muted' : 'bg-studio-success/12 text-studio-success-contrast'}`}>
                  {usageLabel}
                </span>
              </span>
              <span className="mt-1 block text-xs text-studio-text-muted">{libraryNames[result.library_type]} · {result.category?.name || '未分类'}</span>
              <span className="mt-2 line-clamp-2 block break-words text-xs leading-5 text-studio-text-secondary">{result.snippet.replace(/<\/?mark>/g, '') || result.summary || '暂无摘要'}</span>
            </span>
          </button>;
        }) : keyword ? <EmptyState title="暂无资料" /> : null}
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-studio-border-soft pt-4">
        <button type="button" disabled={adding} onClick={closePicker} className="xmt-btn xmt-btn-ghost">取消</button>
        <button type="button" disabled={adding || searching || !workspaceEditable || selectedIds.length === 0} onClick={() => void addSelected('draft')} className="xmt-btn xmt-btn-ghost">{adding ? '插入中…' : `加入资料草稿（${selectedIds.length}）`}</button>
        <button type="button" disabled={adding || searching || !workspaceEditable || selectedIds.length !== 1 || !referenceReady} onClick={() => void addSelected(selectedExcerpt ? 'excerpt' : 'manuscript')} className="xmt-btn xmt-btn-primary">{selectedExcerpt ? '引用选中片段' : '引用到正文'}</button>
      </div>
    </BaseModal>
  </>;
}
