import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FolderTree, Pencil, Plus, Trash2 } from 'lucide-react';
import { getResourceCategories, type LibraryType, type ResourceCategory } from '@/api/resourceCenter';
import { BaseModal, ConfirmModal } from '@/components/common';
import ActionButton from '@/components/studio/ActionButton';
import { useResourceCategoryMutationRecovery } from '@/hooks/useResourceCategoryMutationRecovery';
import { useAuthStore } from '@/store';
import { getUserFacingErrorMessage } from '@/lib/userFacingError';

interface ResourceCategoryManagementModalProps {
  open: boolean;
  libraryType: LibraryType;
  libraryName: string;
  categories: ResourceCategory[];
  onClose: () => void;
  onCategoriesChange: (categories: ResourceCategory[]) => void;
}

const fieldClassName = 'xmt-field w-full';

export default function ResourceCategoryManagementModal({
  open,
  libraryType,
  libraryName,
  categories: initialCategories,
  onClose,
  onCategoriesChange,
}: ResourceCategoryManagementModalProps) {
  const actorId = useAuthStore((state) => state.user?.id);
  const [categories, setCategories] = useState(initialCategories);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<ResourceCategory | null>(null);
  const busyRef = useRef(false);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setName('');
    setParentId('');
    setError('');
  }, []);

  const onMutationCompleted = useCallback((operation: 'create' | 'update' | 'delete') => {
    if (operation === 'create' || operation === 'update') resetForm();
    if (operation === 'delete') setDeleting(null);
  }, [resetForm]);

  const recovery = useResourceCategoryMutationRecovery(open, actorId, libraryType, (next) => {
    setCategories(next);
    onCategoriesChange(next);
    setRefreshError('');
  }, onMutationCompleted);

  useEffect(() => {
    if (!open) return;
    setCategories(initialCategories);
    setEditingId(null);
    setName('');
    setParentId('');
    setError('');
    setRefreshError('');
    setDeleting(null);
  }, [initialCategories, open, libraryType]);

  useEffect(() => {
    const pending = recovery.pending?.recovery;
    if (!pending) return;
    if (pending.operation === 'create') {
      const payload = pending.payload as { name: string; parent_id: number | null };
      setEditingId(null);
      setName(payload.name);
      setParentId(payload.parent_id == null ? '' : String(payload.parent_id));
      return;
    }
    if (pending.operation === 'update') {
      const payload = pending.payload as { name: string; parent_id: number | null };
      setEditingId(Number(pending.categoryId));
      setName(payload.name);
      setParentId(payload.parent_id == null ? '' : String(payload.parent_id));
      return;
    }
    const target = categories.find((category) => category.id === pending.categoryId);
    if (target) setDeleting(target);
  }, [categories, recovery.pending?.recovery]);

  const refreshCategories = useCallback(async () => {
    try {
      const response = await getResourceCategories(libraryType);
      setCategories(response.data);
      onCategoriesChange(response.data);
      setRefreshError('');
      return true;
    } catch (cause) {
      setRefreshError(getUserFacingErrorMessage(cause, '分类暂时无法读取，请检查连接后重试。'));
      return false;
    }
  }, [libraryType, onCategoriesChange]);

  const disabledParentIds = useMemo(() => {
    if (editingId === null) return new Set<number>();
    const childrenByParent = new Map<number, number[]>();
    for (const category of categories) {
      if (category.parent_id === null) continue;
      const siblings = childrenByParent.get(category.parent_id) ?? [];
      siblings.push(category.id);
      childrenByParent.set(category.parent_id, siblings);
    }
    const descendants = new Set<number>([editingId]);
    const pending = [editingId];
    while (pending.length) {
      const currentId = pending.pop()!;
      for (const childId of childrenByParent.get(currentId) ?? []) {
        if (descendants.has(childId)) continue;
        descendants.add(childId);
        pending.push(childId);
      }
    }
    return descendants;
  }, [categories, editingId]);

  const close = () => {
    if (!busyRef.current && (!recovery.pending || recovery.pending.phase === 'wrong_library')) onClose();
  };

  const saveCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError('请输入分类名称');
      return;
    }
    if (normalizedName.length > 100) {
      setError('分类名称不能超过 100 个字符');
      return;
    }
    if (busyRef.current || recovery.locked || !recovery.ready) return;

    busyRef.current = true;
    setBusy(true);
    setError('');
    recovery.clearError();
    try {
      const payload = { name: normalizedName, parent_id: parentId ? Number(parentId) : null };
      await recovery.mutate(editingId === null ? 'create' : 'update', editingId, payload);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const deleteCategory = async () => {
    const target = deleting;
    if (!target || busyRef.current || recovery.locked || !recovery.ready) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    recovery.clearError();
    try {
      await recovery.mutate('delete', target.id, {});
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const controlsLocked = busy || recovery.locked || !recovery.ready;
  const phase = recovery.pending?.phase;
  const blocksClose = Boolean(recovery.pending && phase !== 'wrong_library');
  const canRetryStatus = recovery.pending && !['submitting', 'checking', 'wrong_library'].includes(recovery.pending.phase);

  return <>
    <BaseModal
      open={open}
      onClose={close}
      title={<span className="flex items-center gap-2"><FolderTree className="h-5 w-5 text-studio-cyan-contrast" />{libraryName}分类管理</span>}
      description="可创建分类、调整上级关系或删除空分类。含有资料或子分类的分类不能删除。"
      size="lg"
      closeOnOverlayClick={!busy && !blocksClose}
      closeOnEscape={!busy && !blocksClose}
      showCloseButton={!busy && !blocksClose}
    >
      <div className="space-y-5">
        <form onSubmit={(event) => void saveCategory(event)} className="grid gap-3 rounded-card border border-studio-border-soft bg-studio-surface-soft p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <label className="block text-sm text-studio-text-secondary">分类名称
            <input aria-label="分类名称" value={name} onChange={(event) => setName(event.target.value)} className={`mt-2 ${fieldClassName}`} maxLength={100} disabled={controlsLocked} />
          </label>
          <label className="block text-sm text-studio-text-secondary">上级分类
            <select aria-label="上级分类" value={parentId} onChange={(event) => setParentId(event.target.value)} className={`mt-2 ${fieldClassName}`} disabled={controlsLocked}>
              <option value="">一级分类</option>
              {categories.map((category) => <option key={category.id} value={category.id} disabled={disabledParentIds.has(category.id)}>{category.path || category.name}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            {editingId !== null ? <ActionButton type="button" onClick={resetForm} disabled={controlsLocked}>取消</ActionButton> : null}
            <ActionButton type="submit" variant="primary" disabled={controlsLocked}>
              <span className="inline-flex items-center gap-2"><Plus className="h-4 w-4" />{busy ? '保存中…' : editingId === null ? '新增分类' : '保存修改'}</span>
            </ActionButton>
          </div>
        </form>

        {error ? <p role="alert" className="text-sm text-studio-coral-contrast">{error}</p> : null}
        {recovery.error ? <p role="alert" className="text-sm text-studio-coral-contrast">{recovery.error}</p> : null}
        {recovery.message ? <div role={recovery.locked ? 'alert' : 'status'} className={`space-y-3 text-sm ${recovery.locked ? 'text-studio-amber-contrast' : 'text-studio-cyan-contrast'}`}>
          <p>{recovery.message}</p>
          {phase === 'not_found' ? <div className="flex flex-wrap gap-2"><ActionButton type="button" variant="primary" onClick={recovery.retry}>用原内容和原编号安全重试</ActionButton><ActionButton type="button" onClick={recovery.verify}>再次只读核实</ActionButton></div> : null}
          {canRetryStatus && phase !== 'not_found' ? <ActionButton type="button" onClick={phase === 'confirmed_read_failed' ? recovery.retryRead : phase === 'cleanup_failed' || phase === 'rejected_cleanup_failed' ? recovery.retryCleanup : recovery.verify}>{phase === 'confirmed_read_failed' ? '只重试读取分类' : phase === 'cleanup_failed' || phase === 'rejected_cleanup_failed' ? '重试清理恢复记录' : '只读重新核实'}</ActionButton> : null}
        </div> : null}
        {refreshError ? <div className="flex flex-col gap-3 rounded-button border border-studio-coral-soft bg-studio-coral-soft px-4 py-3 text-sm text-studio-coral-contrast sm:flex-row sm:items-center sm:justify-between"><span>分类列表读取失败：{refreshError}</span><ActionButton type="button" onClick={() => void refreshCategories()} disabled={busy || recovery.locked}>{busy ? '正在重试…' : '只重试读取'}</ActionButton></div> : null}

        <div className="max-h-72 overflow-auto rounded-card border border-studio-border-soft">
          {categories.length ? <ul className="divide-y divide-studio-border-soft">
            {categories.map((category) => <li key={category.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-studio-text-primary">{category.name}</p>
                <p className="truncate text-xs text-studio-text-secondary">{category.path || category.name} · {category.resource_count ?? 0} 条资料</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <ActionButton type="button" aria-label={`编辑分类 ${category.name}`} disabled={controlsLocked} onClick={() => { setEditingId(category.id); setName(category.name); setParentId(category.parent_id == null ? '' : String(category.parent_id)); setError(''); recovery.clearError(); }}>
                  <span className="inline-flex items-center gap-1.5"><Pencil className="h-4 w-4" />编辑</span>
                </ActionButton>
                <ActionButton type="button" variant="danger" aria-label={`删除分类 ${category.name}`} disabled={controlsLocked} onClick={() => setDeleting(category)}>
                  <span className="inline-flex items-center gap-1.5"><Trash2 className="h-4 w-4" />删除</span>
                </ActionButton>
              </div>
            </li>)}
          </ul> : <p className="px-4 py-8 text-center text-sm text-studio-text-secondary">还没有分类，可从上方新增。</p>}
        </div>
      </div>
    </BaseModal>
    <ConfirmModal open={!!deleting} title="删除分类" description={`确定删除分类“${deleting?.name || ''}”吗？含有资料或子分类时，服务端会拒绝删除。`} confirmText="删除分类" variant="danger" loading={busy || phase === 'checking'} onCancel={() => { if (!recovery.pending) setDeleting(null); }} onConfirm={deleteCategory} />
  </>;
}
