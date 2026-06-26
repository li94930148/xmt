import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore, useMessageStore } from '../store';
import { notifyDesktop } from '../utils/notification';

let globalSocket: Socket | null = null;
let globalUserId: number | null = null;
let globalToken: string | null = null;

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
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
      globalSocket.disconnect();
      globalSocket = null;
    }

    const nextSocket = io(window.location.origin, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      auth: {
        token,
      },
    });

    globalSocket = nextSocket;
    globalUserId = user.id;
    globalToken = token;

    nextSocket.on('connect', () => {
      console.info('[Socket] connected:', nextSocket.id);
      setSocket(nextSocket);
    });

    nextSocket.on('connect_error', (error) => {
      console.warn('[Socket] connect_error:', error.message);
      setSocket(null);
    });

    nextSocket.on('disconnect', (reason) => {
      console.info('[Socket] disconnected:', reason);
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
      globalUserId = null;
      globalToken = null;
      setSocket(null);
    }
  }, [isLoggedIn]);

  return socket;
}
