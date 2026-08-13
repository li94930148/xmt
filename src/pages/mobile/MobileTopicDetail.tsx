import { ArrowLeft, Clock3, FolderOpen, Save, Send } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getTopic, updateTopic, updateTopicStatus } from '@/api';
import type { Topic, TopicStatus } from '@/types';
import { getTopicResources, type TopicResource } from '@/api/topics';
import { readSafeDraftValue, writeSafeDraft } from '@/platform/safe-draft';
import { useNetworkState } from '@/platform/network';

const nextStatus: Partial<Record<TopicStatus, TopicStatus>> = {
  rejected: 'pending', approved: 'production', production: 'shooting', shooting: 'publishing', publishing: 'completed',
};
const statusLabel: Partial<Record<TopicStatus, string>> = {
  pending: '待审核', rejected: '重新提交', approved: '进入创作', production: '进入拍摄', shooting: '进入发布', publishing: '标记完成',
};
const statusName: Record<TopicStatus, string> = {
  pending: '待审核', approved: '已通过', rejected: '已驳回', production: '创作中', shooting: '拍摄中', publishing: '发布中', completed: '已完成',
};

export default function MobileTopicDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [resources, setResources] = useState<TopicResource[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const networkState = useNetworkState();

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await getTopic(Number(id));
      setTopic(result);
      setTitle(result.title);
      setDescription(result.description ?? '');
      writeSafeDraft(`topic:${id}:view`, result);
      void getTopicResources(Number(id)).then(setResources).catch(() => undefined);
    } catch (error) {
      const cached = readSafeDraftValue<Topic>(`topic:${id}:view`);
      if (cached) {
        setTopic(cached); setTitle(cached.title); setDescription(cached.description ?? '');
        setNotice('当前显示最近缓存内容；恢复网络后会自动获取最新数据。');
      } else {
        setNotice(error instanceof Error ? error.message : '加载选题失败');
      }
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
  const advance = async () => {
    if (!topic) return;
    const next = nextStatus[topic.status];
    if (!next) { setNotice(topic.status === 'pending' ? '待审核选题需由有审核权限的成员处理。' : '当前阶段没有可推进的后续状态。'); return; }
    if (networkState !== 'online') { setNotice('当前网络未恢复，尚未推进状态。'); return; }
    setSaving(true); setNotice('');
    try {
      await updateTopicStatus(topic.id, next);
      setTopic((current) => current ? { ...current, status: next } : current);
      setNotice(`已推进至${statusName[next]}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '状态推进失败');
    } finally { setSaving(false); }
  };

  return <div className="space-y-4">
    <button type="button" onClick={() => navigate('/topics')} className="inline-flex min-h-11 items-center gap-2 text-sm text-studio-cyan"><ArrowLeft className="h-4 w-4" />返回选题</button>
    {loading ? <p className="text-sm text-studio-text-muted">正在加载选题…</p> : topic ? <>
      <div className="flex items-center justify-between rounded-2xl border border-studio-border-soft bg-studio-surface p-4"><span className="text-sm text-studio-text-muted">当前状态</span><span className="rounded-full bg-studio-primary/15 px-3 py-1 text-sm text-studio-cyan">{topic.status}</span></div>
      <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl border border-studio-border-soft p-3"><p className="text-xs text-studio-text-muted">创建人</p><p className="mt-1 truncate">{topic.creator_name ?? '—'}</p></div><div className="rounded-xl border border-studio-border-soft p-3"><p className="text-xs text-studio-text-muted">更新时间</p><p className="mt-1 truncate">{topic.updated_at || '—'}</p></div></div>
      <label className="block rounded-2xl border border-studio-border-soft bg-studio-surface p-4"><span className="mb-2 block text-sm font-semibold">选题标题</span><input value={title} onChange={(event) => setTitle(event.target.value)} className="min-h-11 w-full rounded-xl border border-studio-border-soft bg-studio-bg px-3 text-sm outline-none focus:border-studio-cyan" /></label>
      <label className="block rounded-2xl border border-studio-border-soft bg-studio-surface p-4"><span className="mb-2 block text-sm font-semibold">选题说明</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-40 w-full resize-y rounded-xl border border-studio-border-soft bg-studio-bg p-3 text-sm leading-6 outline-none focus:border-studio-cyan" placeholder="补充选题背景、目标受众和创作思路" /></label>
      <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl border border-studio-border-soft p-3"><p className="text-xs text-studio-text-muted">负责人</p><p className="mt-1">{topic.assignee_name ?? '未分配'}</p></div><div className="rounded-xl border border-studio-border-soft p-3"><p className="text-xs text-studio-text-muted">截止日期</p><p className="mt-1">{topic.deadline || '未设置'}</p></div></div>
      <section className="rounded-2xl border border-studio-border-soft bg-studio-surface p-4"><h2 className="inline-flex items-center gap-2 text-sm font-semibold"><FolderOpen className="h-4 w-4 text-studio-cyan" />关联资料</h2>{resources.length ? <div className="mt-3 space-y-2">{resources.map((resource) => <p key={resource.id} className="truncate rounded-lg bg-studio-bg px-3 py-2 text-sm">{resource.title}</p>)}</div> : <p className="mt-2 text-sm text-studio-text-muted">暂无关联资料</p>}</section>
      {topic.history?.length ? <section className="rounded-2xl border border-studio-border-soft bg-studio-surface p-4"><h2 className="inline-flex items-center gap-2 text-sm font-semibold"><Clock3 className="h-4 w-4 text-studio-cyan" />协作动态</h2><div className="mt-3 space-y-3">{topic.history.slice(0, 5).map((record) => <div key={record.id} className="border-l border-studio-border-soft pl-3 text-sm"><p>{record.operator_name ?? '成员'} · {record.action}</p><p className="mt-1 text-xs text-studio-text-muted">{record.comment || record.created_at}</p></div>)}</div></section> : null}
      {notice ? <p role="status" className="px-1 text-sm text-studio-text-secondary">{notice}</p> : null}
      <div className="sticky bottom-0 z-20 -mx-1 grid grid-cols-2 gap-3 bg-studio-bg px-1 py-2"><button type="button" disabled={saving} onClick={() => void save()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-studio-border-soft text-sm font-semibold disabled:opacity-50"><Save className="h-4 w-4" />{saving ? '保存中…' : '保存修改'}</button><button type="button" disabled={saving || !nextStatus[topic.status] || networkState !== 'online'} onClick={() => void advance()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-studio-primary text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />{statusLabel[topic.status] ?? '无后续阶段'}</button></div>
    </> : <p className="text-sm text-studio-text-secondary">未找到该选题。</p>}
  </div>;
}
