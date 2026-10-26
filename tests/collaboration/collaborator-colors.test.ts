import assert from 'node:assert/strict';
import test from 'node:test';
import { COLLABORATOR_COLORS, getCollaboratorDisplayColors } from '../../src/collaboration/core/collaboratorColors';

function parseHex(color: string) {
  const hex = color.slice(1);
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

function relativeLuminance(rgb: number[]) {
  const channels = rgb.map((value) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

test('all collaboration palette initials meet 4.5:1 contrast', () => {
  const foregroundTokens = {
    'var(--xmt-text-on-color-light)': '#FFFFFF',
    'var(--xmt-text-on-color-dark)': '#0F172A',
  };

  for (const color of COLLABORATOR_COLORS) {
    const displayColors = getCollaboratorDisplayColors(color);
    const foregroundColor = foregroundTokens[displayColors.foregroundColor as keyof typeof foregroundTokens];
    assert.ok(foregroundColor, `a semantic foreground token is selected for ${color}`);
    const foregroundLuminance = relativeLuminance(parseHex(foregroundColor));
    const backgroundLuminance = relativeLuminance(parseHex(displayColors.backgroundColor));
    const contrast = (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
      / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
    assert.ok(contrast >= 4.5, `${color} with ${displayColors.foregroundColor} has ${contrast.toFixed(2)}:1 contrast`);
  }
});

test('invalid collaborator colors fall back to the accessible default pair', () => {
  assert.deepEqual(getCollaboratorDisplayColors('not-a-color'), {
    backgroundColor: COLLABORATOR_COLORS[0],
    foregroundColor: 'var(--xmt-text-on-color-light)',
  });
});
