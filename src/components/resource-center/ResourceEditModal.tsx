import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getResourceCategories, type ResourceCategory, type ResourceDetailData, type UpdateResourceCenterResourceInput } from '@/api/resourceCenter';
import { BaseModal } from '@/components/common';
import ActionButton from '@/components/studio/ActionButton';
import { useAuthStore } from '@/store';
import { useResourceUpdateRecovery } from '@/hooks/useResourceUpdateRecovery';
import { getUserFacingErrorMessage } from '@/lib/userFacingError';

interface ResourceEditModalProps {
  open: boolean;
  resource: ResourceDetailData;
  onClose: () => void;
  onUpdated: (input: UpdateResourceCenterResourceInput, category: ResourceCategory | null) => void;
  onRecovered: () => void;
}

const inputClassName = 'w-full rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2.5 text-sm text-studio-text-primary outline-none focus:border-studio-border-active disabled:opacity-60';

export default function ResourceEditModal({ open, resource, onClose, onUpdated, onRecovered }: ResourceEditModalProps) {
  const actorId = useAuthStore((state) => state.user?.id);
  const [title, setTitle] = useState(resource.title);
  const [summary, setSummary] = useState(resource.summary || '');
  const [contentText, setContentText] = useState(resource.content_text || '');
  const [categoryId, setCategoryId] = useState(resource.category ? String(resource.category.id) : '');
  const [visibility, setVisibility] = useState<UpdateResourceCenterResourceInput['visibility']>(resource.visibility as UpdateResourceCenterResourceInput['visibility']);
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [categoryState, setCategoryState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [categoryError, setCategoryError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const submitLockRef = useRef(false);
  const categoryRequestRef = useRef(0);
  const applyConfirmedUpdate = (input: UpdateResourceCenterResourceInput) => {
    const category = input.category_id == null ? null : categories.find((item) => item.id === input.category_id) || resource.category;
    onUpdated(input, category);
    onClose();
  };
  const handleRecoveredUpdate = () => {
    onRecovered();
    onClose();
  };
  const recovery = useResourceUpdateRecovery(open, actorId, resource.id, resource.library_type, applyConfirmedUpdate, handleRecoveredUpdate);

  const loadCategories = async () => {
    const requestId = ++categoryRequestRef.current;
    setCategoryState('loading');
    setCategoryError('');
    try {
      const result = await getResourceCategories(resource.library_type);
      if (requestId !== categoryRequestRef.current) return;
      setCategories(result.data);
      setCategoryState('ready');
    } catch (cause) {
      if (requestId !== categoryRequestRef.current) return;
      setCategoryError(getUserFacingErrorMessage(cause, '分类暂时无法读取，请检查连接后重试。'));
      setCategoryState('error');
    }
  };

  useEffect(() => {
    if (!open) {
      categoryRequestRef.current += 1;
      return;
    }
    setTitle(resource.title);
    setSummary(resource.summary || '');
    setContentText(resource.content_text || '');
    setCategoryId(resource.category ? String(resource.category.id) : '');
    setVisibility(resource.visibility as UpdateResourceCenterResourceInput['visibility']);
    setError('');
    void loadCategories();
  // Reset only when the dialog opens or the resource identity changes; background detail refreshes must not erase an in-progress edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resource.id]);

  useEffect(() => {
    const recoveryPayload = recovery.pending?.recovery.payload;
    if (!open || !recoveryPayload) return;
    setTitle(recoveryPayload.title);
    setSummary(recoveryPayload.summary || '');
    setContentText(recoveryPayload.content_text || '');
    setCategoryId(recoveryPayload.category_id == null ? '' : String(recoveryPayload.category_id));
    setVisibility(recoveryPayload.visibility);
  }, [open, recovery.pending?.recovery.requestId, recovery.pending?.recovery.payload]);

  const close = () => {
    if (!submitLockRef.current && !recovery.pending) onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setError('请输入资料标题');
      return;
    }
    if (submitLockRef.current || recovery.locked || !recovery.ready) return;
    submitLockRef.current = true;
    setSubmitting(true);
    setError('');
    const input: UpdateResourceCenterResourceInput = {
      title: normalizedTitle,
      summary: summary.trim() || null,
      category_id: categoryId ? Number(categoryId) : null,
      visibility,
      content_text: contentText || null,
    };
    try {
      await recovery.save(input);
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  const formLocked = submitting || recovery.locked;

  const currentCategoryMissing = categoryId !== '' && !categories.some((category) => String(category.id) === categoryId);
  const selectedCategory = categoryId === '' ? null : categories.find((category) => String(category.id) === categoryId) || resource.category;

  return <BaseModal open={open} onClose={close} title="编辑资料" description="更新后会保留在当前资料库；结果不明时会先核实，不会自动重复保存。" size="lg" closeOnOverlayClick={!formLocked && !recovery.pending} closeOnEscape={!formLocked && !recovery.pending} showCloseButton={!formLocked && !recovery.pending}>
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm text-studio-text-secondary">标题
        <input autoFocus aria-label="资料标题" value={title} onChange={(event) => setTitle(event.target.value)} className={`mt-2 ${inputClassName}`} maxLength={200} disabled={formLocked} />
      </label>
      <div>
        <label className="block text-sm text-studio-text-secondary">分类
          <select aria-label="资料分类" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={`mt-2 ${inputClassName}`} disabled={formLocked || categoryState !== 'ready'}>
            <option value="">未分类</option>
            {currentCategoryMissing && resource.category ? <option value={resource.category.id}>{resource.category.path || resource.category.name}（当前分类）</option> : null}
            {categories.map((category) => <option key={category.id} value={category.id}>{category.path || category.name}</option>)}
          </select>
        </label>
        {categoryState === 'loading' ? <p role="status" className="mt-1 text-xs text-studio-text-muted">正在读取分类…</p> : null}
        {categoryState === 'error' ? <div className="mt-1 flex flex-col items-start gap-2 text-xs text-studio-amber-contrast"><p>分类读取失败，其他字段仍可修改；分类将保持当前值。{categoryError ? ` ${categoryError}` : ''}</p><ActionButton type="button" onClick={() => void loadCategories()} disabled={formLocked}>重试读取分类</ActionButton></div> : null}
      </div>
      <label className="block text-sm text-studio-text-secondary">可见范围
        <select aria-label="可见范围" value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)} className={`mt-2 ${inputClassName}`} disabled={formLocked}>
          <option value="team">团队</option>
          <option value="company">企业</option>
          <option value="private">私有</option>
          {resource.visibility === 'project' ? <option value="project">项目关联（保留当前范围）</option> : null}
        </select>
      </label>
      <label className="block text-sm text-studio-text-secondary">摘要
        <textarea aria-label="资料摘要" value={summary} onChange={(event) => setSummary(event.target.value)} className={`mt-2 min-h-20 resize-y ${inputClassName}`} maxLength={1000} disabled={formLocked} />
      </label>
      <label className="block text-sm text-studio-text-secondary">正文
        <textarea aria-label="资料正文" value={contentText} onChange={(event) => setContentText(event.target.value)} className={`mt-2 min-h-40 resize-y ${inputClassName}`} disabled={formLocked} />
      </label>
      {error ? <p role="alert" className="text-sm text-studio-coral-contrast">{error}</p> : null}
      {recovery.message ? <section role="status" aria-live="polite" className="space-y-3 rounded-button border border-studio-amber/30 bg-studio-amber/10 p-3 text-sm text-studio-amber-contrast">
        <p>{recovery.message}</p>
        {recovery.pending?.phase === 'uncertain' ? <ActionButton type="button" variant="secondary" onClick={() => void recovery.verify()}>只读重新核实保存状态</ActionButton> : null}
        {recovery.pending?.phase === 'not_found' ? <div className="flex flex-wrap gap-2"><ActionButton type="button" variant="primary" onClick={() => void recovery.retry()}>用原内容和原编号安全重试</ActionButton><ActionButton type="button" variant="secondary" onClick={() => void recovery.verify()}>再次只读核实</ActionButton></div> : null}
        {recovery.pending?.phase === 'cleanup_failed' ? <ActionButton type="button" variant="secondary" onClick={recovery.retryCleanup}>重试清理恢复编号</ActionButton> : null}
        {recovery.pending?.phase === 'rejected_cleanup_failed' ? <ActionButton type="button" variant="secondary" onClick={recovery.retryCleanup}>清理已被拒绝的恢复编号后继续编辑</ActionButton> : null}
      </section> : null}
      <div className="flex justify-end gap-3 pt-2">
        <ActionButton type="button" onClick={close} disabled={formLocked || Boolean(recovery.pending)}>取消</ActionButton>
        <ActionButton type="submit" variant="primary" disabled={formLocked}>{submitting ? '保存中…' : recovery.pending ? '请先核实保存结果' : '保存修改'}</ActionButton>
      </div>
      {selectedCategory && categoryState === 'error' ? <span className="sr-only">当前分类：{selectedCategory.path || selectedCategory.name}</span> : null}
    </form>
  </BaseModal>;
}
