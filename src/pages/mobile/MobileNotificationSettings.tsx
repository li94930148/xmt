import { Bell, ChevronLeft, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '@/api/transport';
import { useAuthStore } from '@/store';

type Preference = { channel: string; event_type: string; enabled: boolean; config?: string };
type EventType = { id: string; name: string; description: string };

export default function MobileNotificationSettings() {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [events, setEvents] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setNotice('');
    try {
      const [preferencesResponse, eventsResponse] = await Promise.all([
        fetch(apiUrl('/notifications/preferences'), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(apiUrl('/notifications/events'), { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (!preferencesResponse.ok || !eventsResponse.ok) throw new Error('通知偏好加载失败');
      setPreferences(await preferencesResponse.json());
      setEvents(await eventsResponse.json());
    } catch (error) { setNotice(error instanceof Error ? error.message : '通知偏好加载失败'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);
  const enabled = (eventId: string) => preferences.find((item) => item.channel === 'web' && item.event_type === eventId)?.enabled ?? false;
  const toggle = (eventId: string) => setPreferences((current) => {
    const existing = current.find((item) => item.channel === 'web' && item.event_type === eventId);
    return existing
      ? current.map((item) => item === existing ? { ...item, enabled: !item.enabled } : item)
      : [...current, { channel: 'web', event_type: eventId, enabled: true }];
  });
  const save = async () => {
    if (!token) return;
    setSaving(true); setNotice('');
    try {
      const response = await fetch(apiUrl('/notifications/preferences'), { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ preferences }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || '通知偏好保存失败');
      setNotice('通知偏好已保存。');
    } catch (error) { setNotice(error instanceof Error ? error.message : '通知偏好保存失败'); }
    finally { setSaving(false); }
  };

  return <div className="space-y-4"><div className="flex items-center gap-2"><button type="button" onClick={() => navigate('/me')} className="flex h-11 w-11 items-center justify-center rounded-xl border border-studio-border-soft" aria-label="返回个人设置"><ChevronLeft className="h-5 w-5" /></button><div><h2 className="text-lg font-semibold">消息通知偏好</h2><p className="text-sm text-studio-text-muted">控制站内提醒的接收范围。</p></div></div>{loading ? <p className="py-8 text-center text-sm text-studio-text-muted">正在加载通知偏好…</p> : <section className="overflow-hidden rounded-2xl border border-studio-border-soft bg-studio-surface">{events.map((event) => <button type="button" key={event.id} onClick={() => toggle(event.id)} className="flex min-h-16 w-full items-center justify-between gap-4 border-b border-studio-border-soft px-4 text-left last:border-b-0"><span><span className="block text-sm font-medium">{event.name}</span><span className="mt-1 block text-xs text-studio-text-muted">{event.description}</span></span><span className={`relative h-6 w-11 shrink-0 rounded-full transition ${enabled(event.id) ? 'bg-studio-primary' : 'bg-studio-border-soft'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${enabled(event.id) ? 'left-6' : 'left-1'}`} /></span></button>)}</section>}{notice ? <p role="status" className="text-sm text-studio-text-secondary">{notice}</p> : null}<button type="button" disabled={loading || saving} onClick={() => void save()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-studio-primary px-4 text-sm text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? '保存中…' : '保存通知偏好'}</button><p className="flex items-center gap-2 text-xs text-studio-text-muted"><Bell className="h-4 w-4" />Android 系统推送需由管理员配置推送服务后启用。</p></div>;
}
