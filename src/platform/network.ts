import { useEffect, useState } from 'react';

export type NetworkState = 'online' | 'offline' | 'reconnecting';

function initialNetworkState(): NetworkState {
  return typeof navigator === 'undefined' || navigator.onLine ? 'online' : 'offline';
}

export function useNetworkState() {
  const [state, setState] = useState<NetworkState>(initialNetworkState);
  useEffect(() => {
    const online = () => setState('reconnecting');
    const offline = () => setState('offline');
    const native = (event: Event) => setState((event as CustomEvent<{ connected?: boolean }>).detail?.connected ? 'reconnecting' : 'offline');
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('xmt-network-status', native);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); window.removeEventListener('xmt-network-status', native); };
  }, []);
  useEffect(() => { if (state !== 'reconnecting') return; const timer = window.setTimeout(() => setState('online'), 1200); return () => window.clearTimeout(timer); }, [state]);
  return state;
}
