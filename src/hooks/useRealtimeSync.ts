import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';

interface UseRealtimeSyncOptions {
  room: string;
  events: Record<string, (data: any) => void>;
  socket: Socket | null;
}

/**
 * 通用实时同步 Hook（单例 socket 版）
 * 自动加入/离开房间，监听指定事件
 */
export function useRealtimeSync({ room, events, socket }: UseRealtimeSyncOptions) {
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    if (!socket) return;

    // 无论是否已连接，都尝试加入房间
    const joinAndListen = () => {
      socket.emit('join', room);
      Object.entries(eventsRef.current).forEach(([event, handler]) => {
        socket.on(event, (data: unknown) => handler(data));
      });
    };

    if (socket.connected) {
      joinAndListen();
    } else {
      socket.on('connect', joinAndListen);
    }

    return () => {
      socket.emit('leave', room);
      Object.keys(eventsRef.current).forEach((event) => socket.off(event));
      socket.off('connect', joinAndListen);
    };
  }, [socket, room]);
}
