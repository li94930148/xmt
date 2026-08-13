import { ArrowLeft, Save, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTopic } from '@/api';
import { useNetworkState } from '@/platform/network';
import { clearSafeDraft, readSafeDraftValue, writeSafeDraft } from '@/platform/safe-draft';

type TopicForm = {
  title: string;
  platform: string;
  deadline: string;
  projectBackground: string;
  targetAudience: string;
  outline: string;
};

const draftKey = 'topic:new';
const emptyForm: TopicForm = { title: '', platform: '', deadline: '', projectBackground: '', targetAudience: '', outline: '' };

function hasContent(form: TopicForm) {
  return Object.values(form).some((value) => Boolean(value.trim()));
}

export default function MobileAddTopic() {
  const navigate = useNavigate();
  const networkState = useNetworkState();
  const [form, setForm] = useState<TopicForm>(() => readSafeDraftValue<TopicForm>(draftKey) ?? emptyForm);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (hasContent(form)) writeSafeDraft(draftKey, form);
  }, [form]);

  const change = (key: keyof TopicForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const saveLocalDraft = () => {
    if (!hasContent(form)) { setNotice('填写内容后才能保存本地草稿'); return; }
    writeSafeDraft(draftKey, form);
    setNotice('已保存到本机草稿，不会创建服务端选题');
  };
  const submit = async () => {
    if (!form.title.trim()) { setNotice('请输入选题标题'); return; }
    if (networkState !== 'online') { setNotice('当前网络未恢复，内容已保存在本地草稿，暂未提交。'); return; }
    setSaving(true);
    setNotice('');
    try {
      const details = [
        form.projectBackground.trim() ? `【项目背景】\n${form.projectBackground.trim()}` : '',
        form.targetAudience.trim() ? `【目标受众】\n${form.targetAudience.trim()}` : '',
      ].filter(Boolean).join('\n\n');
      await createTopic({ title: form.title.trim(), description: details, outline: form.outline.trim() || undefined, platform: form.platform.trim(), deadline: form.deadline, assignee_id: null });
      clearSafeDraft(draftKey);
      navigate('/topics', { replace: true });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '提交选题失败，已保留本地草稿');
    } finally {
      setSaving(false);
    }
  };

  return <div className="space-y-4 pb-2">
    <button type="button" onClick={() => navigate('/topics')} className="inline-flex min-h-11 items-center gap-2 text-sm text-studio-cyan"><ArrowLeft className="h-4 w-4" />返回选题</button>
    <section className="space-y-4 rounded-2xl border border-studio-border-soft bg-studio-surface p-4">
      <div><h1 className="text-lg font-semibold">提报选题</h1><p className="mt-1 text-sm text-studio-text-muted">本地草稿只保存在此设备；提交后才会创建选题。</p></div>
      <label className="block"><span className="mb-2 block text-sm font-semibold">选题标题 <span className="text-red-400">*</span></span><input value={form.title} onChange={(event) => change('title', event.target.value)} className="min-h-11 w-full rounded-xl border border-studio-border-soft bg-studio-bg px-3 text-sm outline-none focus:border-studio-cyan" placeholder="输入清晰、可执行的选题标题" /></label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="block"><span className="mb-2 block text-sm font-semibold">发布平台</span><input value={form.platform} onChange={(event) => change('platform', event.target.value)} className="min-h-11 w-full rounded-xl border border-studio-border-soft bg-studio-bg px-3 text-sm outline-none focus:border-studio-cyan" placeholder="如：抖音、小红书" /></label><label className="block"><span className="mb-2 block text-sm font-semibold">截止日期</span><input type="date" value={form.deadline} onChange={(event) => change('deadline', event.target.value)} className="min-h-11 w-full rounded-xl border border-studio-border-soft bg-studio-bg px-3 text-sm outline-none focus:border-studio-cyan" /></label></div>
    </section>
    <section className="space-y-4 rounded-2xl border border-studio-border-soft bg-studio-surface p-4">
      <h2 className="text-base font-semibold">项目资料</h2>
      <label className="block"><span className="mb-2 block text-sm font-semibold">项目背景</span><textarea value={form.projectBackground} onChange={(event) => change('projectBackground', event.target.value)} className="min-h-32 w-full resize-y rounded-xl border border-studio-border-soft bg-studio-bg p-3 text-sm leading-6 outline-none focus:border-studio-cyan" placeholder="说明选题来源、场景和目标" /></label>
      <label className="block"><span className="mb-2 block text-sm font-semibold">目标受众</span><textarea value={form.targetAudience} onChange={(event) => change('targetAudience', event.target.value)} className="min-h-24 w-full resize-y rounded-xl border border-studio-border-soft bg-studio-bg p-3 text-sm leading-6 outline-none focus:border-studio-cyan" placeholder="描述受众特征和需求" /></label>
    </section>
    <section className="rounded-2xl border border-studio-border-soft bg-studio-surface p-4"><label className="block"><span className="mb-2 block text-base font-semibold">大纲结构</span><textarea value={form.outline} onChange={(event) => change('outline', event.target.value)} className="min-h-48 w-full resize-y rounded-xl border border-studio-border-soft bg-studio-bg p-3 text-sm leading-6 outline-none focus:border-studio-cyan" placeholder="列出内容结构、核心观点和素材方向" /></label></section>
    {notice ? <p role="status" className="px-1 text-sm text-studio-text-secondary">{notice}</p> : null}
    <div className="grid grid-cols-2 gap-3"><button type="button" onClick={saveLocalDraft} disabled={saving} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-studio-border-soft text-sm font-semibold disabled:opacity-50"><Save className="h-4 w-4" />存本地草稿</button><button type="button" onClick={() => void submit()} disabled={saving || networkState !== 'online'} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-studio-primary text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />{saving ? '提交中…' : networkState === 'offline' ? '等待联网' : '提交选题'}</button></div>
  </div>;
}
