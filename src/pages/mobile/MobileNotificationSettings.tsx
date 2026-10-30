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
import ConfirmModal from '@/components/common/ConfirmModal';
import { useRouteNavigationGuard, type RouteNavigationAttempt } from '@/hooks/useRouteNavigationGuard';
import { getUserFacingErrorMessage } from '@/lib/userFacingError';
import {
  clearNotificationPreferenceRecovery,
  createNotificationPreferenceRecoveryRequestId,
  persistNotificationPreferenceRecovery,
  readNotificationPreferenceRecovery,
  type PendingNotificationPreferenceRecovery,
} from '@/pages/notificationPreferenceRecovery';

type Preference = Awaited<ReturnType<typeof getNotificationSettings>>['preferences'][number];
type EventType = Awaited<ReturnType<typeof getNotificationSettings>>['events'][number];
type SaveNotice = { kind: 'success' | 'error'; message: string };
type PreferenceRecovery =
  | { kind: 'unknown'; marker: PendingNotificationPreferenceRecovery; draft: Preference[]; message: string }
  | { kind: 'conflict'; marker: PendingNotificationPreferenceRecovery; draft: Preference[]; currentPreferences: Preference[] }
  | { kind: 'blocked'; marker: PendingNotificationPreferenceRecovery | null; message: string };

const notificationSettingsUrlFor = (path: string) => apiUrl(path.replace(/^\/api/, ''));

function preferenceFingerprint(preferences: Preference[]) {
  return JSON.stringify(preferences
    .map(({ channel, event_type, enabled }) => ({ channel, event_type, enabled }))
    .sort((left, right) => `${left.channel}:${left.event_type}`.localeCompare(`${right.channel}:${right.event_type}`)));
}

