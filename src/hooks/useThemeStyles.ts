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
    textPlaceholder: 'placeholder-studio-text-muted',

    // === 交互 ===
    hoverBg: 'hover:bg-studio-surface-soft',
    hoverBgLight: 'hover:bg-studio-surface-elevated',
    focusRing: 'focus:outline-none focus:ring-2 focus:ring-studio-primary/35 focus:border-studio-border-active',

    // === 表格 ===
    tableHeader: 'bg-theme-tertiary',
    tableRow: 'border-theme-border',
    tableHover: 'hover:bg-studio-surface-soft/55',

    // === 按钮 ===
    buttonPrimary: 'xmt-btn xmt-btn-primary min-h-9 px-4 py-2 text-sm text-white',
    buttonSecondary: 'bg-theme-tertiary hover:bg-theme-elevated text-theme-text border border-theme-border',
    buttonDanger: 'xmt-btn xmt-btn-danger min-h-9 px-4 py-2 text-sm',
    buttonInfo: 'text-studio-primary hover:bg-studio-primary/10',
    buttonSuccess: 'text-studio-success-contrast hover:bg-studio-success/12',

    // === 组合样式 ===
    card: 'xmt-card rounded-card bg-studio-surface-glass',
    modal: 'rounded-panel border border-studio-border-soft bg-studio-surface shadow-floating',
    input: 'xmt-field',
    pageTitle: 'text-2xl font-bold text-theme-text',
    subtitle: 'text-sm text-theme-text-secondary',
    divider: 'border-theme-border',
    badge: 'px-2.5 py-0.5 rounded-full text-xs font-medium border',

    // === 杂项 ===
    spinner: 'border-studio-primary',
    progressBg: 'bg-theme-tertiary',
    completedStep: 'bg-theme-success',
    pendingStep: 'bg-studio-text-muted',
    overlay: 'bg-black/60 backdrop-blur-sm',

    // === 原始值 ===
    isDark,
    theme,
  };

  return styles;
}
