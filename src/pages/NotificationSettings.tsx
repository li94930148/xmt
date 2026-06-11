import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useAuthStore, useAppStore } from '../store';
import { changePassword, updateUser } from '../api';
import { createBackup, getBackupList, downloadBackup, deleteBackup, BackupFile } from '../api/backup';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { formatBeijingTime } from '../lib/utils';
import { useDesktopNotification } from '../hooks/useDesktopNotification';
import { isSecureContext } from '../utils/notification';
import { changelog, getChangeTypeLabel, getChangeTypeColor } from '../data/changelog';
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

type LoginLayoutMode = 'style1' | 'style2' | 'style3';

type SystemSettings = {
  systemName: string;
  systemIcon: string;
  systemLogo: string;
  defaultTheme: 'light' | 'dark';
  defaultFontSize: number;
  loginLayout: LoginLayoutMode;
};

const defaultSystemSettings: SystemSettings = {
  systemName: 'XMT 新媒体台',
  systemIcon: '📺',
  systemLogo: '',
  defaultTheme: 'dark',
  defaultFontSize: 18,
  loginLayout: 'style1',
};

const tabMeta = {
  notifications: { label: '通知设置', icon: Bell },
  profile: { label: '个人信息', icon: User },
  password: { label: '修改密码', icon: Lock },
  appearance: { label: '外观设置', icon: Palette },
  system: { label: '系统设置', icon: Monitor },
  database: { label: '数据管理', icon: Database },
  changelog: { label: '系统更新说明', icon: History },
  about: { label: '关于系统', icon: Info },
} as const;

type TabKey = keyof typeof tabMeta;

function loadSystemSettings(): SystemSettings {
  try {
    const saved = localStorage.getItem('xmt_system_settings');
    return saved ? { ...defaultSystemSettings, ...JSON.parse(saved) } : defaultSystemSettings;
  } catch {
    return defaultSystemSettings;
  }
}

function styleLabel(layout: LoginLayoutMode) {
  if (layout === 'style2') return '样式二（Apple 风格）';
  if (layout === 'style3') return '样式三（影视飓风首页风格）';
  return '样式一（当前经典版式）';
}

