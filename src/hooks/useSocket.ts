import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore, useMessageStore } from '../store';
import { notifyDesktop } from '../utils/notification';
import { SocketCoordinator, createRuntimeTokenProvider, readSocketCoordinatorEnabled, SocketTabCoordinator } from '../auth/socket';
import { SocketClientLifecycleDiagnostics } from '../observability/socket-client-lifecycle';
import { getSocketBaseUrl, isNative } from '@/platform/runtime';

let globalSocket: Socket | null = null;
let globalUserId: number | null = null;
let globalToken: string | null = null;
let globalCoordinator: SocketCoordinator | null = null;
let globalTabs: SocketTabCoordinator | null = null;
let globalLifecycleDiagnostics: SocketClientLifecycleDiagnostics | null = null;

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [, setSocketRevision] = useState(0);
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const setUnreadCount = useMessageStore((state) => state.setUnreadCount);
  const addMessage = useMessageStore((state) => state.addMessage);

  useEffect(() => {
    if (!isLoggedIn || !user || !token) {
      setSocket(null);
      return;
    }

    if (globalSocket && globalUserId === user.id && globalToken === token) {
      setSocket(globalSocket);
      return;
    }

    if (globalSocket) {
      globalCoordinator?.destroy();
      globalCoordinator = null;
      globalLifecycleDiagnostics?.destroyed('identity_changed');
      globalLifecycleDiagnostics = null;
      globalSocket.disconnect();
      globalSocket = null;
    }

    const coordinatorEnabled = readSocketCoordinatorEnabled(import.meta.env);
    const runtime = window.__xmtAuthRuntime;
    const nextSocket = io(getSocketBaseUrl(), {
      path: '/socket.io',
      // Native networks can block a websocket upgrade. Keep polling as a secure fallback.
      transports: ['polling', 'websocket'],
      upgrade: true,
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      auth: {
        token,
      },
      autoConnect: !coordinatorEnabled || !runtime,
    });

    globalSocket = nextSocket;
    globalUserId = user.id;
    globalToken = token;
    const lifecycleDiagnostics = new SocketClientLifecycleDiagnostics(import.meta.env.DEV);
    globalLifecycleDiagnostics = lifecycleDiagnostics;
    lifecycleDiagnostics.created();
    setSocket(nextSocket);
    let reconnectAttempt = 0;

    if (coordinatorEnabled && runtime) {
      const coordinator = new SocketCoordinator({
        socket: nextSocket,
        tokenProvider: createRuntimeTokenProvider(runtime),
      });
      globalCoordinator = coordinator;
      globalTabs = new SocketTabCoordinator();
      globalTabs.on((event) => {
        if (event === 'logout') coordinator.logout();
        if (event === 'token_refreshed' && !nextSocket.connected) coordinator.connect();
      });
      coordinator.connect();
    }

    nextSocket.on('connect', () => {
      lifecycleDiagnostics.connected();
      if (reconnectAttempt > 0) {
        nextSocket.emit('socket:lifecycle:reconnect', { attempt: reconnectAttempt });
        reconnectAttempt = 0;
      }
      console.info('[Socket] connected:', nextSocket.id);
      setSocketRevision((revision) => revision + 1);
      setSocket(nextSocket);
    });

    nextSocket.on('connect_error', (error) => {
      console.warn('[Socket] connect_error:', error.message);
      setSocketRevision((revision) => revision + 1);
    });

    nextSocket.on('disconnect', (reason) => {
      lifecycleDiagnostics.disconnected(reason);
      console.info('[Socket] disconnected:', reason);
      setSocketRevision((revision) => revision + 1);
    });

    const onNetworkStatus = (event: Event) => {
      const online = (event as CustomEvent<{ connected?: boolean }>).detail?.connected;
      if (online && !nextSocket.connected) nextSocket.connect();
      if (online === false && isNative()) nextSocket.disconnect();
    };
    const onResume = () => {
      if (!nextSocket.connected) nextSocket.connect();
    };
    window.addEventListener('xmt-network-status', onNetworkStatus);
    window.addEventListener('xmt-app-resume', onResume);

    nextSocket.io.on('reconnect_attempt', (attempt) => {
      reconnectAttempt = Number.isInteger(attempt) ? attempt : 0;
      lifecycleDiagnostics.reconnectAttempt(attempt);
    });

    nextSocket.on('new_message', (message) => {
      addMessage(message);
      notifyDesktop({
        title: message.title || '新消息',
        body: message.content || '你有一条新消息',
        tag: `xmt-msg-${message.id}`,
        url: '/messages',
      });
    });

    nextSocket.on('unread_count', () => {
      import('../api').then(({ getUnreadCount }) => {
        getUnreadCount().then((data) => {
          setUnreadCount(data.unreadCount);
        }).catch(() => {});
      });
    });

    return () => {
      window.removeEventListener('xmt-network-status', onNetworkStatus);
      window.removeEventListener('xmt-app-resume', onResume);
    };
  }, [addMessage, isLoggedIn, setUnreadCount, token, user]);

  useEffect(() => {
    if (!isLoggedIn && globalSocket) {
      globalLifecycleDiagnostics?.destroyed('logout');
      globalLifecycleDiagnostics = null;
      globalSocket.disconnect();
      globalSocket = null;
      globalCoordinator?.destroy();
      globalCoordinator = null;
      globalTabs?.notify('logout');
      globalTabs?.close();
      globalTabs = null;
      globalUserId = null;
      globalToken = null;
      setSocket(null);
    }
  }, [isLoggedIn]);

  return socket;
}
