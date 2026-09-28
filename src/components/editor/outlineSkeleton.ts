export interface OutlineHeading {
  title: string;
  level: number;
}

function normalizedTitle(value: string): string {
  return value.replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim();
}

function titleKey(value: string): string {
  return normalizedTitle(value).toLocaleLowerCase();
}

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

export function extractOutlineHeadings(outlineHtml: string): OutlineHeading[] {
  if (!outlineHtml.trim()) return [];
  const doc = parseHtml(outlineHtml);
  const seen = new Set<string>();
  const headings: OutlineHeading[] = [];
  for (const element of doc.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    const title = normalizedTitle(element.textContent || '');
    const key = titleKey(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    headings.push({ title, level: Math.max(2, Math.min(4, Number(element.tagName.slice(1)))) });
  }
  return headings;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function buildMissingOutlineSkeleton(headings: OutlineHeading[], manuscriptHtml: string): { html: string; count: number } {
  const existing = new Set(Array.from(parseHtml(manuscriptHtml).querySelectorAll('h1,h2,h3,h4,h5,h6'), (element) => titleKey(element.textContent || '')));
  const additions = headings.filter((heading) => {
    const key = titleKey(heading.title);
    if (!key || existing.has(key)) return false;
    existing.add(key);
    return true;
  });
  return {
    html: additions.map((heading) => `<h${heading.level}>${escapeHtml(heading.title)}</h${heading.level}><p></p>`).join(''),
    count: additions.length,
  };
}
