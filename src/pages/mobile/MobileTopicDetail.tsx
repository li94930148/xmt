import { ArrowLeft, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getTopic, updateTopic } from '@/api';
import type { Topic } from '@/types';

export default function MobileTopicDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await getTopic(Number(id));
      setTopic(result);
      setTitle(result.title);
      setDescription(result.description ?? '');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '加载选题失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!topic || !title.trim()) {
      setNotice('选题标题不能为空');
      return;
    }
    setSaving(true);
    setNotice('');
    try {
      await updateTopic(topic.id, { title: title.trim(), description });
      setTopic((current) => current ? { ...current, title: title.trim(), description } : current);
      setNotice('已保存');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存选题失败');
    } finally {
      setSaving(false);
    }
  };

  return <div className="space-y-4">
    <button type="button" onClick={() => navigate('/topics')} className="inline-flex min-h-11 items-center gap-2 text-sm text-studio-cyan"><ArrowLeft className="h-4 w-4" />返回选题</button>
    {loading ? <p className="text-sm text-studio-text-muted">正在加载选题…</p> : topic ? <>
      <div className="flex items-center justify-between rounded-2xl border border-studio-border-soft bg-studio-surface p-4"><span className="text-sm text-studio-text-muted">当前状态</span><span className="rounded-full bg-studio-primary/15 px-3 py-1 text-sm text-studio-cyan">{topic.status}</span></div>
      <label className="block rounded-2xl border border-studio-border-soft bg-studio-surface p-4"><span className="mb-2 block text-sm font-semibold">选题标题</span><input value={title} onChange={(event) => setTitle(event.target.value)} className="min-h-11 w-full rounded-xl border border-studio-border-soft bg-studio-bg px-3 text-sm outline-none focus:border-studio-cyan" /></label>
      <label className="block rounded-2xl border border-studio-border-soft bg-studio-surface p-4"><span className="mb-2 block text-sm font-semibold">选题说明</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-40 w-full resize-y rounded-xl border border-studio-border-soft bg-studio-bg p-3 text-sm leading-6 outline-none focus:border-studio-cyan" placeholder="补充选题背景、目标受众和创作思路" /></label>
      <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl border border-studio-border-soft p-3"><p className="text-xs text-studio-text-muted">负责人</p><p className="mt-1">{topic.assignee_name ?? '未分配'}</p></div><div className="rounded-xl border border-studio-border-soft p-3"><p className="text-xs text-studio-text-muted">截止日期</p><p className="mt-1">{topic.deadline || '未设置'}</p></div></div>
      {notice ? <p role="status" className="px-1 text-sm text-studio-text-secondary">{notice}</p> : null}
      <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-studio-primary text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? '保存中…' : '保存修改'}</button>
    </> : <p className="text-sm text-studio-text-secondary">未找到该选题。</p>}
  </div>;
}
