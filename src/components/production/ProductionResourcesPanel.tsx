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

export default function ProductionResourcesPanel({ productionId, canManage }: { productionId: number; canManage: boolean }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
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

  const addSelected = async () => {
    if (selectedIds.length === 0) return;
    setAdding(true);
    try {
      const response = await getProductionResourceInsertions(productionId, selectedIds);
      const insertion = buildMaterialInsertionHtml(response.data.map((item) => item.content_html));
      if (insertion) {
        const inserted = editorHandleRef.current?.insertHtmlAtSelectionOrEnd(insertion) ?? false;
        if (!inserted) scheduleSave(`${contentRef.current}${insertion}`);
      }
      if (response.empty_resource_ids.length > 0) {
        addNotification({ title: '部分资料未插入', message: '该资料暂无可插入的正文内容。', type: 'info' });
      }
      if (insertion) {
        addNotification({ title: '资料正文已插入', message: `已插入 ${response.data.length} 条资料正文`, type: 'success' });
      }
      setPickerOpen(false);
      setSelectedIds([]);
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
        {canManage ? <button type="button" onClick={() => setPickerOpen(true)} className="inline-flex items-center gap-2 rounded-button bg-studio-primary px-3 py-2 text-sm text-white"><Link2 className="h-4 w-4" />添加资料</button> : null}
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

    <BaseModal open={pickerOpen} onClose={() => setPickerOpen(false)} title="添加资料" size="lg">
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
              <span className="block truncate text-sm font-medium text-studio-text-primary">{result.title}</span>
              <span className="mt-1 block text-xs text-studio-text-muted">{libraryNames[result.library_type]} · {result.category?.name || '未分类'}</span>
              <span className="mt-2 line-clamp-2 block break-words text-xs leading-5 text-studio-text-secondary">{result.snippet.replace(/<\/?mark>/g, '') || result.summary || '暂无摘要'}</span>
            </span>
          </button>;
        }) : keyword ? <EmptyState title="暂无资料" /> : null}
      </div>
      <div className="mt-4 flex justify-end gap-2 border-t border-studio-border-soft pt-4">
        <button type="button" onClick={() => setPickerOpen(false)} className="rounded-button border border-studio-border-soft px-4 py-2 text-sm text-studio-text-secondary">取消</button>
        <button type="button" disabled={adding || selectedIds.length === 0} onClick={() => void addSelected()} className="rounded-button bg-studio-primary px-4 py-2 text-sm text-white disabled:opacity-50">{adding ? '插入中…' : `插入所选（${selectedIds.length}）`}</button>
      </div>
    </BaseModal>
  </>;
}
