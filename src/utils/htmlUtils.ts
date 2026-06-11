export function htmlToText(html: string): string {
  if (!html) return '';
  
  const temp = document.createElement('div');
  temp.innerHTML = html;
  
  let text = temp.textContent || temp.innerText || '';
  
  text = text.replace(/\n\n+/g, '\n\n');
  text = text.replace(/^\s+|\s+$/g, '');
  
  return text;
}

export function cleanHtmlForDisplay(html: string): string {
  if (!html) return '';
  
  let cleaned = html;
  
  cleaned = cleaned.replace(/<\/p><p>/g, '\n\n');
  cleaned = cleaned.replace(/<\/p>$/g, '');
  cleaned = cleaned.replace(/^<p>/g, '');
  cleaned = cleaned.replace(/<br\s*\/?>/g, '\n');
  cleaned = cleaned.replace(/<\/?strong>/g, '**');
  cleaned = cleaned.replace(/<\/?em>/g, '*');
  cleaned = cleaned.replace(/<\/?b>/g, '**');
  cleaned = cleaned.replace(/<\/?i>/g, '*');
  cleaned = cleaned.replace(/<h1[^>]*>/g, '# ');
  cleaned = cleaned.replace(/<h2[^>]*>/g, '## ');
  cleaned = cleaned.replace(/<h3[^>]*>/g, '### ');
  cleaned = cleaned.replace(/<\/h[1-3]>/g, '');
  cleaned = cleaned.replace(/<ul[^>]*>/g, '');
  cleaned = cleaned.replace(/<\/ul>/g, '');
  cleaned = cleaned.replace(/<ol[^>]*>/g, '');
  cleaned = cleaned.replace(/<\/ol>/g, '');
  cleaned = cleaned.replace(/<li[^>]*>/g, '- ');
  cleaned = cleaned.replace(/<\/li>/g, '\n');
  cleaned = cleaned.replace(/<blockquote[^>]*>/g, '> ');
  cleaned = cleaned.replace(/<\/blockquote>/g, '');
  cleaned = cleaned.replace(/<code[^>]*>/g, '`');
  cleaned = cleaned.replace(/<\/code>/g, '`');
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  
  cleaned = cleaned.replace(/\n\n+/g, '\n\n');
  cleaned = cleaned.replace(/^\s+|\s+$/g, '');
  
  return cleaned;
}

export function extractHeadings(html: string): { level: number; text: string; id: string }[] {
  const headings: { level: number; text: string; id: string }[] = [];
  const headingRegex = /<h([1-3])[^>]*>(.*?)<\/h[1-3]>/gi;
  let match;
  
  while ((match = headingRegex.exec(html)) !== null) {
    const level = parseInt(match[1]);
    const text = match[2].replace(/<[^>]+>/g, '').trim();
    const id = text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-');
    
    if (text) {
      headings.push({ level, text, id });
    }
  }
  
  return headings;
}

export function generateTableOfContents(html: string): string {
  const headings = extractHeadings(html);
  
  if (headings.length === 0) return '';
  
  let toc = '## 目录\n\n';
  
  headings.forEach((heading, index) => {
    const indent = '  '.repeat(heading.level - 1);
    const numbering = generateNumbering(headings, index);
    toc += `${indent}${numbering} [${heading.text}](#${heading.id})\n`;
  });
  
  return toc;
}

function generateNumbering(headings: { level: number; text: string; id: string }[], index: number): string {
  const levels: number[] = [];
  
  for (let i = 0; i <= index; i++) {
    const currentLevel = headings[i].level;
    
    while (levels.length >= currentLevel) {
      levels.pop();
    }
    
    if (levels.length === currentLevel - 1) {
      levels.push((levels[levels.length - 1] || 0) + 1);
    }
  }
  
  return levels.join('.');
}