import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store';
import { createAnnouncement, deleteAnnouncement, getAnnouncements } from '@/api/announcements';
import { usePermission } from '@/hooks/usePermission';
import ConfirmModal from '@/components/common/ConfirmModal';
import {
  Pin, Plus, Trash2, Megaphone, StickyNote, AlertTriangle, X,
} from 'lucide-react';
import type { Announcement } from '../types';
import { formatBeijingDate } from '../lib/utils';
import { GlassPanel } from './studio';
import { parseStoredBjt } from '@shared/time';

const typeConfig: Record<string, { label: string; icon: typeof Pin; color: string; bgLight: string; bgDark: string; border: string }> = {
  note: { label: '便签', icon: StickyNote, color: 'var(--xmt-primary-contrast)', bgLight: 'bg-studio-primary/5', bgDark: 'bg-studio-primary/10', border: 'border-studio-primary/20' },
  announcement: { label: '公告', icon: Megaphone, color: 'var(--xmt-success-contrast)', bgLight: 'bg-studio-success/5', bgDark: 'bg-studio-success/10', border: 'border-studio-success/20' },
  important: { label: '重要', icon: AlertTriangle, color: 'var(--xmt-coral-contrast)', bgLight: 'bg-studio-coral/5', bgDark: 'bg-studio-coral/10', border: 'border-studio-coral/20' },
};

