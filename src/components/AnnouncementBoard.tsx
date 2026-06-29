import { useState, useEffect } from 'react';
import { useAppStore, useAuthStore } from '../store';
import {
  Pin, Plus, Trash2, Megaphone, StickyNote, AlertTriangle, X,
} from 'lucide-react';
import type { Announcement } from '../types';
import { formatBeijingDate, getCurrentBeijingDateTimeString } from '../lib/utils';
import { GlassPanel } from './studio';

// Mock API — replace with real endpoints
async function getAnnouncements(): Promise<Announcement[]> {
  const token = useAuthStore.getState().token;
  const res = await fetch('/api/announcements', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data || []);
}

async function createAnnouncement(data: {
  content: string;
  type: string;
  pinned: boolean;
}): Promise<Announcement> {
  const token = useAuthStore.getState().token;
  const res = await fetch('/api/announcements', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('创建公告失败');
  const json = await res.json();
  // 返回的不是完整对象，需要重新构造
  return {
    id: json.id || Date.now(),
    content: data.content,
    type: data.type,
    pinned: data.pinned,
    creator_id: 0,
    created_at: getCurrentBeijingDateTimeString(),
    updated_at: getCurrentBeijingDateTimeString(),
  } as Announcement;
}

async function deleteAnnouncement(id: number): Promise<void> {
  const token = useAuthStore.getState().token;
  const res = await fetch(`/api/announcements/${id}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('删除公告失败');
}

const typeConfig: Record<string, { label: string; icon: typeof Pin; color: string; bgLight: string; bgDark: string; border: string }> = {
  note: { label: '便签', icon: StickyNote, color: '#5c7cfa', bgLight: 'bg-[#5c7cfa]/5', bgDark: 'bg-[#5c7cfa]/10', border: 'border-[#5c7cfa]/20' },
  announcement: { label: '公告', icon: Megaphone, color: '#51cf66', bgLight: 'bg-[#51cf66]/5', bgDark: 'bg-[#51cf66]/10', border: 'border-[#51cf66]/20' },
  important: { label: '重要', icon: AlertTriangle, color: '#ff6b6b', bgLight: 'bg-[#ff6b6b]/5', bgDark: 'bg-[#ff6b6b]/10', border: 'border-[#ff6b6b]/20' },
};

export default function AnnouncementBoard() {
  const appStore = useAppStore();
  const [items, setItems] = useState<Announcement[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState<string>('note');
  const [newPinned, setNewPinned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const data = await getAnnouncements();
      setItems(data);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleCreate = async () => {
    if (!newContent.trim() || submitting) return;
    setSubmitting(true);
    try {
      const created = await createAnnouncement({
        content: newContent.trim(),
        type: newType,
        pinned: newPinned,
      });
      setItems((prev) => [created, ...prev]);
      setNewContent('');
      setNewType('note');
      setNewPinned(false);
      setShowForm(false);
      await fetchItems();
      appStore.addNotification({ title: '创建成功', message: '公告已发布', type: 'success' });
    } catch (err) {
      appStore.addNotification({ title: '创建失败', message: (err as Error).message, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteAnnouncement(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      appStore.addNotification({ title: '已删除', message: '公告已删除', type: 'success' });
    } catch (err) {
      appStore.addNotification({ title: '删除失败', message: (err as Error).message, type: 'error' });
    }
  };

  // Sort: pinned first, then by date
  const sortedItems = [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <GlassPanel className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[14px] bg-studio-amber/15 text-studio-amber">
            <Megaphone className="h-4 w-4" />
          </div>
          <h3 className="text-base font-semibold text-studio-text-primary">公告板</h3>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-button border border-studio-border-soft bg-white/[0.04] text-studio-text-muted transition-colors hover:border-studio-border-active hover:text-studio-text-primary"
          title="添加公告"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>

      {showForm && (
        <div className="mb-4 rounded-card border border-studio-border-soft bg-white/[0.04] p-4">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="输入公告内容..."
            rows={2}
            className="mb-3 min-h-20 w-full resize-y rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm leading-6 text-studio-text-primary outline-none transition focus:border-studio-border-active"
          />
          <div className="flex items-center gap-2 flex-wrap">
            {(['note', 'announcement', 'important'] as const).map((t) => {
              const cfg = typeConfig[t];
              const Icon = cfg.icon;
              return (
                <button
                  key={t}
                  onClick={() => setNewType(t)}
                  className={`inline-flex min-h-8 items-center gap-1.5 rounded-button border px-3 py-1.5 text-xs font-medium transition-colors ${
                    newType === t
                      ? `${cfg.bgDark} ${cfg.border}`
                      : 'border-studio-border-soft bg-white/[0.04] text-studio-text-muted hover:text-studio-text-primary'
                  }`}
                  style={newType === t ? { color: cfg.color } : undefined}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {cfg.label}
                </button>
              );
            })}
            <button
              onClick={() => setNewPinned(!newPinned)}
              className={`inline-flex min-h-8 items-center gap-1 rounded-button border px-3 py-1.5 text-xs font-medium transition-colors ${
                newPinned
                  ? `bg-[#ffd43b]/10 border-[#ffd43b]/30 text-[#ffd43b]`
                  : 'border-studio-border-soft bg-white/[0.04] text-studio-text-muted hover:text-studio-text-primary'
              }`}
            >
              <Pin className="w-3 h-3" />
              置顶
            </button>
            <div className="flex-1" />
            <button
              onClick={handleCreate}
              disabled={!newContent.trim() || submitting}
              className="inline-flex min-h-8 items-center justify-center rounded-button border border-studio-primary/40 bg-studio-primary px-4 py-1.5 text-xs font-semibold text-white transition-all hover:bg-[#6A91FF] disabled:pointer-events-none disabled:opacity-40"
            >
              {submitting ? '发布中...' : '发布'}
            </button>
          </div>
        </div>
      )}

      <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-card border border-studio-border-soft bg-white/[0.04] p-3">
                <div className="mb-2 h-3 w-3/4 rounded bg-white/[0.08]" />
                <div className="h-2 w-1/2 rounded bg-white/[0.08]" />
              </div>
            ))}
          </div>
        ) : sortedItems.length === 0 ? (
          <div className="rounded-card border border-dashed border-studio-border-soft py-6 text-center text-sm text-studio-text-muted">暂无公告</div>
        ) : (
          sortedItems.map((item) => {
            const cfg = typeConfig[item.type] || typeConfig.note;
            const Icon = cfg.icon;
            return (
              <div
                key={item.id}
                className={`group rounded-card border p-3 transition-all duration-200 hover:border-studio-border-active hover:bg-white/[0.07] ${cfg.bgDark} ${cfg.border}`}
              >
                <div className="flex items-start gap-2.5">
                  <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: cfg.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-studio-text-primary">{item.content}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {item.pinned && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-[#ffd43b]">
                          <Pin className="w-2.5 h-2.5" /> 置顶
                        </span>
                      )}
                      <span className="text-[10px] text-studio-text-muted">
                        {item.creator_name || '系统'} · {formatBeijingDate(item.created_at)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="rounded p-1 opacity-0 transition-opacity hover:bg-studio-coral/10 group-hover:opacity-100"
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-[#ff6b6b]" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </GlassPanel>
  );
}
