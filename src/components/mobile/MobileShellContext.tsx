import { createContext, useContext, type ReactNode } from 'react';

const MobileShellContext = createContext(false);

export function MobileShellProvider({ children }: { children: ReactNode }) {
  return <MobileShellContext.Provider value={true}>{children}</MobileShellContext.Provider>;
}

export function useIsInsideMobileShell() {
  return useContext(MobileShellContext);
}
