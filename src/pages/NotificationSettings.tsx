import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore, useAppStore } from '../store';
import { updateMyProfile, getSystemSettings, updateSystemSettings } from '../api';
import { apiUrl } from '../api/transport';
import {
  getBackupList,
  downloadBackup,
  deleteBackup,
  BackupApiError,
  BackupFile,
} from '../api/backup';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { usePermission } from '../hooks/usePermission';
import { formatBeijingTime } from '../lib/utils';
import { getRoleDisplayName } from '../lib/roles';
import { ReactBitsAppearancePanel } from '@/features/reactbits-appearance/ReactBitsAppearancePanel';
import { useDesktopNotification } from '../hooks/useDesktopNotification';
import { isSecureContext } from '../utils/notification';
import { useBackupCreateRecovery } from '../hooks/useBackupCreateRecovery';
import { emitClientLog, safeClientErrorClass } from '../observability/client-logger';
import ErrorState from '../components/common/ErrorState';
import ConfirmModal from '../components/common/ConfirmModal';
import PageShell from '../components/studio/PageShell';
import PageHeader from '../components/studio/PageHeader';
import GlassPanel from '../components/studio/GlassPanel';
import {
  getNotificationSettings,
  saveNotificationPreferences,
  verifyNotificationPreferences,
  NotificationChannel,
  NotificationEvent,
  NotificationPreference,
} from '../api/notificationSettings';
import { changelog, getChangeTypeLabel, getChangeTypeColor } from '../data/changelog';
import {
  applyDocumentBranding,
  defaultSystemSettings,
  emitSystemSettingsChanged,
  ManagedSystemSettings,
} from '@/lib/systemSettings';
import {
  Bell,
  BellOff,
  BellRing,
  ChevronRight,
  Database,
  Eye,
  EyeOff,
  HardDrive,
  History,
  Info,
  Loader2,
  Lock,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Save,
  Shield,
  Sparkles,
  Sun,
  Tag,
  Trash2,
  User,
  Volume2,
  VolumeX,
} from 'lucide-react';

declare const __APP_VERSION__: string;

const tabMeta = {
  notifications: { label: '通知偏好', icon: Bell },
  profile: { label: '个人资料', icon: User },
  password: { label: '账号安全', icon: Lock },
  appearance: { label: '外观与动效', icon: Palette },
  system: { label: '系统设置', icon: Monitor },
  branding: { label: '品牌设置', icon: Tag },
  login: { label: '登录页设置', icon: Sparkles },
  database: { label: '数据与备份', icon: Database },
  changelog: { label: '版本更新', icon: History },
  about: { label: '关于系统', icon: Info },
} as const;

type TabKey = keyof typeof tabMeta;
type BackupDeleteRecoveryMarker = { version: 1; actorId: number; name: string };
type NotificationPreferenceRecovery =
  | { kind: 'unknown'; draft: NotificationPreference[]; message: string }
  | { kind: 'conflict'; draft: NotificationPreference[]; currentPreferences: NotificationPreference[] };

const BACKUP_DELETE_RECOVERY_PREFIX = 'xmt:backup-delete-pending:v1:actor:';

function backupDeleteRecoveryKey(actorId: number, name: string) {
  return `${BACKUP_DELETE_RECOVERY_PREFIX}${actorId}:${encodeURIComponent(name)}`;
}

function isSafeBackupName(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 255
    && value.endsWith('.db')
    && !value.includes('/')
    && !value.includes('\\');
}

function readBackupDeleteRecovery(actorId: number | null): BackupDeleteRecoveryMarker | null {
  if (!actorId || typeof window === 'undefined') return null;
  try {
    const prefix = `${BACKUP_DELETE_RECOVERY_PREFIX}${actorId}:`;
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const raw = window.sessionStorage.getItem(key);
      if (!raw) continue;
      const marker = JSON.parse(raw) as Partial<BackupDeleteRecoveryMarker>;
      if (marker.version === 1 && marker.actorId === actorId && isSafeBackupName(marker.name)
        && key === backupDeleteRecoveryKey(actorId, marker.name)) {
        return { version: 1, actorId, name: marker.name };
      }
    }
  } catch {
    return null;
  }
  return null;
}

function persistBackupDeleteRecovery(marker: BackupDeleteRecoveryMarker): boolean {
  try {
    const key = backupDeleteRecoveryKey(marker.actorId, marker.name);
    window.sessionStorage.setItem(key, JSON.stringify(marker));
    return window.sessionStorage.getItem(key) === JSON.stringify(marker);
  } catch {
    return false;
  }
}

function clearBackupDeleteRecovery(marker: BackupDeleteRecoveryMarker): boolean {
  try {
    const key = backupDeleteRecoveryKey(marker.actorId, marker.name);
    const raw = window.sessionStorage.getItem(key);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<BackupDeleteRecoveryMarker>;
      if (stored.version === 1 && stored.actorId === marker.actorId && stored.name === marker.name) {
        window.sessionStorage.removeItem(key);
      }
    }
    return window.sessionStorage.getItem(key) === null;
  } catch {
    return false;
  }
}

