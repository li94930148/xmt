export const XMTTheme = {
  colors: {
    primary: 'var(--xmt-primary)',
    secondary: 'var(--xmt-cyan)',
    background: 'var(--xmt-app-bg)',
    surface: 'var(--xmt-surface)',
    danger: 'var(--xmt-danger)',
    warning: 'var(--xmt-warning)',
    success: 'var(--xmt-success)',
  },
  typography: {
    heading: 'var(--xmt-font-heading)',
    body: 'var(--xmt-font-body)',
    data: 'var(--xmt-font-data)',
  },
  radius: { small: 'var(--xmt-radius-button)', medium: 'var(--xmt-radius-card)' },
  shadow: { card: 'var(--xmt-card-shadow)', floating: 'var(--xmt-floating-shadow)', modal: 'var(--xmt-modal-shadow)' },
  motion: { fast: '140ms', normal: '220ms', slow: '300ms' },
} as const;

export type XMTThemeToken = typeof XMTTheme;
