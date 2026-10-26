import { lazy, Suspense, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';
import { useEffectiveReactBitsAppearanceConfig } from './ReactBitsAppearancePreviewContext';

const BorderGlow = lazy(() => import('@/components/reactbits/components/BorderGlow/BorderGlow'));
const ElectricBorder = lazy(() => import('@/components/reactbits/animations/ElectricBorder/ElectricBorder'));
const StarBorder = lazy(() => import('@/components/reactbits/animations/StarBorder/StarBorder'));
const Magnet = lazy(() => import('@/components/reactbits/animations/Magnet/Magnet'));
const ClickSpark = lazy(() => import('@/components/reactbits/animations/ClickSpark/ClickSpark'));
const GlareHover = lazy(() => import('@/components/reactbits/animations/GlareHover/GlareHover'));

export type ReactBitsButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon' | 'ai';
type SlotProps = ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; variant?: ReactBitsButtonVariant };

export function ReactBitsButtonSlot({ children, variant = 'secondary', className, ...props }: SlotProps) {
  const config = useEffectiveReactBitsAppearanceConfig();
  const heavyAllowed = config.motionMode !== 'off' && variant !== 'danger';
  const surface = variant === 'primary' || variant === 'ai' ? config.buttonSurface.component : 'standard';
  const interaction = heavyAllowed ? config.buttonInteraction.component : 'none';
  const common = twMerge(
    'xmt-btn inline-flex min-h-10 w-fit max-w-full min-w-0 shrink appearance-none items-center justify-center gap-2 rounded-button border px-4 py-2.5 text-sm font-semibold leading-[1.25] align-middle',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-studio-primary',
    'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
  );
  const variantClasses: Record<ReactBitsButtonVariant, string> = {
    primary: 'xmt-btn-primary border-transparent text-white',
    ai: 'border-studio-violet/30 bg-studio-violet/10 text-studio-violet-contrast hover:bg-studio-violet/20',
    secondary: 'xmt-btn-secondary',
    ghost: 'xmt-btn-ghost',
    danger: 'xmt-btn-danger',
    icon: 'xmt-btn-secondary px-3',
  };
  const specularClasses =
    heavyAllowed && surface === 'specular-button'
      ? "relative overflow-hidden ring-1 ring-inset ring-studio-border-active/40 before:pointer-events-none before:absolute before:inset-x-[12%] before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-studio-primary/80 before:to-transparent before:content-['']"
      : '';
  const base = twMerge(common, variantClasses[variant], specularClasses, className);
  const widthClass = base.split(/\s+/).includes('w-full') ? 'w-full' : 'w-fit';
  const wrapperClasses = `inline-flex ${widthClass} max-w-full align-middle`;
  const innerClasses = `inline-flex ${widthClass} max-w-full`;
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
          className={twMerge(wrapperClasses, 'rounded-button')}
          backgroundColor="var(--xmt-surface)"
          glowColor="var(--xmt-primary)"
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
          className={twMerge(wrapperClasses, 'overflow-visible')}
          color="var(--xmt-primary)"
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
          color="var(--xmt-primary)"
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
        <Magnet padding={20} magnetStrength={3} disabled={props.disabled} wrapperClassName={wrapperClasses} innerClassName={innerClasses}>
          {button}
        </Magnet>
      </Suspense>
    );
  }
  if (interaction === 'click-spark') {
    button = (
      <span className={`relative ${wrapperClasses}`}>
        <Suspense fallback={button}>
          <ClickSpark sparkColor="var(--xmt-primary-contrast)" sparkSize={8} sparkRadius={18} sparkCount={8} duration={400}>
            {button}
          </ClickSpark>
        </Suspense>
      </span>
    );
  }
  if (interaction === 'glare-hover') {
    button = (
      <span className={wrapperClasses}>
        <Suspense fallback={button}>
          <GlareHover
            width={widthClass === 'w-full' ? '100%' : 'fit-content'}
            height="auto"
            background="transparent"
            borderColor="transparent"
            borderRadius="inherit"
            glareColor="var(--xmt-primary)"
            glareOpacity={0.32}
            className={wrapperClasses}
          >
            {button}
          </GlareHover>
        </Suspense>
      </span>
    );
  }
  return <>{button}</>;
}
