import { lazy, Suspense, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';
import { useAppStore } from '@/store';
import { useEffectiveReactBitsAppearanceConfig } from './ReactBitsAppearancePreviewContext';

const BorderGlow = lazy(() => import('@/components/reactbits/components/BorderGlow/BorderGlow'));
const ElectricBorder = lazy(() => import('@/components/reactbits/animations/ElectricBorder/ElectricBorder'));
const StarBorder = lazy(() => import('@/components/reactbits/animations/StarBorder/StarBorder'));
const Magnet = lazy(() => import('@/components/reactbits/animations/Magnet/Magnet'));
const ClickSpark = lazy(() => import('@/components/reactbits/animations/ClickSpark/ClickSpark'));
const GlareHover = lazy(() => import('@/components/reactbits/animations/GlareHover/GlareHover'));

export type ReactBitsButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon' | 'ai';
type SlotProps = ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; variant?: ReactBitsButtonVariant; themeOverride?: 'light' | 'dark' };

export function ReactBitsButtonSlot({ children, variant = 'secondary', className, themeOverride, ...props }: SlotProps) {
  const config = useEffectiveReactBitsAppearanceConfig();
  const appTheme = useAppStore((state) => state.theme);
  const theme = themeOverride ?? appTheme;
  const light = theme === 'light';
  const heavyAllowed = config.motionMode !== 'off' && variant !== 'danger';
  const surface = variant === 'primary' || variant === 'ai' ? config.buttonSurface.component : 'standard';
  const interaction = heavyAllowed ? config.buttonInteraction.component : 'none';
  const common = twMerge(
    'xmt-btn inline-flex min-h-10 w-fit max-w-full shrink-0 appearance-none items-center justify-center gap-2 rounded-button border px-4 py-2.5 text-sm font-semibold leading-[1.25] align-middle',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-studio-primary',
    'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
  );
  const variantClasses: Record<ReactBitsButtonVariant, string> = {
    primary: 'xmt-btn-primary border-transparent text-white',
    ai: light
      ? 'border-violet-300/50 bg-violet-600 text-white shadow-[0_8px_20px_rgba(124,58,237,0.22)] hover:bg-violet-700'
      : 'border-violet-300/35 bg-violet-500/90 text-white shadow-[0_8px_20px_rgba(167,139,250,0.22)] hover:bg-violet-400/95',
    secondary: 'xmt-btn-secondary',
    ghost: 'xmt-btn-ghost',
    danger: 'xmt-btn-danger',
    icon: 'xmt-btn-secondary px-3',
  };
  const specularClasses =
    heavyAllowed && surface === 'specular-button'
      ? "relative overflow-hidden ring-1 ring-inset ring-white/20 before:pointer-events-none before:absolute before:inset-x-[12%] before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/80 before:to-transparent before:content-['']"
      : '';
  const base = twMerge(common, variantClasses[variant], specularClasses, className);
  let button: ReactNode = (
    <button {...props} type={props.type || 'button'} className={base} data-reactbits-button={variant}>
      {children}
    </button>
  );

  if (heavyAllowed && surface === 'border-glow') {
    button = (
      <Suspense fallback={button}>
        <BorderGlow
          buttonSurface
          className="inline-flex w-fit max-w-full rounded-button"
          backgroundColor={light ? '#FFFFFF' : '#121826'}
          glowColor={light ? '107 140 255' : '107 140 255'}
          borderRadius={12}
        >
          {button}
        </BorderGlow>
      </Suspense>
    );
  }
  if (heavyAllowed && surface === 'electric-border') {
    button = (
      <Suspense fallback={button}>
        <ElectricBorder
          className="inline-flex w-fit max-w-full overflow-visible"
          color={light ? '#3D5AFE' : '#5CE1E6'}
          borderRadius={12}
        >
          {button}
        </ElectricBorder>
      </Suspense>
    );
  }
  if (heavyAllowed && surface === 'star-border') {
    button = (
      <Suspense fallback={button}>
        <StarBorder
          as="button"
          type={props.type || 'button'}
          disabled={props.disabled}
          onClick={props.onClick}
          title={props.title}
          aria-label={props['aria-label']}
          aria-describedby={props['aria-describedby']}
          name={props.name}
          value={props.value}
          form={props.form}
          data-reactbits-button={variant}
          className={base}
          color={light ? '#93C5FD' : '#A5B4FC'}
          speed="4s"
        >
          {children}
        </StarBorder>
      </Suspense>
    );
  }
  if (interaction === 'magnet') {
    button = (
      <Suspense fallback={button}>
        <Magnet padding={20} magnetStrength={3} disabled={props.disabled} wrapperClassName="inline-flex w-fit max-w-full align-middle" innerClassName="inline-flex w-fit max-w-full">
          {button}
        </Magnet>
      </Suspense>
    );
  }
  if (interaction === 'click-spark') {
    button = (
      <span className="relative inline-flex w-fit max-w-full align-middle">
        <Suspense fallback={button}>
          <ClickSpark sparkColor={light ? '#1E3A8A' : '#C9D6FF'} sparkSize={8} sparkRadius={18} sparkCount={8} duration={400}>
            {button}
          </ClickSpark>
        </Suspense>
      </span>
    );
  }
  if (interaction === 'glare-hover') {
    button = (
      <span className="inline-flex w-fit max-w-full align-middle">
        <Suspense fallback={button}>
          <GlareHover
            width="fit-content"
            height="auto"
            background="transparent"
            borderColor="transparent"
            borderRadius="inherit"
            glareColor={light ? '#3D5AFE' : '#A5B4FC'}
            glareOpacity={0.32}
            className="inline-flex w-fit max-w-full align-middle"
          >
            {button}
          </GlareHover>
        </Suspense>
      </span>
    );
  }
  return <>{button}</>;
}
