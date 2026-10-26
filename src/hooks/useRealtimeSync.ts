import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';

interface UseRealtimeSyncOptions {
  room: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload types differ by socket event.
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
  const eventNamesKey = Object.keys(events).sort().join('\0');

  useEffect(() => {
    if (!socket) return;

    const eventNames = eventNamesKey.split('\0').filter(Boolean);
    const listeners = eventNames.map((event) => {
      const listener = (data: unknown) => eventsRef.current[event]?.(data);
      socket.on(event, listener);
      return { event, listener };
    });
    const joinRoom = () => socket.emit('join', room);
    socket.on('connect', joinRoom);
    if (socket.connected) joinRoom();

    return () => {
      if (socket.connected) socket.emit('leave', room);
      socket.off('connect', joinRoom);
      listeners.forEach(({ event, listener }) => socket.off(event, listener));
    };
  }, [socket, room, eventNamesKey]);
}
