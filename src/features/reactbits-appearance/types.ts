export const REACT_BITS_APPEARANCE_KEY = 'xmt_reactbits_appearance_v1';

export type ReactBitsAppearanceConfig = {
  presetId: string;
  background: { component: 'none' | 'aurora' | 'dark-veil' | 'silk' | 'threads' | 'dot-grid' | 'light-rays' | 'orb' | 'grid-motion' | 'waves' | 'particles'; intensity: 'low' | 'medium' | 'high' };
  headingText: { component: 'none' | 'split-text' | 'blur-text' | 'gradient-text' | 'shiny-text' | 'rotating-text' | 'decrypted-text' | 'text-type' | 'true-focus' | 'scroll-reveal' };
  numberText: { component: 'none' | 'count-up' };
  buttonSurface: { component: 'standard' | 'specular-button' | 'border-glow' | 'star-border' | 'electric-border' };
  buttonInteraction: { component: 'none' | 'magnet' | 'click-spark' | 'glare-hover' };
  card: { component: 'standard' | 'magic-bento' | 'spotlight-card' | 'profile-card' | 'glass-surface' | 'reflective-card' };
  reveal: { component: 'none' | 'animated-content' | 'fade-content' | 'gradual-blur' | 'pixel-transition' };
  navigation: { component: 'standard' | 'dock' | 'pill-nav' };
  motionMode: 'off' | 'reduced' | 'balanced' | 'full';
  applyTo: { login: boolean; home: boolean; topics: boolean; creator: boolean; analytics: boolean; dailyReport: boolean; workflow: boolean; editor: boolean };
};

export type AppearancePage = keyof ReactBitsAppearanceConfig['applyTo'];

export const defaultReactBitsAppearanceConfig: ReactBitsAppearanceConfig = {
  presetId: 'aurora',
  background: { component: 'aurora', intensity: 'medium' },
  headingText: { component: 'split-text' },
  numberText: { component: 'count-up' },
  buttonSurface: { component: 'specular-button' },
  buttonInteraction: { component: 'magnet' },
  card: { component: 'magic-bento' },
  reveal: { component: 'animated-content' },
  navigation: { component: 'standard' },
  motionMode: 'balanced',
  applyTo: { login: true, home: true, topics: false, creator: false, analytics: false, dailyReport: false, workflow: false, editor: false },
};

const allowed = {
  background: ['none', 'aurora', 'dark-veil', 'silk', 'threads', 'dot-grid', 'light-rays', 'orb', 'grid-motion', 'waves', 'particles'],
  headingText: ['none', 'split-text', 'blur-text', 'gradient-text', 'shiny-text', 'rotating-text', 'decrypted-text', 'text-type', 'true-focus', 'scroll-reveal'],
  numberText: ['none', 'count-up'],
  buttonSurface: ['standard', 'specular-button', 'border-glow', 'star-border', 'electric-border'],
  buttonInteraction: ['none', 'magnet', 'click-spark', 'glare-hover'],
  card: ['standard', 'magic-bento', 'spotlight-card', 'profile-card', 'glass-surface', 'reflective-card'],
  reveal: ['none', 'animated-content', 'fade-content', 'gradual-blur', 'pixel-transition'],
  navigation: ['standard', 'dock', 'pill-nav'],
  motionMode: ['off', 'reduced', 'balanced', 'full'],
} as const;

export function parseReactBitsAppearanceConfig(value: unknown): ReactBitsAppearanceConfig | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<ReactBitsAppearanceConfig>;
  const has = <T extends readonly string[]>(list: T, item: unknown): item is T[number] => typeof item === 'string' && list.includes(item as T[number]);
  if (!input.background || !input.headingText || !input.numberText || !input.buttonSurface || !input.buttonInteraction || !input.card || !input.reveal || !input.navigation || !input.applyTo) return null;
  if (!has(allowed.background, input.background.component) || !has(['low', 'medium', 'high'] as const, input.background.intensity) || !has(allowed.headingText, input.headingText.component) || !has(allowed.numberText, input.numberText.component) || !has(allowed.buttonSurface, input.buttonSurface.component) || !has(allowed.buttonInteraction, input.buttonInteraction.component) || !has(allowed.card, input.card.component) || !has(allowed.reveal, input.reveal.component) || !has(allowed.navigation, input.navigation.component) || !has(allowed.motionMode, input.motionMode)) return null;
  const pages = input.applyTo;
  if (!['login', 'home', 'topics', 'creator', 'analytics', 'dailyReport', 'workflow', 'editor'].every((key) => typeof pages[key as AppearancePage] === 'boolean')) return null;
  return input as ReactBitsAppearanceConfig;
}
