import { ChangeEvent, useState } from 'react';
import { Download, RotateCcw, Save, Upload } from 'lucide-react';
import { reactBitsPresets } from './presets';
import { useReactBitsAppearanceStore } from '@/store/reactBitsAppearanceStore';
import { ReactBitsBackgroundSlot } from './ReactBitsBackgroundSlot';
import { ReactBitsTextSlot } from './ReactBitsTextSlot';
import { ReactBitsButtonSlot } from './ReactBitsButtonSlot';
import { ReactBitsRevealSlot } from './ReactBitsRevealSlot';
import { ReactBitsCardSlot } from './ReactBitsCardSlot';
import { ReactBitsAppearancePreviewProvider } from './ReactBitsAppearancePreviewContext';
import { ReactBitsCompatibilityMatrix } from './ReactBitsCompatibilityMatrix';

const fields = [
  ['background.component', '背景动画', [['none', '无动画背景'], ['aurora', 'Aurora'], ['dark-veil', 'Dark Veil'], ['silk', 'Silk'], ['threads', 'Threads'], ['dot-grid', 'Dot Grid'], ['light-rays', 'Light Rays'], ['orb', 'Orb'], ['grid-motion', 'Grid Motion'], ['waves', 'Waves'], ['particles', 'Particles']]],
  ['headingText.component', '标题文本动画', [['none', '无'], ['split-text', 'Split Text'], ['blur-text', 'Blur Text'], ['gradient-text', 'Gradient Text'], ['shiny-text', 'Shiny Text'], ['rotating-text', 'Rotating Text'], ['decrypted-text', 'Decrypted Text'], ['text-type', 'Text Type'], ['true-focus', 'True Focus'], ['scroll-reveal', 'Scroll Reveal']]],
  ['buttonSurface.component', '主按钮外观', [['standard', '标准'], ['specular-button', 'Specular Button'], ['border-glow', 'Border Glow'], ['star-border', 'Star Border'], ['electric-border', 'Electric Border']]],
  ['buttonInteraction.component', '按钮交互', [['none', '无'], ['magnet', 'Magnet'], ['click-spark', 'Click Spark'], ['glare-hover', 'Glare Hover']]],
  ['card.component', '卡片风格', [['standard', '标准'], ['magic-bento', 'Magic Bento'], ['spotlight-card', 'Spotlight Card'], ['profile-card', 'Profile Card'], ['glass-surface', 'Glass Surface'], ['reflective-card', 'Reflective Card']]],
  ['reveal.component', '内容进入动画', [['none', '无'], ['animated-content', 'Animated Content'], ['fade-content', 'Fade Content'], ['gradual-blur', 'Gradual Blur'], ['pixel-transition', 'Pixel Transition']]],
  ['navigation.component', '导航风格', [['standard', '标准'], ['dock', 'Dock'], ['pill-nav', 'Pill Nav']]],
  ['motionMode', '动效强度', [['off', '关闭'], ['reduced', '低'], ['balanced', '平衡'], ['full', '完整']]],
] as const;

function PreviewSurface({ theme }: { theme: 'light' | 'dark' }) {
  const light = theme === 'light';
  return <div className={`relative isolate min-h-[330px] overflow-hidden rounded-2xl border p-5 ${light ? 'border-slate-300 bg-slate-50 text-slate-900' : 'border-slate-700 bg-slate-950 text-white'}`}>
    <ReactBitsBackgroundSlot page="home" fallbackClassName={light ? 'bg-gradient-to-br from-sky-50 via-white to-indigo-100' : 'bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900'} />
    <div className="relative z-10"><p className={`text-xs font-semibold tracking-wider ${light ? 'text-blue-700' : 'text-cyan-200'}`}>{light ? '浅色真实预览' : '深色真实预览'}</p>
      <div className="mt-2 font-black"><ReactBitsTextSlot semantic="brand-title" themeOverride={theme}>XMT 内容生产驾驶舱</ReactBitsTextSlot></div>
      <ReactBitsRevealSlot className="mt-5"><ReactBitsCardSlot className={`max-w-md rounded-xl border p-4 backdrop-blur ${light ? 'border-slate-300 bg-white/85 text-slate-900' : 'border-white/15 bg-slate-950/55 text-white'}`}><p className={light ? 'text-slate-600' : 'text-slate-300'}>今日内容生产指数</p><p className="mt-2 text-4xl font-bold"><ReactBitsTextSlot semantic="metric" themeOverride={theme} value={86}>86</ReactBitsTextSlot><span>%</span></p><p className={`mt-2 text-xs ${light ? 'text-slate-600' : 'text-slate-400'}`}>同一草稿配置的主题兼容预览。</p></ReactBitsCardSlot></ReactBitsRevealSlot>
      <div className="mt-5 flex flex-wrap items-center gap-2"><ReactBitsButtonSlot themeOverride={theme} variant="primary">主要操作</ReactBitsButtonSlot><ReactBitsButtonSlot themeOverride={theme} variant="secondary">次要操作</ReactBitsButtonSlot><ReactBitsButtonSlot themeOverride={theme} variant="ghost">幽灵操作</ReactBitsButtonSlot><ReactBitsButtonSlot themeOverride={theme} variant="icon" aria-label="预览图标">⌘</ReactBitsButtonSlot></div>
    </div>
  </div>;
}

