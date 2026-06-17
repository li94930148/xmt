import { useAppStore } from '../store';

/**
 * 统一主题样式 Hook - 现代设计系统
 * 使用 CSS 变量实现主题切换，不再需要 isDark 三元判断
 */
export function useThemeStyles() {
  const theme = useAppStore((state) => state.theme);
  const isDark = theme === 'dark';

  const styles = {
    // === 基础颜色（CSS 变量自动切换） ===
    bgPrimary: 'bg-theme-primary',
    bgSecondary: 'bg-theme-secondary',
    bgTertiary: 'bg-theme-tertiary',
    bgInput: 'bg-theme-tertiary',
    bgCard: 'bg-theme-secondary',
    bgModal: 'bg-theme-secondary',
    bgElevated: 'bg-theme-elevated',

    // === 边框 ===
    border: 'border-theme-border',
    borderInput: 'border-theme-border',
    borderLight: 'border-theme-border-light',

    // === 文字 ===
    textPrimary: 'text-theme-text',
    textSecondary: 'text-theme-text-secondary',
    textMuted: 'text-theme-text-muted',
    textPlaceholder: isDark ? 'placeholder-[#636983]' : 'placeholder-[#9aa0b0]',

    // === 交互 ===
    hoverBg: isDark ? 'hover:bg-[#1e2030]' : 'hover:bg-[#f1f3f5]',
    hoverBgLight: isDark ? 'hover:bg-[#252840]' : 'hover:bg-[#e9ecef]',
    focusRing: 'focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500',

    // === 表格 ===
    tableHeader: 'bg-theme-tertiary',
    tableRow: 'border-theme-border',
    tableHover: isDark ? 'hover:bg-[#1e2030]/50' : 'hover:bg-[#f8f9fa]',

    // === 按钮 ===
    buttonPrimary: isDark
      ? 'bg-brand-500 hover:bg-brand-400 text-white shadow-sm shadow-brand-500/20'
      : 'bg-brand-700 hover:bg-brand-800 text-white shadow-sm shadow-brand-700/20',
    buttonSecondary: 'bg-theme-tertiary hover:bg-theme-elevated text-theme-text border border-theme-border',
    buttonDanger: isDark
      ? 'text-[#ff6b6b] hover:text-[#ff8787] hover:bg-theme-tertiary'
      : 'text-[#e03131] hover:text-[#c92a2a] hover:bg-[#fff5f5]',
    buttonInfo: isDark
      ? 'text-brand-500 hover:text-brand-400 hover:bg-theme-tertiary'
      : 'text-brand-700 hover:text-brand-800 hover:bg-brand-50',
    buttonSuccess: isDark
      ? 'text-[#51cf66] hover:text-[#69db7c] hover:bg-theme-tertiary'
      : 'text-[#37b24d] hover:text-[#2f9e44] hover:bg-[#ebfbee]',

    // === 组合样式 ===
    card: isDark
      ? 'bg-theme-secondary border border-theme-border rounded-2xl'
      : 'bg-white border border-theme-border rounded-2xl shadow-sm',
    modal: 'bg-theme-secondary border border-theme-border rounded-2xl shadow-2xl',
    input: 'bg-theme-tertiary border border-theme-border text-theme-text rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-theme-text-muted',
    pageTitle: 'text-2xl font-bold text-theme-text',
    subtitle: 'text-sm text-theme-text-secondary',
    divider: 'border-theme-border',
    badge: 'px-2.5 py-0.5 rounded-full text-xs font-medium border',

    // === 杂项 ===
    spinner: isDark ? 'border-brand-500' : 'border-brand-700',
    progressBg: 'bg-theme-tertiary',
    completedStep: 'bg-theme-success',
    pendingStep: isDark ? 'bg-[#636983]' : 'bg-[#ced4da]',
    overlay: 'bg-black/60 backdrop-blur-sm',

    // === 原始值 ===
    isDark,
    theme,
  };

  return styles;
}
