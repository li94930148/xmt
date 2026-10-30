import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BaseModal } from '@/components/common';
import { type LibraryType, type ResourceCategory } from '@/api/resourceCenter';
import { useAuthStore } from '@/store';
import { useResourceCreateRecovery } from '@/hooks/useResourceCreateRecovery';
import type { ResourceCreateRecovery } from '@/utils/resourceCreateRecovery';
import { getUserFacingErrorMessage } from '@/lib/userFacingError';

interface ResourceCreateModalProps {
  open: boolean;
  libraryType: LibraryType;
  categories: ResourceCategory[];
  onClose: () => void;
  onCreated: (resource: { id: number; title: string; libraryType: LibraryType }) => void;
}

const inputClassName = 'w-full rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2.5 text-sm text-studio-text-primary outline-none focus:border-studio-border-active';

export default function ResourceCreateModal({ open, libraryType, categories, onClose, onCreated }: ResourceCreateModalProps) {
  const actorId = useAuthStore((state) => state.user?.id);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [contentText, setContentText] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [visibility, setVisibility] = useState<'team' | 'company' | 'private'>('team');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const submitLockRef = useRef(false);
  const lastRestoredRequestIdRef = useRef<string | null>(null);
  const previousActorIdRef = useRef<number | undefined>(actorId);
  const previousLibraryTypeRef = useRef<LibraryType>(libraryType);
  const finishResourceCreation = (resourceId: number, recovery: ResourceCreateRecovery) => {
    onCreated({ id: resourceId, title: recovery.payload.title, libraryType: recovery.payload.library_type });
  };
  const createRecovery = useResourceCreateRecovery(open, actorId, finishResourceCreation);

  const close = () => {
    if (!submitLockRef.current) onClose();
  };

  useEffect(() => {
    if (previousActorIdRef.current !== actorId) {
      previousActorIdRef.current = actorId;
      lastRestoredRequestIdRef.current = null;
      setTitle('');
      setSummary('');
      setContentText('');
      setCategoryId('');
      setVisibility('team');
      setError('');
    }
    if (previousLibraryTypeRef.current !== libraryType) {
      previousLibraryTypeRef.current = libraryType;
      if (!createRecovery.pending) {
        setTitle('');
        setSummary('');
        setContentText('');
        setCategoryId('');
        setVisibility('team');
        setError('');
      }
    }
    if (!open) {
      lastRestoredRequestIdRef.current = null;
      setTitle('');
      setSummary('');
      setContentText('');
      setCategoryId('');
      setVisibility('team');
      setError('');
    }
  }, [actorId, createRecovery.pending, open, libraryType]);

  useEffect(() => {
    const recovery = createRecovery.pending?.recovery;
    if (!recovery) {
      lastRestoredRequestIdRef.current = null;
      return;
    }
    if (lastRestoredRequestIdRef.current === recovery.requestId) return;
    lastRestoredRequestIdRef.current = recovery.requestId;
    setTitle(recovery.payload.title);
    setSummary(recovery.payload.summary || '');
    setContentText(recovery.payload.content_text || '');
    setCategoryId(recovery.payload.category_id ? String(recovery.payload.category_id) : '');
    setVisibility(recovery.payload.visibility);
    setError('');
  }, [createRecovery.pending?.recovery, createRecovery.pending?.recovery.requestId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setError('请输入资料标题');
      return;
    }
    if (submitLockRef.current || createRecovery.locked || !createRecovery.ready) return;
    submitLockRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      await createRecovery.create({
        title: normalizedTitle,
        summary: summary.trim() || undefined,
        content_text: contentText.trim() || undefined,
        library_type: libraryType,
        category_id: categoryId ? Number(categoryId) : undefined,
        visibility,
      });
    } catch (caught) {
      setError(getUserFacingErrorMessage(caught, '资料暂时无法创建，请检查权限和内容后重试。'));
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  const formLocked = submitting || createRecovery.locked;
  const recoveryMessage = createRecovery.message;

  return <BaseModal open={open} onClose={close} title="新增资料" closeOnOverlayClick={!submitting} closeOnEscape={!submitting} showCloseButton={!submitting}>
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm text-studio-text-secondary">标题
        <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} className={`mt-2 ${inputClassName}`} maxLength={200} disabled={formLocked} />
      </label>
      <label className="block text-sm text-studio-text-secondary">分类
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={`mt-2 ${inputClassName}`} disabled={formLocked}>
          <option value="">未分类</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.path || category.name}</option>)}
        </select>
      </label>
      <label className="block text-sm text-studio-text-secondary">可见范围
        <select value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)} className={`mt-2 ${inputClassName}`} disabled={formLocked}>
          <option value="team">团队</option>
          <option value="company">企业</option>
          <option value="private">私有</option>
        </select>
      </label>
      <label className="block text-sm text-studio-text-secondary">摘要
        <textarea value={summary} onChange={(event) => setSummary(event.target.value)} className={`mt-2 min-h-20 resize-y ${inputClassName}`} maxLength={1000} disabled={formLocked} />
      </label>
      <label className="block text-sm text-studio-text-secondary">正文
        <textarea value={contentText} onChange={(event) => setContentText(event.target.value)} className={`mt-2 min-h-40 resize-y ${inputClassName}`} disabled={formLocked} />
      </label>
      {error ? <p role="alert" className="text-sm text-studio-coral-contrast">{error}</p> : null}
      {recoveryMessage ? <section role="status" aria-live="polite" className="space-y-3 rounded-button border border-studio-amber/30 bg-studio-amber/10 p-3 text-sm text-studio-amber-contrast">
        <p>{recoveryMessage}</p>
        {createRecovery.pending?.phase === 'uncertain' ? <button type="button" onClick={() => void createRecovery.verify()} className="min-h-10 rounded-button border border-studio-border-soft px-3 font-medium text-studio-text-primary">只读重新核实创建状态</button> : null}
        {createRecovery.pending?.phase === 'not_found' ? <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void createRecovery.retry()} className="min-h-10 rounded-button bg-studio-primary-button px-3 font-medium text-white">确认用原内容和同一编号重试</button><button type="button" onClick={() => void createRecovery.verify()} className="min-h-10 rounded-button border border-studio-border-soft px-3 font-medium text-studio-text-primary">再次只读核实</button></div> : null}
        {createRecovery.pending?.phase === 'cleanup_failed' || createRecovery.pending?.phase === 'rejected_cleanup_failed' ? <button type="button" onClick={createRecovery.retryCleanup} className="min-h-10 rounded-button border border-studio-border-soft px-3 font-medium text-studio-text-primary">重试清理恢复记录</button> : null}
      </section> : null}
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" disabled={submitting} onClick={close} className="rounded-button border border-studio-border-soft px-4 py-2.5 text-sm text-studio-text-secondary disabled:opacity-50">取消</button>
        <button type="submit" disabled={formLocked} className="rounded-button bg-studio-primary-button px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{submitting ? '创建中' : createRecovery.pending ? '请先核实创建结果' : '创建'}</button>
      </div>
    </form>
  </BaseModal>;
}
