import { useState, useEffect } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useAppStore, useAuthStore } from '../store';
import {
  Pin, Plus, Trash2, Megaphone, StickyNote, AlertTriangle, X,
} from 'lucide-react';
import type { Announcement } from '../types';
import { formatBeijingDate, getCurrentBeijingDateTimeString } from '../lib/utils';

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
  const styles = useThemeStyles();
  const appStore = useAppStore();
  const [items, setItems] = useState<Announcement[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState<string>('note');
  const [newPinned, setNewPinned] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchItems = async () => {
    try {
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
    if (!newContent.trim()) return;
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
      appStore.addNotification({ title: '创建成功', message: '公告已发布', type: 'success' });
    } catch (err) {
      appStore.addNotification({ title: '创建失败', message: (err as Error).message, type: 'error' });
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
    <div className={`${styles.card} p-5`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            styles.isDark ? 'bg-[#ffd43b]/10' : 'bg-[#f08c00]/10'
          }`}>
            <Megaphone className="w-4 h-4 text-[#ffd43b]" />
          </div>
          <h3 className={`text-base font-semibold ${styles.textPrimary}`}>公告板</h3>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className={`p-2 rounded-lg ${styles.hoverBg} transition-colors`}
          title="添加公告"
        >
          {showForm ? <X className={`w-4 h-4 ${styles.textMuted}`} /> : <Plus className={`w-4 h-4 ${styles.textMuted}`} />}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className={`mb-4 p-4 rounded-xl border ${styles.border} ${styles.isDark ? 'bg-[#1e2030]' : 'bg-[#f8f9fa]'}`}>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="输入公告内容..."
            rows={2}
            className={`w-full px-3 py-2 text-sm ${styles.input} resize-none mb-3`}
          />
          <div className="flex items-center gap-2 flex-wrap">
            {(['note', 'announcement', 'important'] as const).map((t) => {
              const cfg = typeConfig[t];
              const Icon = cfg.icon;
              return (
                <button
                  key={t}
                  onClick={() => setNewType(t)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    newType === t
                      ? `${styles.isDark ? cfg.bgDark : cfg.bgLight} ${cfg.border} text-[${cfg.color}]`
                      : `${styles.hoverBg} ${styles.border} ${styles.textMuted}`
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {cfg.label}
                </button>
              );
            })}
            <button
              onClick={() => setNewPinned(!newPinned)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                newPinned
                  ? `bg-[#ffd43b]/10 border-[#ffd43b]/30 text-[#ffd43b]`
                  : `${styles.hoverBg} ${styles.border} ${styles.textMuted}`
              }`}
            >
              <Pin className="w-3 h-3" />
              置顶
            </button>
            <div className="flex-1" />
            <button
              onClick={handleCreate}
              disabled={!newContent.trim()}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium ${styles.buttonPrimary} disabled:opacity-40 transition-all`}
            >
              发布
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`p-3 rounded-xl ${styles.isDark ? 'bg-[#1e2030]' : 'bg-[#f8f9fa]'} animate-pulse`}>
                <div className={`h-3 rounded ${styles.bgTertiary} w-3/4 mb-2`} />
                <div className={`h-2 rounded ${styles.bgTertiary} w-1/2`} />
              </div>
            ))}
          </div>
        ) : sortedItems.length === 0 ? (
          <div className={`text-center py-6 text-sm ${styles.textMuted}`}>暂无公告</div>
        ) : (
          sortedItems.map((item) => {
            const cfg = typeConfig[item.type] || typeConfig.note;
            const Icon = cfg.icon;
            return (
              <div
                key={item.id}
                className={`group p-3 rounded-xl border transition-all duration-200 hover:shadow-sm ${
                  styles.isDark ? cfg.bgDark : cfg.bgLight
                } ${cfg.border}`}
              >
                <div className="flex items-start gap-2.5">
                  <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: cfg.color }} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${styles.textPrimary} leading-relaxed`}>{item.content}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      {item.pinned && (
                        <span className="flex items-center gap-0.5 text-[10px] text-[#ffd43b]">
                          <Pin className="w-2.5 h-2.5" /> 置顶
                        </span>
                      )}
                      <span className={`text-[10px] ${styles.textMuted}`}>
                        {item.creator_name} · {formatBeijingDate(item.created_at)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity"
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
    </div>
  );
}
