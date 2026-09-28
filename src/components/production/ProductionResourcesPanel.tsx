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
import {
  buildMaterialInsertionHtml,
  canPersistMaterialDraft,
  clampMaterialWorkspaceHeight,
  DEFAULT_MATERIAL_WORKSPACE_HEIGHT,
  materialWorkspaceStorageKey,
} from './materialWorkspace';
import { MAX_REFERENCE_EXCERPT_CHARS, referencedResourceIds, resourceIncludesExcerpt, type ResourceReference } from './resourceReference';

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

export default function ProductionResourcesPanel({ productionId, canManage, manuscriptHtml, referenceReady, onInsertReference }: {
  productionId: number;
  canManage: boolean;
  manuscriptHtml: string;
  referenceReady: boolean;
  onInsertReference: (resource: ResourceReference, excerpt?: string) => boolean;
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
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const userId = useAuthStore((state) => state.user?.id || 0);
  const addNotification = useAppStore((state) => state.addNotification);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const saveQueuedRef = useRef(false);
  const generationRef = useRef(0);
  const revisionRef = useRef(0);
  const contentRef = useRef('');
  const hasUnsavedRef = useRef(false);
  const saveLatestRef = useRef<() => Promise<void>>(async () => undefined);
  const editorHandleRef = useRef<EditorCommandHandle | null>(null);
  const dragRef = useRef<{ y: number; height: number } | null>(null);
  const workspaceHeightRef = useRef(DEFAULT_MATERIAL_WORKSPACE_HEIGHT);
  const storageKey = useMemo(() => materialWorkspaceStorageKey(userId), [userId]);
  const [workspaceHeight, setWorkspaceHeight] = useState(DEFAULT_MATERIAL_WORKSPACE_HEIGHT);
  const usedResourceIds = useMemo(() => pickerOpen ? referencedResourceIds(manuscriptHtml) : new Set<number>(), [manuscriptHtml, pickerOpen]);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const draft = await getProductionMaterialDraft(productionId);
      if (!mountedRef.current) return;
      contentRef.current = draft.content_html;
      revisionRef.current = draft.revision;
      generationRef.current = 0;
      hasUnsavedRef.current = false;
      setContent(draft.content_html);
      setSaveState('saved');
    } catch {
      if (mountedRef.current) setFailed(true);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [productionId]);

  const saveLatest = useCallback(async () => {
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
        if (mountedRef.current) setSaveState('saving');
        try {
          const updated = await updateProductionMaterialDraft(productionId, {
            content_html: snapshot,
            revision: revisionRef.current,
          });
          revisionRef.current = updated.revision;
          if (generation === generationRef.current) {
            hasUnsavedRef.current = false;
            if (mountedRef.current) setSaveState('saved');
          } else {
            saveQueuedRef.current = true;
          }
        } catch (error) {
          if (!mountedRef.current) return;
          setSaveState('failed');
          addNotification({ title: '创作资料保存失败', message: (error as Error).message, type: 'error' });
          return;
        }
      } while (saveQueuedRef.current);
    } finally {
      savingRef.current = false;
    }
  }, [addNotification, canManage, productionId]);

  const scheduleSave = useCallback((nextContent: string) => {
    if (!canPersistMaterialDraft(canManage)) return;
    if (!contentRef.current.trim() && nextContent === '<p></p>') return;
    contentRef.current = nextContent;
    generationRef.current += 1;
    hasUnsavedRef.current = true;
    setContent(nextContent);
    setSaveState('dirty');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void saveLatest(), 800);
  }, [canManage, saveLatest]);

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
    const term = keyword.trim();
    if (!term) return;
    setSearching(true);
    try {
      setResults((await searchResourceCenter({ keyword: term })).data);
    } catch (error) {
      addNotification({ title: '搜索失败', message: (error as Error).message, type: 'error' });
    } finally {
      setSearching(false);
    }
  };

  const openPicker = (excerpt: string | null) => {
    setSelectedExcerpt(excerpt);
    setSelectedIds([]);
    setPickerOpen(true);
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
    if (selectedIds.length === 0 || (destination !== 'draft' && selectedIds.length !== 1)) return;
    setAdding(true);
    try {
      const response = await getProductionResourceInsertions(productionId, selectedIds);
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
        const insertion = buildMaterialInsertionHtml(response.data.map((item) => item.content_html));
        if (insertion) {
          const inserted = editorHandleRef.current?.insertHtmlAtSelectionOrEnd(insertion) ?? false;
          if (!inserted) scheduleSave(`${contentRef.current}${insertion}`);
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
      addNotification({ title: '插入失败', message: (error as Error).message, type: 'error' });
    } finally {
      setAdding(false);
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

  const saveLabel = saveState === 'failed' ? '保存失败' : saveState === 'saved' || saveState === 'idle' ? '已保存' : '保存中';
  const setEditorHandle = useCallback((handle: EditorCommandHandle | null) => { editorHandleRef.current = handle; }, []);

  return <>
    <GlassPanel className="relative flex min-w-0 flex-col overflow-hidden" style={{ height: workspaceHeight }}>
      <div className="z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-studio-border-soft bg-studio-surface/95 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-studio-text-primary">创作资料</h2>
          <span className={`text-xs ${saveState === 'failed' ? 'text-studio-coral-contrast' : 'text-studio-text-muted'}`}>{saveLabel}</span>
          {canManage && saveState === 'failed' ? <button type="button" onClick={() => void saveLatest()} className="text-xs text-studio-cyan">重试</button> : null}
        </div>
        {canManage ? <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={quoteSelectedExcerpt} disabled={!referenceReady || loading} className="xmt-btn xmt-btn-ghost">引用选中片段</button>
          <button type="button" onClick={() => openPicker(null)} className="inline-flex items-center gap-2 rounded-button bg-studio-primary px-3 py-2 text-sm text-white"><Link2 className="h-4 w-4" />添加资料</button>
        </div> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[var(--editor-bg)] pb-5">
        {loading ? <div className="p-4"><LoadingState type="table" rows={2} /></div> : failed ? <div className="p-4"><ErrorState onRetry={() => void load()} /></div> : <ContentEditor
          value={content}
          onChange={scheduleSave}
          readOnly={!canManage}
          mode="rich"
          immersive
          toolbarVariant="basic"
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

    <BaseModal open={pickerOpen} onClose={() => { setPickerOpen(false); setSelectedExcerpt(null); }} title={selectedExcerpt ? '选择片段来源' : '添加资料'} size="lg">
      {selectedExcerpt ? <p className="mb-3 rounded-card border border-studio-border-soft bg-studio-surface-soft/50 px-3 py-2 text-xs text-studio-text-secondary">已选中 {selectedExcerpt.length} 字，请选择原文所在的资料。只有能在资料原文中找到的片段才能引用。</p> : null}
      <form onSubmit={search} className="flex gap-3">
        <SearchBar value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索资料标题或正文" className="flex-1" />
        <button type="submit" className="rounded-button bg-studio-primary px-4 text-sm text-white"><Search className="mr-2 inline h-4 w-4" />搜索</button>
      </form>
      <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto">
        {searching ? <LoadingState type="inline" /> : results.length ? results.map((result) => {
          const selected = selectedIds.includes(result.resource_id);
          return <button
            key={result.resource_id}
            type="button"
            onClick={() => setSelectedIds((current) => selected ? current.filter((id) => id !== result.resource_id) : [...current, result.resource_id])}
            className={`flex w-full items-start gap-3 rounded-card border p-3 text-left ${selected ? 'border-studio-cyan bg-studio-cyan/5' : 'border-studio-border-soft'}`}
          >
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${selected ? 'border-studio-cyan bg-studio-cyan text-white' : 'border-studio-border-active'}`}>{selected ? <Check className="h-3.5 w-3.5" /> : null}</span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-studio-text-primary">
                <span className="min-w-0 truncate">{result.title}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${usedResourceIds.has(result.resource_id) ? 'bg-studio-success/12 text-studio-success-contrast' : 'bg-studio-surface-soft text-studio-text-muted'}`}>
                  {usedResourceIds.has(result.resource_id) ? '已用' : '待用'}
                </span>
              </span>
              <span className="mt-1 block text-xs text-studio-text-muted">{libraryNames[result.library_type]} · {result.category?.name || '未分类'}</span>
              <span className="mt-2 line-clamp-2 block break-words text-xs leading-5 text-studio-text-secondary">{result.snippet.replace(/<\/?mark>/g, '') || result.summary || '暂无摘要'}</span>
            </span>
          </button>;
        }) : keyword ? <EmptyState title="暂无资料" /> : null}
      </div>
      <div className="mt-4 flex justify-end gap-2 border-t border-studio-border-soft pt-4">
        <button type="button" onClick={() => { setPickerOpen(false); setSelectedExcerpt(null); }} className="rounded-button border border-studio-border-soft px-4 py-2 text-sm text-studio-text-secondary">取消</button>
        <button type="button" disabled={adding || selectedIds.length === 0} onClick={() => void addSelected('draft')} className="xmt-btn xmt-btn-ghost">{adding ? '插入中…' : `加入资料草稿（${selectedIds.length}）`}</button>
        <button type="button" disabled={adding || selectedIds.length !== 1 || !referenceReady} onClick={() => void addSelected(selectedExcerpt ? 'excerpt' : 'manuscript')} className="xmt-btn xmt-btn-primary">{selectedExcerpt ? '引用选中片段' : '引用到正文'}</button>
      </div>
    </BaseModal>
  </>;
}
