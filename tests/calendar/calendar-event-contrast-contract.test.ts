import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const tokensSource = read('src/styles/tokens.css');
const calendarSource = read('src/pages/Calendar.tsx');
const statusPillSource = read('src/components/studio/StatusPill.tsx');

type Color = [number, number, number, number];

function parseColor(value: string | undefined): Color | null {
  if (!value) return null;
  const hex = value.match(/^#([\da-f]{6})$/i);
  if (hex) {
    const number = Number.parseInt(hex[1], 16);
    return [(number >> 16) & 255, (number >> 8) & 255, number & 255, 1];
  }

  const rgba = value.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgba) return null;
  const channels = rgba[1].split(',').map((channel) => Number(channel.trim()));
  if (channels.length < 3 || channels.some((channel) => !Number.isFinite(channel))) return null;
  return [channels[0], channels[1], channels[2], channels[3] ?? 1];
}

function variablesIn(source: string): Map<string, string> {
  return new Map(
    [...source.matchAll(/--([\w-]+)\s*:\s*(#[\da-f]{6}|rgba?\([^;]+\))\s*;/gi)]
      .map((match) => [match[1], match[2]]),
  );
}

function composite(foreground: Color, background: Color): Color {
  return [
    foreground[0] * foreground[3] + background[0] * (1 - foreground[3]),
    foreground[1] * foreground[3] + background[1] * (1 - foreground[3]),
    foreground[2] * foreground[3] + background[2] * (1 - foreground[3]),
    1,
  ];
}

function luminance(color: Color): number {
  const linear = color.slice(0, 3).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastRatio(first: Color, second: Color): number {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05)
    / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

const eventTones = {
  deadline: 'coral',
  meeting: 'primary',
  review: 'amber',
  publish: 'success',
  shooting: 'cyan',
  other: 'muted',
} as const;
const expectedBadgeClasses = {
  primary: 'border-studio-primary/30 bg-studio-primary/10 text-studio-primary-contrast',
  cyan: 'border-studio-cyan/30 bg-studio-cyan/10 text-studio-cyan-contrast',
  violet: 'border-studio-violet/30 bg-studio-violet/10 text-studio-violet-contrast',
  coral: 'border-studio-coral/30 bg-studio-coral/10 text-studio-coral-contrast',
  amber: 'border-studio-amber/30 bg-studio-amber/10 text-studio-amber-contrast',
  success: 'border-studio-success/30 bg-studio-success/10 text-studio-success-contrast',
  muted: 'border-studio-border-soft bg-studio-surface-soft text-studio-text-secondary',
} as const;
const expectedDotClasses = {
  primary: 'bg-studio-primary-contrast',
  cyan: 'bg-studio-cyan-contrast',
  violet: 'bg-studio-violet-contrast',
  coral: 'bg-studio-coral-contrast',
  amber: 'bg-studio-amber-contrast',
  success: 'bg-studio-success-contrast',
  muted: 'bg-studio-text-muted',
} as const;

const toneBlock = calendarSource.match(/const eventTypeTone: Record<string, StatusTone> = \{([\s\S]*?)\n\};/);
assert.ok(toneBlock, 'Calendar keeps an explicit event-type to semantic-tone mapping');
for (const [eventType, tone] of Object.entries(eventTones)) {
  assert.match(toneBlock[1], new RegExp(`^\\s*${eventType}: '${tone}',$`, 'm'), `${eventType} keeps its ${tone} tone`);
}

for (const tone of ['primary', 'cyan', 'violet', 'coral', 'amber', 'success']) {
  assert.ok(
    statusPillSource.includes(`${tone}: 'border-studio-${tone}/35 bg-studio-${tone}/12 text-studio-${tone}-contrast'`),
    `StatusPill ${tone} foreground and background remain paired through semantic tokens`,
  );
}
assert.ok(
  statusPillSource.includes("muted: 'border-studio-border-soft bg-[var(--xmt-overlay-tint)] text-studio-text-secondary'"),
  'StatusPill muted tone remains paired with the neutral overlay and secondary text tokens',
);

const badgeClassBlock = calendarSource.match(/const eventTypeBadgeClass: Record<StatusTone, string> = \{([\s\S]*?)\n\};/);
assert.ok(badgeClassBlock, 'Calendar maps semantic tones to explicit month-view badge styles');
for (const [tone, className] of Object.entries(expectedBadgeClasses)) {
  assert.match(badgeClassBlock[1], new RegExp(`^\\s*${tone}: '${className}',?$`, 'm'), `month-view ${tone} badges keep their semantic token pair`);
}

const dotClassBlock = calendarSource.match(/const eventTypeDotClass: Record<StatusTone, string> = \{([\s\S]*?)\n\};/);
assert.ok(dotClassBlock, 'Calendar maps semantic tones to explicit mobile marker styles');
for (const [tone, className] of Object.entries(expectedDotClasses)) {
  assert.match(dotClassBlock[1], new RegExp(`^\\s*${tone}: '${className}',?$`, 'm'), `mobile ${tone} markers keep their semantic color`);
}

const lightStart = tokensSource.indexOf("html.light,\n.xmt-theme-scope[data-theme='light']");
assert.ok(lightStart > 0, 'tokens.css has a distinct light-theme token block');
const themeBlocks = {
  dark: variablesIn(tokensSource.slice(0, lightStart)),
  light: variablesIn(tokensSource.slice(lightStart)),
};

for (const [theme, variables] of Object.entries(themeBlocks)) {
  const get = (name: string): Color => {
    const color = parseColor(variables.get(name));
    assert.ok(color, `${theme} theme defines a parseable --${name} token`);
    return color;
  };

  const app = get('xmt-app-bg');
  const glass = get('xmt-surface-glass');
  const primary = get('xmt-primary');
  const bases = [
    ['app', app],
    ['surface', get('xmt-surface')],
    ['surface-soft', get('xmt-surface-soft')],
    ['surface-elevated', get('xmt-surface-elevated')],
    ['glass over app', composite(glass, app)],
  ] as const;
  const cellBases = [
    ...bases,
    ...bases.map(([name, base]) => [`today tint over ${name}`, composite([primary[0], primary[1], primary[2], 0.1], base)] as const),
  ];

  for (const [eventType, tone] of Object.entries(eventTones)) {
    const dotForeground = tone === 'muted' ? get('xmt-text-muted') : get(`xmt-${tone}-contrast`);
    for (const [surfaceName, base] of cellBases) {
      const dotRatio = contrastRatio(dotForeground, base);
      assert.ok(dotRatio >= 3, `${theme}/${eventType}/mobile marker on ${surfaceName} has ${dotRatio.toFixed(2)}:1 contrast; expected >= 3:1`);
    }

    if (tone === 'muted') {
      const foreground = get('xmt-text-secondary');
      const overlay = get('xmt-overlay-tint');
      for (const [surfaceName, base] of bases) {
        const background = composite(overlay, base);
        const ratio = contrastRatio(foreground, background);
        assert.ok(ratio >= 4.5, `${theme}/${eventType}/StatusPill on ${surfaceName} has ${ratio.toFixed(2)}:1 contrast; expected >= 4.5:1`);
      }

      const neutralForeground = get('xmt-text-secondary');
      for (const [surfaceName, base] of cellBases) {
        const ratio = contrastRatio(neutralForeground, base);
        assert.ok(ratio >= 4.5, `${theme}/${eventType}/desktop neutral badge on ${surfaceName} has ${ratio.toFixed(2)}:1 contrast; expected >= 4.5:1`);
      }
      continue;
    }

    const foreground = get(`xmt-${tone}-contrast`);
    const semanticBackground = get(`xmt-${tone}`);
    for (const [surfaceName, base] of bases) {
      const mobileBackground = composite([semanticBackground[0], semanticBackground[1], semanticBackground[2], 0.12], base);
      const mobileRatio = contrastRatio(foreground, mobileBackground);
      assert.ok(mobileRatio >= 4.5, `${theme}/${eventType}/StatusPill on ${surfaceName} has ${mobileRatio.toFixed(2)}:1 contrast; expected >= 4.5:1`);
    }

    for (const [surfaceName, base] of cellBases) {
      const desktopBackground = composite([semanticBackground[0], semanticBackground[1], semanticBackground[2], 0.1], base);
      const desktopRatio = contrastRatio(foreground, desktopBackground);
      assert.ok(desktopRatio >= 4.5, `${theme}/${eventType}/desktop badge on ${surfaceName} has ${desktopRatio.toFixed(2)}:1 contrast; expected >= 4.5:1`);
    }
  }
}

console.log('Calendar semantic event color contract passed: six event mappings and token-composited text contrast >= 4.5:1 in light/dark themes across calendar/timeline surface candidates.');
