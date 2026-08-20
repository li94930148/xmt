import createDOMPurify from 'dompurify';

const ALLOWED_TAGS = ['a', 'p', 'br', 'span', 'div', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'code', 'pre', 'blockquote', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'colgroup', 'col', 'label', 'input', 'mark'];
const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'target', 'rel', 'class', 'style', 'data-type', 'data-checked', 'data-align', 'colspan', 'rowspan', 'width', 'height', 'start', 'type', 'checked', 'disabled'];

function hasAllowedLinkScheme(value: string) {
  return /^(?:https?:|mailto:|[/#]|\.{1,2}\/)/i.test(value) || !/^[a-z][a-z0-9+.-]*:/i.test(value);
}

function hasAllowedImageScheme(value: string) {
  return /^(?:https?:|[/#]|\.{1,2}\/)/i.test(value)
    || /^data:image\/(?:png|gif|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(value)
    || !/^[a-z][a-z0-9+.-]*:/i.test(value);
}

/** Final rendering boundary for stored editor HTML and markdown-derived HTML. */
export function createHtmlSanitizer(domWindow: Window) {
  const purifier = createDOMPurify(domWindow as unknown as Parameters<typeof createDOMPurify>[0]);
  purifier.addHook('uponSanitizeAttribute', (_node, data) => {
    const value = String(data.attrValue || '').trim();
    if (data.attrName === 'href' && !hasAllowedLinkScheme(value)) data.keepAttr = false;
    if (data.attrName === 'src' && !hasAllowedImageScheme(value)) data.keepAttr = false;
  });
  return (html: string) => purifier.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ['svg', 'math', 'iframe', 'object', 'embed', 'form', 'base', 'meta', 'link'],
    FORBID_ATTR: ['srcdoc'],
  });
}

export function sanitizeHtml(html: string): string {
  if (!html || typeof window === 'undefined') return '';
  return createHtmlSanitizer(window).call(null, html);
}
