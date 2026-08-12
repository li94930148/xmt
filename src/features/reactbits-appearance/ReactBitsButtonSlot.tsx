import { lazy, Suspense, useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';
import { useAppStore } from '@/store';
import { useEffectiveReactBitsAppearanceConfig } from './ReactBitsAppearancePreviewContext';

const SpecularButton = lazy(() => import('@/components/reactbits/components/SpecularButton/SpecularButton'));
const BorderGlow = lazy(() => import('@/components/reactbits/components/BorderGlow/BorderGlow'));
const ElectricBorder = lazy(() => import('@/components/reactbits/animations/ElectricBorder/ElectricBorder'));
const StarBorder = lazy(() => import('@/components/reactbits/animations/StarBorder/StarBorder'));
const Magnet = lazy(() => import('@/components/reactbits/animations/Magnet/Magnet'));
const ClickSpark = lazy(() => import('@/components/reactbits/animations/ClickSpark/ClickSpark'));
const GlareHover = lazy(() => import('@/components/reactbits/animations/GlareHover/GlareHover'));

export type ReactBitsButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon' | 'ai';
type SlotProps = ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; variant?: ReactBitsButtonVariant; themeOverride?: 'light' | 'dark' };

function SpecularButtonAdapter({ children, buttonProps, className, light, variant }: { children: ReactNode; buttonProps: ButtonHTMLAttributes<HTMLButtonElement>; className: string; light: boolean; variant: ReactBitsButtonVariant }) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const isBrandSurface = variant === 'primary' || variant === 'ai';
  useEffect(() => {
    const button = wrapperRef.current?.querySelector('button');
    if (!button) return;
    const attributes = ['title', 'aria-label', 'aria-describedby', 'name', 'value', 'form'] as const;
    attributes.forEach((name) => {
      const value = buttonProps[name];
      if (value == null) button.removeAttribute(name);
      else button.setAttribute(name, String(value));
    });
    button.dataset.reactbitsButton = variant;
  }, [buttonProps]);
  return <span ref={wrapperRef} className="inline-flex w-fit max-w-full align-middle"><SpecularButton {...({
    type: buttonProps.type || 'button', disabled: buttonProps.disabled, onClick: buttonProps.onClick, className,
    textColor: isBrandSurface ? '#FFFFFF' : '#0F172A',
    tint: isBrandSurface ? (light ? '#2563EB' : '#0F172A') : '#FFFFFF', tintOpacity: light ? 0.9 : 0.58,
    baseColor: isBrandSurface ? (light ? '#1D4ED8' : '#334155') : '#94A3B8',
    lineColor: light ? '#2563EB' : '#67E8F9', radius: 14, size: 'sm'
  } as any)}>{children}</SpecularButton></span>;
}

export function ReactBitsButtonSlot({ children, variant = 'secondary', className, themeOverride, ...props }: SlotProps) {
  const config = useEffectiveReactBitsAppearanceConfig();
  const appTheme = useAppStore((state) => state.theme);
  const theme = themeOverride ?? appTheme;
  const light = theme === 'light';
  const heavyAllowed = config.motionMode !== 'off' && variant !== 'danger';
  const surface = variant === 'primary' || variant === 'ai' ? config.buttonSurface.component : 'standard';
  const interaction = heavyAllowed ? config.buttonInteraction.component : 'none';
  const common = 'inline-flex min-h-10 w-fit max-w-full shrink-0 items-center justify-center gap-2 rounded-button border px-4 py-2.5 text-sm font-semibold leading-[1.25] align-middle transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-studio-primary disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50';
  const variantClasses: Record<ReactBitsButtonVariant, string> = {
    primary: light ? 'border-blue-700 bg-blue-600 text-white shadow-sm shadow-blue-600/25 hover:bg-blue-700' : 'border-blue-400/45 bg-blue-600 text-white shadow-sm shadow-blue-500/20 hover:bg-blue-500',
    ai: light ? 'border-violet-700 bg-violet-600 text-white shadow-sm shadow-violet-500/25 hover:bg-violet-700' : 'border-violet-300/35 bg-violet-600 text-white shadow-sm shadow-violet-400/15 hover:bg-violet-500',
    secondary: light ? 'border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50' : 'border-slate-500/45 bg-slate-900/70 text-slate-100 hover:bg-slate-800',
    ghost: light ? 'border-transparent bg-transparent text-slate-700 hover:bg-slate-200/70' : 'border-transparent bg-transparent text-slate-100 hover:bg-white/10',
    danger: light ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100' : 'border-red-400/40 bg-red-500/15 text-red-100 hover:bg-red-500/25',
    icon: light ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50' : 'border-slate-500/45 bg-slate-900/70 text-slate-100 hover:bg-slate-800',
  };
  const base = twMerge(common, variantClasses[variant], className);
  let button: ReactNode = <button {...props} type={props.type || 'button'} className={base} data-reactbits-button={variant}>{children}</button>;

  if (heavyAllowed && surface === 'specular-button') button = <Suspense fallback={button}><SpecularButtonAdapter buttonProps={props} className={base} light={light} variant={variant}>{children}</SpecularButtonAdapter></Suspense>;
  if (heavyAllowed && surface === 'border-glow') button = <Suspense fallback={button}><BorderGlow className="inline-flex w-fit max-w-full rounded-button" backgroundColor={light ? '#FFFFFF' : '#0F172A'} glowColor={light ? '215 90 48' : '190 90 60'} borderRadius={14}>{button}</BorderGlow></Suspense>;
  if (heavyAllowed && surface === 'electric-border') button = <Suspense fallback={button}><ElectricBorder className="inline-flex w-fit max-w-full overflow-visible" color={light ? '#2563EB' : '#67E8F9'} borderRadius={14}>{button}</ElectricBorder></Suspense>;
  if (heavyAllowed && surface === 'star-border') button = <Suspense fallback={button}><StarBorder as="button" {...({ type: props.type || 'button', disabled: props.disabled, onClick: props.onClick, title: props.title, 'aria-label': props['aria-label'], 'aria-describedby': props['aria-describedby'], name: props.name, value: props.value, form: props.form, 'data-reactbits-button': variant, className: 'inline-flex w-fit max-w-full align-middle', color: light ? '#2563EB' : '#67E8F9', speed: '4s' } as any)}>{children}</StarBorder></Suspense>;
  if (interaction === 'magnet') button = <Suspense fallback={button}><Magnet padding={20} magnetStrength={3} disabled={props.disabled} wrapperClassName="inline-flex w-fit max-w-full align-middle" innerClassName="inline-flex w-fit max-w-full">{button}</Magnet></Suspense>;
  if (interaction === 'click-spark') button = <span className="relative inline-flex w-fit max-w-full align-middle"><Suspense fallback={button}><ClickSpark sparkColor={light ? '#1D4ED8' : '#DBEAFE'} sparkSize={8} sparkRadius={18} sparkCount={8} duration={400}>{button}</ClickSpark></Suspense></span>;
  if (interaction === 'glare-hover') button = <span className="inline-flex w-fit max-w-full align-middle"><Suspense fallback={button}><GlareHover width="fit-content" height="auto" background="transparent" borderColor="transparent" borderRadius="inherit" glareColor={light ? '#2563EB' : '#A5B4FC'} glareOpacity={0.38} className="inline-flex w-fit max-w-full align-middle">{button}</GlareHover></Suspense></span>;
  return <>{button}</>;
}
