const LEGACY_DEFAULT_TEXT_COLORS = new Set([
  '#000',
  '#000000',
  '#333',
  '#333333',
  'rgb(0,0,0)',
  'rgb(51,51,51)',
]);

export function isLegacyDefaultTextColor(color?: string): boolean {
  if (!color) return false;
  return LEGACY_DEFAULT_TEXT_COLORS.has(color.replace(/\s+/g, '').toLowerCase());
}

function normalizeStyleAttribute(style: string): string {
  return style
    .split(';')
    .map((part) => {
      const separatorIndex = part.indexOf(':');
      if (separatorIndex < 0) return part;

      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      if (key.toLowerCase() !== 'color' || !isLegacyDefaultTextColor(value)) {
        return part;
      }

      return `${key}: var(--editor-fg)`;
    })
    .join(';');
}

export function normalizeLegacyEditorHtmlTheme(html: string): string {
  if (!html) return html;

  return html
    .replace(/\sstyle=(["'])([\s\S]*?)\1/gi, (_match, quote: string, style: string) => {
      return ` style=${quote}${normalizeStyleAttribute(style)}${quote}`;
    })
    .replace(/(<font\b[^>]*\scolor=)(["']?)([^"'\s>]+)(\2)/gi, (match, prefix: string, quote: string, color: string, closingQuote: string) => {
      if (!isLegacyDefaultTextColor(color)) return match;
      return `${prefix}${quote}var(--editor-fg)${closingQuote}`;
    });
}
