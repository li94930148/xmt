import { ArrowLeft, Save, Send } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createProduction, getProductionById, getTopics, updateProduction } from '@/api';
import ContentEditor from '@/components/ContentEditor';
import { getProductionVersionRoomId } from '@/collaboration/core/events';
import { createProductionEditorAdapter } from '@/editor/adapters/productionEditorAdapter';
import type { Production, Topic } from '@/types';
import { clearSafeDraft, readSafeDraftValue, userSafeDraftKey, writeSafeDraft } from '@/platform/safe-draft';
import { useAuthStore } from '@/store';
import { useNetworkState } from '@/platform/network';
import { usePermission } from '@/hooks/usePermission';
import AccessDeniedState from '@/components/AccessDeniedState';

export default function MobileProductionEditor() {
  const { id } = useParams<{ id: string }>();
  const userId = useAuthStore((state) => state.user?.id);
  const navigate = useNavigate();
  const [production, setProduction] = useState<Production | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const persistedContentRef = useRef('');
  const networkState = useNetworkState();
  const { permissions, loading: permissionsLoading } = usePermission();
  const canView = permissions.includes('*') || permissions.includes('production:view') || permissions.includes('production:update');
  const canEditPermission = permissions.includes('*') || permissions.includes('production:update');
  const isNewProduction = !id || id === 'new';
  const canEdit = canEditPermission && (isNewProduction || production?.can_edit === true);
  const draftKey = userSafeDraftKey(userId, `production:${id ?? 'new'}`);

  const load = useCallback(async () => {
    if (permissionsLoading || !draftKey) return;
    if (isNewProduction && !canEditPermission) { setLoading(false); setNotice('当前账号没有新建创作稿件的权限。'); return; }
    if (id && id !== 'new' && !canView) { setLoading(false); setNotice('当前账号没有查看这份创作稿件的权限。'); return; }
    setLoading(true);
    try {
      if (canEditPermission) {
        const topicResult = await getTopics({ page: 1, limit: 100 });
        setTopics(topicResult.data.filter((topic) => ['approved', 'production'].includes(topic.status)));
      }
      if (id && id !== 'new') { const result = await getProductionById(Number(id)); persistedContentRef.current = result.content || ''; setProduction(result); setTopicId(String(result.topic_id)); setContent(canEditPermission && result.can_edit === true ? (readSafeDraftValue<string>(draftKey) ?? result.content ?? '') : (result.content ?? '')); }
      if (isNewProduction) setContent(readSafeDraftValue<string>(draftKey) ?? '');
    } catch (error) { setNotice(error instanceof Error ? error.message : '加载稿件失败'); } finally { setLoading(false); }
  }, [canEditPermission, canView, draftKey, id, isNewProduction, permissionsLoading]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (canEdit && draftKey && !loading && content) writeSafeDraft(draftKey, content); }, [canEdit, content, draftKey, loading]);

  const adapter = useMemo(() => production ? createProductionEditorAdapter({ documentId: getProductionVersionRoomId(production.id, production.version), collaborationRoom: getProductionVersionRoomId(production.id, production.version), initialContent: content, readonly: !canEdit, capabilities: { collaboration: canEdit, manualSave: false, immersive: false, pageScroll: true }, persist: async (next) => { if (!canEdit) throw new Error('当前账号没有修改创作稿件的权限'); await updateProduction(production.id, { topic_id: production.topic_id, version: production.version, content: next, expected_content: persistedContentRef.current, status: production.status, version_action: 'none' }); persistedContentRef.current = next; } }) : undefined, [canEdit, content, production]);
  const save = async (submit: boolean) => {
    if (!canEdit || !draftKey) { setNotice('当前账号没有修改创作稿件的权限。'); return; }
    if (!topicId) { setNotice('请先选择关联选题'); return; }
    if (networkState === 'offline') { setNotice('当前离线，正文已保存为本地草稿，恢复网络后再保存。'); return; }
    setSaving(true); setNotice('');
    try {
      if (production) { await updateProduction(production.id, { topic_id: Number(topicId), version: production.version, content, expected_content: persistedContentRef.current, status: submit ? 'review' : production.status, version_action: 'none' }); persistedContentRef.current = content; clearSafeDraft(draftKey); }
      else { const result = await createProduction({ topic_id: Number(topicId), content, status: submit ? 'review' : 'draft' }); clearSafeDraft(draftKey); navigate(`/production/content/${result.productionId}`, { replace: true }); }
      setNotice(submit ? '已提交审核' : '已保存草稿');
    } catch (error) { setNotice(error instanceof Error ? error.message : '保存稿件失败'); } finally { setSaving(false); }
  };
  if (!permissionsLoading && ((!id || id === 'new') ? !canEdit : !canView)) return <div className="space-y-4"><button type="button" onClick={() => navigate('/production/content')} className="inline-flex min-h-11 items-center gap-2 text-sm text-studio-cyan"><ArrowLeft className="h-4 w-4" />返回创作</button><AccessDeniedState title="当前账号无法打开这份稿件" description={!id || id === 'new' ? '新建稿件需要创作权限。' : '查看稿件需要相应的创作查看权限。'} /></div>;
  return <div className="space-y-4"><button type="button" onClick={() => navigate('/production/content')} className="inline-flex min-h-11 items-center gap-2 text-sm text-studio-cyan"><ArrowLeft className="h-4 w-4" />返回创作</button>{loading && permissionsLoading ? <p className="text-sm text-studio-text-muted">正在检查访问权限…</p> : null}{canEdit ? <label className="block rounded-2xl border border-studio-border-soft bg-studio-surface p-4"><span className="mb-2 block text-sm font-semibold">关联选题</span><select disabled={Boolean(production) || loading} value={topicId} onChange={(event) => setTopicId(event.target.value)} className="min-h-11 w-full rounded-xl border border-studio-border-soft bg-studio-bg px-3 text-sm"><option value="">请选择选题</option>{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select></label> : null}{loading ? <p className="text-sm text-studio-text-muted">正在载入编辑器…</p> : <section className="overflow-visible rounded-2xl border border-studio-border-soft bg-studio-surface">{!canEdit ? <p className="border-b border-studio-border-soft px-4 py-3 text-sm text-studio-text-muted">只读模式：当前账号仅可查看。</p> : null}<ContentEditor value={content} onChange={canEdit ? setContent : undefined} readOnly={!canEdit} placeholder="开始编写正文…" collaborationKey={canEdit && production ? getProductionVersionRoomId(production.id, production.version) : undefined} collaborationEnabled={canEdit && Boolean(production)} adapter={adapter} toolbarVariant="basic" className="mobile-editor" /></section>}{notice ? <p role="status" className="text-sm text-studio-text-secondary">{notice}</p> : null}{canEdit ? <div className="sticky z-20 -mx-1 grid grid-cols-2 gap-3 bg-studio-bg px-1 py-2" style={{ bottom: 'var(--xmt-keyboard-height, 0px)' }}><button type="button" disabled={loading || saving} onClick={() => void save(false)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-studio-border-soft text-sm font-semibold disabled:opacity-50"><Save className="h-4 w-4" />保存草稿</button><button type="button" disabled={loading || saving} onClick={() => void save(true)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-studio-primary text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />提交审核</button></div> : null}</div>;
}
