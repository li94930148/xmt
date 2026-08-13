import { ArrowLeft, Save, Send } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createProduction, getProductionById, getTopics, updateProduction } from '@/api';
import ContentEditor from '@/components/ContentEditor';
import { getCollaborationRoomId } from '@/collaboration/core/events';
import { createProductionEditorAdapter } from '@/editor/adapters/productionEditorAdapter';
import type { Production, Topic } from '@/types';
import { clearSafeDraft, readSafeDraftValue, writeSafeDraft } from '@/platform/safe-draft';
import { useNetworkState } from '@/platform/network';

export default function MobileProductionEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [production, setProduction] = useState<Production | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const networkState = useNetworkState();
  const draftKey = `production:${id ?? 'new'}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const topicResult = await getTopics({ page: 1, limit: 100 });
      setTopics(topicResult.data.filter((topic) => ['approved', 'production'].includes(topic.status)));
      if (id && id !== 'new') { const result = await getProductionById(Number(id)); setProduction(result); setTopicId(String(result.topic_id)); setContent(readSafeDraftValue<string>(draftKey) ?? result.content ?? ''); }
      if (!id || id === 'new') setContent(readSafeDraftValue<string>(draftKey) ?? '');
    } catch (error) { setNotice(error instanceof Error ? error.message : '加载稿件失败'); } finally { setLoading(false); }
  }, [draftKey, id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!loading && content) writeSafeDraft(draftKey, content); }, [content, draftKey, loading]);

  const adapter = useMemo(() => production ? createProductionEditorAdapter({ documentId: getCollaborationRoomId('production', production.id), collaborationRoom: getCollaborationRoomId('production', production.id), initialContent: content, readonly: false, capabilities: { collaboration: true, manualSave: false, immersive: false, pageScroll: true }, persist: (next) => updateProduction(production.id, { topic_id: production.topic_id, version: production.version, content: next, status: production.status, version_action: 'none' }).then(() => undefined) }) : undefined, [content, production]);
  const save = async (submit: boolean) => {
    if (!topicId) { setNotice('请先选择关联选题'); return; }
    if (networkState === 'offline') { setNotice('当前离线，正文已保存为本地草稿，恢复网络后再保存。'); return; }
    setSaving(true); setNotice('');
    try {
      if (production) { await updateProduction(production.id, { topic_id: Number(topicId), version: production.version, content, status: submit ? 'review' : production.status, version_action: 'none' }); clearSafeDraft(draftKey); }
      else { const result = await createProduction({ topic_id: Number(topicId), content, status: submit ? 'review' : 'draft' }); clearSafeDraft(draftKey); navigate(`/production/content/${result.productionId}`, { replace: true }); }
      setNotice(submit ? '已提交审核' : '已保存草稿');
    } catch (error) { setNotice(error instanceof Error ? error.message : '保存稿件失败'); } finally { setSaving(false); }
  };
  return <div className="space-y-4"><button type="button" onClick={() => navigate('/production/content')} className="inline-flex min-h-11 items-center gap-2 text-sm text-studio-cyan"><ArrowLeft className="h-4 w-4" />返回创作</button><label className="block rounded-2xl border border-studio-border-soft bg-studio-surface p-4"><span className="mb-2 block text-sm font-semibold">关联选题</span><select disabled={Boolean(production) || loading} value={topicId} onChange={(event) => setTopicId(event.target.value)} className="min-h-11 w-full rounded-xl border border-studio-border-soft bg-studio-bg px-3 text-sm"><option value="">请选择选题</option>{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select></label>{loading ? <p className="text-sm text-studio-text-muted">正在载入编辑器…</p> : <section className="overflow-hidden rounded-2xl border border-studio-border-soft bg-studio-surface"><ContentEditor value={content} onChange={setContent} placeholder="开始编写正文…" collaborationKey={production ? getCollaborationRoomId('production', production.id) : undefined} collaborationEnabled={Boolean(production)} adapter={adapter} className="mobile-editor" /></section>}{notice ? <p role="status" className="text-sm text-studio-text-secondary">{notice}</p> : null}<div className="grid grid-cols-2 gap-3"><button type="button" disabled={loading || saving} onClick={() => void save(false)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-studio-border-soft text-sm font-semibold disabled:opacity-50"><Save className="h-4 w-4" />保存草稿</button><button type="button" disabled={loading || saving} onClick={() => void save(true)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-studio-primary text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />提交审核</button></div></div>;
}
