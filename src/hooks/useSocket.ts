import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore, useMessageStore } from '../store';
import { notifyDesktop } from '../utils/notification';

// 单例 socket：全局只维护一个连接
let globalSocket: Socket | null = null;
let globalUserId: number | null = null;

/**
 * Socket.IO 实时通信 Hook（单例模式）
 * 所有组件共享同一个 socket 连接
 */
export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const user = useAuthStore((state) => state.user);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const setUnreadCount = useMessageStore((state) => state.setUnreadCount);
  const addMessage = useMessageStore((state) => state.addMessage);

  useEffect(() => {
    if (!isLoggedIn || !user) {
      setSocket(null);
      return;
    }

    // 复用已有连接
    if (globalSocket && globalUserId === user.id && globalSocket.connected) {
      setSocket(globalSocket);
      return;
    }

    // 断开旧连接
    if (globalSocket) {
      globalSocket.disconnect();
      globalSocket = null;
    }

    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
    });

    globalSocket = socket;
    globalUserId = user.id;

    socket.on('connect', () => {
      socket.emit('subscribe', user.id);
      if (user.role === 'admin' || user.role === 'director') {
        socket.emit('subscribe', 'admin_channel');
      }
      // 连接成功后更新 state，触发子组件 re-render
      setSocket(socket);
    });

    socket.on('new_message', (message) => {
      addMessage(message);
      // 桌面通知：新消息弹窗
      notifyDesktop({
        title: message.title || '新消息',
        body: message.content || '你有一条新消息',
        tag: `xmt-msg-${message.id}`,
        url: '/messages',
      });
    });

    socket.on('unread_count', () => {
      import('../api').then(({ getUnreadCount }) => {
        getUnreadCount().then((data) => {
          setUnreadCount(data.unreadCount);
        }).catch(() => {});
      });
    });

    return () => {
      // 不断开 —— 单例模式，登出时才断
    };
  }, [isLoggedIn, user?.id]);

  // 登出时断开
  useEffect(() => {
    if (!isLoggedIn && globalSocket) {
      globalSocket.disconnect();
      globalSocket = null;
      globalUserId = null;
      setSocket(null);
    }
  }, [isLoggedIn]);

  return socket;
}
