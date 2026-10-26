/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useBlocker, type Location } from 'react-router-dom';

export interface RouteNavigationAttempt {
  location: Location;
  proceed: () => void;
  stay: () => void;
}

export type RouteNavigationAttemptHandler = (
  attempt: RouteNavigationAttempt,
) => void | Promise<void>;

interface RouteNavigationGuardRegistration {
  id: string;
  handleAttempt: RouteNavigationAttemptHandler;
}

type RegisterRouteNavigationGuard = (
  registration: RouteNavigationGuardRegistration,
) => () => void;

const RouteNavigationGuardContext = createContext<RegisterRouteNavigationGuard | null>(null);

/** Installs one app-level blocker while a mounted page has unsaved or in-flight work. */
export function RouteNavigationGuardProvider({ children }: { children: ReactNode }) {
  const [registrations, setRegistrations] = useState<ReadonlyMap<string, RouteNavigationGuardRegistration>>(
    () => new Map(),
  );
  const register = useCallback<RegisterRouteNavigationGuard>((registration) => {
    setRegistrations((current) => new Map(current).set(registration.id, registration));
    return () => {
      setRegistrations((current) => {
        if (current.get(registration.id) !== registration) return current;
        const next = new Map(current);
        next.delete(registration.id);
        return next;
      });
    };
  }, []);
  const activeRegistration = useMemo(
    () => Array.from(registrations.values()).at(-1) ?? null,
    [registrations],
  );
  const activeRegistrationRef = useRef(activeRegistration);
  activeRegistrationRef.current = activeRegistration;
  const blocker = useBlocker(activeRegistration !== null);
  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;
  const handledLocationKeyRef = useRef<string | null>(null);
  const blockedLocationKey = blocker.state === 'blocked' ? blocker.location.key : null;

  useEffect(() => {
    if (blocker.state !== 'blocked') {
      handledLocationKeyRef.current = null;
      return;
    }

    if (handledLocationKeyRef.current === blocker.location.key) return;
    handledLocationKeyRef.current = blocker.location.key;

    const proceed = () => {
      const current = blockerRef.current;
      if (current.state === 'blocked') current.proceed();
    };
    const stay = () => {
      const current = blockerRef.current;
      if (current.state === 'blocked') current.reset();
    };
    const attempt: RouteNavigationAttempt = { location: blocker.location, proceed, stay };
    const handleAttempt = activeRegistrationRef.current?.handleAttempt;

    if (!handleAttempt) {
      proceed();
      return;
    }

    try {
      const result = handleAttempt(attempt);
      if (result) void result.catch(stay);
    } catch {
      stay();
    }
  }, [blocker, blockedLocationKey]);

  return (
    <RouteNavigationGuardContext.Provider value={register}>
      {children}
    </RouteNavigationGuardContext.Provider>
  );
}

/** Registers the page's existing save/confirm flow for all React Router navigations. */
export function useRouteNavigationGuard(
  enabled: boolean,
  handleAttempt: RouteNavigationAttemptHandler,
) {
  const register = useContext(RouteNavigationGuardContext);
  const id = useId();

  if (!register) {
    throw new Error('useRouteNavigationGuard must be used inside RouteNavigationGuardProvider');
  }

  useLayoutEffect(() => {
    if (!enabled) return undefined;
    return register({ id, handleAttempt });
  }, [enabled, handleAttempt, id, register]);
}