export default function MobileNotificationSettings() {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const actorId = Number(useAuthStore((state) => state.user?.id));
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [savedPreferences, setSavedPreferences] = useState<Preference[]>([]);
  const [events, setEvents] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<SaveNotice | null>(null);
  const [recovery, setRecovery] = useState<PreferenceRecovery | null>(null);
  const [pendingLeaveAttempt, setPendingLeaveAttempt] = useState<Pick<RouteNavigationAttempt, 'proceed' | 'stay'> | null>(null);
  const saveLockRef = useRef(false);
  const applySaveResult = useCallback((result: Awaited<ReturnType<typeof saveNotificationPreferences>>, marker: PendingNotificationPreferenceRecovery) => {
    if (result.kind === 'saved') {
      if (!clearNotificationPreferenceRecovery(marker)) {
        setRecovery({ kind: 'blocked', marker, message: '服务器已确认通知偏好保存，但本机恢复记录未能清除。设置保持锁定，请只读重新核实。' });
        setNotice(null);
        return;
      }
      setPreferences(result.preferences);
      setSavedPreferences(result.preferences);
      setRecovery(null);
      setNotice({ kind: 'success', message: result.recovered ? '已核实通知偏好已保存。' : '通知偏好已保存。' });
      return;
    }
    if (result.kind === 'rejected') {
      if (!clearNotificationPreferenceRecovery(marker)) {
        setRecovery({ kind: 'blocked', marker, message: '服务器已拒绝本次通知偏好保存，但本机恢复记录未能清除。设置保持锁定，请重新读取恢复记录。' });
        setNotice(null);
        return;
      }
      setRecovery(null);
      setNotice({ kind: 'error', message: result.message });
      return;
    }
    if (result.kind === 'conflict') {
      setRecovery({ kind: 'conflict', marker, draft: marker.draft, currentPreferences: result.currentPreferences });
      setNotice(null);
      return;
    }
    setRecovery({ kind: 'unknown', marker, draft: marker.draft, message: result.message });
    setNotice(null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setLoaded(false); setLoadError(''); setNotice(null);
    if (!token || !Number.isSafeInteger(actorId) || actorId <= 0) {
      setLoadError('登录身份已失效，请重新登录后再加载。'); setLoading(false); return;
    }
    const storedRecovery = readNotificationPreferenceRecovery(actorId);
    const marker = storedRecovery.state === 'valid' ? storedRecovery.recovery : null;
    if (marker) {
      setRecovery({
        kind: 'unknown',
        marker,
        draft: marker.draft,
        message: '发现一项尚未核实的通知偏好保存。系统将只读核实；确认前请勿重复保存。',
      });
    } else if (storedRecovery.state === 'invalid' || storedRecovery.state === 'unavailable') {
      setRecovery({
        kind: 'blocked',
        marker: null,
        message: storedRecovery.state === 'invalid'
          ? '本机通知偏好恢复记录无法安全读取；为避免重复保存，普通保存已暂停。请重新读取恢复记录。'
          : '浏览器暂时无法读取通知偏好恢复记录；为避免重复保存，普通保存已暂停。请检查浏览器存储后重试读取。',
      });
    } else {
      setRecovery(null);
    }
    try {
      const data = await getNotificationSettings(token, fetch, notificationSettingsUrlFor);
      if (Number(useAuthStore.getState().user?.id) !== actorId) return;
      setPreferences(data.preferences);
      setSavedPreferences(data.preferences);
      setEvents(data.events);
      setLoaded(true);
      if (marker) {
        const result = await verifyNotificationPreferences(token, marker.draft, fetch, notificationSettingsUrlFor);
        if (Number(useAuthStore.getState().user?.id) !== actorId) return;
        applySaveResult(result, marker);
      }
    } catch (error) {
      if (Number(useAuthStore.getState().user?.id) !== actorId) return;
      setLoadError(getUserFacingErrorMessage(error, '通知偏好加载失败，请检查连接后重试。'));
    } finally {
      if (Number(useAuthStore.getState().user?.id) === actorId) setLoading(false);
    }
  }, [actorId, applySaveResult, token]);

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
  const save = async (confirmOverwrite = false) => {
    const existingConflict = recovery?.kind === 'conflict' ? recovery : null;
    if (!token || !loaded || loading || loadError || saveLockRef.current || (recovery && (!confirmOverwrite || !existingConflict))) return;
    if (!Number.isSafeInteger(actorId) || actorId <= 0 || Number(useAuthStore.getState().user?.id) !== actorId) {
      setRecovery({ kind: 'blocked', marker: null, message: '当前账号无法确认；通知偏好未发送。请重新读取页面后再试。' });
      return;
    }
    const draft = (existingConflict?.draft ?? preferences).map((preference) => ({
      channel: preference.channel,
      event_type: preference.event_type,
      enabled: preference.enabled,
      config: preference.config ?? null,
    }));
    let marker: PendingNotificationPreferenceRecovery;
    try {
      marker = existingConflict?.marker ?? {
        version: 1,
        actorId,
        requestId: createNotificationPreferenceRecoveryRequestId(),
        draft,
      };
    } catch (error) {
      setNotice({ kind: 'error', message: getUserFacingErrorMessage(error, '通知偏好恢复编号无法创建；设置未发送。') });
      return;
    }
    if (!persistNotificationPreferenceRecovery(marker)) {
      setRecovery({ kind: 'blocked', marker: existingConflict ? marker : null, message: '本机恢复信息未能可靠保存；通知偏好未发送。请检查浏览器存储后重新读取恢复记录。' });
      setNotice(null);
      return;
    }
    saveLockRef.current = true;
    setSaving(true); setNotice(null);
    try {
      const result = await saveNotificationPreferences(token, marker.draft, fetch, notificationSettingsUrlFor);
      if (Number(useAuthStore.getState().user?.id) !== actorId) return;
      applySaveResult(result, marker);
    }
    finally { saveLockRef.current = false; setSaving(false); }
  };
  const verifyRecovery = async () => {
    if (!token || !recovery || recovery.kind !== 'unknown' || saveLockRef.current) return;
    const pending = recovery;
    saveLockRef.current = true;
    setSaving(true); setNotice(null);
    try {
      const result = await verifyNotificationPreferences(token, pending.draft, fetch, notificationSettingsUrlFor);
      if (Number(useAuthStore.getState().user?.id) !== actorId) return;
      applySaveResult(result, pending.marker);
    } finally { saveLockRef.current = false; setSaving(false); }
  };
  const restoreCurrentPreferences = () => {
    if (recovery?.kind !== 'conflict') return;
    if (!clearNotificationPreferenceRecovery(recovery.marker)) {
      setRecovery({ kind: 'blocked', marker: recovery.marker, message: '服务器当前设置已读回，但本机恢复记录未能清除。写入保持锁定，请重新读取恢复记录。' });
      return;
    }
    setPreferences(recovery.currentPreferences);
    setSavedPreferences(recovery.currentPreferences);
    setRecovery(null);
    setNotice({ kind: 'success', message: '已载入服务器当前保存的通知偏好。' });
  };

  const hasUnsavedPreferences = loaded
    && preferenceFingerprint(preferences) !== preferenceFingerprint(savedPreferences);
  const handleRouteNavigationAttempt = useCallback(({ proceed, stay }: RouteNavigationAttempt) => {
    if (saveLockRef.current || saving) {
      setNotice({ kind: 'error', message: '通知偏好仍在保存或核实，请等待处理完成后再离开。' });
      stay();
      return;
    }
    if (hasUnsavedPreferences || recovery) {
      setPendingLeaveAttempt({ proceed, stay });
      return;
    }
    proceed();
  }, [hasUnsavedPreferences, recovery, saving]);
  useRouteNavigationGuard(loaded, handleRouteNavigationAttempt);

  useEffect(() => {
    if (!loaded || (!hasUnsavedPreferences && !recovery && !saving)) return undefined;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedPreferences, loaded, recovery, saving]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => navigate('/me')} className="xmt-btn xmt-btn-ghost h-11 w-11 p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-studio-primary" aria-label="返回个人设置">
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
        <ErrorState announcementRole="alert" className="py-2" title="通知偏好未能加载" description={loadError} onRetry={() => void load()} />
      ) : (
        <section className="overflow-hidden rounded-2xl border border-studio-border-soft bg-studio-surface">
          {events.map((event) => (
            <button
              type="button"
              key={event.id}
              aria-pressed={enabled(event.id)}
              disabled={saving || Boolean(recovery)}
              onClick={() => toggle(event.id)}
              className="flex min-h-16 w-full items-center justify-between gap-4 border-b border-studio-border-soft px-4 text-left transition-colors hover:bg-studio-surface-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-studio-primary last:border-b-0 disabled:cursor-wait disabled:opacity-60"
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
          role={recovery.kind === 'conflict' ? 'status' : 'alert'}
          className="space-y-3 rounded-xl border border-studio-amber/30 bg-studio-amber-soft p-4 text-sm text-studio-text-primary"
        >
          <p>
            {recovery.kind === 'unknown'
              ? recovery.message
              : recovery.kind === 'conflict'
                ? '服务器当前通知偏好与本页设置不同。为避免覆盖其他设备的更新，系统没有自动重复保存。'
                : recovery.message}
          </p>
          <div className="flex flex-wrap gap-2">
            {recovery.kind === 'unknown' ? (
              <button type="button" onClick={() => void verifyRecovery()} disabled={saving} className="xmt-btn xmt-btn-secondary">
                {saving ? '正在核实…' : '只读重新核实'}
              </button>
            ) : recovery.kind === 'conflict' ? (
              <>
                <button type="button" onClick={restoreCurrentPreferences} disabled={saving} className="xmt-btn xmt-btn-secondary">
                  载入服务器设置
                </button>
                <button type="button" onClick={() => void save(true)} disabled={saving} className="xmt-btn xmt-btn-primary">
                  {saving ? '正在保存…' : '确认覆盖服务器设置'}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => void load()} disabled={loading || saving} className="xmt-btn xmt-btn-secondary">
                {loading ? '正在读取…' : '重新读取恢复记录'}
              </button>
            )}
          </div>
        </div>
      ) : null}
      {notice ? <p role={notice.kind === 'error' ? 'alert' : 'status'} className="text-sm text-studio-text-secondary">{notice.message}</p> : null}
      <button type="button" disabled={loading || saving || !loaded || Boolean(loadError) || Boolean(recovery)} onClick={() => void save()} className="xmt-btn xmt-btn-primary inline-flex min-h-11 items-center gap-2 px-4 text-sm disabled:opacity-50">
        <Save className="h-4 w-4" />{saving ? '保存中…' : '保存通知偏好'}
      </button>
      <p className="flex items-center gap-2 text-xs text-studio-text-muted"><Bell className="h-4 w-4" />Android 系统推送需由管理员配置推送服务后启用。</p>
      <ConfirmModal
        open={pendingLeaveAttempt !== null}
        title={recovery?.kind === 'conflict' ? '通知偏好与服务器设置不同' : recovery ? '通知偏好结果尚未核实' : '通知偏好尚未保存'}
        description={recovery?.kind === 'unknown'
          ? '本机已保留待核实状态。离开不会重复保存；重新打开后会先只读核实服务器结果。'
          : recovery?.kind === 'conflict'
            ? '本机会保留待处理设置。重新打开后先只读核实；你可以载入服务器设置或明确确认覆盖。'
            : recovery?.kind === 'blocked'
              ? '恢复状态仍被保护。离开不会清除记录或发送请求；重新打开后可继续只读核实。'
              : '离开后本页尚未保存的通知选择会丢失。重新打开后会重新读取服务器当前设置。'}
        confirmText="离开本页"
        cancelText="继续编辑"
        variant="warning"
        onCancel={() => {
          pendingLeaveAttempt?.stay();
          setPendingLeaveAttempt(null);
        }}
        onConfirm={() => {
          const attempt = pendingLeaveAttempt;
          setPendingLeaveAttempt(null);
          attempt?.proceed();
        }}
      />
    </div>
  );
}
