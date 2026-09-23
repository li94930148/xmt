import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { createTemplate, deleteTemplate, getTemplates, updateTemplate } from '../api/templates';
import { ActionButton, EmptyState, GlassPanel, PageHeader, PageShell } from '../components/studio';
import LoadingState from '../components/common/LoadingState';
import type { Template } from '@shared/types';

type TemplateForm = { name: string; platform: string; description: string; template_data: string };
const emptyForm: TemplateForm = { name: '', platform: '', description: '', template_data: '' };

export default function TemplateManagement() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  async function refresh() { setTemplates(await getTemplates()); }

  useEffect(() => {
    let active = true;
    getTemplates()
      .then((rows) => { if (active) setTemplates(rows); })
      .catch(() => { if (active) setNotice('模板列表加载失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function edit(template: Template) {
    setEditingId(template.id);
    setForm({ name: template.name, platform: template.platform || '', description: template.description || '', template_data: template.template_data || '' });
    setNotice('');
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) { setNotice('请填写模板名称'); return; }
    if (!form.template_data.trim()) { setNotice('请填写模板正文'); return; }
    setBusy(true);
    try {
      const payload = { ...form, name: form.name.trim(), platform: form.platform.trim(), description: form.description.trim() };
      if (editingId === null) await createTemplate(payload); else await updateTemplate(editingId, payload);
      await refresh();
      setEditingId(null);
      setForm(emptyForm);
      setNotice('模板已保存');
    } catch { setNotice('保存模板失败，请稍后重试'); }
    finally { setBusy(false); }
  }

  async function remove(template: Template) {
    if (!window.confirm(`删除“${template.name}”？已有选题不会被删除。`)) return;
    setBusy(true);
    try {
      await deleteTemplate(template.id);
      await refresh();
      if (editingId === template.id) { setEditingId(null); setForm(emptyForm); }
      setNotice('模板已删除');
    } catch { setNotice('删除模板失败，请稍后重试'); }
    finally { setBusy(false); }
  }

  return <PageShell>
    <div><PageHeader title="选题模板" /><p className="mt-2 text-sm text-studio-text-secondary">管理团队可复用的选题内容结构。</p></div>
    {notice ? <p role="status" className="rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-3 text-sm text-studio-text-primary">{notice}</p> : null}
    <div className="grid gap-6 lg:grid-cols-2">
      <GlassPanel className="studio-sheen p-6">
        <h2 className="mb-5 text-lg font-semibold text-studio-text-primary">{editingId === null ? '新建模板' : '编辑模板'}</h2>
        <form onSubmit={(event) => void save(event)} className="space-y-4">
          <label className="block text-sm text-studio-text-secondary">名称<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="xmt-field mt-2 w-full" /></label>
          <label className="block text-sm text-studio-text-secondary">平台<input value={form.platform} onChange={(event) => setForm({ ...form, platform: event.target.value })} placeholder="留空表示通用" className="xmt-field mt-2 w-full" /></label>
          <label className="block text-sm text-studio-text-secondary">说明<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={2} className="xmt-field mt-2 w-full" /></label>
          <label className="block text-sm text-studio-text-secondary">模板正文<textarea required value={form.template_data} onChange={(event) => setForm({ ...form, template_data: event.target.value })} rows={8} className="xmt-field mt-2 w-full" /></label>
          <div className="flex flex-wrap gap-3"><ActionButton disabled={busy} type="submit" variant="primary">保存模板</ActionButton>{editingId !== null ? <ActionButton type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }}>取消编辑</ActionButton> : null}</div>
        </form>
      </GlassPanel>
      <GlassPanel className="studio-sheen p-6">
        <h2 className="mb-5 text-lg font-semibold text-studio-text-primary">已有模板</h2>
        {loading ? <LoadingState text="正在加载模板…" /> : templates.length === 0 ? <EmptyState icon={FileText} title="还没有选题模板" description="在左侧创建团队的第一个选题模板。" /> : <ul className="space-y-3">{templates.map((template) => <li key={template.id} className="rounded-card border border-studio-border-soft bg-studio-surface-soft p-4 transition-colors hover:border-studio-border-active"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="font-medium text-studio-text-primary">{template.name}</p><p className="mt-1 text-sm text-studio-text-muted">{template.platform || '通用'} · {template.creator_name || '团队成员'}</p>{template.description ? <p className="mt-2 text-sm text-studio-text-secondary">{template.description}</p> : null}</div><div className="flex shrink-0 gap-2"><ActionButton type="button" variant="ghost" onClick={() => edit(template)}>编辑</ActionButton><ActionButton type="button" variant="danger" disabled={busy} onClick={() => void remove(template)}>删除</ActionButton></div></div></li>)}</ul>}
      </GlassPanel>
    </div>
  </PageShell>;
}
