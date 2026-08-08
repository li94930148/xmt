import { lazy, Suspense, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useEffectiveReactBitsAppearanceConfig } from './ReactBitsAppearancePreviewContext';
import { twMerge } from 'tailwind-merge';
const SpecularButton = lazy(() => import('@/components/reactbits/components/SpecularButton/SpecularButton'));
const StarBorder = lazy(() => import('@/components/reactbits/animations/StarBorder/StarBorder'));
const Magnet = lazy(() => import('@/components/reactbits/animations/Magnet/Magnet'));
const ClickSpark = lazy(() => import('@/components/reactbits/animations/ClickSpark/ClickSpark'));
const GlareHover = lazy(() => import('@/components/reactbits/animations/GlareHover/GlareHover'));

export type ReactBitsButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon' | 'ai';
export function ReactBitsButtonSlot({ children, variant = 'secondary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; variant?: ReactBitsButtonVariant }) {
  const config = useEffectiveReactBitsAppearanceConfig();
  const heavyAllowed = config.motionMode !== 'off' && variant !== 'danger';
  const surface = variant === 'primary' || variant === 'ai' ? config.buttonSurface.component : 'standard';
  const interaction = heavyAllowed ? config.buttonInteraction.component : 'none';
  const base = twMerge('inline-flex min-h-10 items-center justify-center gap-2 rounded-button border px-4 py-2.5 text-sm font-semibold leading-snug disabled:pointer-events-none disabled:opacity-50', variant === 'danger' ? 'border-red-400/40 bg-red-500/15 text-red-100' : variant === 'ghost' ? 'border-transparent bg-transparent text-studio-text-secondary' : 'border-studio-primary/40 bg-studio-primary text-white', className);
  let button: ReactNode = <button className={base} {...props}>{children}</button>;
  if (heavyAllowed && surface === 'specular-button') button = <Suspense fallback={button}><SpecularButton {...({ className, onClick: props.onClick, disabled: props.disabled, size: 'md' } as any)}>{children}</SpecularButton></Suspense>;
  if (heavyAllowed && surface === 'star-border') button = <Suspense fallback={button}><StarBorder {...({ as: 'button', className: base, onClick: props.onClick, disabled: props.disabled, color: '#8b5cf6', speed: '4s' } as any)}>{children}</StarBorder></Suspense>;
  if (interaction === 'magnet') button = <Suspense fallback={button}><Magnet {...({ padding: 20, magnetStrength: 3, disabled: props.disabled } as any)}>{button}</Magnet></Suspense>;
  if (interaction === 'click-spark') button = <Suspense fallback={button}><ClickSpark {...({ sparkColor: '#dbeafe', sparkSize: 8, sparkRadius: 18, sparkCount: 8, duration: 400 } as any)}>{button}</ClickSpark></Suspense>;
  if (interaction === 'glare-hover') button = <Suspense fallback={button}><GlareHover {...({ glareColor: '#a5b4fc', glareOpacity: 0.45 } as any)}>{button}</GlareHover></Suspense>;
  return <>{button}</>;
}
