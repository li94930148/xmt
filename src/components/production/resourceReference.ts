export interface ResourceReference {
  resource_id: number;
  title: string;
  content_html: string;
}

export const MAX_REFERENCE_EXCERPT_CHARS = 5000;

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function resourceIncludesExcerpt(resource: ResourceReference, excerpt: string): boolean {
  const normalizedExcerpt = excerpt.normalize('NFKC').replace(/\s+/g, '');
  if (!normalizedExcerpt || excerpt.length > MAX_REFERENCE_EXCERPT_CHARS) return false;
  const document = new DOMParser().parseFromString(resource.content_html, 'text/html');
  const normalizedSource = (document.body.textContent || '').normalize('NFKC').replace(/\s+/g, '');
  return normalizedSource.includes(normalizedExcerpt);
}

export function buildResourceReferenceHtml(resource: ResourceReference, excerpt?: string): string {
  if (!Number.isSafeInteger(resource.resource_id) || resource.resource_id <= 0 || !resource.content_html.trim()) return '';
  if (excerpt !== undefined && !resourceIncludesExcerpt(resource, excerpt)) return '';
  const title = escapeHtml(resource.title.trim() || `资料 ${resource.resource_id}`);
  const quote = excerpt === undefined ? resource.content_html : `<p>${escapeHtml(excerpt).replace(/\r?\n/g, '<br>')}</p>`;
  return `<blockquote>${quote}</blockquote><p><a href="/asset-center/resources/${resource.resource_id}">来源：${title}</a></p><p></p>`;
}

export function referencedResourceIds(manuscriptHtml: string): Set<number> {
  const document = new DOMParser().parseFromString(manuscriptHtml, 'text/html');
  const ids = new Set<number>();
  for (const link of document.querySelectorAll('a[href]')) {
    const match = /^\/asset-center\/resources\/([1-9]\d*)\/?$/.exec(link.getAttribute('href') || '');
    if (!match || !link.textContent?.trim().startsWith('来源：')) continue;
    const id = Number(match[1]);
    if (Number.isSafeInteger(id)) ids.add(id);
  }
  return ids;
}
