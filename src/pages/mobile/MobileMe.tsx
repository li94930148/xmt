import { ChevronRight, History, Lock, Moon, Save, SlidersHorizontal, Sun, UserRound } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePassword, getMe, updateMyProfile } from '@/api';
import { AuthRequestError, PasswordChangeRequestError } from '@/api/auth';
import ConfirmModal from '@/components/common/ConfirmModal';
import { changelog } from '@/data/changelog';
import { usePermission } from '@/hooks/usePermission';
import { useRouteNavigationGuard, type RouteNavigationAttempt } from '@/hooks/useRouteNavigationGuard';
import { useAppStore, useAuthStore } from '@/store';
import { getRoleDisplayName } from '@/lib/roles';

type ProfileFields = { name: string; email: string };
type ProfileRecovery = {
  kind: 'unknown' | 'unchanged' | 'conflict';
  actorId: number;
  token: string;
  before: ProfileFields;
  draft: ProfileFields;
  currentUser?: Awaited<ReturnType<typeof getMe>>;
  message: string;
};

function normalizeProfileFields(fields: ProfileFields): ProfileFields {
  return { name: fields.name.trim(), email: fields.email.trim() };
}

function sameProfileFields(left: ProfileFields, right: ProfileFields) {
  const normalizedLeft = normalizeProfileFields(left);
  const normalizedRight = normalizeProfileFields(right);
  return normalizedLeft.name === normalizedRight.name && normalizedLeft.email === normalizedRight.email;
}

