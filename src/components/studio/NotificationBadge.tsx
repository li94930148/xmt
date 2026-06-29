export default function NotificationBadge({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }

  return (
    <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border border-studio-app-bg bg-studio-coral px-1 text-[10px] font-bold leading-none text-white shadow-[0_0_18px_rgba(255,95,122,0.34)]">
      {count > 99 ? '99+' : count}
    </span>
  );
}