export default function NotificationSettings() {
  const styles = useThemeStyles();
  const authStore = useAuthStore();
  const appStore = useAppStore();
  const addNotification = useAppStore((state) => state.addNotification);
  const desktopNotify = useDesktopNotification();
  const token = authStore.token;
  const { hasPermission } = usePermission();
  const canManageDatabase = hasPermission('system:backup');
  const canManageSystem = hasPermission('system:settings');
  const setGlobalSystemSettings = useAppStore((state) => state.setSystemSettings);

  const [requestedTab, setActiveTab] = useState<TabKey>(() => {
    if (sessionStorage.getItem('xmt_show_changelog') === 'true') {
      sessionStorage.removeItem('xmt_show_changelog');
      return 'changelog';
    }
    return authStore.user?.force_change_password ? 'password' : 'notifications';
  });

  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [events, setEvents] = useState<NotificationEvent[]>([]);
  const [notifyLoading, setNotifyLoading] = useState(true);
  const [notifyLoaded, setNotifyLoaded] = useState(false);
  const [notifyLoadError, setNotifyLoadError] = useState('');
  const [notifySaving, setNotifySaving] = useState(false);
  const [notifyRecovery, setNotifyRecovery] = useState<NotificationPreferenceRecovery | null>(null);
  const notifySaveLockRef = useRef(false);
  const logoReaderRef = useRef<FileReader | null>(null);

  const [profileName, setProfileName] = useState(authStore.user?.name || '');
  const [profileEmail, setProfileEmail] = useState(authStore.user?.email || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const profileSaveLockRef = useRef(false);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const passwordSaveLockRef = useRef(false);
  const [passwordOutcomeUnknown, setPasswordOutcomeUnknown] = useState(false);
  const passwordOutcomeUnknownRef = useRef(false);

  const [systemSettings, setSystemSettings] = useState<ManagedSystemSettings>(defaultSystemSettings);
  const [systemSettingsLoading, setSystemSettingsLoading] = useState(false);
  const [systemSettingsLoaded, setSystemSettingsLoaded] = useState(false);
  const [systemSettingsError, setSystemSettingsError] = useState('');
  const [systemSettingsSaving, setSystemSettingsSaving] = useState(false);
  const systemSettingsSaveLockRef = useRef(false);
  const [fontSize, setFontSize] = useState(appStore.fontSize);
  const [appearanceTheme, setAppearanceTheme] = useState<'light' | 'dark'>(appStore.theme);

  const [backupList, setBackupList] = useState<BackupFile[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupError, setBackupError] = useState('');
  const [backupCreating, setBackupCreating] = useState(false);
  const [backupDeleteCandidate, setBackupDeleteCandidate] = useState<string | null>(null);
  const [backupDeleting, setBackupDeleting] = useState<string | null>(null);
  const [backupDeleteRecovery, setBackupDeleteRecovery] = useState<BackupDeleteRecoveryMarker | null>(() => {
    const actorId = Number(authStore.user?.id);
    return Number.isSafeInteger(actorId) && actorId > 0 ? readBackupDeleteRecovery(actorId) : null;
  });
  const [backupDeleteVerifying, setBackupDeleteVerifying] = useState(false);
  const [backupFeedback, setBackupFeedback] = useState('');
  const backupMutationLockRef = useRef(false);
  const backupDeleteVerificationLocksRef = useRef(new Set<string>());
  const backupActorId = Number(authStore.user?.id);
  const validBackupActorId = Number.isSafeInteger(backupActorId) && backupActorId > 0 ? backupActorId : null;

  const tabGroups = useMemo(() => {
    const management: TabKey[] = [];
    if (canManageSystem) {
      management.push('system', 'branding', 'login');
    }
    if (canManageDatabase) {
      management.push('database');
    }
    return [
      { label: '我的设置', tabs: ['notifications', 'profile', 'password', 'appearance'] as TabKey[] },
      ...(management.length ? [{ label: '系统管理', tabs: management }] : []),
      { label: '产品信息', tabs: ['changelog', 'about'] as TabKey[] },
    ];
  }, [canManageDatabase, canManageSystem]);
  const activeTab = tabGroups.some((group) => group.tabs.includes(requestedTab)) ? requestedTab : 'notifications';
  const savedSettings = appStore.systemSettings;

  const verifyBackupDelete = useCallback(async (marker: BackupDeleteRecoveryMarker) => {
    const actorId = Number(useAuthStore.getState().user?.id);
    if (!Number.isSafeInteger(actorId) || actorId !== marker.actorId) return;
    const operationKey = backupDeleteRecoveryKey(marker.actorId, marker.name);
    if (backupDeleteVerificationLocksRef.current.has(operationKey)) return;
    backupDeleteVerificationLocksRef.current.add(operationKey);
    setBackupDeleteVerifying(true);
    setBackupLoading(true);
    setBackupError('');
    try {
      const items = await getBackupList();
      if (Number(useAuthStore.getState().user?.id) !== marker.actorId) return;
      setBackupList(items);
      const stillPresent = items.some((item) => item.name === marker.name);
      if (!clearBackupDeleteRecovery(marker)) {
        setBackupDeleteRecovery(marker);
        setBackupDeleteCandidate(null);
        setBackupFeedback(`已读取备份清单，但本机核实记录暂时无法清理。为避免重复删除，${marker.name} 仍保持锁定；请重试只读核实。`);
        return;
      }

      setBackupDeleteRecovery(null);
      setBackupFeedback(stillPresent
        ? `删除请求未收到确认；备份 ${marker.name} 仍在当前清单中。请核对后决定是否再次删除。`
        : `已核实：当前备份清单中不存在 ${marker.name}，没有重复提交删除。`);
      if (stillPresent) {
        setBackupDeleteCandidate(marker.name);
      } else {
        setBackupDeleteCandidate(null);
        addNotification({
          title: '删除状态已核实',
          message: `当前备份清单中不存在 ${marker.name}；没有重复提交删除。`,
          type: 'success',
        });
      }
    } catch (error) {
      if (Number(useAuthStore.getState().user?.id) !== marker.actorId) return;
      setBackupDeleteRecovery(marker);
      setBackupDeleteCandidate(null);
      setBackupError((error as Error).message || '备份列表暂时无法读取。');
      setBackupFeedback(`删除结果仍待核实；暂时无法读取备份清单。恢复记录已按当前账号和文件名保存，请只读核实，暂不要重复删除。`);
    } finally {
      backupDeleteVerificationLocksRef.current.delete(operationKey);
      if (backupDeleteVerificationLocksRef.current.size === 0) {
        setBackupDeleteVerifying(false);
        setBackupLoading(false);
      }
    }
  }, [addNotification]);

  useEffect(() => {
    void fetchNotificationData();
  }, []);

  useEffect(() => () => logoReaderRef.current?.abort(), []);

  useEffect(() => {
    setProfileName(authStore.user?.name || '');
    setProfileEmail(authStore.user?.email || '');
  }, [authStore.user?.email, authStore.user?.name]);

  useEffect(() => {
    setAppearanceTheme(appStore.theme);
    setFontSize(appStore.fontSize);
  }, [appStore.fontSize, appStore.theme]);

  useEffect(() => {
    if (!canManageSystem) {
      return;
    }

    void fetchSystemSettings();
  }, [canManageSystem]);

  useEffect(() => {
    if (validBackupActorId) {
      const recovery = readBackupDeleteRecovery(validBackupActorId);
      setBackupDeleteRecovery(recovery);
      if (recovery && canManageDatabase) {
        setActiveTab('database');
      }
    } else {
      setBackupDeleteRecovery(null);
    }
  }, [validBackupActorId, canManageDatabase]);

  useEffect(() => {
    if (activeTab === 'database' && canManageDatabase) {
      const recovery = readBackupDeleteRecovery(validBackupActorId);
      if (recovery) {
        setBackupDeleteRecovery(recovery);
        setBackupDeleteCandidate(null);
        void verifyBackupDelete(recovery);
      } else {
        setBackupDeleteRecovery(null);
        void loadBackupItems();
      }
    }
  }, [activeTab, canManageDatabase, validBackupActorId, verifyBackupDelete]);

  async function fetchNotificationData() {
    setNotifyLoading(true);
    setNotifyLoaded(false);
    setNotifyLoadError('');
    if (!token) {
      setNotifyLoadError('登录状态已失效，请重新登录后再加载通知偏好。');
      setNotifyLoading(false);
      return;
    }

    try {
      const data = await getNotificationSettings(token);
      setPreferences(data.preferences);
      setChannels(data.channels);
      setEvents(data.events);
      setNotifyLoaded(true);
    } catch (error) {
      emitClientLog({ event: 'settings.notification_preferences_load_failed', level: 'error', fields: { errorClass: safeClientErrorClass(error) } });
      setNotifyLoadError((error as Error).message || '通知偏好加载失败，请重试。');
    } finally {
      setNotifyLoading(false);
    }
  }

  async function fetchSystemSettings() {
    setSystemSettingsLoading(true);
    setSystemSettingsLoaded(false);
    setSystemSettingsError('');
    try {
      const settings = await getSystemSettings();
      setSystemSettings(settings);
      setGlobalSystemSettings(settings);
      applyDocumentBranding(settings);
      setSystemSettingsLoaded(true);
    } catch (error) {
      setSystemSettingsError((error as Error).message || '系统配置加载失败，请重试。');
    } finally {
      setSystemSettingsLoading(false);
    }
  }

  function isEnabled(channelId: string, eventId: string) {
    const pref = preferences.find((item) => item.channel === channelId && item.event_type === eventId);
    return pref ? pref.enabled : false;
  }

  function handleTogglePreference(channelId: string, eventId: string) {
    if (notifySaving || notifyRecovery) return;
    setPreferences((current) => {
      const existing = current.find((item) => item.channel === channelId && item.event_type === eventId);
      if (!existing) {
        return [...current, { channel: channelId, event_type: eventId, enabled: true }];
      }

      return current.map((item) =>
        item.channel === channelId && item.event_type === eventId
          ? { ...item, enabled: !item.enabled }
          : item,
      );
    });
  }

  function applyNotificationSaveResult(
    result: Awaited<ReturnType<typeof saveNotificationPreferences>>,
    draft: NotificationPreference[],
  ) {
    if (result.kind === 'saved') {
      setPreferences(result.preferences);
      setNotifyRecovery(null);
      appStore.addNotification({
        title: '保存成功',
        message: result.recovered ? '已核实通知偏好已保存' : '通知偏好已更新',
        type: 'success',
      });
      return;
    }
    if (result.kind === 'rejected') {
      appStore.addNotification({ title: '保存失败', message: result.message, type: 'error' });
      return;
    }
    if (result.kind === 'conflict') {
      setNotifyRecovery({ kind: 'conflict', draft, currentPreferences: result.currentPreferences });
      return;
    }
    setNotifyRecovery({ kind: 'unknown', draft, message: result.message });
  }

  async function handleSaveNotifications(confirmOverwrite = false) {
    if (!token || !notifyLoaded || notifyLoading || notifyLoadError || notifySaveLockRef.current
      || (notifyRecovery && !confirmOverwrite)) {
      return;
    }

    const draft = (notifyRecovery?.draft ?? preferences).map((preference) => ({ ...preference }));
    notifySaveLockRef.current = true;
    setNotifySaving(true);
    try {
      const result = await saveNotificationPreferences(token, draft);
      applyNotificationSaveResult(result, draft);
    } finally {
      notifySaveLockRef.current = false;
      setNotifySaving(false);
    }
  }

  async function verifyNotificationRecovery() {
    if (!token || !notifyRecovery || notifySaveLockRef.current) return;
    const recovery = notifyRecovery;
    notifySaveLockRef.current = true;
    setNotifySaving(true);
    try {
      const result = await verifyNotificationPreferences(token, recovery.draft);
      applyNotificationSaveResult(result, recovery.draft);
    } finally {
      notifySaveLockRef.current = false;
      setNotifySaving(false);
    }
  }

  function restoreCurrentNotificationPreferences() {
    if (notifyRecovery?.kind !== 'conflict') return;
    setPreferences(notifyRecovery.currentPreferences);
    setNotifyRecovery(null);
    appStore.addNotification({ title: '已载入服务器设置', message: '页面现在显示服务器当前保存的通知偏好。', type: 'info' });
  }

  async function handleSaveProfile() {
    if (!authStore.user || profileSaveLockRef.current) {
      return;
    }

    profileSaveLockRef.current = true;
    setProfileSaving(true);
    try {
      const profile = await updateMyProfile({ name: profileName, email: profileEmail });
      authStore.login({ ...authStore.user, name: profile.name, email: profile.email }, authStore.token!);
      appStore.addNotification({ title: '保存成功', message: '个人资料已更新', type: 'success' });
    } catch (error) {
      appStore.addNotification({ title: '保存失败', message: (error as Error).message, type: 'error' });
    } finally {
      profileSaveLockRef.current = false;
      setProfileSaving(false);
    }
  }

  async function handleChangePassword() {
    if (passwordSaveLockRef.current || passwordOutcomeUnknownRef.current) {
      return;
    }
    if (!oldPassword) {
      appStore.addNotification({ title: '修改失败', message: '请输入当前密码', type: 'error' });
      return;
    }
    if (newPassword.length < 6) {
      appStore.addNotification({ title: '修改失败', message: '新密码至少需要 6 位', type: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      appStore.addNotification({ title: '修改失败', message: '两次输入的新密码不一致', type: 'error' });
      return;
    }

    passwordSaveLockRef.current = true;
    setPwdSaving(true);
    try {
      let response: { status: number; body: unknown; bodyIsJson: boolean };
      try {
        response = await new Promise((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open('POST', apiUrl('/auth/change-password'));
          request.timeout = 15_000;
          if (token) request.setRequestHeader('Authorization', `Bearer ${token}`);
          request.setRequestHeader('Content-Type', 'application/json');
          request.onload = () => {
            let body: unknown = null;
            let bodyIsJson = false;
            try {
              body = JSON.parse(request.responseText);
              bodyIsJson = typeof body === 'object' && body !== null && !Array.isArray(body);
            } catch {
              // A non-JSON response cannot confirm a successful password update.
            }
            resolve({ status: request.status, body, bodyIsJson });
          };
          request.onerror = () => reject(new TypeError('Password change response was not received'));
          request.ontimeout = () => reject(new TypeError('Password change response was not received'));
          request.onabort = () => reject(new TypeError('Password change response was not received'));
          request.send(JSON.stringify({ oldPassword, newPassword }));
        });
      } catch {
        passwordOutcomeUnknownRef.current = true;
        setPasswordOutcomeUnknown(true);
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        appStore.addNotification({
          title: '结果尚未确认',
          message: '密码修改请求未收到确认。请不要重复提交；退出后尝试使用新密码重新登录。',
          type: 'error',
        });
        return;
      }

      const body = response.body as { message?: unknown } | null;
      const message = typeof body?.message === 'string' && body.message ? body.message : '密码修改请求未收到确认';
      if (response.status < 200 || response.status >= 300 || !response.bodyIsJson) {
        // These responses are emitted before the password transaction. A generic 401 is
        // deliberately not included: middleware can return it after auth_version changed.
        const definitelyRejected = response.status === 400
          || response.status === 404
          || response.status === 429
          || (response.status === 401 && message === '旧密码错误');
        if (definitelyRejected) {
          appStore.addNotification({ title: '修改失败', message, type: 'error' });
          return;
        }

        passwordOutcomeUnknownRef.current = true;
        setPasswordOutcomeUnknown(true);
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        appStore.addNotification({
          title: '结果尚未确认',
          message: '密码修改请求未收到确认。请不要重复提交；退出后尝试使用新密码重新登录。',
          type: 'error',
        });
        return;
      }

      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (authStore.user?.force_change_password) {
        authStore.login({ ...authStore.user, force_change_password: false }, authStore.token!);
      }
      appStore.addNotification({ title: '修改成功', message: '密码已更新', type: 'success' });
    } finally {
      passwordSaveLockRef.current = false;
      setPwdSaving(false);
    }
  }

  async function handleSaveSystemSection(patch: Partial<ManagedSystemSettings>, successMessage: string) {
    if (!canManageSystem || !systemSettingsLoaded || systemSettingsLoading || systemSettingsSaving || systemSettingsSaveLockRef.current) return;
    systemSettingsSaveLockRef.current = true;
    setSystemSettingsSaving(true);
    try {
      const next = await updateSystemSettings(patch);
      setSystemSettings(next);
      setGlobalSystemSettings(next);
      applyDocumentBranding(next);
      emitSystemSettingsChanged();
      appStore.addNotification({ title: '保存成功', message: successMessage, type: 'success' });
    } catch (error) {
      appStore.addNotification({ title: '保存失败', message: (error as Error).message, type: 'error' });
    } finally {
      systemSettingsSaveLockRef.current = false;
      setSystemSettingsSaving(false);
    }
  }

  function handleLogoUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = event.target.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      appStore.addNotification({ title: '选择失败', message: '请选择图片文件', type: 'error' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      appStore.addNotification({ title: '选择失败', message: '图片大小不能超过 2MB', type: 'error' });
      return;
    }

    logoReaderRef.current?.abort();
    const reader = new FileReader();
    logoReaderRef.current = reader;
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const image = new Image();
      image.onload = () => {
        if (logoReaderRef.current !== reader) return;
        logoReaderRef.current = null;
        setSystemSettings((current) => ({
          ...current,
          branding: { ...current.branding, logo: dataUrl },
        }));
        appStore.addNotification({ title: 'Logo 已选择', message: '当前仅更新本页预览；点击“保存品牌设置”后才会应用。', type: 'success' });
      };
      image.onerror = () => {
        if (logoReaderRef.current !== reader) return;
        logoReaderRef.current = null;
        appStore.addNotification({ title: '读取图片失败', message: '文件内容无法解码为图片，请换一张图片重试。', type: 'error' });
      };
      image.src = dataUrl;
    };
    reader.onerror = () => {
      if (logoReaderRef.current !== reader) return;
      logoReaderRef.current = null;
      appStore.addNotification({ title: '读取图片失败', message: '无法读取所选文件，请重试。', type: 'error' });
    };
    reader.onabort = () => {
      if (logoReaderRef.current === reader) logoReaderRef.current = null;
    };
    reader.readAsDataURL(file);
  }

  function handleSaveAppearance() {
    appStore.setFontSize(fontSize);
    if (appearanceTheme !== appStore.theme) {
      appStore.toggleTheme();
    }
    appStore.addNotification({
      title: '保存成功',
      message: `个人偏好已更新，当前字号 ${fontSize}px`,
      type: 'success',
    });
  }

  async function loadBackupItems(): Promise<boolean> {
    setBackupLoading(true);
    setBackupError('');
    try {
      setBackupList(await getBackupList());
      setBackupFeedback('');
      return true;
    } catch (error) {
      setBackupError((error as Error).message || '备份列表加载失败，请重试。');
      return false;
    } finally {
      setBackupLoading(false);
    }
  }

  async function handleRefreshBackupList() {
    const recovery = validBackupActorId
      ? backupDeleteRecovery?.actorId === validBackupActorId
        ? backupDeleteRecovery
        : readBackupDeleteRecovery(validBackupActorId)
      : null;
    if (recovery) {
      await verifyBackupDelete(recovery);
      return;
    }
    await loadBackupItems();
  }

  async function handleBackupConfirmed(result: { name: string }, recovered: boolean) {
    appStore.addNotification({
      title: recovered ? '备份结果已核实' : '备份成功',
      message: `已创建备份：${result.name}`,
      type: 'success',
    });
    if (!(await loadBackupItems())) {
      setBackupFeedback(`服务端已确认创建备份 ${result.name}，但备份列表刷新失败；请重新加载列表确认，不要重复创建。`);
    }
  }
  const backupRecovery = useBackupCreateRecovery(handleBackupConfirmed);

  async function handleCreateBackup() {
    if (backupMutationLockRef.current || backupLoading || backupRecovery.busy || backupRecovery.pending || backupDeleteRecovery || backupDeleteVerifying) return;
    backupMutationLockRef.current = true;
    setBackupCreating(true);
    setBackupFeedback('');
    try {
      await backupRecovery.start();
    } finally {
      backupMutationLockRef.current = false;
      setBackupCreating(false);
    }
  }

  async function handleDownloadBackup(name: string) {
    try {
      await downloadBackup(name);
      appStore.addNotification({ title: '下载成功', message: '备份文件已开始下载', type: 'success' });
    } catch (error) {
      appStore.addNotification({ title: '下载失败', message: (error as Error).message, type: 'error' });
    }
  }

  async function handleDeleteBackup(name: string) {
    if (backupMutationLockRef.current || backupLoading || backupRecovery.busy || backupRecovery.pending || backupDeleteRecovery || backupDeleteVerifying) return;
    if (!validBackupActorId) {
      appStore.addNotification({ title: '未能删除备份', message: '当前登录账号不可用；没有提交删除请求。', type: 'error' });
      return;
    }
    const recovery: BackupDeleteRecoveryMarker = { version: 1, actorId: validBackupActorId, name };
    if (!persistBackupDeleteRecovery(recovery)) {
      setBackupFeedback(`无法保存 ${name} 的删除核实记录；本次没有提交删除。`);
      return;
    }
    const isCurrentActor = () => Number(useAuthStore.getState().user?.id) === recovery.actorId;
    setBackupDeleteRecovery(recovery);
    backupMutationLockRef.current = true;
    setBackupDeleting(name);
    setBackupFeedback('');
    try {
      await deleteBackup(name);
      if (!isCurrentActor()) return;
      const recoveryCleared = clearBackupDeleteRecovery(recovery);
      if (recoveryCleared) setBackupDeleteRecovery(null);
      setBackupDeleteCandidate(null);
      setBackupList((current) => current.filter((item) => item.name !== name));
      appStore.addNotification({ title: '删除成功', message: '备份文件已删除', type: 'success' });
      if (!recoveryCleared) {
        setBackupDeleteRecovery(recovery);
        await verifyBackupDelete(recovery);
      } else if (!(await loadBackupItems())) {
        setBackupFeedback(`服务端已确认删除备份 ${name}，但备份列表刷新失败；请重新加载列表确认，不要重复删除。`);
      }
    } catch (error) {
      if (!isCurrentActor()) return;
      const status = error instanceof BackupApiError ? error.status : null;
      const outcomeMayBeUnknown = status === null || status === 404 || status === 408 || status === 429 || status >= 500;
      if (outcomeMayBeUnknown) {
        await verifyBackupDelete(recovery);
      } else if (clearBackupDeleteRecovery(recovery)) {
        setBackupDeleteRecovery(null);
        appStore.addNotification({ title: '删除失败', message: (error as Error).message, type: 'error' });
      } else {
        setBackupDeleteRecovery(recovery);
        setBackupDeleteCandidate(null);
        setBackupFeedback(`删除请求被拒绝，但本机核实记录无法清理。为避免重复删除，${name} 暂时保持锁定；请只读核实。`);
      }
    } finally {
      backupMutationLockRef.current = false;
      setBackupDeleting(null);
    }
  }

  function renderInput(
    label: string,
    value: string,
    onChange: (value: string) => void,
    type = 'text',
    placeholder?: string,
    disabled = false,
  ) {
    return (
      <div>
        <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>{label}</label>
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full px-4 py-2.5 ${styles.input}`}
        />
      </div>
    );
  }

  function renderSystemInput(label: string, value: string, onChange: (value: string) => void) {
    return renderInput(label, value, onChange, 'text', undefined, systemSettingsSaving);
  }

  return (
    <PageShell>
      <PageHeader
        title="设置中心"
        description={canManageSystem || canManageDatabase
          ? '个人偏好在“我的设置”中调整，团队共用配置在“系统管理”中维护。'
          : '管理你的资料、账号安全、外观与通知偏好。'}
      />

      <div className="flex flex-col gap-6 lg:flex-row">
        <GlassPanel className="w-full flex-shrink-0 self-start p-2 lg:w-56">
          <nav aria-label="设置分类" className="space-y-3">
            {tabGroups.map((group) => (
              <section key={group.label} aria-label={group.label}>
                <h2 className="px-3 pb-1 pt-2 text-xs font-semibold text-studio-text-secondary">{group.label}</h2>
                <div className="grid grid-cols-2 gap-1 lg:grid-cols-1">
                  {group.tabs.map((key) => {
                    const meta = tabMeta[key];
                    const Icon = meta.icon;
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-current={activeTab === key ? 'page' : undefined}
                        onClick={() => setActiveTab(key)}
                        className={`xmt-btn xmt-btn-ghost min-w-0 w-full justify-start gap-2 px-3 text-sm ${
                          activeTab === key ? 'bg-studio-surface-soft text-studio-text-primary' : styles.textSecondary
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 text-left">{meta.label}</span>
                        <ChevronRight className={`ml-auto h-3 w-3 shrink-0 ${activeTab === key ? 'text-studio-primary' : styles.textMuted}`} />
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </nav>
        </GlassPanel>

        <GlassPanel className="min-w-0 flex-1 overflow-visible p-4 sm:p-6">
          {canManageSystem && ['system', 'branding', 'login'].includes(activeTab) && !systemSettingsLoaded && (
            systemSettingsError ? (
              <ErrorState title="系统配置未能加载" description={systemSettingsError} onRetry={() => void fetchSystemSettings()} />
            ) : (
              <div className="flex min-h-40 items-center justify-center gap-2 text-studio-text-secondary" role="status">
                <Loader2 className="h-5 w-5 animate-spin" />正在读取系统配置
              </div>
            )
          )}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className={`text-lg font-semibold ${styles.textPrimary}`}>通知偏好</h2>
                  <p className={`mt-1 text-sm ${styles.textSecondary}`}>管理消息提醒方式、桌面通知与测试提醒。</p>
                </div>
                <button
                  onClick={() => void handleSaveNotifications()}
                  disabled={notifySaving || notifyLoading || !notifyLoaded || Boolean(notifyLoadError) || Boolean(notifyRecovery)}
                  className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 ${styles.buttonPrimary} disabled:opacity-60`}
                >
                  {notifySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {notifySaving ? '保存中...' : '保存设置'}
                </button>
              </div>

              {notifyRecovery ? (
                <div
                  role={notifyRecovery.kind === 'unknown' ? 'alert' : 'status'}
                  className={`space-y-3 rounded-xl border border-studio-amber/30 bg-studio-amber-soft px-4 py-3 text-sm ${styles.textPrimary}`}
                >
                  <p>
                    {notifyRecovery.kind === 'unknown'
                      ? notifyRecovery.message
                      : '服务器当前通知偏好与本页设置不同。为避免覆盖其他设备的更新，系统没有自动重复保存。'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {notifyRecovery.kind === 'unknown' ? (
                      <button type="button" onClick={() => void verifyNotificationRecovery()} disabled={notifySaving} className="xmt-btn xmt-btn-secondary">
                        {notifySaving ? '正在核实…' : '只读重新核实'}
                      </button>
                    ) : (
                      <>
                        <button type="button" onClick={restoreCurrentNotificationPreferences} disabled={notifySaving} className="xmt-btn xmt-btn-secondary">
                          载入服务器设置
                        </button>
                        <button type="button" onClick={() => void handleSaveNotifications(true)} disabled={notifySaving} className="xmt-btn xmt-btn-primary">
                          {notifySaving ? '正在保存…' : '确认覆盖服务器设置'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : null}

              <div className={`rounded-2xl ${styles.bgTertiary} p-5`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div>
                    <h3 className={`font-medium ${styles.textPrimary}`}>桌面通知与提示音</h3>
                    <p className={`mt-1 text-sm ${styles.textSecondary}`}>
                      当前浏览器环境：
                      {isSecureContext() ? '安全上下文，可申请系统通知权限' : '非安全上下文，桌面通知不可用'}
                    </p>
                  </div>
                  {desktopNotify.supported && desktopNotify.permission !== 'granted' && (
                    <button
                      onClick={() => void desktopNotify.requestPermission()}
                      className={`shrink-0 self-start whitespace-nowrap rounded-lg px-3 py-2 text-sm ${styles.buttonSecondary}`}
                    >
                      申请权限
                    </button>
                  )}
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <button onClick={desktopNotify.toggleEnabled} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left ${styles.border} ${styles.hoverBg}`}>
                    {desktopNotify.enabled ? <BellRing className="h-5 w-5 text-studio-success" /> : <BellOff className="h-5 w-5 text-studio-text-muted" />}
                    <div>
                      <p className={`text-sm font-medium ${styles.textPrimary}`}>桌面通知</p>
                      <p className={`text-xs ${styles.textSecondary}`}>{desktopNotify.enabled ? '已开启' : '已关闭'}</p>
                    </div>
                  </button>
                  <button onClick={desktopNotify.toggleSound} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left ${styles.border} ${styles.hoverBg}`}>
                    {desktopNotify.soundEnabled ? <Volume2 className="h-5 w-5 text-studio-primary" /> : <VolumeX className="h-5 w-5 text-studio-text-muted" />}
                    <div>
                      <p className={`text-sm font-medium ${styles.textPrimary}`}>提示音</p>
                      <p className={`text-xs ${styles.textSecondary}`}>{desktopNotify.soundEnabled ? '已开启' : '已关闭'}</p>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      desktopNotify.testSound();
                      desktopNotify.notify({ title: '测试通知', body: '这是一条测试通知。' });
                    }}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left ${styles.border} ${styles.hoverBg}`}
                  >
                    <Sparkles className="h-5 w-5 text-studio-amber" />
                    <div>
                      <p className={`text-sm font-medium ${styles.textPrimary}`}>发送测试</p>
                      <p className={`text-xs ${styles.textSecondary}`}>检查声音与桌面通知</p>
                    </div>
                  </button>
                </div>
              </div>

              <div className={`overflow-hidden rounded-2xl ${styles.card}`}>
                {notifyLoading ? (
                  <div className={`flex h-40 items-center justify-center ${styles.textMuted}`}>
                    <Loader2 className="h-7 w-7 animate-spin" />
                  </div>
                ) : notifyLoadError ? (
                  <ErrorState
                    className="py-2"
                    title="通知偏好未能加载"
                    description={notifyLoadError}
                    onRetry={() => void fetchNotificationData()}
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-studio-border-soft">
                      <thead className={styles.bgTertiary}>
                        <tr>
                          <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${styles.textSecondary}`}>事件</th>
                          {channels.map((channel) => (
                            <th key={channel.id} className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${styles.textSecondary}`}>
                              {channel.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-studio-border-soft">
                        {events.map((event) => (
                          <tr key={event.id}>
                            <td className="px-6 py-4">
                              <p className={`font-medium ${styles.textPrimary}`}>{event.name}</p>
                              <p className={`mt-1 text-xs ${styles.textSecondary}`}>{event.description}</p>
                            </td>
                            {channels.map((channel) => (
                              <td key={`${event.id}-${channel.id}`} className="px-6 py-4">
                                <button
                                  onClick={() => handleTogglePreference(channel.id, event.id)}
                                  disabled={notifySaving || Boolean(notifyRecovery)}
                                  className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${
                                    isEnabled(channel.id, event.id)
                                      ? 'bg-studio-success/10 text-studio-success-contrast'
                                      : `${styles.bgTertiary} ${styles.textSecondary}`
                                  }`}
                                >
                                  {isEnabled(channel.id, event.id) ? '已启用' : '已关闭'}
                                </button>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div>
                <h2 className={`text-lg font-semibold ${styles.textPrimary}`}>个人资料</h2>
                <p className={`mt-1 text-sm ${styles.textMuted}`}>更新你的姓名和邮箱信息。</p>
              </div>

              <div className="grid gap-5 md:max-w-xl">
                {renderInput('姓名', profileName, setProfileName)}
                {renderInput('邮箱', profileEmail, setProfileEmail, 'email')}
              </div>

              <button
                onClick={handleSaveProfile}
                disabled={profileSaving}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 ${styles.buttonPrimary} disabled:opacity-60`}
              >
                {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {profileSaving ? '保存中...' : '保存个人资料'}
              </button>
            </div>
          )}

          {activeTab === 'password' && (
            <div className="space-y-6">
              <div>
                <h2 className={`text-lg font-semibold ${styles.textPrimary}`}>账号安全</h2>
                <p className={`mt-1 text-sm ${styles.textMuted}`}>建议定期更新密码，并保证至少 6 位。</p>
              </div>

              <div className="grid gap-5 md:max-w-xl">
                <div>
                  <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>当前密码</label>
                  <div className="relative">
                    <input type={showOldPwd ? 'text' : 'password'} value={oldPassword} disabled={pwdSaving || passwordOutcomeUnknown} onChange={(event) => setOldPassword(event.target.value)} className={`w-full px-4 py-2.5 pr-12 ${styles.input} disabled:cursor-not-allowed disabled:opacity-60`} />
                    <button type="button" onClick={() => setShowOldPwd((value) => !value)} className={`absolute right-4 top-1/2 -translate-y-1/2 ${styles.textMuted}`}>
                      {showOldPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>新密码</label>
                  <div className="relative">
                    <input type={showNewPwd ? 'text' : 'password'} value={newPassword} disabled={pwdSaving || passwordOutcomeUnknown} onChange={(event) => setNewPassword(event.target.value)} className={`w-full px-4 py-2.5 pr-12 ${styles.input} disabled:cursor-not-allowed disabled:opacity-60`} />
                    <button type="button" onClick={() => setShowNewPwd((value) => !value)} className={`absolute right-4 top-1/2 -translate-y-1/2 ${styles.textMuted}`}>
                      {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>确认新密码</label>
                  <div className="relative">
                    <input type={showConfirmPwd ? 'text' : 'password'} value={confirmPassword} disabled={pwdSaving || passwordOutcomeUnknown} onChange={(event) => setConfirmPassword(event.target.value)} className={`w-full px-4 py-2.5 pr-12 ${styles.input} disabled:cursor-not-allowed disabled:opacity-60`} />
                    <button type="button" onClick={() => setShowConfirmPwd((value) => !value)} className={`absolute right-4 top-1/2 -translate-y-1/2 ${styles.textMuted}`}>
                      {showConfirmPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {passwordOutcomeUnknown ? (
                <div data-testid="password-outcome-unknown" role="alert" className="rounded-xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast">
                  密码修改结果尚未确认。为避免重复提交，当前密码表单已锁定。请退出后尝试使用新密码重新登录；如果新密码无法登录，请使用密码找回或联系管理员。
                </div>
              ) : null}

              <button
                onClick={handleChangePassword}
                disabled={pwdSaving || passwordOutcomeUnknown}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 ${styles.buttonPrimary} disabled:opacity-60`}
              >
                {pwdSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                {pwdSaving ? '提交中...' : passwordOutcomeUnknown ? '结果待核实' : '更新密码'}
              </button>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h2 className={`text-lg font-semibold ${styles.textPrimary}`}>外观与动效</h2>
                <p className={`mt-1 text-sm ${styles.textMuted}`}>这些设置仅保存在当前浏览器，不会影响其他管理员设备。</p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                <label htmlFor="appearance-theme" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>主题</label>
                  <select id="appearance-theme" aria-label="主题" value={appearanceTheme} onChange={(event) => setAppearanceTheme(event.target.value as 'light' | 'dark')} className={`w-full px-4 py-2.5 ${styles.input}`}>
                    <option value="dark">深色模式</option>
                    <option value="light">浅色模式</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="interface-font-size" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>界面字号</label>
                  <select id="interface-font-size" value={fontSize} onChange={(event) => setFontSize(parseInt(event.target.value, 10))} className={`w-full px-4 py-2.5 ${styles.input}`}>
                    {[14, 16, 18, 20, 22, 24].map((size) => (
                      <option key={size} value={size}>{size}px</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <button onClick={() => setAppearanceTheme('light')} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${styles.border} ${styles.hoverBg}`}>
                  <Sun className="h-5 w-5 text-studio-amber" />
                  <div className="text-left">
                    <p className={`text-sm font-medium ${styles.textPrimary}`}>浅色模式</p>
                    <p className={`text-xs ${styles.textMuted}`}>适合明亮办公环境</p>
                  </div>
                </button>
                <button onClick={() => setAppearanceTheme('dark')} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${styles.border} ${styles.hoverBg}`}>
                  <Moon className="h-5 w-5 text-studio-primary" />
                  <div className="text-left">
                    <p className={`text-sm font-medium ${styles.textPrimary}`}>深色模式</p>
                    <p className={`text-xs ${styles.textMuted}`}>适合长时间创作</p>
                  </div>
                </button>
              </div>

              <ReactBitsAppearancePanel />

              <button onClick={handleSaveAppearance} className={`flex items-center gap-2 rounded-xl px-4 py-2 ${styles.buttonPrimary}`}>
                <Save className="h-4 w-4" /> 保存个人偏好
              </button>
            </div>
          )}

          {activeTab === 'system' && canManageSystem && systemSettingsLoaded && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className={`text-lg font-semibold ${styles.textPrimary}`}>系统设置</h2>
                  <p className={`mt-1 text-sm ${styles.textMuted}`}>后端统一管理系统名称、标题和系统简介。</p>
                </div>
                {systemSettingsLoading && <Loader2 className={`h-5 w-5 animate-spin ${styles.textMuted}`} />}
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {renderSystemInput('系统名称', systemSettings.system.name, (value) => setSystemSettings((current) => ({ ...current, system: { ...current.system, name: value } })))}
                {renderSystemInput('页签标题', systemSettings.system.browserTitle, (value) => setSystemSettings((current) => ({ ...current, system: { ...current.system, browserTitle: value } })))}
              </div>

              <div className="max-w-xl">
                <label htmlFor="system-default-theme" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>默认主题</label>
                <select
                  id="system-default-theme"
                  aria-label="默认主题"
                  value={systemSettings.system.defaultTheme}
                  disabled={systemSettingsSaving}
                  onChange={(event) => setSystemSettings((current) => ({
                    ...current,
                    system: { ...current.system, defaultTheme: event.target.value as 'light' | 'dark' },
                  }))}
                  className={`w-full px-4 py-2.5 ${styles.input}`}
                >
                  <option value="dark">暗色</option>
                  <option value="light">亮色</option>
                </select>
                <p className={`mt-2 text-sm ${styles.textMuted}`}>仅在此浏览器尚未保存个人主题时生效；已手动选择的主题不会被覆盖。</p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {renderSystemInput('系统图标（单字或 Emoji）', systemSettings.system.icon, (value) => setSystemSettings((current) => ({ ...current, system: { ...current.system, icon: value } })))}
                {renderSystemInput('系统简介', systemSettings.system.description, (value) => setSystemSettings((current) => ({ ...current, system: { ...current.system, description: value } })))}
              </div>

              <button
                onClick={() => void handleSaveSystemSection({ system: systemSettings.system }, '系统设置已更新')}
                disabled={systemSettingsSaving}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 ${styles.buttonPrimary} disabled:opacity-60`}
              >
                {systemSettingsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                保存系统设置
              </button>
            </div>
          )}

          {activeTab === 'branding' && canManageSystem && systemSettingsLoaded && (
            <div className="space-y-6">
              <div>
                <h2 className={`text-lg font-semibold ${styles.textPrimary}`}>品牌设置</h2>
                <p className={`mt-1 text-sm ${styles.textMuted}`}>统一管理品牌名称、Logo 和展示文案。</p>
                <p className={`mt-1 text-sm ${styles.textMuted}`}>选择或移除只更新本页预览；点击“保存品牌设置”后才会同步应用。</p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {renderSystemInput('品牌名称', systemSettings.branding.brandName, (value) => setSystemSettings((current) => ({ ...current, branding: { ...current.branding, brandName: value } })))}
                {renderSystemInput('品牌展示文案', systemSettings.branding.brandDescription, (value) => setSystemSettings((current) => ({ ...current, branding: { ...current.branding, brandDescription: value } })))}
              </div>

              <div>
                <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>品牌 Logo</label>
                <div className="flex items-center gap-4">
                  <div className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed ${systemSettings.branding.logo ? 'border-studio-primary' : `${styles.border} ${styles.bgTertiary}`}`}>
                    {systemSettings.branding.logo ? (
                      <img src={systemSettings.branding.logo} alt="系统 Logo" className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-2xl">{systemSettings.system.icon}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <label aria-disabled={systemSettingsSaving} className={`rounded-lg px-4 py-2 ${styles.buttonPrimary} ${systemSettingsSaving ? 'pointer-events-none cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                      选择图片
                      <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={systemSettingsSaving} className="hidden" />
                    </label>
                    {systemSettings.branding.logo && (
                      <button
                        onClick={() => setSystemSettings((current) => ({ ...current, branding: { ...current.branding, logo: '' } }))}
                        disabled={systemSettingsSaving}
                        className="rounded-lg border border-studio-coral/30 px-4 py-2 text-studio-coral-contrast hover:bg-studio-coral/10"
                      >
                        移除 Logo
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => void handleSaveSystemSection({ branding: systemSettings.branding }, '品牌设置已更新')}
                disabled={systemSettingsSaving}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 ${styles.buttonPrimary} disabled:opacity-60`}
              >
                {systemSettingsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                保存品牌设置
              </button>
            </div>
          )}

          {activeTab === 'login' && canManageSystem && systemSettingsLoaded && (
            <div className="space-y-6">
              <div>
                <h2 className={`text-lg font-semibold ${styles.textPrimary}`}>登录页设置</h2>
                <p className={`mt-1 text-sm ${styles.textMuted}`}>统一管理登录页布局、欢迎语和登录说明。</p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>登录页布局</label>
                  <select value={systemSettings.login.layout} disabled={systemSettingsSaving} onChange={(event) => setSystemSettings((current) => ({ ...current, login: { ...current.login, layout: event.target.value as ManagedSystemSettings['login']['layout'] } }))} className={`w-full px-4 py-2.5 ${styles.input}`}>
                    <option value="style1">样式一（暗色经典）</option>
                    <option value="style2">样式二（金色聚焦）</option>
                    <option value="style3">样式三（双栏对比）</option>
                  </select>
                </div>
                {renderSystemInput('欢迎标题', systemSettings.login.welcomeTitle, (value) => setSystemSettings((current) => ({ ...current, login: { ...current.login, welcomeTitle: value } })))}
              </div>

              <div className="grid gap-6">
                {renderSystemInput('欢迎说明', systemSettings.login.welcomeMessage, (value) => setSystemSettings((current) => ({ ...current, login: { ...current.login, welcomeMessage: value } })))}
              </div>

              <button
                onClick={() => void handleSaveSystemSection({ login: systemSettings.login }, '登录页设置已更新')}
                disabled={systemSettingsSaving}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 ${styles.buttonPrimary} disabled:opacity-60`}
              >
                {systemSettingsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                保存登录页设置
              </button>
            </div>
          )}

          {activeTab === 'database' && canManageDatabase && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className={`text-lg font-semibold ${styles.textPrimary}`}>数据与备份</h2>
                  <p className={`mt-1 text-sm ${styles.textMuted}`}>创建、下载和清理系统备份。</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => void handleRefreshBackupList()} disabled={backupLoading || backupCreating || backupRecovery.busy || backupDeleting !== null || backupDeleteVerifying} className={`flex items-center gap-2 rounded-xl px-4 py-2 ${styles.buttonSecondary} disabled:opacity-60`}>
                    <RefreshCw className={`h-4 w-4 ${backupLoading || backupDeleteVerifying ? 'animate-spin' : ''}`} /> {backupDeleteRecovery ? '只读核实删除状态' : '刷新列表'}
                  </button>
                  <button onClick={() => void handleCreateBackup()} disabled={backupCreating || backupRecovery.busy || backupRecovery.phase !== 'idle' || backupLoading || backupDeleting !== null || Boolean(backupDeleteRecovery) || backupDeleteVerifying} aria-busy={backupCreating || backupRecovery.busy} className={`flex items-center gap-2 rounded-xl px-4 py-2 ${styles.buttonPrimary} disabled:opacity-60`}>
                    {backupCreating || backupRecovery.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />} {backupCreating || backupRecovery.busy ? '正在处理备份…' : backupRecovery.phase !== 'idle' ? '备份结果待核实' : '创建备份'}
                  </button>
                </div>
              </div>

              {backupFeedback ? (
                <div role="alert" className="flex flex-col gap-3 rounded-xl border border-studio-amber/25 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between">
                  <p className="min-w-0">{backupFeedback}</p>
                  {backupDeleteRecovery ? <button type="button" onClick={() => void verifyBackupDelete(backupDeleteRecovery)} disabled={backupLoading || backupDeleteVerifying || backupDeleting !== null} className={`shrink-0 rounded-xl px-4 py-2 ${styles.buttonSecondary} disabled:opacity-60`}>{backupDeleteVerifying ? '正在核实…' : '只读核实删除状态'}</button> : null}
                </div>
              ) : null}
              {backupRecovery.message ? (
                <div role={backupRecovery.phase === 'storage_error' ? 'alert' : 'status'} aria-live="polite" className="flex flex-col gap-3 rounded-xl border border-studio-amber/25 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between">
                  <p className="min-w-0">{backupRecovery.message}</p>
                  {backupRecovery.phase === 'not_found' ? (
                    <button type="button" onClick={() => void backupRecovery.retry()} disabled={backupRecovery.busy || backupDeleting !== null} className={`rounded-xl px-4 py-2 ${styles.buttonPrimary} disabled:opacity-60`}>使用同一编号明确重试</button>
                  ) : backupRecovery.pending ? (
                    <button type="button" onClick={() => void backupRecovery.verify()} disabled={backupRecovery.busy || backupDeleting !== null} className={`rounded-xl px-4 py-2 ${styles.buttonSecondary} disabled:opacity-60`}>{backupRecovery.busy ? '正在核实…' : '只读核实备份状态'}</button>
                  ) : null}
                </div>
              ) : null}

              <div className={`rounded-2xl ${styles.bgTertiary} p-5`}>
                <div className="grid gap-4 text-sm md:grid-cols-4">
                  <div>
                    <p className={styles.textMuted}>存储方式</p>
                    <p className={styles.textPrimary}>服务器存储</p>
                  </div>
                  <div>
                    <p className={styles.textMuted}>数据范围</p>
                    <p className={styles.textPrimary}>应用业务数据</p>
                  </div>
                  <div>
                    <p className={styles.textMuted}>备份策略</p>
                    <p className={styles.textPrimary}>手动创建；自动备份以管理员配置为准</p>
                  </div>
                  <div>
                    <p className={styles.textMuted}>当前备份数</p>
                    <p className={styles.textPrimary}>{backupLoading || backupError ? '待确认' : backupList.length}</p>
                  </div>
                </div>
              </div>

              <div className={`rounded-2xl ${styles.card} p-4`}>
                {backupLoading ? (
                  <div className={`flex h-24 items-center justify-center ${styles.textMuted}`}>
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : backupError ? (
                  <ErrorState title="备份列表未能加载" description={backupError} onRetry={() => void handleRefreshBackupList()} />
                ) : backupList.length === 0 ? (
                  <p className={`py-6 text-center text-sm ${styles.textMuted}`}>暂无备份记录。</p>
                ) : (
                  <div className="space-y-3">
                    {backupList.map((item) => (
                      <div key={item.name} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${styles.border}`}>
                        <div className="min-w-0">
                          <p className={`break-all font-mono text-sm ${styles.textPrimary}`}>{item.name}</p>
                          <p className={`mt-1 text-xs ${styles.textMuted}`}>{(item.size / 1024).toFixed(1)} KB · {formatBeijingTime(item.created)}</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => void handleDownloadBackup(item.name)} className={`rounded-lg px-3 py-1.5 text-sm ${styles.buttonInfo}`}>下载</button>
                          <button
                            type="button"
                            aria-label={`删除备份 ${item.name}`}
                            onClick={() => setBackupDeleteCandidate(item.name)}
                            disabled={backupLoading || backupCreating || Boolean(backupRecovery.pending) || backupRecovery.busy || backupDeleting !== null || Boolean(backupDeleteRecovery) || backupDeleteVerifying}
                            className={`rounded-lg px-3 py-1.5 text-sm ${styles.buttonDanger} disabled:opacity-60`}
                          >
                            {backupDeleting === item.name ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <ConfirmModal
            open={backupDeleteCandidate !== null}
            title="确认删除备份？"
            description={<>此操作会永久删除备份文件 <span className="font-medium text-studio-text-primary">{backupDeleteCandidate}</span>，且无法恢复。</>}
            confirmText="删除备份"
            variant="danger"
            loading={backupDeleting !== null}
            onConfirm={() => {
              if (backupDeleteCandidate) void handleDeleteBackup(backupDeleteCandidate);
            }}
            onCancel={() => {
              if (!backupDeleting) setBackupDeleteCandidate(null);
            }}
          />

          {activeTab === 'changelog' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className={`text-lg font-semibold ${styles.textPrimary}`}>版本更新</h2>
                <span className={`text-sm ${styles.textMuted}`}>当前版本：v{__APP_VERSION__}</span>
              </div>
              <div className="space-y-5">
                {changelog.map((entry, index) => (
                  <div key={`${entry.version}-${index}`} className={`overflow-hidden rounded-2xl ${styles.card}`}>
                    <div className={`px-6 py-4 ${index === 0 ? 'bg-gradient-to-r from-studio-primary/10 to-studio-primary/10' : styles.bgTertiary}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className={`text-lg font-semibold ${styles.textPrimary}`}>v{entry.version}</h3>
                            {index === 0 && <span className="rounded-full bg-studio-primary-button px-2 py-0.5 text-xs text-white">最新</span>}
                          </div>
                          <p className={`mt-1 text-sm ${styles.textMuted}`}>{entry.title}</p>
                        </div>
                        <span className={`text-sm ${styles.textMuted}`}>{entry.date}</span>
                      </div>
                    </div>
                    <div className="space-y-3 p-6">
                      {entry.changes.map((change, changeIndex) => (
                        <div key={`${entry.version}-${changeIndex}`} className="flex items-start gap-3">
                          <span className={`inline-flex flex-shrink-0 items-center rounded border px-2 py-0.5 text-xs font-medium ${getChangeTypeColor(change.type)}`}>
                            {getChangeTypeLabel(change.type)}
                          </span>
                          <p className={`text-sm ${styles.textSecondary}`}>{change.description}</p>
                        </div>
                      ))}
                      {entry.impactScope?.length ? (
                        <div className={`border-t pt-4 ${styles.border}`}>
                          <p className={`mb-2 text-xs font-medium ${styles.textMuted}`}>影响范围</p>
                          <div className="flex flex-wrap gap-2">
                            {entry.impactScope.map((scope) => (
                              <span key={scope} className={`rounded-full border px-2.5 py-1 text-xs ${styles.border} ${styles.textSecondary}`}>
                                {scope}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'about' && (
            <div className="space-y-6">
              <div>
                <h2 className={`text-lg font-semibold ${styles.textPrimary}`}>关于系统</h2>
                <p data-testid="about-description" className={`mt-1 text-sm ${styles.textSecondary}`}>{savedSettings.system.description}</p>
              </div>

              <div className="flex items-center gap-4">
                <div data-testid="about-brand-mark" className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-studio-primary-button text-3xl text-white">
                  {savedSettings.branding.logo ? <img src={savedSettings.branding.logo} alt="Logo" className="h-full w-full object-contain" /> : savedSettings.system.icon}
                </div>
                <div>
                  <h3 className={`text-xl font-bold ${styles.textPrimary}`}>{savedSettings.system.name}</h3>
                  <p className={`text-sm ${styles.textSecondary}`}>版本 v{__APP_VERSION__}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {[
                  { label: '品牌名称', value: savedSettings.branding.brandName },
                  { label: '当前用户角色', value: getRoleDisplayName(authStore.user?.role) },
                ].map((item) => (
                  <div key={item.label} className={`flex items-center justify-between rounded-xl p-4 ${styles.bgTertiary}`}>
                    <span className={`text-sm ${styles.textSecondary}`}>{item.label}</span>
                    <span className={`text-sm font-medium ${styles.textPrimary}`}>{item.value}</span>
                  </div>
                ))}
              </div>

              <div className={`rounded-2xl ${styles.bgTertiary} p-5`}>
                <h3 className={`mb-3 font-medium ${styles.textPrimary}`}>内容协作流程</h3>
                <p className={`mb-3 text-sm ${styles.textSecondary}`}>{savedSettings.branding.brandDescription}</p>
                <div className="grid gap-2 md:grid-cols-3">
                  {['选题策划', '内容创作', '拍摄制作', '审核发布', '数据复盘', '资料积累'].map((item) => (
                    <div key={item} className={`flex items-center gap-2 text-sm ${styles.textSecondary}`}>
                      <div className="h-1.5 w-1.5 rounded-full bg-studio-success" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </GlassPanel>
      </div>
    </PageShell>
  );
}
