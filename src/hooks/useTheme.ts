import { useAppStore } from '../store';

export function useTheme() {
  const theme = useAppStore((state) => state.theme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);

  return {
    theme,
    toggleTheme,
    isDark: theme === 'dark'
  };
}
