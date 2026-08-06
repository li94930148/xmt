import { useEffect, useRef, useState } from 'react';

export function useCountUp(target: number, duration = 520) {
  const [value, setValue] = useState(target);
  const currentValue = useRef(target);

  useEffect(() => {
    const start = currentValue.current;
    const delta = target - start;
    if (!delta || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      currentValue.current = target;
      setValue(target);
      return undefined;
    }

    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = start + delta * eased;
      currentValue.current = next;
      setValue(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else currentValue.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}
