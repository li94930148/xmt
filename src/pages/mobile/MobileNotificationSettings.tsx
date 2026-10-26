import { Bell, ChevronLeft, Save } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '@/api/transport';
import {
  getNotificationSettings,
  saveNotificationPreferences,
  verifyNotificationPreferences,
} from '@/api/notificationSettings';
import { useAuthStore } from '@/store';
import ErrorState from '@/components/common/ErrorState';

type Preference = Awaited<ReturnType<typeof getNotificationSettings>>['preferences'][number];
type EventType = Awaited<ReturnType<typeof getNotificationSettings>>['events'][number];
type SaveNotice = { kind: 'success' | 'error'; message: string };
type PreferenceRecovery =
  | { kind: 'unknown'; draft: Preference[]; message: string }
  | { kind: 'conflict'; draft: Preference[]; currentPreferences: Preference[] };

export default function MobileNotificationSettings() {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [events, setEvents] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<SaveNotice | null>(null);
  const [recovery, setRecovery] = useState<PreferenceRecovery | null>(null);
  const saveLockRef = useRef(false);
  const load = useCallback(async () => {
    setLoading(true); setLoaded(false); setLoadError(''); setNotice(null);
    if (!token) { setLoadError('登录状态已失效，请重新登录后再加载。'); setLoading(false); return; }
    try {
      const data = await getNotificationSettings(token, fetch, (path) => apiUrl(path.replace(/^\/api/, '')));
      setPreferences(data.preferences);
      setEvents(data.events);
      setLoaded(true);
    } catch (error) { setLoadError(error instanceof Error ? error.message : '通知偏好加载失败，请重试。'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);
  const enabled = (eventId: string) => preferences.find((item) => item.channel === 'web' && item.event_type === eventId)?.enabled ?? false;
  const toggle = (eventId: string) => {
    if (saving || recovery) return;
    setNotice((current) => current?.kind === 'success' ? null : current);
    setPreferences((current) => {
      const existing = current.find((item) => item.channel === 'web' && item.event_type === eventId);
      return existing
        ? current.map((item) => item === existing ? { ...item, enabled: !item.enabled } : item)
        : [...current, { channel: 'web', event_type: eventId, enabled: true }];
    });
  };
  const urlFor = (path: string) => apiUrl(path.replace(/^\/api/, ''));
  const applySaveResult = (result: Awaited<ReturnType<typeof saveNotificationPreferences>>, draft: Preference[]) => {
    if (result.kind === 'saved') {
      setPreferences(result.preferences);
      setRecovery(null);
      setNotice({ kind: 'success', message: result.recovered ? '已核实通知偏好已保存。' : '通知偏好已保存。' });
      return;
    }
    if (result.kind === 'rejected') {
      setNotice({ kind: 'error', message: result.message });
      return;
    }
    if (result.kind === 'conflict') {
      setRecovery({ kind: 'conflict', draft, currentPreferences: result.currentPreferences });
      setNotice(null);
      return;
    }
    setRecovery({ kind: 'unknown', draft, message: result.message });
    setNotice(null);
  };
  const save = async (confirmOverwrite = false) => {
    if (!token || !loaded || loading || loadError || saveLockRef.current || (recovery && !confirmOverwrite)) return;
    const draft = (recovery?.draft ?? preferences).map((preference) => ({ ...preference }));
    saveLockRef.current = true;
    setSaving(true); setNotice(null);
    try {
      const result = await saveNotificationPreferences(token, draft, fetch, urlFor);
      applySaveResult(result, draft);
    }
    finally { saveLockRef.current = false; setSaving(false); }
  };
  const verifyRecovery = async () => {
    if (!token || !recovery || saveLockRef.current) return;
    const pending = recovery;
    saveLockRef.current = true;
    setSaving(true); setNotice(null);
    try {
      const result = await verifyNotificationPreferences(token, pending.draft, fetch, urlFor);
      applySaveResult(result, pending.draft);
    } finally { saveLockRef.current = false; setSaving(false); }
  };
  const restoreCurrentPreferences = () => {
    if (recovery?.kind !== 'conflict') return;
    setPreferences(recovery.currentPreferences);
    setRecovery(null);
    setNotice({ kind: 'success', message: '已载入服务器当前保存的通知偏好。' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => navigate('/me')} className="flex h-11 w-11 items-center justify-center rounded-xl border border-studio-border-soft" aria-label="返回个人设置">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-lg font-semibold">消息通知偏好</h2>
          <p className="text-sm text-studio-text-muted">控制站内提醒的接收范围。</p>
        </div>
      </div>
      {loading ? (
        <p className="py-8 text-center text-sm text-studio-text-muted" role="status">正在加载通知偏好…</p>
      ) : loadError ? (
        <ErrorState className="py-2" title="通知偏好未能加载" description={loadError} onRetry={() => void load()} />
      ) : (
        <section className="overflow-hidden rounded-2xl border border-studio-border-soft bg-studio-surface">
          {events.map((event) => (
            <button
              type="button"
              key={event.id}
              aria-pressed={enabled(event.id)}
              disabled={saving || Boolean(recovery)}
              onClick={() => toggle(event.id)}
              className="flex min-h-16 w-full items-center justify-between gap-4 border-b border-studio-border-soft px-4 text-left last:border-b-0 disabled:cursor-wait disabled:opacity-60"
            >
              <span>
                <span className="block text-sm font-medium">{event.name}</span>
                <span className="mt-1 block text-xs text-studio-text-muted">{event.description}</span>
              </span>
              <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${enabled(event.id) ? 'bg-studio-primary-button' : 'bg-studio-border-soft'}`}>
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${enabled(event.id) ? 'left-6' : 'left-1'}`} />
              </span>
            </button>
          ))}
        </section>
      )}
      {recovery ? (
        <div
          role={recovery.kind === 'unknown' ? 'alert' : 'status'}
          className="space-y-3 rounded-xl border border-studio-amber/30 bg-studio-amber-soft p-4 text-sm text-studio-text-primary"
        >
          <p>
            {recovery.kind === 'unknown'
              ? recovery.message
              : '服务器当前通知偏好与本页设置不同。为避免覆盖其他设备的更新，系统没有自动重复保存。'}
          </p>
          <div className="flex flex-wrap gap-2">
            {recovery.kind === 'unknown' ? (
              <button type="button" onClick={() => void verifyRecovery()} disabled={saving} className="min-h-10 rounded-xl border border-studio-border-soft px-4 py-2 disabled:opacity-60">
                {saving ? '正在核实…' : '只读重新核实'}
              </button>
            ) : (
              <>
                <button type="button" onClick={restoreCurrentPreferences} disabled={saving} className="min-h-10 rounded-xl border border-studio-border-soft px-4 py-2 disabled:opacity-60">
                  载入服务器设置
                </button>
                <button type="button" onClick={() => void save(true)} disabled={saving} className="min-h-10 rounded-xl bg-studio-primary-button px-4 py-2 text-white disabled:opacity-60">
                  {saving ? '正在保存…' : '确认覆盖服务器设置'}
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
      {notice ? <p role={notice.kind === 'error' ? 'alert' : 'status'} className="text-sm text-studio-text-secondary">{notice.message}</p> : null}
      <button type="button" disabled={loading || saving || !loaded || Boolean(loadError) || Boolean(recovery)} onClick={() => void save()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-studio-primary-button px-4 text-sm text-white disabled:opacity-50">
        <Save className="h-4 w-4" />{saving ? '保存中…' : '保存通知偏好'}
      </button>
      <p className="flex items-center gap-2 text-xs text-studio-text-muted"><Bell className="h-4 w-4" />Android 系统推送需由管理员配置推送服务后启用。</p>
    </div>
  );
}