export default function MobileMe() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const theme = useAppStore((state) => state.theme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);
  const fontSize = useAppStore((state) => state.fontSize);
  const setFontSize = useAppStore((state) => state.setFontSize);
  const { hasPermission } = usePermission();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [saving, setSaving] = useState(false);
  const [profileRecovery, setProfileRecovery] = useState<ProfileRecovery | null>(null);
  const profileSaveLockRef = useRef(false);
  const [profileNotice, setProfileNotice] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState('');
  const [passwordOutcomeUnknown, setPasswordOutcomeUnknown] = useState(false);
  const passwordSaveLockRef = useRef(false);
  const passwordOutcomeUnknownRef = useRef(false);
  const [pendingLeaveAttempt, setPendingLeaveAttempt] = useState<{
    kind: 'profile' | 'password';
    attempt: Pick<RouteNavigationAttempt, 'proceed' | 'stay'>;
  } | null>(null);
  const [passwordNavigationNotice, setPasswordNavigationNotice] = useState('');
  const [showChangelog, setShowChangelog] = useState(false);

  useEffect(() => { setName(user?.name ?? ''); setEmail(user?.email ?? ''); }, [user?.email, user?.name]);
  const saveProfileFromServer = (profile: Awaited<ReturnType<typeof getMe>>, actorId: number, actorToken: string) => {
    const auth = useAuthStore.getState();
    if (Number(auth.user?.id) !== actorId || auth.token !== actorToken || Number(profile.id) !== actorId) return false;
    auth.login(profile, actorToken);
    setName(profile.name);
    setEmail(profile.email ?? '');
    setProfileRecovery(null);
    setProfileNotice('个人资料已保存。');
    return true;
  };
  const verifyProfileSnapshot = async (snapshot: ProfileRecovery) => {
    try {
      const currentProfile = await getMe(snapshot.token);
      if (Number(currentProfile.id) !== snapshot.actorId) {
        setProfileRecovery({
          ...snapshot,
          kind: 'unknown',
          currentUser: undefined,
          message: '当前会话返回了其他账号资料，尚不能确认本次保存结果。草稿已保留，请重新只读核实。',
        });
        return;
      }
      const currentFields = normalizeProfileFields({ name: currentProfile.name, email: currentProfile.email ?? '' });
      if (sameProfileFields(currentFields, snapshot.draft)) {
        if (!saveProfileFromServer(currentProfile, snapshot.actorId, snapshot.token)) return;
        setProfileNotice('已核实个人资料已更新。');
        return;
      }
      const unchanged = sameProfileFields(currentFields, snapshot.before);
      setProfileRecovery({
        ...snapshot,
        kind: unchanged ? 'unchanged' : 'conflict',
        currentUser: currentProfile,
        message: unchanged
          ? '服务器仍是本次编辑前的资料。没有自动重发；确认后可明确重新保存。'
          : '服务器资料与本次提交内容及编辑前资料均不同。为避免覆盖其他修改，普通保存已暂停。',
      });
      setProfileNotice('');
    } catch {
      setProfileRecovery({
        ...snapshot,
        kind: 'unknown',
        currentUser: undefined,
        message: '个人资料保存结果尚未核实。页面草稿已保留；请只读重新核实，确认前不要重复保存。',
      });
      setProfileNotice('');
    }
  };
  const verifyProfileRecovery = async () => {
    if (!profileRecovery || profileSaveLockRef.current) return;
    profileSaveLockRef.current = true;
    setSaving(true);
    setProfileNotice('');
    try {
      await verifyProfileSnapshot(profileRecovery);
    } finally {
      profileSaveLockRef.current = false;
      setSaving(false);
    }
  };
  const saveProfile = async (confirmOverwrite = false) => {
    const auth = useAuthStore.getState();
    const currentUser = auth.user;
    const actorToken = auth.token;
    const recovery = profileRecovery;
    if (!currentUser || !actorToken || profileSaveLockRef.current || (recovery && !confirmOverwrite)) return;
    if (confirmOverwrite && (!recovery || !recovery.currentUser || (recovery.kind !== 'unchanged' && recovery.kind !== 'conflict'))) return;
    const actorId = Number(currentUser.id);
    if (!Number.isSafeInteger(actorId) || actorId <= 0) {
      setProfileNotice('当前账号尚未确认，无法安全保存个人资料。');
      return;
    }
    const draft = normalizeProfileFields(confirmOverwrite && recovery ? recovery.draft : { name, email });
    const before = normalizeProfileFields(confirmOverwrite && recovery?.currentUser
      ? { name: recovery.currentUser.name, email: recovery.currentUser.email ?? '' }
      : { name: currentUser.name, email: currentUser.email ?? '' });
    const snapshot: ProfileRecovery = {
      kind: 'unknown', actorId, token: actorToken, before, draft,
      message: '正在只读核实个人资料保存结果；核实期间不会再次提交。',
    };
    profileSaveLockRef.current = true;
    setSaving(true); setProfileNotice('');
    try {
      try {
        const profile = await updateMyProfile(draft);
        if (!saveProfileFromServer(profile, actorId, actorToken)) return;
      } catch (error) {
        const status = error instanceof AuthRequestError ? error.status : null;
        const definitelyRejected = status !== null && status >= 400 && status < 500
          && ![408, 425, 429].includes(status);
        if (definitelyRejected) {
          setProfileRecovery(null);
          setProfileNotice(error instanceof Error ? error.message : '保存个人资料失败');
          return;
        }
        setProfileRecovery(snapshot);
        setProfileNotice('');
        await verifyProfileSnapshot(snapshot);
      }
    }
    finally {
      profileSaveLockRef.current = false;
      setSaving(false);
    }
  };
  const savePassword = async () => {
    if (savingPassword || passwordSaveLockRef.current || passwordOutcomeUnknownRef.current) return;
    setPasswordNotice('');
    if (!oldPassword) { setPasswordNotice('请输入当前密码。'); return; }
    if (newPassword.length < 6) { setPasswordNotice('新密码至少 6 位。'); return; }
    passwordSaveLockRef.current = true;
    setSavingPassword(true);
    try {
      await changePassword(oldPassword, newPassword);
      setOldPassword(''); setNewPassword(''); setPasswordNotice('密码已更新。');
    } catch (error) {
      const status = error instanceof PasswordChangeRequestError ? error.status : null;
      const message = error instanceof Error ? error.message : '修改密码失败';
      const definitelyRejected = status === 400
        || status === 404
        || status === 429
        || (status === 401 && message === '旧密码错误');
      if (definitelyRejected) {
        setPasswordNotice(message);
        return;
      }
      passwordOutcomeUnknownRef.current = true;
      setPasswordOutcomeUnknown(true);
      setOldPassword('');
      setNewPassword('');
      setPasswordNotice('密码修改结果尚未确认。为避免重复修改，密码输入与提交已锁定；请退出后尝试使用新密码重新登录。密码不会保存在本机。');
    }
    finally {
      passwordSaveLockRef.current = false;
      setSavingPassword(false);
    }
  };
  const handleRouteNavigationAttempt = useCallback(({ proceed, stay }: RouteNavigationAttempt) => {
    if (saving || profileSaveLockRef.current) {
      setPasswordNavigationNotice('个人资料仍在保存或核实，请等待结果后再离开。');
      stay();
      return;
    }
    if (profileRecovery) {
      setPasswordNavigationNotice('');
      setPendingLeaveAttempt({ kind: 'profile', attempt: { proceed, stay } });
      return;
    }
    if (savingPassword || passwordSaveLockRef.current) {
      setPasswordNavigationNotice('密码修改仍在提交或核实，请等待结果后再离开。');
      stay();
      return;
    }
    if (passwordOutcomeUnknown || passwordOutcomeUnknownRef.current) {
      setPasswordNavigationNotice('');
      setPendingLeaveAttempt({ kind: 'password', attempt: { proceed, stay } });
      return;
    }
    proceed();
  }, [passwordOutcomeUnknown, profileRecovery, saving, savingPassword]);
  useRouteNavigationGuard(saving || profileRecovery !== null || savingPassword || passwordOutcomeUnknown, handleRouteNavigationAttempt);

  useEffect(() => {
    if (!saving && !profileRecovery && !savingPassword && !passwordOutcomeUnknown) return undefined;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [passwordOutcomeUnknown, profileRecovery, saving, savingPassword]);
  const row = 'flex min-h-14 w-full items-center justify-between border-t border-studio-border-soft px-4 text-sm';
  const profileLocked = saving || Boolean(profileRecovery);
  return <div className="space-y-4">
    {passwordNavigationNotice ? <p role="alert" className="rounded-xl border border-studio-amber/30 bg-studio-amber-soft p-3 text-sm text-studio-amber-contrast">{passwordNavigationNotice}</p> : null}
    <section className="rounded-2xl border border-studio-border-soft bg-studio-surface p-5">
      <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-studio-primary/15 text-studio-cyan"><UserRound className="h-5 w-5" /></span><div><p className="text-lg font-semibold">{user?.name ?? '我的账号'}</p><p className="mt-1 text-sm text-studio-text-muted">{getRoleDisplayName(user?.role)}</p></div></div>
      <div className="mt-4 space-y-3">
        <label className="block text-sm">姓名<input disabled={profileLocked} value={name} onChange={(event) => setName(event.target.value)} className="xmt-field mt-1 min-h-11 w-full px-3 disabled:opacity-60" /></label>
        <label className="block text-sm">邮箱<input disabled={profileLocked} value={email} onChange={(event) => setEmail(event.target.value)} inputMode="email" className="xmt-field mt-1 min-h-11 w-full px-3 disabled:opacity-60" /></label>
        <button type="button" disabled={profileLocked} onClick={() => void saveProfile()} className="xmt-btn xmt-btn-primary inline-flex min-h-11 items-center gap-2 px-4 text-sm disabled:opacity-50"><Save className="h-4 w-4" />{saving ? '保存中…' : profileRecovery ? '结果待核实' : '保存个人资料'}</button>
        {profileNotice ? <p role="status" className="text-sm text-studio-text-secondary">{profileNotice}</p> : null}
        {profileRecovery ? (
          <div role="alert" data-testid="mobile-profile-recovery" className="space-y-3 rounded-xl border border-studio-amber/30 bg-studio-amber-soft p-3 text-sm text-studio-amber-contrast">
            <p>{profileRecovery.message}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={saving} onClick={() => void verifyProfileRecovery()} className="xmt-btn xmt-btn-secondary min-h-10 px-3">{saving ? '核实中…' : '只读重新核实'}</button>
              {profileRecovery.kind === 'unchanged' ? (
                <button type="button" disabled={saving} onClick={() => void saveProfile(true)} className="xmt-btn xmt-btn-primary min-h-10 px-3">确认重试保存</button>
              ) : null}
              {profileRecovery.kind === 'conflict' ? (
                <>
                  <button type="button" disabled={saving} onClick={() => {
                    if (profileRecovery.currentUser && saveProfileFromServer(profileRecovery.currentUser, profileRecovery.actorId, profileRecovery.token)) {
                      setProfileNotice('已载入服务器当前资料。');
                    }
                  }} className="xmt-btn xmt-btn-secondary min-h-10 px-3">载入服务器资料</button>
                  <button type="button" disabled={saving} onClick={() => void saveProfile(true)} className="xmt-btn xmt-btn-primary min-h-10 px-3">明确覆盖服务器资料</button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
    <section className="overflow-hidden rounded-2xl border border-studio-border-soft bg-studio-surface"><button type="button" onClick={toggleTheme} className="flex min-h-14 w-full items-center justify-between px-4 text-sm"><span className="inline-flex items-center gap-3">{theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}主题</span><span className="text-studio-text-muted">{theme === 'dark' ? '深色' : '浅色'}</span></button><div className={row}><span className="inline-flex items-center gap-3"><SlidersHorizontal className="h-5 w-5" />字体大小</span><div className="flex gap-1">{[14, 16, 18].map((size) => <button type="button" key={size} onClick={() => setFontSize(size)} className={`min-h-10 min-w-10 rounded-lg text-xs ${fontSize === size ? 'bg-studio-primary-button text-white' : 'border border-studio-border-soft'}`}>{size}</button>)}</div></div><button type="button" onClick={() => navigate('/notification-settings')} className={row}><span>消息通知偏好</span><ChevronRight className="h-5 w-5 text-studio-text-muted" /></button></section>
    <section className="overflow-hidden rounded-2xl border border-studio-border-soft bg-studio-surface"><button type="button" disabled={savingPassword || passwordOutcomeUnknown} onClick={() => setShowPassword((value) => !value)} className="flex min-h-14 w-full items-center justify-between px-4 text-sm disabled:opacity-50"><span className="inline-flex items-center gap-3"><Lock className="h-5 w-5" />账号安全</span><ChevronRight className="h-5 w-5 text-studio-text-muted" /></button>{showPassword ? <div className="space-y-3 border-t border-studio-border-soft p-4"><div className="space-y-1"><label htmlFor="mobile-current-password" className="block text-sm text-studio-text-secondary">当前密码</label><input id="mobile-current-password" disabled={savingPassword || passwordOutcomeUnknown} value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} type="password" autoComplete="current-password" placeholder="当前密码" className="min-h-11 w-full rounded-xl border border-studio-border-soft bg-transparent px-3 disabled:opacity-60" /></div><div className="space-y-1"><label htmlFor="mobile-new-password" className="block text-sm text-studio-text-secondary">新密码（至少 6 位）</label><input id="mobile-new-password" disabled={savingPassword || passwordOutcomeUnknown} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="新密码（至少 6 位）" className="min-h-11 w-full rounded-xl border border-studio-border-soft bg-transparent px-3 disabled:opacity-60" /></div><button type="button" disabled={savingPassword || passwordOutcomeUnknown} onClick={() => void savePassword()} className="min-h-11 rounded-xl bg-studio-primary-button px-4 text-sm text-white disabled:opacity-50">{savingPassword ? '更新中…' : passwordOutcomeUnknown ? '结果待核实' : '更新密码'}</button>{passwordNotice ? <p role={passwordOutcomeUnknown ? 'alert' : 'status'} className="text-sm text-studio-text-secondary">{passwordNotice}</p> : null}</div> : null}<button type="button" onClick={() => setShowChangelog((value) => !value)} className={row}><span className="inline-flex items-center gap-3"><History className="h-5 w-5" />更新说明</span><ChevronRight className="h-5 w-5 text-studio-text-muted" /></button>{showChangelog ? <div className="space-y-3 border-t border-studio-border-soft p-4">{changelog.slice(0, 3).map((entry) => <article key={entry.version}><p className="text-sm font-medium">v{entry.version} · {entry.title}</p><p className="mt-1 text-xs text-studio-text-muted">{entry.date}</p><ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-studio-text-secondary">{entry.changes.slice(0, 4).map((change) => <li key={change.description}>{change.description}</li>)}</ul></article>)}</div> : null}<button type="button" onClick={() => navigate('/anonymous-feedback')} className={row}><span>反馈</span><ChevronRight className="h-5 w-5 text-studio-text-muted" /></button>{hasPermission('system:settings') ? <button type="button" onClick={() => navigate('/notification-settings')} className={row}><span>管理工具</span><ChevronRight className="h-5 w-5 text-studio-text-muted" /></button> : null}</section>
    <p className="px-1 text-xs text-studio-text-muted">XMT Mobile v{__APP_VERSION__}</p>
    <ConfirmModal
      open={pendingLeaveAttempt !== null}
      title={pendingLeaveAttempt?.kind === 'password' ? '密码修改结果尚未确认' : '个人资料结果尚未确认'}
      description={pendingLeaveAttempt?.kind === 'password'
        ? '离开后本页的核验提示会关闭。请先退出当前账号，再用新密码尝试登录；此页面不会自动重复提交改密请求。'
        : '离开后本页的草稿和待核实提示会关闭。重新打开后会读取账号当前资料，不会自动重复提交或覆盖服务器内容。'}
      confirmText={pendingLeaveAttempt?.kind === 'password' ? '离开并按提示核验' : '离开并放弃本页草稿'}
      cancelText="留在当前页面"
      variant="warning"
      onCancel={() => {
        pendingLeaveAttempt?.attempt.stay();
        setPendingLeaveAttempt(null);
      }}
      onConfirm={() => {
        const attempt = pendingLeaveAttempt?.attempt;
        setPendingLeaveAttempt(null);
        attempt?.proceed();
      }}
    />
  </div>;
}
