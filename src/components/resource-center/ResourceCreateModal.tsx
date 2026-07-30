import { useEffect, useState, type FormEvent } from 'react';
import { BaseModal } from '@/components/common';
import { createResourceCenterResource, type LibraryType, type ResourceCategory } from '@/api/resourceCenter';

interface ResourceCreateModalProps {
  open: boolean;
  libraryType: LibraryType;
  categories: ResourceCategory[];
  onClose: () => void;
  onCreated: (id: number) => void;
}

const inputClassName = 'w-full rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2.5 text-sm text-studio-text-primary outline-none focus:border-studio-border-active';

export default function ResourceCreateModal({ open, libraryType, categories, onClose, onCreated }: ResourceCreateModalProps) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [contentText, setContentText] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [visibility, setVisibility] = useState<'team' | 'company' | 'private'>('team');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setSummary('');
    setContentText('');
    setCategoryId('');
    setVisibility('team');
    setError('');
  }, [open, libraryType]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setError('请输入资料标题');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await createResourceCenterResource({
        title: normalizedTitle,
        summary: summary.trim() || undefined,
        content_text: contentText.trim() || undefined,
        library_type: libraryType,
        category_id: categoryId ? Number(categoryId) : undefined,
        visibility,
      });
      onCreated(result.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '创建资料失败');
    } finally {
      setSubmitting(false);
    }
  };

  return <BaseModal open={open} onClose={onClose} title="新增资料" closeOnOverlayClick={!submitting}>
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm text-studio-text-secondary">标题
        <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} className={`mt-2 ${inputClassName}`} maxLength={200} />
      </label>
      <label className="block text-sm text-studio-text-secondary">分类
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={`mt-2 ${inputClassName}`}>
          <option value="">未分类</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.path || category.name}</option>)}
        </select>
      </label>
      <label className="block text-sm text-studio-text-secondary">可见范围
        <select value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)} className={`mt-2 ${inputClassName}`}>
          <option value="team">团队</option>
          <option value="company">企业</option>
          <option value="private">私有</option>
        </select>
      </label>
      <label className="block text-sm text-studio-text-secondary">摘要
        <textarea value={summary} onChange={(event) => setSummary(event.target.value)} className={`mt-2 min-h-20 resize-y ${inputClassName}`} maxLength={1000} />
      </label>
      <label className="block text-sm text-studio-text-secondary">正文
        <textarea value={contentText} onChange={(event) => setContentText(event.target.value)} className={`mt-2 min-h-40 resize-y ${inputClassName}`} />
      </label>
      {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" disabled={submitting} onClick={onClose} className="rounded-button border border-studio-border-soft px-4 py-2.5 text-sm text-studio-text-secondary disabled:opacity-50">取消</button>
        <button type="submit" disabled={submitting} className="rounded-button bg-studio-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{submitting ? '创建中' : '创建'}</button>
      </div>
    </form>
  </BaseModal>;
}
