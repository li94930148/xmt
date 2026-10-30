export default function NotificationBadge({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }

  return (
    <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border border-studio-app-bg bg-studio-coral-soft px-1 text-[10px] font-bold leading-none text-studio-coral-contrast shadow-glow-coral">
      {count > 99 ? '99+' : count}
    </span>
  );
}
