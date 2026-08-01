export type SocketCoordinatorStatus =
  | 'idle'
  | 'connecting'
  | 'authenticated'
  | 'refreshing'
  | 'reconnecting'
  | 'expired';

export type SocketCoordinatorState = {
  status: SocketCoordinatorStatus;
  connected: boolean;
  lastError: string | null;
  reconnectAttempt: number;
};

export type SocketRoomRecovery = {
  roomId: string;
  join: () => void | Promise<void>;
  restoreYjs?: () => void | Promise<void>;
  restoreAwareness?: () => void | Promise<void>;
  restoreTyping?: () => void | Promise<void>;
  restoreLock?: () => void | Promise<void>;
};

export const initialSocketCoordinatorState: SocketCoordinatorState = {
  status: 'idle',
  connected: false,
  lastError: null,
  reconnectAttempt: 0,
};