export function ReactBitsAppearancePanel() {
  const draft = useReactBitsAppearanceStore((state) => state.draftConfig);
  const setDraftField = useReactBitsAppearanceStore((state) => state.setDraftField);
  const applyPreset = useReactBitsAppearanceStore((state) => state.applyPreset);
  const save = useReactBitsAppearanceStore((state) => state.save);
  const reset = useReactBitsAppearanceStore((state) => state.reset);
  const exportConfig = useReactBitsAppearanceStore((state) => state.exportConfig);
  const importConfig = useReactBitsAppearanceStore((state) => state.importConfig);
  const [importMessage, setImportMessage] = useState('');
  const valueAt = (path: string) => path.split('.').reduce<any>((item, key) => item[key], draft);
  const onImport = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setImportMessage(importConfig(String(reader.result || '')) ? '配置已载入预览，请点击保存后应用。' : '配置格式无效，未导入。'); reader.readAsText(file); };
  const onExport = () => { const blob = new Blob([exportConfig()], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'xmt-reactbits-appearance.json'; link.click(); URL.revokeObjectURL(link.href); };
  return <section className="mt-8 space-y-5 border-t border-studio-border-soft pt-6">
    <div><h3 className="text-base font-semibold text-studio-text-primary">React Bits 原生动效外观中心</h3><p className="mt-1 text-sm text-studio-text-muted">只使用 React Bits 官方组件；修改先在下方实时预览，保存后才应用到系统。</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{reactBitsPresets.map((preset) => <button key={preset.id} type="button" onClick={() => applyPreset(preset.id)} className={`rounded-xl border p-4 text-left ${draft.presetId === preset.id ? 'border-studio-cyan bg-studio-cyan/10' : 'border-studio-border-soft bg-white/[0.03]'}`}><p className="font-semibold text-studio-text-primary">{preset.label}</p><p className="mt-1 text-xs text-studio-text-muted">{preset.description}</p></button>)}</div>
    <div className="grid gap-4 md:grid-cols-2">{fields.map(([path, label, options]) => <label key={path} className="text-sm text-studio-text-secondary"><span className="mb-2 block font-medium">{label}</span><select value={valueAt(path)} onChange={(event) => setDraftField(path, event.target.value)} className="w-full rounded-xl border border-studio-border-soft bg-studio-app-bg px-3 py-2.5 text-studio-text-primary">{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>)}</div>
    <div><p className="mb-2 text-sm font-medium text-studio-text-secondary">页面应用范围</p><div className="flex flex-wrap gap-3">{Object.entries(draft.applyTo).map(([page, enabled]) => <label key={page} className="inline-flex items-center gap-2 rounded-lg border border-studio-border-soft px-3 py-2 text-xs text-studio-text-secondary"><input type="checkbox" checked={enabled} onChange={(event) => setDraftField(`applyTo.${page}`, event.target.checked)} />{page}</label>)}</div></div>
    <ReactBitsAppearancePreviewProvider config={draft}><div className="grid gap-4 xl:grid-cols-2"><PreviewSurface theme="dark" /><PreviewSurface theme="light" /></div></ReactBitsAppearancePreviewProvider>
    {import.meta.env.DEV && <ReactBitsCompatibilityMatrix config={draft} />}
    <div className="flex flex-wrap gap-3"><button type="button" onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-studio-primary px-4 py-2.5 text-sm font-semibold text-white"><Save className="h-4 w-4" />保存外观与动效</button><button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-xl border border-studio-border-soft px-4 py-2.5 text-sm text-studio-text-secondary"><RotateCcw className="h-4 w-4" />恢复默认</button><button type="button" onClick={onExport} className="inline-flex items-center gap-2 rounded-xl border border-studio-border-soft px-4 py-2.5 text-sm text-studio-text-secondary"><Download className="h-4 w-4" />导出配置</button><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-studio-border-soft px-4 py-2.5 text-sm text-studio-text-secondary"><Upload className="h-4 w-4" />导入配置<input className="hidden" type="file" accept="application/json" onChange={onImport} /></label></div>{importMessage && <p className="text-xs text-studio-text-muted">{importMessage}</p>}
  </section>;
}
