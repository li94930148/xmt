import { Check, ExternalLink, FilePlus2, GripHorizontal, Library, Link2, Pencil, Search, Trash2 } from 'lucide-react';
import { FormEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addProductionResources,
  createManualProductionMaterial,
  getProductionResources,
  removeProductionMaterial,
  updateProductionMaterial,
  type ProductionResource,
} from '@/api/workflow';
import { searchResourceCenter, type LibraryType, type ResourceCategory } from '@/api/resourceCenter';
import { BaseModal, ConfirmModal, ErrorState, LoadingState } from '@/components/common';
import ContentEditor from '@/components/ContentEditor';
import { EmptyState, GlassPanel, SearchBar } from '@/components/studio';
import { useAppStore, useAuthStore } from '@/store';
import { formatBeijingTime } from '@/lib/utils';
import { sanitizeHtml } from '@/utils/sanitizeHtml';
import {
  clampMaterialWorkspaceHeight,
  DEFAULT_MATERIAL_WORKSPACE_HEIGHT,
  materialWorkspaceStorageKey,
} from './materialWorkspace';

const libraryNames: Record<LibraryType, string> = { project: '项目资料库', content_archive: '内容档案库', knowledge: '知识库', media: '素材归档库' };
type SearchResult = { resource_id: number; title: string; summary: string | null; snippet: string; library_type: LibraryType; category: ResourceCategory | null };
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'failed';

function validSourceUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch { return null; }
}

