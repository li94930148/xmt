export type SocketToken = {
  accessToken: string;
  expiresAt: number;
};

export type SocketTokenProvider = {
  getToken: () => SocketToken | null;
  refresh: () => Promise<SocketToken | null>;
  subscribe?: (listener: (token: SocketToken | null) => void) => () => void;
};

export function createRuntimeTokenProvider(runtime: {
  getAccessToken: () => string | null;
  refresh: () => Promise<string | null>;
  getExpiresAt?: () => number | null;
  subscribe?: (listener: (token: string | null) => void) => () => void;
}): SocketTokenProvider {
  const read = (): SocketToken | null => {
    const accessToken = runtime.getAccessToken();
    const expiresAt = runtime.getExpiresAt?.() ?? null;
    if (!accessToken || !expiresAt) return null;
    return { accessToken, expiresAt };
  };

  return {
    getToken: read,
    refresh: async () => {
      const accessToken = await runtime.refresh();
      if (!accessToken) return null;
      const token = read();
      return token ?? { accessToken, expiresAt: Math.floor(Date.now() / 1000) + 60 };
    },
    subscribe: runtime.subscribe
      ? (listener) => runtime.subscribe!((accessToken) => listener(accessToken ? read() : null))
      : undefined,
  };
}
