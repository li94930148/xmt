import sanitizeHtml from 'sanitize-html';

export const MATERIAL_TITLE_MAX_LENGTH = 200;
export const MATERIAL_HTML_MAX_LENGTH = 500_000;

const allowedTags = ['a', 'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'code', 'pre', 'blockquote', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li'];

export function sanitizeRichText(html: unknown): string {
  return sanitizeHtml(String(html ?? ''), {
    allowedTags,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href'],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: 'a',
        attribs: {
          ...attribs,
          ...(attribs.target === '_blank' ? { rel: 'noopener noreferrer' } : {}),
        },
      }),
    },
    disallowedTagsMode: 'discard',
  }).trim();
}

export function plainTextToSafeHtml(text: unknown): string {
  const escaped = String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br />')}</p>`)
    .join('');
}

export function normalizeMaterialTitle(value: unknown, html: string): string {
  const supplied = String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (supplied) return supplied.slice(0, MATERIAL_TITLE_MAX_LENGTH);
  const plain = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
  return plain.slice(0, 30) || '未命名资料';
}
