import { ReactBitsBackgroundSlot } from '@/features/reactbits-appearance/ReactBitsBackgroundSlot';

export default function LoginHero() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <ReactBitsBackgroundSlot page="login" className="opacity-70" fallbackClassName="bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.24),transparent_32%),radial-gradient(circle_at_80%_30%,rgba(124,58,237,0.22),transparent_34%),linear-gradient(135deg,#04111f,#0f172a)]" />
      <div className="absolute inset-0 bg-slate-950/45" />
    </div>
  );
}
