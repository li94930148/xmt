import MagicBento, { type BentoCardProps } from '@/components/reactbits/components/MagicBento/MagicBento';

type Props = {
  cards: BentoCardProps[];
  reducedMotion?: boolean;
};

/** Business adapter: data, navigation and text-safe card content; visual effects remain official MagicBento. */
export function XMTMagicBentoAdapter({ cards, reducedMotion = false }: Props) {
  return <MagicBento cards={cards} textAutoHide={false} glowColor="34, 211, 238" particleCount={reducedMotion ? 0 : 10} spotlightRadius={340} enableStars={!reducedMotion} enableSpotlight={!reducedMotion} enableBorderGlow enableTilt={!reducedMotion} enableMagnetism={!reducedMotion} clickEffect={!reducedMotion} />;
}

export type { BentoCardProps };
