import { ReactBitsBackgroundSlot } from '@/features/reactbits-appearance/ReactBitsBackgroundSlot';

export default function LoginHero() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <ReactBitsBackgroundSlot
        page="login"
        className="opacity-75"
        fallbackClassName="bg-[radial-gradient(circle_at_18%_18%,rgba(107,140,255,0.28),transparent_34%),radial-gradient(circle_at_82%_28%,rgba(92,225,230,0.14),transparent_32%),radial-gradient(circle_at_60%_80%,rgba(167,139,250,0.14),transparent_36%),linear-gradient(160deg,#080B12,#0C1018_45%,#0A0F1C)]"
      />
      <div className="absolute inset-0 bg-studio-app-bg/45" />
    </div>
  );
}
