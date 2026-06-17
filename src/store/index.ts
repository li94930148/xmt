import { create } from 'zustand';
import { User, Topic, Message } from '../types';
import { defaultSystemSettings, ManagedSystemSettings } from '@/lib/systemSettings';

export type AuthPersistence = 'local' | 'session';

const AUTH_USER_KEY = 'xmt_user';
const AUTH_TOKEN_KEY = 'xmt_token';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoggedIn: boolean;
  persistence: AuthPersistence;
  login: (user: User, token: string, options?: { persist?: AuthPersistence }) => void;
  logout: () => void;
}

const loadFromStorage = () => {
  try {
    const sessionUser = sessionStorage.getItem(AUTH_USER_KEY);
    const sessionToken = sessionStorage.getItem(AUTH_TOKEN_KEY);
    if (sessionToken) {
      return {
        user: sessionUser ? JSON.parse(sessionUser) : null,
        token: sessionToken,
        isLoggedIn: true,
        persistence: 'session' as AuthPersistence,
      };
    }

    const userStr = localStorage.getItem(AUTH_USER_KEY);
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    return {
      user: userStr ? JSON.parse(userStr) : null,
      token: token || null,
      isLoggedIn: !!token,
      persistence: token ? ('local' as AuthPersistence) : ('session' as AuthPersistence),
    };
  } catch {
    return { user: null, token: null, isLoggedIn: false, persistence: 'session' as AuthPersistence };
  }
};

export const useAuthStore = create<AuthState>((set, get) => ({
  ...loadFromStorage(),
  login: (user, token, options) => {
    const persist = options?.persist ?? get().persistence;
    const storage = persist === 'local' ? localStorage : sessionStorage;

    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_USER_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);

    storage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    storage.setItem(AUTH_TOKEN_KEY, token);
    set({ user, token, isLoggedIn: true, persistence: persist });
  },
  logout: () => {
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_USER_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    set({ user: null, token: null, isLoggedIn: false, persistence: 'session' });
  },
}));

interface TopicState {
  topics: Topic[];
  currentTopic: Topic | null;
  setTopics: (topics: Topic[]) => void;
  setCurrentTopic: (topic: Topic | null) => void;
  addTopic: (topic: Topic) => void;
  updateTopic: (topic: Topic) => void;
}

export const useTopicStore = create<TopicState>((set) => ({
  topics: [],
  currentTopic: null,
  setTopics: (topics) => set({ topics }),
  setCurrentTopic: (topic) => set({ currentTopic: topic }),
  addTopic: (topic) => set((state) => ({ topics: [topic, ...state.topics] })),
  updateTopic: (updatedTopic) => set((state) => ({
    topics: state.topics.map(t => t.id === updatedTopic.id ? updatedTopic : t)
  })),
}));

interface MessageState {
  messages: Message[];
  unreadCount: number;
  setMessages: (messages: Message[]) => void;
  setUnreadCount: (count: number) => void;
  markAsRead: (id: number) => void;
  addMessage: (message: Message) => void;
}

export const useMessageStore = create<MessageState>((set) => ({
  messages: [],
  unreadCount: 0,
  setMessages: (messages) => set({ messages }),
  setUnreadCount: (count) => set({ unreadCount: count }),
  markAsRead: (id) => set((state) => ({
    messages: state.messages.map(m => m.id === id ? { ...m, read: true } : m),
    unreadCount: state.unreadCount - 1
  })),
  addMessage: (message) => set((state) => ({
    messages: [message, ...state.messages],
    unreadCount: state.unreadCount + 1
  })),
}));

interface AppState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  notifications: { id: number; title: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }[];
  addNotification: (notification: { title: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }) => void;
  removeNotification: (id: number) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  systemSettings: ManagedSystemSettings;
  setSystemSettings: (settings: ManagedSystemSettings) => void;
}

const loadTheme = (): 'light' | 'dark' => {
  try {
    const theme = localStorage.getItem('xmt_theme') as 'light' | 'dark';
    return theme || 'dark';
  } catch {
    return 'dark';
  }
};

const loadFontSize = (): number => {
  try {
    const fontSize = localStorage.getItem('xmt_fontSize');
    return fontSize ? parseInt(fontSize, 10) : 14;
  } catch {
    return 14;
  }
};

export const useAppStore = create<AppState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  notifications: [],
  addNotification: (notification) => set((state) => ({
    notifications: [...state.notifications, { ...notification, id: Date.now() }]
  })),
  removeNotification: (id) => set((state) => ({
    notifications: state.notifications.filter(n => n.id !== id)
  })),
  theme: loadTheme(),
  toggleTheme: () => set((state) => {
    const newTheme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('xmt_theme', newTheme);
    document.documentElement.className = newTheme;
    return { theme: newTheme };
  }),
  fontSize: loadFontSize(),
  setFontSize: (size) => {
    localStorage.setItem('xmt_fontSize', size.toString());
    set({ fontSize: size });
  },
  systemSettings: defaultSystemSettings,
  setSystemSettings: (systemSettings) => set({ systemSettings }),
}));
