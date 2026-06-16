import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useAuthStore, useAppStore } from '../store';
import { changePassword, updateUser, getSystemSettings, updateSystemSettings } from '../api';
import {
  createBackup,
  getBackupList,
  downloadBackup,
  deleteBackup,
  BackupFile,
} from '../api/backup';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { usePermission } from '../hooks/usePermission';
import { formatBeijingTime } from '../lib/utils';
import { getRoleDisplayName } from '../lib/roles';
import { useDesktopNotification } from '../hooks/useDesktopNotification';
import { isSecureContext } from '../utils/notification';
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

type NotificationPreference = {
  id?: number;
  channel: string;
  event_type: string;
  enabled: boolean;
  config?: string;
};

type Channel = {
  id: string;
  name: string;
  description: string;
};

type EventType = {
  id: string;
  name: string;
  description: string;
};

const tabMeta = {
  notifications: { label: '通知偏好', icon: Bell },
  profile: { label: '个人资料', icon: User },
  password: { label: '账号安全', icon: Lock },
  appearance: { label: '个人偏好', icon: Palette },
  system: { label: '系统设置', icon: Monitor },
  branding: { label: '品牌设置', icon: Tag },
  login: { label: '登录页设置', icon: Sparkles },
  database: { label: '数据与备份', icon: Database },
  changelog: { label: '系统更新说明', icon: History },
  about: { label: '关于系统', icon: Info },
} as const;

type TabKey = keyof typeof tabMeta;

