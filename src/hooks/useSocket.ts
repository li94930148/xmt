import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore, useMessageStore } from '../store';
import { notifyDesktop } from '../utils/notification';
import { SocketCoordinator, createRuntimeTokenProvider, readSocketCoordinatorEnabled, SocketTabCoordinator } from '../auth/socket';

type CoordinatorRuntime = {
  getAccessToken: () => string | null;
  refresh: () => Promise<string | null>;
  getExpiresAt: () => number | null;
  getTraceSnapshot?: () => { mode: string; status: string; loginCompleted: boolean; hasAccessToken: boolean };
};

declare global {
  interface Window { __xmtAuthRuntime?: CoordinatorRuntime; }
}

let globalSocket: Socket | null = null;
let globalUserId: number | null = null;
let globalToken: string | null = null;
let globalCoordinator: SocketCoordinator | null = null;
let globalTabs: SocketTabCoordinator | null = null;

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
      globalSocket.disconnect();
      globalSocket = null;
    }

    // 当前 http://47.104.77.65 生产环境先使用 polling 稳定运行；
    // 后续切换 https://lanyaomedia.com 后，再恢复 transports: ['polling', 'websocket'] 和 upgrade。
    const coordinatorEnabled = readSocketCoordinatorEnabled(import.meta.env);
    const runtime = window.__xmtAuthRuntime;
    const nextSocket = io(window.location.origin, {
      path: '/socket.io',
      transports: ['polling'],
      upgrade: false,
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
    setSocket(nextSocket);

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
      console.info('[Socket] connected:', nextSocket.id);
      setSocketRevision((revision) => revision + 1);
      setSocket(nextSocket);
    });

    nextSocket.on('connect_error', (error) => {
      console.warn('[Socket] connect_error:', error.message);
      setSocketRevision((revision) => revision + 1);
    });

    nextSocket.on('disconnect', (reason) => {
      console.info('[Socket] disconnected:', reason);
      setSocketRevision((revision) => revision + 1);
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
      // 单例模式下由登录态变化统一断开
    };
  }, [addMessage, isLoggedIn, setUnreadCount, token, user]);

  useEffect(() => {
    if (!isLoggedIn && globalSocket) {
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
