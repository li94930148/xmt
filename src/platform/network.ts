import { useEffect, useState } from 'react';

export type NetworkState = 'online' | 'offline' | 'reconnecting' | 'poor_network';

type BrowserConnection = { effectiveType?: string; downlink?: number };
type NativeNetworkDetail = { connected?: boolean; poor?: boolean };

function browserConnection(): BrowserConnection | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { connection?: BrowserConnection }).connection;
}

export function isPoorNetwork(connection = browserConnection()) {
  return connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g' || (typeof connection?.downlink === 'number' && connection.downlink < 0.75);
}

export function resolveNetworkState(online: boolean, detail?: NativeNetworkDetail): NetworkState {
  if (!online || detail?.connected === false) return 'offline';
  if (detail?.poor || isPoorNetwork()) return 'poor_network';
  return 'online';
}

function initialNetworkState(): NetworkState {
  return typeof navigator === 'undefined' ? 'online' : resolveNetworkState(navigator.onLine);
}

export function useNetworkState() {
  const [state, setState] = useState<NetworkState>(initialNetworkState);
  useEffect(() => {
    const online = () => setState(isPoorNetwork() ? 'poor_network' : 'reconnecting');
    const offline = () => setState('offline');
    const native = (event: Event) => setState(resolveNetworkState(navigator.onLine, (event as CustomEvent<NativeNetworkDetail>).detail));
    const quality = () => setState(resolveNetworkState(navigator.onLine));
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('xmt-network-status', native);
    window.addEventListener('connectionchange', quality);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.removeEventListener('xmt-network-status', native);
      window.removeEventListener('connectionchange', quality);
    };
  }, []);
  useEffect(() => {
    if (state !== 'reconnecting') return;
    const timer = window.setTimeout(() => setState(resolveNetworkState(navigator.onLine)), 1200);
    return () => window.clearTimeout(timer);
  }, [state]);
  return state;
}