export default function NotificationSettings() {
  const styles = useThemeStyles();
  const authStore = useAuthStore();
  const appStore = useAppStore();
  const desktopNotify = useDesktopNotification();
  const token = authStore.token;
  const { hasPermission } = usePermission();
  const canManageDatabase = hasPermission('system:backup');
  const canManageSystem = hasPermission('system:settings');
  const setGlobalSystemSettings = useAppStore((state) => state.setSystemSettings);

  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (sessionStorage.getItem('xmt_show_changelog') === 'true') {
      sessionStorage.removeItem('xmt_show_changelog');
      return 'changelog';
    }
    return authStore.user?.force_change_password ? 'password' : 'notifications';
  });

  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [events, setEvents] = useState<EventType[]>([]);
  const [notifyLoading, setNotifyLoading] = useState(true);
  const [notifySaving, setNotifySaving] = useState(false);

  const [profileName, setProfileName] = useState(authStore.user?.name || '');
  const [profileEmail, setProfileEmail] = useState(authStore.user?.email || '');
  const [profileSaving, setProfileSaving] = useState(false);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);

  const [systemSettings, setSystemSettings] = useState<ManagedSystemSettings>(defaultSystemSettings);
  const [systemSettingsLoading, setSystemSettingsLoading] = useState(false);
  const [systemSettingsSaving, setSystemSettingsSaving] = useState(false);
  const [fontSize, setFontSize] = useState(appStore.fontSize);
  const [appearanceTheme, setAppearanceTheme] = useState<'light' | 'dark'>(appStore.theme);

  const [backupList, setBackupList] = useState<BackupFile[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupCreating, setBackupCreating] = useState(false);

  const tabs = useMemo(() => {
    const base: TabKey[] = ['notifications', 'profile', 'password', 'appearance'];
    if (canManageSystem) {
      base.push('system', 'branding', 'login');
    }
    if (canManageDatabase) {
      base.push('database');
    }
    base.push('changelog', 'about');
    return base;
  }, [canManageDatabase, canManageSystem]);

  useEffect(() => {
    void fetchNotificationData();
  }, []);

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
    if (activeTab === 'database' && canManageDatabase) {
      void loadBackupItems();
    }
  }, [activeTab, canManageDatabase]);

  async function fetchNotificationData() {
    if (!token) {
      setNotifyLoading(false);
      return;
    }

    try {
      const [prefsRes, channelsRes, eventsRes] = await Promise.all([
        fetch('/api/notifications/preferences', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/notifications/channels', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/notifications/events', { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (prefsRes.ok) {
        setPreferences(await prefsRes.json());
      }
      if (channelsRes.ok) {
        setChannels(await channelsRes.json());
      }
      if (eventsRes.ok) {
        setEvents(await eventsRes.json());
      }
    } catch (error) {
      console.error('获取通知设置失败', error);
    } finally {
      setNotifyLoading(false);
    }
  }

  async function fetchSystemSettings() {
    setSystemSettingsLoading(true);
    try {
      const settings = await getSystemSettings();
      setSystemSettings(settings);
      setGlobalSystemSettings(settings);
      applyDocumentBranding(settings);
    } catch (error) {
      appStore.addNotification({
        title: '加载失败',
        message: (error as Error).message,
        type: 'error',
      });
    } finally {
      setSystemSettingsLoading(false);
    }
  }

  function isEnabled(channelId: string, eventId: string) {
    const pref = preferences.find((item) => item.channel === channelId && item.event_type === eventId);
    return pref ? pref.enabled : false;
  }

  function handleTogglePreference(channelId: string, eventId: string) {
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

  async function handleSaveNotifications() {
    if (!token) {
      return;
    }

    setNotifySaving(true);
    try {
      const response = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ message: '保存失败' }));
        throw new Error(data.message || '保存失败');
      }

      appStore.addNotification({ title: '保存成功', message: '通知偏好已更新', type: 'success' });
    } catch (error) {
      appStore.addNotification({ title: '保存失败', message: (error as Error).message, type: 'error' });
    } finally {
      setNotifySaving(false);
    }
  }

  async function handleSaveProfile() {
    if (!authStore.user) {
      return;
    }

    setProfileSaving(true);
    try {
      await updateUser(authStore.user.id, { name: profileName, email: profileEmail });
      authStore.login({ ...authStore.user, name: profileName, email: profileEmail }, authStore.token!);
      appStore.addNotification({ title: '保存成功', message: '个人资料已更新', type: 'success' });
    } catch (error) {
      appStore.addNotification({ title: '保存失败', message: (error as Error).message, type: 'error' });
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword() {
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

    setPwdSaving(true);
    try {
      await changePassword(oldPassword, newPassword);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (authStore.user?.force_change_password) {
        authStore.login({ ...authStore.user, force_change_password: false }, authStore.token!);
      }
      appStore.addNotification({ title: '修改成功', message: '密码已更新', type: 'success' });
    } catch (error) {
      appStore.addNotification({ title: '修改失败', message: (error as Error).message, type: 'error' });
    } finally {
      setPwdSaving(false);
    }
  }

  async function handleSaveSystemSection(patch: Partial<ManagedSystemSettings>, successMessage: string) {
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
      setSystemSettingsSaving(false);
    }
  }

  function handleLogoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      appStore.addNotification({ title: '上传失败', message: '请选择图片文件', type: 'error' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      appStore.addNotification({ title: '上传失败', message: '图片大小不能超过 2MB', type: 'error' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSystemSettings((current) => ({
        ...current,
        branding: { ...current.branding, logo: String(reader.result || '') },
      }));
      appStore.addNotification({ title: '上传成功', message: 'Logo 已选择，请保存品牌设置', type: 'success' });
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

  async function loadBackupItems() {
    setBackupLoading(true);
    try {
      setBackupList(await getBackupList());
    } catch (error) {
      appStore.addNotification({ title: '加载失败', message: (error as Error).message, type: 'error' });
    } finally {
      setBackupLoading(false);
    }
  }

  async function handleCreateBackup() {
    setBackupCreating(true);
    try {
      const result = await createBackup();
      appStore.addNotification({ title: '备份成功', message: `已创建备份：${result.name}`, type: 'success' });
      await loadBackupItems();
    } catch (error) {
      appStore.addNotification({ title: '备份失败', message: (error as Error).message, type: 'error' });
    } finally {
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
    try {
      await deleteBackup(name);
      appStore.addNotification({ title: '删除成功', message: '备份文件已删除', type: 'success' });
      await loadBackupItems();
    } catch (error) {
      appStore.addNotification({ title: '删除失败', message: (error as Error).message, type: 'error' });
    }
  }

  function renderInput(
    label: string,
    value: string,
    onChange: (value: string) => void,
    type = 'text',
    placeholder?: string,
  ) {
    return (
      <div>
        <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>{label}</label>
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={`w-full px-4 py-2.5 ${styles.input}`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className={styles.pageTitle}>设置中心</h1>
        <p className={styles.subtitle}>
          {canManageSystem || canManageDatabase
            ? '统一管理系统配置、个人偏好与运维项'
            : '管理你的个人偏好与通知设置'}
        </p>
      </div>

      <div className="flex gap-6">
        <div className={`w-56 flex-shrink-0 self-start ${styles.card} p-2`}>
          {tabs.map((key) => {
            const meta = tabMeta[key];
            const Icon = meta.icon;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === key ? 'bg-blue-500/10 text-blue-400' : `${styles.textSecondary} ${styles.hoverBg}`
                }`}
              >
                <Icon className="h-4 w-4" />
                {meta.label}
                <ChevronRight className={`ml-auto h-3 w-3 ${activeTab === key ? 'text-blue-400' : styles.textMuted}`} />
              </button>
            );
          })}
        </div>

        <div className={`flex-1 ${styles.card} p-6`}>
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className={`text-lg font-semibold ${styles.textPrimary}`}>通知偏好</h2>
                  <p className={`mt-1 text-sm ${styles.textMuted}`}>管理消息提醒方式、桌面通知与测试提醒。</p>
                </div>
                <button
                  onClick={handleSaveNotifications}
                  disabled={notifySaving}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 ${styles.buttonPrimary} disabled:opacity-60`}
                >
                  {notifySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {notifySaving ? '保存中...' : '保存设置'}
                </button>
              </div>

              <div className={`rounded-2xl ${styles.bgTertiary} p-5`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className={`font-medium ${styles.textPrimary}`}>桌面通知与提示音</h3>
                    <p className={`mt-1 text-sm ${styles.textMuted}`}>
                      当前浏览器环境：
                      {isSecureContext() ? '安全上下文，可申请系统通知权限' : '非安全上下文，桌面通知不可用'}
                    </p>
                  </div>
                  {desktopNotify.supported && desktopNotify.permission !== 'granted' && (
                    <button
                      onClick={() => void desktopNotify.requestPermission()}
                      className={`rounded-lg px-3 py-2 text-sm ${styles.buttonSecondary}`}
                    >
                      申请权限
                    </button>
                  )}
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <button onClick={desktopNotify.toggleEnabled} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left ${styles.border} ${styles.hoverBg}`}>
                    {desktopNotify.enabled ? <BellRing className="h-5 w-5 text-green-400" /> : <BellOff className="h-5 w-5 text-gray-400" />}
                    <div>
                      <p className={`text-sm font-medium ${styles.textPrimary}`}>桌面通知</p>
                      <p className={`text-xs ${styles.textMuted}`}>{desktopNotify.enabled ? '已开启' : '已关闭'}</p>
                    </div>
                  </button>
                  <button onClick={desktopNotify.toggleSound} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left ${styles.border} ${styles.hoverBg}`}>
                    {desktopNotify.soundEnabled ? <Volume2 className="h-5 w-5 text-blue-400" /> : <VolumeX className="h-5 w-5 text-gray-400" />}
                    <div>
                      <p className={`text-sm font-medium ${styles.textPrimary}`}>提示音</p>
                      <p className={`text-xs ${styles.textMuted}`}>{desktopNotify.soundEnabled ? '已开启' : '已关闭'}</p>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      desktopNotify.testSound();
                      desktopNotify.notify({ title: '测试通知', body: '这是一条测试通知。' });
                    }}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left ${styles.border} ${styles.hoverBg}`}
                  >
                    <Sparkles className="h-5 w-5 text-yellow-400" />
                    <div>
                      <p className={`text-sm font-medium ${styles.textPrimary}`}>发送测试</p>
                      <p className={`text-xs ${styles.textMuted}`}>检查声音与桌面通知</p>
                    </div>
                  </button>
                </div>
              </div>

              <div className={`overflow-hidden rounded-2xl ${styles.card}`}>
                {notifyLoading ? (
                  <div className={`flex h-40 items-center justify-center ${styles.textMuted}`}>
                    <Loader2 className="h-7 w-7 animate-spin" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-white/5">
                      <thead className={styles.bgTertiary}>
                        <tr>
                          <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${styles.textMuted}`}>事件</th>
                          {channels.map((channel) => (
                            <th key={channel.id} className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${styles.textMuted}`}>
                              {channel.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {events.map((event) => (
                          <tr key={event.id}>
                            <td className="px-6 py-4">
                              <p className={`font-medium ${styles.textPrimary}`}>{event.name}</p>
                              <p className={`mt-1 text-xs ${styles.textMuted}`}>{event.description}</p>
                            </td>
                            {channels.map((channel) => (
                              <td key={`${event.id}-${channel.id}`} className="px-6 py-4">
                                <button
                                  onClick={() => handleTogglePreference(channel.id, event.id)}
                                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                                    isEnabled(channel.id, event.id)
                                      ? 'bg-green-500/10 text-green-400'
                                      : `${styles.bgTertiary} ${styles.textMuted}`
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
                    <input type={showOldPwd ? 'text' : 'password'} value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} className={`w-full px-4 py-2.5 pr-12 ${styles.input}`} />
                    <button type="button" onClick={() => setShowOldPwd((value) => !value)} className={`absolute right-4 top-1/2 -translate-y-1/2 ${styles.textMuted}`}>
                      {showOldPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>新密码</label>
                  <div className="relative">
                    <input type={showNewPwd ? 'text' : 'password'} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className={`w-full px-4 py-2.5 pr-12 ${styles.input}`} />
                    <button type="button" onClick={() => setShowNewPwd((value) => !value)} className={`absolute right-4 top-1/2 -translate-y-1/2 ${styles.textMuted}`}>
                      {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>确认新密码</label>
                  <div className="relative">
                    <input type={showConfirmPwd ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={`w-full px-4 py-2.5 pr-12 ${styles.input}`} />
                    <button type="button" onClick={() => setShowConfirmPwd((value) => !value)} className={`absolute right-4 top-1/2 -translate-y-1/2 ${styles.textMuted}`}>
                      {showConfirmPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={handleChangePassword}
                disabled={pwdSaving}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 ${styles.buttonPrimary} disabled:opacity-60`}
              >
                {pwdSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                {pwdSaving ? '提交中...' : '更新密码'}
              </button>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h2 className={`text-lg font-semibold ${styles.textPrimary}`}>个人偏好</h2>
                <p className={`mt-1 text-sm ${styles.textMuted}`}>这些设置仅保存在当前浏览器，不会影响其他管理员设备。</p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>主题</label>
                  <select value={appearanceTheme} onChange={(event) => setAppearanceTheme(event.target.value as 'light' | 'dark')} className={`w-full px-4 py-2.5 ${styles.input}`}>
                    <option value="dark">深色模式</option>
                    <option value="light">浅色模式</option>
                  </select>
                </div>
                <div>
                  <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>界面字号</label>
                  <select value={fontSize} onChange={(event) => setFontSize(parseInt(event.target.value, 10))} className={`w-full px-4 py-2.5 ${styles.input}`}>
                    {[14, 16, 18, 20, 22, 24].map((size) => (
                      <option key={size} value={size}>{size}px</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <button onClick={() => setAppearanceTheme('light')} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${styles.border} ${styles.hoverBg}`}>
                  <Sun className="h-5 w-5 text-amber-400" />
                  <div className="text-left">
                    <p className={`text-sm font-medium ${styles.textPrimary}`}>浅色模式</p>
                    <p className={`text-xs ${styles.textMuted}`}>适合明亮办公环境</p>
                  </div>
                </button>
                <button onClick={() => setAppearanceTheme('dark')} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${styles.border} ${styles.hoverBg}`}>
                  <Moon className="h-5 w-5 text-blue-400" />
                  <div className="text-left">
                    <p className={`text-sm font-medium ${styles.textPrimary}`}>深色模式</p>
                    <p className={`text-xs ${styles.textMuted}`}>适合长时间创作</p>
                  </div>
                </button>
              </div>

              <button onClick={handleSaveAppearance} className={`flex items-center gap-2 rounded-xl px-4 py-2 ${styles.buttonPrimary}`}>
                <Save className="h-4 w-4" /> 保存个人偏好
              </button>
            </div>
          )}

          {activeTab === 'system' && canManageSystem && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className={`text-lg font-semibold ${styles.textPrimary}`}>系统设置</h2>
                  <p className={`mt-1 text-sm ${styles.textMuted}`}>后端统一管理系统名称、标题和系统简介。</p>
                </div>
                {systemSettingsLoading && <Loader2 className={`h-5 w-5 animate-spin ${styles.textMuted}`} />}
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {renderInput('系统名称', systemSettings.system.name, (value) => setSystemSettings((current) => ({ ...current, system: { ...current.system, name: value } })))}
                {renderInput('页签标题', systemSettings.system.browserTitle, (value) => setSystemSettings((current) => ({ ...current, system: { ...current.system, browserTitle: value } })))}
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {renderInput('系统图标（单字或 Emoji）', systemSettings.system.icon, (value) => setSystemSettings((current) => ({ ...current, system: { ...current.system, icon: value } })))}
                {renderInput('系统简介', systemSettings.system.description, (value) => setSystemSettings((current) => ({ ...current, system: { ...current.system, description: value } })))}
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

          {activeTab === 'branding' && canManageSystem && (
            <div className="space-y-6">
              <div>
                <h2 className={`text-lg font-semibold ${styles.textPrimary}`}>品牌设置</h2>
                <p className={`mt-1 text-sm ${styles.textMuted}`}>统一管理品牌名称、Logo 和展示文案。</p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {renderInput('品牌名称', systemSettings.branding.brandName, (value) => setSystemSettings((current) => ({ ...current, branding: { ...current.branding, brandName: value } })))}
                {renderInput('品牌展示文案', systemSettings.branding.brandDescription, (value) => setSystemSettings((current) => ({ ...current, branding: { ...current.branding, brandDescription: value } })))}
              </div>

              <div>
                <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>品牌 Logo</label>
                <div className="flex items-center gap-4">
                  <div className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed ${systemSettings.branding.logo ? 'border-blue-500' : `${styles.border} ${styles.bgTertiary}`}`}>
                    {systemSettings.branding.logo ? (
                      <img src={systemSettings.branding.logo} alt="系统 Logo" className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-2xl">{systemSettings.system.icon}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <label className={`cursor-pointer rounded-lg px-4 py-2 ${styles.buttonPrimary}`}>
                      选择图片
                      <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                    </label>
                    {systemSettings.branding.logo && (
                      <button
                        onClick={() => setSystemSettings((current) => ({ ...current, branding: { ...current.branding, logo: '' } }))}
                        className="rounded-lg border border-red-500/30 px-4 py-2 text-red-400 hover:bg-red-500/10"
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

          {activeTab === 'login' && canManageSystem && (
            <div className="space-y-6">
              <div>
                <h2 className={`text-lg font-semibold ${styles.textPrimary}`}>登录页设置</h2>
                <p className={`mt-1 text-sm ${styles.textMuted}`}>统一管理登录页布局、欢迎语和登录说明。</p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>登录页布局</label>
                  <select value={systemSettings.login.layout} onChange={(event) => setSystemSettings((current) => ({ ...current, login: { ...current.login, layout: event.target.value as ManagedSystemSettings['login']['layout'] } }))} className={`w-full px-4 py-2.5 ${styles.input}`}>
                    <option value="style1">样式一（暗色经典）</option>
                    <option value="style2">样式二（金色聚焦）</option>
                    <option value="style3">样式三（双栏对比）</option>
                  </select>
                </div>
                {renderInput('欢迎标题', systemSettings.login.welcomeTitle, (value) => setSystemSettings((current) => ({ ...current, login: { ...current.login, welcomeTitle: value } })))}
              </div>

              <div className="grid gap-6">
                {renderInput('欢迎说明', systemSettings.login.welcomeMessage, (value) => setSystemSettings((current) => ({ ...current, login: { ...current.login, welcomeMessage: value } })))}
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
              <div className="flex items-center justify-between">
                <div>
                  <h2 className={`text-lg font-semibold ${styles.textPrimary}`}>数据与备份</h2>
                  <p className={`mt-1 text-sm ${styles.textMuted}`}>创建、下载和清理系统备份。</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => void loadBackupItems()} className={`flex items-center gap-2 rounded-xl px-4 py-2 ${styles.buttonSecondary}`}>
                    <RefreshCw className={`h-4 w-4 ${backupLoading ? 'animate-spin' : ''}`} /> 刷新列表
                  </button>
                  <button onClick={() => void handleCreateBackup()} disabled={backupCreating} className={`flex items-center gap-2 rounded-xl px-4 py-2 ${styles.buttonPrimary} disabled:opacity-60`}>
                    {backupCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />} 创建备份
                  </button>
                </div>
              </div>

              <div className={`rounded-2xl ${styles.bgTertiary} p-5`}>
                <div className="grid gap-4 text-sm md:grid-cols-4">
                  <div>
                    <p className={styles.textMuted}>存储方式</p>
                    <p className={styles.textPrimary}>SQLite (libsql)</p>
                  </div>
                  <div>
                    <p className={styles.textMuted}>数据文件</p>
                    <p className={styles.textPrimary}>data/xmt.db</p>
                  </div>
                  <div>
                    <p className={styles.textMuted}>备份策略</p>
                    <p className={styles.textPrimary}>每日自动 + 手动快照</p>
                  </div>
                  <div>
                    <p className={styles.textMuted}>当前备份数</p>
                    <p className={styles.textPrimary}>{backupList.length}</p>
                  </div>
                </div>
              </div>

              <div className={`rounded-2xl ${styles.card} p-4`}>
                {backupLoading ? (
                  <div className={`flex h-24 items-center justify-center ${styles.textMuted}`}>
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : backupList.length === 0 ? (
                  <p className={`py-6 text-center text-sm ${styles.textMuted}`}>暂无备份记录。</p>
                ) : (
                  <div className="space-y-3">
                    {backupList.map((item) => (
                      <div key={item.name} className={`flex items-center justify-between rounded-xl border p-3 ${styles.border}`}>
                        <div>
                          <p className={`font-mono text-sm ${styles.textPrimary}`}>{item.name}</p>
                          <p className={`mt-1 text-xs ${styles.textMuted}`}>{(item.size / 1024).toFixed(1)} KB · {formatBeijingTime(item.created)}</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => void handleDownloadBackup(item.name)} className={`rounded-lg px-3 py-1.5 text-sm ${styles.buttonInfo}`}>下载</button>
                          <button onClick={() => void handleDeleteBackup(item.name)} className={`rounded-lg px-3 py-1.5 text-sm ${styles.buttonDanger}`}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'changelog' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className={`text-lg font-semibold ${styles.textPrimary}`}>系统更新说明</h2>
                <span className={`text-sm ${styles.textMuted}`}>当前版本：v{__APP_VERSION__}</span>
              </div>
              <div className="space-y-5">
                {changelog.map((entry, index) => (
                  <div key={entry.version} className={`overflow-hidden rounded-2xl ${styles.card}`}>
                    <div className={`px-6 py-4 ${index === 0 ? 'bg-gradient-to-r from-[#5c7cfa]/10 to-[#748ffc]/10' : styles.bgTertiary}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className={`text-lg font-semibold ${styles.textPrimary}`}>v{entry.version}</h3>
                            {index === 0 && <span className="rounded-full bg-blue-500 px-2 py-0.5 text-xs text-white">最新</span>}
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
                <p className={`mt-1 text-sm ${styles.textMuted}`}>视频内容创作全流程协作与管理平台。</p>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 text-3xl text-white">
                  {systemSettings.branding.logo ? <img src={systemSettings.branding.logo} alt="Logo" className="h-full w-full object-contain" /> : systemSettings.system.icon}
                </div>
                <div>
                  <h3 className={`text-xl font-bold ${styles.textPrimary}`}>{systemSettings.system.name}</h3>
                  <p className={`text-sm ${styles.textSecondary}`}>版本 v{__APP_VERSION__}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {[
                  { label: '前端框架', value: 'React 18 + TypeScript' },
                  { label: 'UI 框架', value: 'Tailwind CSS' },
                  { label: '后端服务', value: 'Express + SQLite' },
                  { label: '实时通信', value: 'Socket.IO' },
                  { label: '默认登录页', value: systemSettings.login.layout },
                  { label: '当前用户角色', value: getRoleDisplayName(authStore.user?.role) },
                ].map((item) => (
                  <div key={item.label} className={`flex items-center justify-between rounded-xl p-4 ${styles.bgTertiary}`}>
                    <span className={`text-sm ${styles.textSecondary}`}>{item.label}</span>
                    <span className={`text-sm font-medium ${styles.textPrimary}`}>{item.value}</span>
                  </div>
                ))}
              </div>

              <div className={`rounded-2xl ${styles.bgTertiary} p-5`}>
                <h3 className={`mb-3 font-medium ${styles.textPrimary}`}>当前启用模块</h3>
                <div className="grid gap-2 md:grid-cols-3">
                  {['选题管理', '创作管理', '拍摄管理', '发布管理', '数据分析', '资源库', '消息中心', '权限管理', '系统设置'].map((item) => (
                    <div key={item} className={`flex items-center gap-2 text-sm ${styles.textSecondary}`}>
                      <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
