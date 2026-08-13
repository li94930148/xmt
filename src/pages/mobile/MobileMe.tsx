import { ChevronRight, History, Lock, Moon, Save, SlidersHorizontal, Sun, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePassword, updateMyProfile } from '@/api';
import { usePermission } from '@/hooks/usePermission';
import { useAppStore, useAuthStore } from '@/store';

export default function MobileMe() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const login = useAuthStore((state) => state.login);
  const token = useAuthStore((state) => state.token);
  const theme = useAppStore((state) => state.theme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);
  const fontSize = useAppStore((state) => state.fontSize);
  const setFontSize = useAppStore((state) => state.setFontSize);
  const { hasPermission } = usePermission();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [saving, setSaving] = useState(false);
  const [profileNotice, setProfileNotice] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordNotice, setPasswordNotice] = useState('');

  useEffect(() => { setName(user?.name ?? ''); setEmail(user?.email ?? ''); }, [user?.email, user?.name]);

  const saveProfile = async () => {
    setSaving(true); setProfileNotice('');
    try {
      const profile = await updateMyProfile({ name, email });
      if (user && token) login({ ...user, name: profile.name, email: profile.email }, token);
      setProfileNotice('个人资料已保存。');
    } catch (error) { setProfileNotice(error instanceof Error ? error.message : '保存个人资料失败'); }
    finally { setSaving(false); }
  };

  const savePassword = async () => {
    setPasswordNotice('');
    try {
      await changePassword(oldPassword, newPassword);
      setOldPassword(''); setNewPassword(''); setShowPassword(false); setPasswordNotice('密码已更新。');
    } catch (error) { setPasswordNotice(error instanceof Error ? error.message : '修改密码失败'); }
  };

  const openChangelog = () => { sessionStorage.setItem('xmt_show_changelog', 'true'); navigate('/notification-settings'); };
  return <div className="space-y-4"><section className="rounded-2xl border border-studio-border-soft bg-studio-surface p-5"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-studio-primary/15 text-studio-cyan"><UserRound className="h-5 w-5" /></span><div><p className="text-lg font-semibold">{user?.name ?? '我的账号'}</p><p className="mt-1 text-sm text-studio-text-muted">{user?.role ?? '成员'}</p></div></div><div className="mt-4 space-y-3"><label className="block text-sm">姓名<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-studio-border-soft bg-transparent px-3" /></label><label className="block text-sm">邮箱<input value={email} onChange={(event) => setEmail(event.target.value)} inputMode="email" className="mt-1 min-h-11 w-full rounded-xl border border-studio-border-soft bg-transparent px-3" /></label><button type="button" disabled={saving} onClick={() => void saveProfile()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-studio-primary px-4 text-sm text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? '保存中…' : '保存个人资料'}</button>{profileNotice ? <p role="status" className="text-sm text-studio-text-secondary">{profileNotice}</p> : null}</div></section><section className="overflow-hidden rounded-2xl border border-studio-border-soft bg-studio-surface"><button type="button" onClick={toggleTheme} className="flex min-h-14 w-full items-center justify-between px-4 text-sm"><span className="inline-flex items-center gap-3">{theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}主题</span><span className="text-studio-text-muted">{theme === 'dark' ? '深色' : '浅色'}</span></button><div className="flex min-h-14 items-center justify-between border-t border-studio-border-soft px-4 text-sm"><span className="inline-flex items-center gap-3"><SlidersHorizontal className="h-5 w-5" />字体大小</span><div className="flex gap-1">{[14, 16, 18].map((size) => <button type="button" key={size} onClick={() => setFontSize(size)} className={`min-h-9 min-w-9 rounded-lg text-xs ${fontSize === size ? 'bg-studio-primary text-white' : 'border border-studio-border-soft'}`}>{size}</button>)}</div></div><button type="button" onClick={() => navigate('/notification-settings')} className="flex min-h-14 w-full items-center justify-between border-t border-studio-border-soft px-4 text-sm"><span>消息通知偏好</span><ChevronRight className="h-5 w-5 text-studio-text-muted" /></button></section><section className="overflow-hidden rounded-2xl border border-studio-border-soft bg-studio-surface"><button type="button" onClick={() => setShowPassword((value) => !value)} className="flex min-h-14 w-full items-center justify-between px-4 text-sm"><span className="inline-flex items-center gap-3"><Lock className="h-5 w-5" />账号安全</span><ChevronRight className="h-5 w-5 text-studio-text-muted" /></button>{showPassword ? <div className="space-y-3 border-t border-studio-border-soft p-4"><input value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} type="password" autoComplete="current-password" placeholder="当前密码" className="min-h-11 w-full rounded-xl border border-studio-border-soft bg-transparent px-3" /><input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="新密码（至少 6 位）" className="min-h-11 w-full rounded-xl border border-studio-border-soft bg-transparent px-3" /><button type="button" onClick={() => void savePassword()} className="min-h-11 rounded-xl bg-studio-primary px-4 text-sm text-white">更新密码</button>{passwordNotice ? <p role="status" className="text-sm text-studio-text-secondary">{passwordNotice}</p> : null}</div> : null}<button type="button" onClick={openChangelog} className="flex min-h-14 w-full items-center justify-between border-t border-studio-border-soft px-4 text-sm"><span className="inline-flex items-center gap-3"><History className="h-5 w-5" />更新说明</span><ChevronRight className="h-5 w-5 text-studio-text-muted" /></button><button type="button" onClick={() => navigate('/anonymous-feedback')} className="flex min-h-14 w-full items-center justify-between border-t border-studio-border-soft px-4 text-sm"><span>反馈</span><ChevronRight className="h-5 w-5 text-studio-text-muted" /></button>{hasPermission('system:settings') ? <button type="button" onClick={() => navigate('/notification-settings')} className="flex min-h-14 w-full items-center justify-between border-t border-studio-border-soft px-4 text-sm"><span>管理工具</span><ChevronRight className="h-5 w-5 text-studio-text-muted" /></button> : null}</section><p className="px-1 text-xs text-studio-text-muted">XMT Mobile v{__APP_VERSION__}</p></div>;
}
