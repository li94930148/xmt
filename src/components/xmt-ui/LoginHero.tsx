import { useEffect, useState } from 'react';
import Aurora from '../reactbits/AuroraBackground';

function supportsWebGL2() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

export default function LoginHero() {
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    setWebglAvailable(supportsWebGL2());
    const media = window.matchMedia('(max-width: 767px)');
    const sync = () => setMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      {webglAvailable === false ? (
        <div className="h-full w-full bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.24),transparent_32%),radial-gradient(circle_at_80%_30%,rgba(124,58,237,0.22),transparent_34%),linear-gradient(135deg,#04111f,#0f172a)]" />
      ) : webglAvailable === true ? (
        <div className="h-full w-full opacity-70">
          <Aurora
            colorStops={['#0ea5e9', '#8b5cf6', '#22d3ee']}
            amplitude={mobile ? 0.55 : 1}
            blend={mobile ? 0.28 : 0.5}
            speed={mobile ? 0.45 : 1}
          />
        </div>
      ) : null}
      <div className="absolute inset-0 bg-slate-950/45" />
    </div>
  );
}
