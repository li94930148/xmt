import { createContext, useContext } from 'react';

interface WritingFocusContextValue {
  focused: boolean;
  setFocused: (focused: boolean) => void;
}

export const WritingFocusContext = createContext<WritingFocusContextValue>({
  focused: false,
  setFocused: () => undefined,
});

export function useWritingFocus(): WritingFocusContextValue {
  return useContext(WritingFocusContext);
}
