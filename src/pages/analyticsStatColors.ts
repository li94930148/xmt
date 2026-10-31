export type AnalyticsStatTone = 'success' | 'primary' | 'coral' | 'violet';

export const analyticsStatToneStyles: Record<AnalyticsStatTone, { text: string; icon: string; iconBackground: string }> = {
  success: { text: 'var(--xmt-success-contrast)', icon: 'var(--xmt-success-contrast)', iconBackground: 'var(--xmt-success-soft)' },
  primary: { text: 'var(--xmt-primary-contrast)', icon: 'var(--xmt-primary-contrast)', iconBackground: 'var(--xmt-primary-soft)' },
  coral: { text: 'var(--xmt-coral-contrast)', icon: 'var(--xmt-coral-contrast)', iconBackground: 'var(--xmt-coral-soft)' },
  violet: { text: 'var(--xmt-violet-contrast)', icon: 'var(--xmt-violet-contrast)', iconBackground: 'var(--xmt-violet-soft)' },
};
