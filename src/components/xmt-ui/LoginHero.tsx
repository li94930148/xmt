import { ReactBitsBackgroundSlot } from '@/features/reactbits-appearance/ReactBitsBackgroundSlot';

export default function LoginHero() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <ReactBitsBackgroundSlot
        page="login"
        className="opacity-75"
        fallbackClassName="bg-[radial-gradient(circle_at_18%_18%,var(--xmt-ambient-a),transparent_34%),radial-gradient(circle_at_82%_28%,var(--xmt-ambient-b),transparent_32%),linear-gradient(160deg,var(--xmt-app-bg),var(--xmt-app-bg-soft)_45%,var(--xmt-app-bg))]"
      />
      <div className="absolute inset-0 bg-studio-app-bg/45" />
    </div>
  );
}
