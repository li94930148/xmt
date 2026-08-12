import { events as createPointerEvents, type EventManager } from '@react-three/fiber';

// Fiber 8 / React 18 lifecycle compatibility: ignore only connect(null); reassess after an R3F upgrade.
export function createXmtSafeR3FEvents(store: any): EventManager<HTMLElement> {
  const manager = createPointerEvents(store);
  const connect = manager.connect;
  return { ...manager, connect: (target) => { if (target != null) connect?.(target); } };
}
