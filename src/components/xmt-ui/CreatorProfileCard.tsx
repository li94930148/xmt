import ProfileCard from '../reactbits/ProfileCard';

type CreatorProfileCardProps = {
  avatarUrl?: string;
  name: string;
  uid: string;
  dataStatus: string;
  fansCount: number | null;
  worksCount: number;
  playCount: number;
  onViewWorks: () => void;
};

const compactNumber = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 });

function avatarFallback(name: string) {
  const initial = (name.trim().slice(0, 1) || '创').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character] || character);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0ea5e9"/><stop offset="1" stop-color="#312e81"/></linearGradient></defs><rect width="100%" height="100%" rx="48" fill="url(#g)"/><text x="50%" y="48%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="220" font-family="sans-serif">${initial}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function CreatorProfileCard({
  avatarUrl,
  name,
  uid,
  dataStatus,
  fansCount,
  worksCount,
  playCount,
  onViewWorks,
}: CreatorProfileCardProps) {
  const resolvedAvatar = avatarUrl || avatarFallback(name);

  return (
    <section aria-label="创作者账号概览" className="grid min-w-0 gap-6 rounded-2xl border border-studio-border bg-studio-card p-5 lg:grid-cols-[minmax(260px,360px)_1fr] lg:items-center">
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
        behindGlowColor="rgba(14, 165, 233, 0.38)"
        behindGlowSize="58%"
      />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-studio-cyan">Creator profile</p>
        <h2 className="mt-2 truncate text-2xl font-semibold text-studio-text">{name}</h2>
        <p className="mt-2 text-sm text-studio-text-muted">抖音 UID：{uid || '—'}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-studio-surface p-4"><span className="text-xs text-studio-text-muted">粉丝</span><p className="mt-2 text-xl font-semibold">{fansCount == null ? '暂无数据' : compactNumber.format(fansCount)}</p></div>
          <div className="rounded-xl bg-studio-surface p-4"><span className="text-xs text-studio-text-muted">入库作品</span><p className="mt-2 text-xl font-semibold">{compactNumber.format(worksCount)}</p></div>
          <div className="rounded-xl bg-studio-surface p-4"><span className="text-xs text-studio-text-muted">累计播放</span><p className="mt-2 text-xl font-semibold">{compactNumber.format(playCount)}</p></div>
        </div>
        <p className="mt-4 text-xs leading-5 text-studio-text-muted">仅展示 Creator Dashboard 已同步的真实账号与内容数据。</p>
      </div>
    </section>
  );
}
