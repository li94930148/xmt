import { useSyncExternalStore } from 'react';
import ProfileCard from '../reactbits/ProfileCard';
import ActionButton from '@/components/studio/ActionButton';

type CreatorProfileCardProps = {
  avatarUrl?: string;
  name: string;
  uid: string;
  dataStatus: string;
  fansCount: number | null;
  worksLabel: string;
  worksCount: number;
  playCount: number;
  onViewWorks: () => void;
};

const compactNumber = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 });
const desktopProfileQuery = '(min-width: 1024px)';

function subscribeToDesktopProfile(callback: () => void) {
  const media = window.matchMedia(desktopProfileQuery);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

function getDesktopProfileSnapshot() {
  return window.matchMedia(desktopProfileQuery).matches;
}

function avatarFallback(name: string) {
  const initial = (name.trim().slice(0, 1) || '创').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character] || character);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#6B8CFF"/><stop offset="1" stop-color="#0A0F1C"/></linearGradient></defs><rect width="100%" height="100%" rx="48" fill="url(#g)"/><text x="50%" y="48%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="220" font-family="sans-serif">${initial}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function CreatorProfileCard({
  avatarUrl,
  name,
  uid,
  dataStatus,
  fansCount,
  worksLabel,
  worksCount,
  playCount,
  onViewWorks,
}: CreatorProfileCardProps) {
  const resolvedAvatar = avatarUrl || avatarFallback(name);
  const showDesktopProfile = useSyncExternalStore(subscribeToDesktopProfile, getDesktopProfileSnapshot, () => false);

  return (
    <section data-testid="creator-account-overview" aria-label="创作者账号概览" className="grid min-w-0 gap-4 rounded-2xl border border-studio-border bg-studio-card p-4 sm:p-5 lg:grid-cols-[minmax(260px,340px)_1fr] lg:items-center lg:gap-6">
      {showDesktopProfile ? <div data-testid="creator-profile-desktop" className="mx-auto w-full min-w-0 max-w-[340px]">
        <ProfileCard
        className="mx-auto w-full min-w-0 max-w-[340px] [&>div>section]:!h-auto [&>div>section]:w-full [&>div>section]:max-h-none"
        avatarUrl={resolvedAvatar}
        miniAvatarUrl={resolvedAvatar}
        iconUrl=""
        grainUrl=""
        name={name}
        title="抖音创作者账号"
        handle={uid || '未同步 UID'}
        status={dataStatus === 'ready' ? '数据正常' : '数据不完整'}
        contactText="查看作品"
        onContactClick={onViewWorks}
        enableTilt
        enableMobileTilt={false}
        behindGlowColor="rgb(var(--xmt-cyan-rgb) / 0.38)"
        behindGlowSize="58%"
      />
      </div> : null}

      {!showDesktopProfile ? <div data-testid="creator-profile-compact" className="flex min-w-0 items-center gap-2.5">
        <img src={resolvedAvatar} alt={`${name}头像`} className="h-14 w-14 shrink-0 rounded-2xl border border-studio-border object-cover" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-studio-text">{name}</h2>
          <p className="mt-1 truncate text-xs text-studio-text-secondary">抖音 UID：{uid || '—'}</p>
          <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs ${dataStatus === 'ready' ? 'bg-studio-success/10 text-studio-success-contrast' : 'bg-studio-amber/10 text-studio-amber-contrast'}`}>
            {dataStatus === 'ready' ? '数据正常' : '数据不完整'}
          </span>
        </div>
        <ActionButton type="button" variant="secondary" onClick={onViewWorks} className="min-h-10 shrink-0 px-2.5 py-2 text-xs sm:px-3 sm:text-sm">
          查看作品
        </ActionButton>
      </div> : null}

      <dl data-testid="creator-account-metrics" aria-label="账号数据" className="grid grid-cols-2 gap-2 min-[360px]:grid-cols-3 sm:gap-3">
        <div className="min-w-0 rounded-xl bg-studio-surface p-3 sm:p-4">
          <dt className="truncate text-xs text-studio-text-secondary">粉丝</dt>
          <dd className="xmt-data-number mt-1 break-words text-base font-semibold text-studio-text sm:text-xl">{fansCount == null ? '暂无数据' : compactNumber.format(fansCount)}</dd>
        </div>
        <div className="min-w-0 rounded-xl bg-studio-surface p-3 sm:p-4">
          <dt className="truncate text-xs text-studio-text-secondary">{worksLabel}</dt>
          <dd className="xmt-data-number mt-1 break-words text-base font-semibold text-studio-text sm:text-xl">{compactNumber.format(worksCount)}</dd>
        </div>
        <div className="min-w-0 rounded-xl bg-studio-surface p-3 sm:p-4">
          <dt className="truncate text-xs text-studio-text-secondary">累计播放</dt>
          <dd className="xmt-data-number mt-1 break-words text-base font-semibold text-studio-text sm:text-xl">{compactNumber.format(playCount)}</dd>
        </div>
      </dl>
    </section>
  );
}
