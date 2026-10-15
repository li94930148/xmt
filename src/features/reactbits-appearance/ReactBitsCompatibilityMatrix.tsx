import type { ReactBitsAppearanceConfig } from './types';
import { ReactBitsAppearancePreviewProvider } from './ReactBitsAppearancePreviewContext';
import { ReactBitsButtonSlot, type ReactBitsButtonVariant } from './ReactBitsButtonSlot';
import { ReactBitsTextSlot } from './ReactBitsTextSlot';

const surfaces = ['standard', 'specular-button', 'border-glow', 'star-border', 'electric-border'] as const;
const interactions = ['none', 'magnet', 'click-spark', 'glare-hover'] as const;
const variants: ReactBitsButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger', 'icon', 'ai'];

/** Development-only visual matrix; intentionally not mounted in production navigation. */
export function ReactBitsCompatibilityMatrix({ config }: { config: ReactBitsAppearanceConfig }) {
  return <section className="space-y-5 rounded-2xl border border-dashed border-studio-border-active p-4" data-testid="reactbits-compatibility-matrix">
    <div><h4 className="font-semibold text-studio-text-primary">开发验收矩阵</h4><p className="text-xs text-studio-text-muted">仅开发环境显示：按钮表面、交互、变体和文本动画的双主题检查。</p></div>
    {(['dark', 'light'] as const).map((theme) => <div key={theme} data-theme={theme} className="xmt-theme-scope space-y-3 rounded-xl bg-studio-app-bg p-4 text-studio-text-primary"><p className="font-medium">{theme === 'light' ? '浅色模式' : '深色模式'}</p><div className="grid gap-3 lg:grid-cols-2">{surfaces.flatMap((surface) => interactions.map((interaction) => {
      const matrixConfig = { ...config, motionMode: 'balanced' as const, buttonSurface: { component: surface }, buttonInteraction: { component: interaction } };
      return <ReactBitsAppearancePreviewProvider key={`${theme}-${surface}-${interaction}`} config={matrixConfig}><div className="min-w-0 rounded-lg border border-studio-border-soft p-3"><p className="mb-2 text-xs text-studio-text-secondary">{surface} · {interaction}</p><div className="flex flex-wrap items-center gap-2">{variants.map((variant) => <ReactBitsButtonSlot key={variant} variant={variant} disabled={variant === 'icon'} aria-label={`${surface}-${interaction}-${variant}`}>{variant === 'icon' ? '⌘' : variant}</ReactBitsButtonSlot>)}</div></div></ReactBitsAppearancePreviewProvider>;
    }))}</div><div className="mt-4 space-y-2"><ReactBitsAppearancePreviewProvider config={config}><ReactBitsTextSlot semantic="brand-title">文本动画兼容标题</ReactBitsTextSlot><ReactBitsTextSlot semantic="metric" value={128}>128</ReactBitsTextSlot></ReactBitsAppearancePreviewProvider></div></div>)}
  </section>;
}