export default function AnnouncementBoard() {
  const theme = useAppStore((state) => state.theme);
  const addNotification = useAppStore((state) => state.addNotification);
  const { hasPermission, loading: permissionLoading } = usePermission();
  const canManageAnnouncements = !permissionLoading && hasPermission('system:announcement');
  const [items, setItems] = useState<Announcement[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState<string>('note');
  const [newPinned, setNewPinned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState(false);
  const mutationLockRef = useRef(false);
  const readLockRef = useRef(false);

  const fetchItems = useCallback(async () => {
    if (readLockRef.current) return false;
    readLockRef.current = true;
    setLoading(true);
    try {
      const data = await getAnnouncements();
      setItems(data);
      setLoaded(true);
      setLoadError('');
      return true;
    } catch (err) {
      setLoadError((err as Error).message || '公告列表暂时无法读取。');
      return false;
    } finally {
      readLockRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const handleRetryList = async () => {
    const wasPending = pendingConfirmation;
    const refreshed = await fetchItems();
    if (refreshed) {
      setPendingConfirmation(false);
      setFeedback(wasPending ? '公告列表已重新加载，先前操作已确认。' : '公告列表已重新加载。');
    }
  };

  const handleCreate = async () => {
    if (!newContent.trim() || !loaded || loading || loadError || pendingConfirmation || mutationLockRef.current || !canManageAnnouncements) return;
    mutationLockRef.current = true;
    setSubmitting(true);
    setFeedback('');
    try {
      await createAnnouncement({
        content: newContent.trim(),
        type: newType,
        pinned: newPinned,
      });
      setNewContent('');
      setNewType('note');
      setNewPinned(false);
      setShowForm(false);
      setPendingConfirmation(true);
      setFeedback('服务端已确认公告发布，正在更新列表。');
      addNotification({ title: '创建成功', message: '公告已发布', type: 'success' });
      const refreshed = await fetchItems();
      if (refreshed) {
        setPendingConfirmation(false);
        setFeedback('公告已发布。');
      } else {
        setFeedback('服务端已确认公告发布，但公告列表暂未刷新；请重新加载列表确认，不要重复发布。');
      }
    } catch (err) {
      const message = (err as Error).message || '创建公告失败，请重试。';
      setFeedback(message);
      addNotification({ title: '创建失败', message, type: 'error' });
    } finally {
      mutationLockRef.current = false;
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteCandidate || !canManageAnnouncements || pendingConfirmation || mutationLockRef.current) return;
    const candidate = deleteCandidate;
    mutationLockRef.current = true;
    setDeleting(true);
    setFeedback('');
    try {
      await deleteAnnouncement(candidate.id);
      setItems((prev) => prev.filter((item) => item.id !== candidate.id));
      setDeleteCandidate(null);
      setPendingConfirmation(true);
      setFeedback('服务端已确认删除公告，正在更新列表。');
      addNotification({ title: '已删除', message: '公告已删除', type: 'success' });
      const refreshed = await fetchItems();
      if (refreshed) {
        setPendingConfirmation(false);
        setFeedback('公告已删除。');
      } else {
        setFeedback('服务端已确认删除公告，但公告列表暂未刷新；请重新加载列表确认，不要重复删除。');
      }
    } catch (err) {
      const message = (err as Error).message || '删除公告失败，请重试。';
      setFeedback(message);
      addNotification({ title: '删除失败', message, type: 'error' });
    } finally {
      mutationLockRef.current = false;
      setDeleting(false);
    }
  };

  // Sort: pinned first, then by date
  const sortedItems = [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (parseStoredBjt(b.created_at)?.getTime() ?? 0) - (parseStoredBjt(a.created_at)?.getTime() ?? 0);
  });

  const mutationBusy = submitting || deleting;

  return (
    <GlassPanel className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[14px] bg-studio-amber/15 text-studio-amber-contrast">
            <Megaphone className="h-4 w-4" />
          </div>
          <h3 className="text-base font-semibold text-studio-text-primary">公告板</h3>
        </div>
        {canManageAnnouncements ? (
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            disabled={mutationBusy || pendingConfirmation || !loaded || loading}
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-button border border-studio-border-soft bg-studio-surface-soft text-studio-text-muted transition-colors hover:border-studio-border-active hover:bg-studio-surface-elevated hover:text-studio-text-primary disabled:opacity-50"
            title="添加公告"
            aria-label={showForm ? '关闭公告表单' : '添加公告'}
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </button>
        ) : null}
      </div>

      {showForm && (
        <div className="mb-4 rounded-card border border-studio-border-soft bg-studio-surface-soft p-4">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            disabled={mutationBusy || pendingConfirmation}
            placeholder="输入公告内容..."
            rows={2}
            className="mb-3 min-h-20 w-full resize-y rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm leading-6 text-studio-text-primary outline-none transition focus:border-studio-border-active disabled:opacity-60"
          />
          <div className="flex items-center gap-2 flex-wrap">
            {(['note', 'announcement', 'important'] as const).map((t) => {
              const cfg = typeConfig[t];
              const Icon = cfg.icon;
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={newType === t}
                  disabled={mutationBusy || pendingConfirmation}
                  onClick={() => setNewType(t)}
                  className={`inline-flex min-h-8 items-center gap-1.5 rounded-button border px-3 py-1.5 text-xs font-medium transition-colors ${
                    newType === t
                      ? `${theme === 'dark' ? cfg.bgDark : cfg.bgLight} ${cfg.border}`
                      : 'border-studio-border-soft bg-studio-surface-soft text-studio-text-muted hover:bg-studio-surface-elevated hover:text-studio-text-primary'
                  } disabled:opacity-50`}
                  style={newType === t ? { color: cfg.color } : undefined}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {cfg.label}
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={newPinned}
              disabled={mutationBusy || pendingConfirmation}
              onClick={() => setNewPinned(!newPinned)}
              className={`inline-flex min-h-8 items-center gap-1 rounded-button border px-3 py-1.5 text-xs font-medium transition-colors ${
                newPinned
                  ? `bg-studio-amber/10 border-studio-amber/30 text-studio-amber-contrast`
                  : 'border-studio-border-soft bg-studio-surface-soft text-studio-text-muted hover:bg-studio-surface-elevated hover:text-studio-text-primary'
              } disabled:opacity-50`}
            >
              <Pin className="w-3 h-3" />
              置顶
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newContent.trim() || mutationBusy || pendingConfirmation || loading || !loaded || Boolean(loadError)}
              className="inline-flex min-h-8 items-center justify-center rounded-button border border-studio-primary/40 bg-studio-primary-button px-4 py-1.5 text-xs font-semibold text-white transition-all hover:bg-studio-primary-button disabled:pointer-events-none disabled:opacity-40"
            >
              {submitting ? '发布中...' : '发布'}
            </button>
          </div>
        </div>
      )}

      {(feedback || (loadError && !pendingConfirmation)) ? (
        <div className="mb-3 rounded-card border border-studio-border-soft bg-studio-surface-soft p-3">
          {feedback ? <p role={feedback.includes('失败') ? 'alert' : 'status'} className="text-sm text-studio-text-secondary">{feedback}</p> : null}
          {loadError && !pendingConfirmation ? <p className="mt-1 text-sm text-studio-text-muted">公告列表暂时无法读取：{loadError}</p> : null}
          {loadError ? (
            <button type="button" disabled={loading} onClick={() => void handleRetryList()} className="xmt-btn xmt-btn-secondary mt-2 min-h-9 px-3 text-xs disabled:opacity-50">
              {loading ? '正在重新加载…' : '重新加载列表'}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
        {loading && !loaded ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-card border border-studio-border-soft bg-studio-surface-soft p-3">
                <div className="mb-2 h-3 w-3/4 rounded bg-studio-surface-elevated" />
                <div className="h-2 w-1/2 rounded bg-studio-surface-elevated" />
              </div>
            ))}
          </div>
        ) : !loaded && loadError ? (
          <div className="rounded-card border border-dashed border-studio-border-soft py-6 text-center text-sm text-studio-text-muted">公告列表不可用，请重新加载后再查看。</div>
        ) : sortedItems.length === 0 ? (
          <div className="rounded-card border border-dashed border-studio-border-soft py-6 text-center text-sm text-studio-text-muted">{loadError ? '公告列表暂未刷新。' : '暂无公告'}</div>
        ) : (
          sortedItems.map((item) => {
            const cfg = typeConfig[item.type] || typeConfig.note;
            const Icon = cfg.icon;
            return (
              <div
                key={item.id}
                className={`group rounded-card border p-3 transition-all duration-200 hover:border-studio-border-active hover:bg-studio-surface-elevated ${theme === 'dark' ? cfg.bgDark : cfg.bgLight} ${cfg.border}`}
              >
                <div className="flex items-start gap-2.5">
                  <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: cfg.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-studio-text-primary">{item.content}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {item.pinned && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-studio-amber-contrast">
                          <Pin className="w-2.5 h-2.5" /> 置顶
                        </span>
                      )}
                      <span className="text-[10px] text-studio-text-muted">
                        {item.creator_name || '系统'} · {formatBeijingDate(item.created_at)}
                      </span>
                    </div>
                  </div>
                  {canManageAnnouncements ? (
                    <button
                      type="button"
                      disabled={mutationBusy || pendingConfirmation || loading}
                      onClick={() => setDeleteCandidate(item)}
                      className="rounded p-1 text-studio-coral-contrast opacity-0 transition-opacity hover:bg-studio-coral-soft group-hover:opacity-100 focus:opacity-100 disabled:opacity-40"
                      title="删除"
                      aria-label={`删除公告：${item.content.slice(0, 32)}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
      <ConfirmModal
        open={Boolean(deleteCandidate)}
        title="确认删除公告？"
        description={deleteCandidate ? <>删除后无法恢复：<span className="font-medium text-studio-text-primary">{deleteCandidate.content}</span></> : undefined}
        confirmText="删除公告"
        variant="danger"
        loading={deleting}
        onCancel={() => { if (!mutationLockRef.current) setDeleteCandidate(null); }}
        onConfirm={handleDelete}
      />
    </GlassPanel>
  );
}