export default function NotificationSettings() {
  const styles = useThemeStyles();
  const authStore = useAuthStore();
  const appStore = useAppStore();
  const desktopNotify = useDesktopNotification();
  const token = authStore.token;
  const isAdmin = authStore.user?.role === 'admin';

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

  const [systemSettings, setSystemSettings] = useState<SystemSettings>(loadSystemSettings);
  const [fontSize, setFontSize] = useState(appStore.fontSize);

  const [backupList, setBackupList] = useState<BackupFile[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupCreating, setBackupCreating] = useState(false);

  const tabs = useMemo(() => {
    const base: TabKey[] = ['notifications', 'profile', 'password', 'appearance'];
    if (isAdmin) {
      base.push('system', 'database');
    }
    base.push('changelog', 'about');
    return base;
  }, [isAdmin]);

  useEffect(() => {
    void fetchNotificationData();
  }, []);

  useEffect(() => {
    document.title = systemSettings.systemName;
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
    if (!link) {
      return;
    }

    if (systemSettings.systemLogo) {
      link.href = systemSettings.systemLogo;
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.height = 64;
    canvas.width = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = '56px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(systemSettings.systemIcon, 32, 36);
      link.href = canvas.toDataURL();
    }
  }, [systemSettings.systemIcon, systemSettings.systemLogo, systemSettings.systemName]);

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

      return current.map((item) => (
        item.channel === channelId && item.event_type === eventId
          ? { ...item, enabled: !item.enabled }
          : item
      ));
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
      appStore.addNotification({ title: '保存成功', message: '个人信息已更新', type: 'success' });
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

  function handleSaveSystemSettings() {
    localStorage.setItem('xmt_system_settings', JSON.stringify(systemSettings));
    window.dispatchEvent(new Event('xmt-settings-changed'));
    appStore.addNotification({ title: '保存成功', message: '系统设置已更新', type: 'success' });
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
      setSystemSettings((current) => ({ ...current, systemLogo: String(reader.result || '') }));
      appStore.addNotification({ title: '上传成功', message: 'Logo 已选择，请保存系统设置', type: 'success' });
    };
    reader.readAsDataURL(file);
  }

  function handleSaveAppearance() {
    appStore.setFontSize(fontSize);
    if (systemSettings.defaultTheme !== appStore.theme) {
      appStore.toggleTheme();
    }
    appStore.addNotification({ title: '保存成功', message: `界面字号已更新为 ${fontSize}px`, type: 'success' });
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

  function renderInput(label: string, value: string, onChange: (value: string) => void, type = 'text') {
    return (
      <div>
        <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>{label}</label>
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`w-full px-4 py-2.5 ${styles.input}`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className={styles.pageTitle}>系统设置</h1>
        <p className={styles.subtitle}>{isAdmin ? '管理系统配置和个人偏好' : '管理你的个人偏好'}</p>
      </div>

      <div className="flex gap-6">
        <div className={`w-56 flex-shrink-0 ${styles.card} p-2 self-start`}>
          {tabs.map((key) => {
            const meta = tabMeta[key];
            const Icon = meta.icon;
            return (
              <button
                key={key}
                onClick={() => {
                  setActiveTab(key);
                  if (key === 'database') {
                    void loadBackupItems();
                  }
                }}
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
                  <h2 className={`text-lg font-semibold ${styles.textPrimary}`}>通知设置</h2>
                  <p className={`mt-1 text-sm ${styles.textMuted}`}>管理消息推送方式与桌面提醒体验。</p>
                </div>
                <button onClick={handleSaveNotifications} disabled={notifySaving} className={`flex items-center gap-2 rounded-xl px-4 py-2 ${styles.buttonPrimary} disabled:opacity-60`}>
                  {notifySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {notifySaving ? '保存中...' : '保存设置'}
                </button>
              </div>

              <div className={`rounded-2xl ${styles.bgTertiary} p-5`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className={`font-medium ${styles.textPrimary}`}>桌面通知与提示音</h3>
                    <p className={`mt-1 text-sm ${styles.textMuted}`}>当前浏览器环境：{isSecureContext() ? '安全上下文，可申请系统通知权限' : '非安全上下文，桌面通知不可用'}</p>
                  </div>
                  {desktopNotify.supported && desktopNotify.permission !== 'granted' && (
                    <button onClick={() => void desktopNotify.requestPermission()} className={`rounded-lg px-3 py-2 text-sm ${styles.buttonSecondary}`}>
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
                  <button onClick={() => { desktopNotify.testSound(); desktopNotify.notify({ title: '测试通知', body: '这是一条测试通知。' }); }} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left ${styles.border} ${styles.hoverBg}`}>
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
                    <table className="w-full">
                      <thead>
                        <tr className={styles.tableHeader}>
                          <th className={`px-6 py-4 text-left text-sm font-medium ${styles.textSecondary}`}>事件类型</th>
                          {channels.map((channel) => (
                            <th key={channel.id} className={`px-6 py-4 text-center text-sm font-medium ${styles.textSecondary}`}>
                              {channel.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {events.map((event) => (
                          <tr key={event.id} className={`border-t ${styles.tableRow}`}>
                            <td className="px-6 py-4">
                              <p className={`text-sm font-medium ${styles.textPrimary}`}>{event.name}</p>
                              <p className={`text-xs ${styles.textMuted}`}>{event.description}</p>
                            </td>
                            {channels.map((channel) => (
                              <td key={channel.id} className="px-6 py-4 text-center">
                                <button
                                  onClick={() => handleTogglePreference(channel.id, event.id)}
                                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isEnabled(channel.id, event.id) ? 'bg-brand-500' : styles.bgTertiary}`}
                                >
                                  <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${isEnabled(channel.id, event.id) ? 'translate-x-6' : 'translate-x-1'}`} />
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
                <h2 className={`text-lg font-semibold ${styles.textPrimary}`}>个人信息</h2>
                <p className={`mt-1 text-sm ${styles.textMuted}`}>维护你的展示姓名与联系邮箱。</p>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                {renderInput('姓名', profileName, setProfileName)}
                {renderInput('邮箱', profileEmail, setProfileEmail, 'email')}
              </div>
              <button onClick={handleSaveProfile} disabled={profileSaving} className={`flex items-center gap-2 rounded-xl px-4 py-2 ${styles.buttonPrimary} disabled:opacity-60`}>
                {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {profileSaving ? '保存中...' : '保存个人信息'}
              </button>
            </div>
          )}

          {activeTab === 'password' && (
            <div className="space-y-6">
              <div>
                <h2 className={`text-lg font-semibold ${styles.textPrimary}`}>修改密码</h2>
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
              <button onClick={handleChangePassword} disabled={pwdSaving} className={`flex items-center gap-2 rounded-xl px-4 py-2 ${styles.buttonPrimary} disabled:opacity-60`}>
                {pwdSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                {pwdSaving ? '提交中...' : '更新密码'}
              </button>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h2 className={`text-lg font-semibold ${styles.textPrimary}`}>外观设置</h2>
                <p className={`mt-1 text-sm ${styles.textMuted}`}>调整默认主题、当前界面主题和全局字号。</p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>默认主题</label>
                  <select value={systemSettings.defaultTheme} onChange={(event) => setSystemSettings((current) => ({ ...current, defaultTheme: event.target.value as 'light' | 'dark' }))} className={`w-full px-4 py-2.5 ${styles.input}`}>
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
                <button onClick={() => appStore.theme !== 'light' && appStore.toggleTheme()} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${styles.border} ${styles.hoverBg}`}>
                  <Sun className="h-5 w-5 text-amber-400" />
                  <div className="text-left">
                    <p className={`text-sm font-medium ${styles.textPrimary}`}>切换到浅色</p>
                    <p className={`text-xs ${styles.textMuted}`}>适合明亮办公环境</p>
                  </div>
                </button>
                <button onClick={() => appStore.theme !== 'dark' && appStore.toggleTheme()} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${styles.border} ${styles.hoverBg}`}>
                  <Moon className="h-5 w-5 text-blue-400" />
                  <div className="text-left">
                    <p className={`text-sm font-medium ${styles.textPrimary}`}>切换到深色</p>
                    <p className={`text-xs ${styles.textMuted}`}>适合长时间创作</p>
                  </div>
                </button>
              </div>

              <button onClick={handleSaveAppearance} className={`flex items-center gap-2 rounded-xl px-4 py-2 ${styles.buttonPrimary}`}>
                <Save className="h-4 w-4" /> 保存外观设置
              </button>
            </div>
          )}

          {activeTab === 'system' && isAdmin && (
            <div className="space-y-6">
              <div>
                <h2 className={`text-lg font-semibold ${styles.textPrimary}`}>系统设置</h2>
                <p className={`mt-1 text-sm ${styles.textMuted}`}>维护系统名称、Logo 与登录页版式。</p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {renderInput('系统名称', systemSettings.systemName, (value) => setSystemSettings((current) => ({ ...current, systemName: value })))}
                {renderInput('系统图标（Emoji 或单字）', systemSettings.systemIcon, (value) => setSystemSettings((current) => ({ ...current, systemIcon: value })))}
              </div>

              <div>
                <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>系统 Logo</label>
                <div className="flex items-center gap-4">
                  <div className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed ${systemSettings.systemLogo ? 'border-blue-500' : `${styles.border} ${styles.bgTertiary}`}`}>
                    {systemSettings.systemLogo ? (
                      <img src={systemSettings.systemLogo} alt="系统 Logo" className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-2xl">{systemSettings.systemIcon}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <label className={`cursor-pointer rounded-lg px-4 py-2 ${styles.buttonPrimary}`}>
                      选择图片
                      <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                    </label>
                    {systemSettings.systemLogo && (
                      <button onClick={() => setSystemSettings((current) => ({ ...current, systemLogo: '' }))} className="rounded-lg border border-red-500/30 px-4 py-2 text-red-400 hover:bg-red-500/10">
                        移除 Logo
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>默认登录页版式</label>
                  <select value={systemSettings.loginLayout} onChange={(event) => setSystemSettings((current) => ({ ...current, loginLayout: event.target.value as LoginLayoutMode }))} className={`w-full px-4 py-2.5 ${styles.input}`}>
                    <option value="style1">样式一（当前经典版式）</option>
                    <option value="style2">样式二（Apple 风格）</option>
                    <option value="style3">样式三（影视飓风首页风格）</option>
                  </select>
                </div>
                <div>
                  <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>默认字号</label>
                  <select value={systemSettings.defaultFontSize} onChange={(event) => setSystemSettings((current) => ({ ...current, defaultFontSize: parseInt(event.target.value, 10) }))} className={`w-full px-4 py-2.5 ${styles.input}`}>
                    {[14, 16, 18, 20, 22, 24].map((size) => (
                      <option key={size} value={size}>{size}px</option>
                    ))}
                  </select>
                </div>
              </div>

              <button onClick={handleSaveSystemSettings} className={`flex items-center gap-2 rounded-xl px-4 py-2 ${styles.buttonPrimary}`}>
                <Save className="h-4 w-4" /> 保存系统设置
              </button>
            </div>
          )}

          {activeTab === 'database' && isAdmin && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className={`text-lg font-semibold ${styles.textPrimary}`}>数据管理</h2>
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
                <div className="grid gap-4 md:grid-cols-4 text-sm">
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
                <p className={`mt-1 text-sm ${styles.textMuted}`}>视频内容创作全流程管理系统。</p>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 text-3xl text-white">
                  {systemSettings.systemLogo ? <img src={systemSettings.systemLogo} alt="Logo" className="h-full w-full object-contain" /> : systemSettings.systemIcon}
                </div>
                <div>
                  <h3 className={`text-xl font-bold ${styles.textPrimary}`}>{systemSettings.systemName}</h3>
                  <p className={`text-sm ${styles.textSecondary}`}>版本 v{__APP_VERSION__}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {[
                  { label: '前端框架', value: 'React 18 + TypeScript' },
                  { label: 'UI 框架', value: 'Tailwind CSS' },
                  { label: '后端服务', value: 'Express + SQLite' },
                  { label: '实时通信', value: 'Socket.IO' },
                  { label: '默认登录页', value: styleLabel(systemSettings.loginLayout) },
                  { label: '当前用户角色', value: authStore.user?.role === 'admin' ? '管理员' : authStore.user?.role === 'director' ? '编导' : '成员' },
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
                  {['选题管理', '创作管理', '成片制作', '发布管理', '数据复盘', '灵感池', '消息中心', '系统设置', '权限管理'].map((item) => (
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
