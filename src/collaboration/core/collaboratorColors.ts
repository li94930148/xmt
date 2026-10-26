export const COLLABORATOR_COLORS = [
  '#2563eb',
  '#16a34a',
  '#dc2626',
  '#9333ea',
  '#ea580c',
  '#0891b2',
  '#be123c',
  '#4f46e5',
] as const;

const FALLBACK_COLOR = COLLABORATOR_COLORS[0];
const LIGHT_FOREGROUND = { css: 'var(--xmt-text-on-color-light)', rgb: [255, 255, 255] as const };
const DARK_FOREGROUND = { css: 'var(--xmt-text-on-color-dark)', rgb: [15, 23, 42] as const };

export interface CollaboratorDisplayColors {
  backgroundColor: string;
  foregroundColor: string;
}

function parseHexColor(value: string): [number, number, number] | null {
  const hex = value.trim().match(/^#(?:[\da-f]{3}|[\da-f]{6})$/i)?.[0].slice(1);
  if (!hex) return null;
  const expanded = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex;
  return [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16)) as [number, number, number];
}

function relativeLuminance(rgb: readonly number[]) {
  const channels = rgb.map((value) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: readonly number[], background: readonly number[]) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

export function getCollaboratorDisplayColors(color: string | null | undefined): CollaboratorDisplayColors {
  const parsedBackground = typeof color === 'string' ? parseHexColor(color) : null;
  const fallbackBackground = parseHexColor(FALLBACK_COLOR)!;
  const background = parsedBackground || fallbackBackground;
  const backgroundColor = parsedBackground
    ? `#${background.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
    : FALLBACK_COLOR;
  const foreground = contrastRatio(LIGHT_FOREGROUND.rgb, background) >= contrastRatio(DARK_FOREGROUND.rgb, background)
    ? LIGHT_FOREGROUND
    : DARK_FOREGROUND;

  return { backgroundColor, foregroundColor: foreground.css };
}