export default function ProductionResourcesPanel({ productionId, canManage }: { productionId: number; canManage: boolean }) {
  const [items, setItems] = useState<ProductionResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualContent, setManualContent] = useState('');
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<ProductionResource | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const userId = useAuthStore((state) => state.user?.id || 0);
  const appStore = useAppStore();
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const generationRef = useRef(0);
  const revisionRef = useRef(1);
  const draftRef = useRef({ title: '', content: '' });
  const dragRef = useRef<{ y: number; height: number } | null>(null);
  const workspaceHeightRef = useRef(DEFAULT_MATERIAL_WORKSPACE_HEIGHT);
  const storageKey = useMemo(() => materialWorkspaceStorageKey(userId), [userId]);
  const [workspaceHeight, setWorkspaceHeight] = useState(DEFAULT_MATERIAL_WORKSPACE_HEIGHT);

  const load = useCallback(async () => {
    setLoading(true); setFailed(false);
    try { setItems(await getProductionResources(productionId)); } catch { setFailed(true); } finally { setLoading(false); }
  }, [productionId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { mountedRef.current = false; if (timerRef.current) clearTimeout(timerRef.current); document.body.style.userSelect = ''; }, []);
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

  const flushSave = useCallback(async () => {
    if (savingRef.current || editingId === null) return;
    const generation = generationRef.current;
    const snapshot = { ...draftRef.current };
    savingRef.current = true;
    setSaveState('saving');
    try {
      const updated = await updateProductionMaterial(productionId, editingId, { title: snapshot.title, content_html: snapshot.content, revision: revisionRef.current });
      revisionRef.current = updated.revision;
      if (!mountedRef.current) return;
      setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (generation === generationRef.current) setSaveState('saved');
    } catch (error) {
      if (!mountedRef.current) return;
      setSaveState('failed');
      appStore.addNotification({ title: '资料保存失败', message: (error as Error).message, type: 'error' });
    } finally {
      savingRef.current = false;
      if (mountedRef.current && generation !== generationRef.current) void flushSave();
    }
  }, [appStore, editingId, productionId]);

  const scheduleSave = useCallback((title: string, content: string) => {
    draftRef.current = { title, content };
    generationRef.current += 1;
    setSaveState('dirty');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flushSave(), 800);
  }, [flushSave]);

  const startEditing = (item: ProductionResource) => {
    if (editingId !== null && editingId !== item.id) {
      appStore.addNotification({ title: '请先完成当前资料编辑', message: '当前修改会自动保存，保存完成后可编辑另一条资料。', type: 'info' });
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setEditingId(item.id); setDraftTitle(item.title); setDraftContent(item.content_html);
    draftRef.current = { title: item.title, content: item.content_html };
    revisionRef.current = item.revision; generationRef.current = 0; setSaveState('idle');
  };

  const search = async (event: FormEvent) => {
    event.preventDefault();
    const term = keyword.trim();
    if (!term) return;
    setSearching(true);
    try { setResults((await searchResourceCenter({ keyword: term })).data); }
    catch (error) { appStore.addNotification({ title: '搜索失败', message: (error as Error).message, type: 'error' }); }
    finally { setSearching(false); }
  };

  const addSelected = async () => {
    if (selectedIds.size === 0) return;
    setAdding(true);
    try {
      const response = await addProductionResources(productionId, [...selectedIds]);
      setItems(response.data); setPickerOpen(false); setAddMenuOpen(false); setSelectedIds(new Set());
      appStore.addNotification({ title: '资料已添加', message: response.skipped_resource_ids.length ? `已跳过 ${response.skipped_resource_ids.length} 条重复资料` : `已添加 ${selectedIds.size} 条资料`, type: 'success' });
    } catch (error) { appStore.addNotification({ title: '添加失败', message: (error as Error).message, type: 'error' }); }
    finally { setAdding(false); }
  };

  const createManual = async () => {
    setCreating(true);
    try {
      const item = await createManualProductionMaterial(productionId, { title: manualTitle, content_html: manualContent });
      setItems((current) => [...current, item]); setManualOpen(false); setAddMenuOpen(false); setManualTitle(''); setManualContent('');
      appStore.addNotification({ title: '手动资料已创建', message: item.title, type: 'success' });
    } catch (error) { appStore.addNotification({ title: '创建失败', message: (error as Error).message, type: 'error' }); }
    finally { setCreating(false); }
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
    dragRef.current = null; document.body.style.userSelect = '';
    event.currentTarget.releasePointerCapture(event.pointerId);
    localStorage.setItem(storageKey, String(workspaceHeightRef.current));
  };
  const resetHeight = () => {
    const height = clampMaterialWorkspaceHeight(DEFAULT_MATERIAL_WORKSPACE_HEIGHT, window.innerHeight);
    workspaceHeightRef.current = height; setWorkspaceHeight(height); localStorage.setItem(storageKey, String(height));
  };

  const finishEditing = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (saveState === 'dirty' || saveState === 'failed') void flushSave();
    setEditingId(null);
  };

  const saveLabel = saveState === 'dirty' ? '未保存' : saveState === 'saving' ? '保存中' : saveState === 'saved' ? '已保存' : saveState === 'failed' ? '保存失败，可重试' : '已保存';

  return <>
    <GlassPanel className="relative flex min-w-0 flex-col overflow-hidden" style={{ height: workspaceHeight }}>
      <div className="z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-studio-border-soft bg-studio-surface/95 px-5 py-3 backdrop-blur">
        <div><div className="flex items-center gap-2"><h2 className="text-sm font-semibold text-studio-text-primary">创作资料</h2><span className="rounded-full bg-studio-surface-soft px-2 py-0.5 text-xs text-studio-text-secondary">{items.length}</span><span className={`text-xs ${saveState === 'failed' ? 'text-studio-coral-contrast' : 'text-studio-text-muted'}`}>{saveLabel}</span>{saveState === 'failed' ? <button type="button" onClick={() => void flushSave()} className="text-xs text-studio-cyan">重试</button> : null}</div><p className="mt-1 text-xs text-studio-text-muted">整理正式写作前需要参考的文字、摘录和笔记</p></div>
        {canManage ? <div className="relative"><button type="button" onClick={() => setAddMenuOpen((open) => !open)} className="inline-flex items-center gap-2 rounded-button bg-studio-primary px-3 py-2 text-sm text-white"><Link2 className="h-4 w-4" />添加资料</button>{addMenuOpen ? <div className="absolute right-0 top-11 z-20 w-48 rounded-card border border-studio-border-soft bg-studio-surface p-1 shadow-xl"><button type="button" onClick={() => { setPickerOpen(true); setAddMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-button px-3 py-2 text-left text-sm text-studio-text-primary hover:bg-studio-surface-soft"><Library className="h-4 w-4" />从资料库添加</button><button type="button" onClick={() => { setManualOpen(true); setAddMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-button px-3 py-2 text-left text-sm text-studio-text-primary hover:bg-studio-surface-soft"><FilePlus2 className="h-4 w-4" />新建手动资料</button></div> : null}</div> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-7">
        {loading ? <LoadingState type="table" rows={2} /> : failed ? <ErrorState onRetry={() => void load()} /> : items.length === 0 ? <EmptyState title="还没有创作资料，可从资料库添加，或粘贴你搜集的文字。" /> : <div className="space-y-3">{items.map((item) => {
          const sourceUrl = validSourceUrl(item.source_url);
          const editing = editingId === item.id;
          return <article key={item.id} className="overflow-hidden rounded-card border border-studio-border-soft bg-studio-surface-soft/35">
            <div className="flex items-start justify-between gap-3 border-b border-studio-border-soft px-4 py-3"><div className="min-w-0 flex-1">{editing ? <input value={draftTitle} maxLength={200} onChange={(event) => { setDraftTitle(event.target.value); scheduleSave(event.target.value, draftContent); }} className="w-full rounded-button border border-studio-border-active bg-studio-surface px-3 py-2 text-sm font-semibold text-studio-text-primary outline-none" aria-label="资料标题" /> : <h3 className="break-words text-sm font-semibold text-studio-text-primary">{item.title}</h3>}<p className="mt-1 text-xs text-studio-text-muted">{item.material_type === 'library' ? '资料库引用' : '手动资料'} · {item.source_name || '手动整理'} · 更新于 {formatBeijingTime(item.updated_at)}</p></div><div className="flex shrink-0 items-center gap-1">{sourceUrl ? <a aria-label="查看来源" href={sourceUrl} target="_blank" rel="noreferrer" className="rounded-button p-2 text-studio-text-muted hover:bg-studio-surface-soft hover:text-studio-cyan-contrast"><ExternalLink className="h-4 w-4" /></a> : null}{canManage ? <button type="button" aria-label={editing ? '完成编辑' : '编辑资料'} onClick={() => editing ? finishEditing() : startEditing(item)} className="rounded-button p-2 text-studio-text-muted hover:bg-studio-surface-soft hover:text-studio-cyan-contrast">{editing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}</button> : null}{canManage ? <button type="button" aria-label="删除资料" disabled={removingId === item.id || editing} onClick={() => setRemoving(item)} className="rounded-button p-2 text-studio-text-muted hover:bg-studio-coral/10 hover:text-studio-coral-contrast disabled:opacity-50"><Trash2 className="h-4 w-4" /></button> : null}</div></div>
            {editing ? <div className="bg-[var(--editor-bg)]"><ContentEditor value={draftContent} onChange={(content) => { setDraftContent(content); scheduleSave(draftTitle, content); }} mode="rich" minHeight={220} placeholder="粘贴或整理资料正文…" /></div> : item.content_html ? <div className="production-material-content prose max-w-none break-words px-4 py-4 text-sm leading-7 text-studio-text-primary prose-a:break-all" dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.content_html) }} /> : <p className="px-4 py-6 text-sm text-studio-text-muted">暂无正文内容</p>}
          </article>;
        })}</div>}
      </div>
      <div role="separator" aria-label="拖动调整创作资料区域高度，双击恢复默认高度" aria-orientation="horizontal" aria-valuemin={240} aria-valuemax={Math.max(240, Math.floor((typeof window === 'undefined' ? 800 : window.innerHeight) * 0.75))} aria-valuenow={workspaceHeight} tabIndex={0} onKeyDown={(event) => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); const delta = event.key === 'ArrowUp' ? -20 : 20; const height = clampMaterialWorkspaceHeight(workspaceHeightRef.current + delta, window.innerHeight); workspaceHeightRef.current = height; setWorkspaceHeight(height); localStorage.setItem(storageKey, String(height)); } if (event.key === 'Home') resetHeight(); }} onDoubleClick={resetHeight} onPointerDown={onResizeStart} onPointerMove={onResizeMove} onPointerUp={finishResize} onPointerCancel={finishResize} className="absolute inset-x-0 bottom-0 z-20 flex h-5 cursor-ns-resize touch-none items-center justify-center border-t border-studio-border-soft bg-studio-surface/95 text-studio-text-muted"><GripHorizontal className="h-4 w-4" /></div>
    </GlassPanel>

    <BaseModal open={pickerOpen} onClose={() => setPickerOpen(false)} title="从资料库添加" size="lg"><form onSubmit={search} className="flex gap-3"><SearchBar value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索资料标题或正文" className="flex-1" /><button type="submit" className="rounded-button bg-studio-primary px-4 text-sm text-white"><Search className="mr-2 inline h-4 w-4" />搜索</button></form><div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto">{searching ? <LoadingState type="inline" /> : results.length ? results.map((result) => { const selected = selectedIds.has(result.resource_id); const added = items.some((item) => item.source_resource_id === result.resource_id); return <button key={result.resource_id} type="button" disabled={added} onClick={() => setSelectedIds((current) => { const next = new Set(current); if (selected) next.delete(result.resource_id); else next.add(result.resource_id); return next; })} className={`flex w-full items-start gap-3 rounded-card border p-3 text-left ${selected ? 'border-studio-cyan bg-studio-cyan/5' : 'border-studio-border-soft'} disabled:opacity-55`}><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${selected ? 'border-studio-cyan bg-studio-cyan text-white' : 'border-studio-border-active'}`}>{selected ? <Check className="h-3.5 w-3.5" /> : null}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-studio-text-primary">{result.title}</span><span className="mt-1 block text-xs text-studio-text-muted">{libraryNames[result.library_type]} · {result.category?.name || '未分类'}{added ? ' · 已添加' : ''}</span><span className="mt-2 line-clamp-2 block break-words text-xs leading-5 text-studio-text-secondary">{result.snippet.replace(/<\/?mark>/g, '') || result.summary || '暂无摘要'}</span></span></button>; }) : keyword ? <EmptyState title="暂无资料" /> : null}</div><div className="mt-4 flex justify-end gap-2 border-t border-studio-border-soft pt-4"><button type="button" onClick={() => setPickerOpen(false)} className="rounded-button border border-studio-border-soft px-4 py-2 text-sm text-studio-text-secondary">取消</button><button type="button" disabled={adding || selectedIds.size === 0} onClick={() => void addSelected()} className="rounded-button bg-studio-primary px-4 py-2 text-sm text-white disabled:opacity-50">{adding ? '添加中…' : `添加所选（${selectedIds.size}）`}</button></div></BaseModal>

    <BaseModal open={manualOpen} onClose={() => setManualOpen(false)} title="新建手动资料" size="lg"><label className="block text-sm text-studio-text-secondary">标题（可选）<input value={manualTitle} maxLength={200} onChange={(event) => setManualTitle(event.target.value)} placeholder="留空将根据正文生成" className="mt-2 w-full rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-studio-text-primary outline-none focus:border-studio-border-active" /></label><div className="mt-4 overflow-hidden rounded-card border border-studio-border-soft bg-[var(--editor-bg)]"><ContentEditor value={manualContent} onChange={setManualContent} mode="rich" minHeight={240} placeholder="粘贴网页、微信或文档中的文字…" /></div><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setManualOpen(false)} className="rounded-button border border-studio-border-soft px-4 py-2 text-sm text-studio-text-secondary">取消</button><button type="button" disabled={creating || !manualContent.replace(/<[^>]+>/g, '').trim()} onClick={() => void createManual()} className="rounded-button bg-studio-primary px-4 py-2 text-sm text-white disabled:opacity-50">{creating ? '创建中…' : '创建资料'}</button></div></BaseModal>

    <ConfirmModal open={!!removing} title="从当前创作移除资料" description={`将移除“${removing?.title || ''}”的创作资料快照，不会删除资料中心的原始资料。`} confirmText="移除" variant="danger" onCancel={() => setRemoving(null)} onConfirm={async () => { if (!removing || removingId) return; const target = removing; setRemovingId(target.id); setRemoving(null); setItems((current) => current.filter((item) => item.id !== target.id)); try { await removeProductionMaterial(productionId, target.id); appStore.addNotification({ title: '资料已移除', message: target.title, type: 'success' }); } catch (error) { setItems((current) => [...current, target].sort((a, b) => a.sort_order - b.sort_order)); appStore.addNotification({ title: '移除失败', message: (error as Error).message, type: 'error' }); } finally { setRemovingId(null); } }} />
  </>;
}
