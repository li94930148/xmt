import type { ReactBitsAppearanceConfig } from './types';
import { defaultReactBitsAppearanceConfig } from './types';

type PresetPatch = Partial<Omit<ReactBitsAppearanceConfig, 'applyTo'>> & { applyTo?: Partial<ReactBitsAppearanceConfig['applyTo']> };
const preset = (id: string, label: string, description: string, config: PresetPatch) => ({ id, label, description, config: { ...defaultReactBitsAppearanceConfig, ...config, presetId: id, applyTo: { ...defaultReactBitsAppearanceConfig.applyTo, ...config.applyTo } } as ReactBitsAppearanceConfig });

export const reactBitsPresets = [
  preset('aurora', '岚曜极光', '极光背景与内容生产驾驶舱。', defaultReactBitsAppearanceConfig),
  preset('deep-space', '深空科技', '深色数据总览与聚焦卡片。', { background: { component: 'dark-veil', intensity: 'medium' }, headingText: { component: 'decrypted-text' }, buttonSurface: { component: 'border-glow' }, buttonInteraction: { component: 'glare-hover' }, card: { component: 'spotlight-card' }, reveal: { component: 'fade-content' }, applyTo: { home: true, analytics: true } }),
  preset('silk', '丝绸创意', '创作工作台的丝绸流光。', { background: { component: 'silk', intensity: 'low' }, headingText: { component: 'blur-text' }, buttonSurface: { component: 'star-border' }, buttonInteraction: { component: 'magnet' }, card: { component: 'glass-surface' }, applyTo: { creator: true } }),
  preset('linear', '线性协作', '低干扰协作与流程页面。', { background: { component: 'threads', intensity: 'low' }, headingText: { component: 'text-type' }, buttonSurface: { component: 'border-glow' }, card: { component: 'spotlight-card' }, reveal: { component: 'fade-content' }, navigation: { component: 'pill-nav' }, applyTo: { topics: true, dailyReport: true, workflow: true } }),
  preset('minimal', '极简无扰', '长时间办公与低性能设备。', { background: { component: 'none', intensity: 'low' }, headingText: { component: 'blur-text' }, buttonSurface: { component: 'standard' }, buttonInteraction: { component: 'none' }, card: { component: 'glass-surface' }, reveal: { component: 'fade-content' }, motionMode: 'reduced', applyTo: { login: false, home: false, editor: true } }),
  preset('custom', '自由搭配', '分别选择各个官方组件槽位。', { presetId: 'custom' }),
];
