/**
 * Markdown 工具 - HTML ↔ Markdown 转换
 * 使用纯 JS 实现（DOMParser + 正则），不依赖外部库
 */

/**
 * HTML 转 Markdown
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return '';

  // 浏览器环境用 DOMParser，Node 环境用正则
  if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
    return htmlToMarkdownDom(html);
  }
  return htmlToMarkdownRegex(html);
}

/**
 * 使用 DOMParser 的 HTML → Markdown 转换
 */
function htmlToMarkdownDom(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const body = doc.body;
  return nodeToMarkdown(body).trim();
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || '';
    // 转义 markdown 特殊字符（仅在必要时）
    return text.replace(/([*_~`\[\]])/g, '\\$1');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const children = Array.from(el.childNodes).map(nodeToMarkdown).join('');

  switch (tag) {
    case 'h1': return `\n# ${children.trim()}\n\n`;
    case 'h2': return `\n## ${children.trim()}\n\n`;
    case 'h3': return `\n### ${children.trim()}\n\n`;
    case 'h4': return `\n#### ${children.trim()}\n\n`;
    case 'h5': return `\n##### ${children.trim()}\n\n`;
    case 'h6': return `\n###### ${children.trim()}\n\n`;
    case 'strong':
    case 'b': return `**${children.trim()}**`;
    case 'em':
    case 'i': return `*${children.trim()}*`;
    case 'u': return `<u>${children.trim()}</u>`;
    case 's':
    case 'strike':
    case 'del': return `~~${children.trim()}~~`;
    case 'code': {
      if (el.parentElement?.tagName.toLowerCase() === 'pre') return children;
      return `\`${children.trim()}\``;
    }
    case 'pre': {
      const codeEl = el.querySelector('code');
      const lang = codeEl?.className?.match(/language-(\w+)/)?.[1] || '';
      const code = codeEl ? codeEl.textContent || '' : el.textContent || '';
      return `\n\`\`\`${lang}\n${code.trim()}\n\`\`\`\n\n`;
    }
    case 'blockquote': return `\n> ${children.trim()}\n\n`;
    case 'br': return '\n';
    case 'hr': return '\n---\n\n';
    case 'p': return `\n${children.trim()}\n\n`;
    case 'div': return `\n${children}\n`;
    case 'a': {
      const href = el.getAttribute('href') || '';
      return `[${children.trim()}](${href})`;
    }
    case 'img': {
      const src = el.getAttribute('src') || '';
      const alt = el.getAttribute('alt') || '';
      return `![${alt}](${src})`;
    }
    case 'ul': return `\n${children}\n`;
    case 'ol': return `\n${children}\n`;
    case 'li': {
      const parent = el.parentElement;
      const index = parent ? Array.from(parent.children).indexOf(el) : 0;
      const prefix = parent?.tagName.toLowerCase() === 'ol' ? `${index + 1}. ` : '- ';
      return `${prefix}${children.trim()}\n`;
    }
    case 'table': return `\n${children}\n`;
    case 'thead':
    case 'tbody': return children;
    case 'tr': {
      const cells = Array.from(el.children);
      const row = `| ${cells.map(c => nodeToMarkdown(c).trim()).join(' | ')} |`;
      if (el.parentElement?.tagName.toLowerCase() === 'thead') {
        const sep = `| ${cells.map(() => '---').join(' | ')} |`;
        return `${row}\n${sep}\n`;
      }
      return `${row}\n`;
    }
    case 'th':
    case 'td': return children.trim();
    default: return children;
  }
}

/**
 * 纯正则的 HTML → Markdown 转换（服务端 fallback）
 */
function htmlToMarkdownRegex(html: string): string {
  if (!html) return '';
  let md = html;
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
  md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n');
  md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n');
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
  md = md.replace(/<u[^>]*>(.*?)<\/u>/gi, '<u>$1</u>');
  md = md.replace(/<s[^>]*>(.*?)<\/s>/gi, '~~$1~~');
  md = md.replace(/<strike[^>]*>(.*?)<\/strike>/gi, '~~$1~~');
  md = md.replace(/<del[^>]*>(.*?)<\/del>/gi, '~~$1~~');
  md = md.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n');
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
  md = md.replace(/<pre[^>]*>(.*?)<\/pre>/gis, '```\n$1\n```\n');
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<hr\s*\/?>/gi, '\n---\n');
  md = md.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)');
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  md = md.replace(/<ul[^>]*>/gi, '\n');
  md = md.replace(/<\/ul>/gi, '\n');
  md = md.replace(/<ol[^>]*>/gi, '\n');
  md = md.replace(/<\/ol>/gi, '\n');
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
  md = md.replace(/<div[^>]*>(.*?)<\/div>/gi, '$1\n');
  md = md.replace(/<[^>]+>/g, '');
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&nbsp;/g, ' ');
  md = md.replace(/\n{3,}/g, '\n\n');
  return md.trim();
}

/**
 * Markdown 转 HTML
 */
export function markdownToHtml(md: string): string {
  if (!md) return '';
  let html = md;

  // 代码块（先处理，避免内部被转换）
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const escaped = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<pre><code class="language-${lang}">${escaped}</code></pre>`;
  });

  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 标题
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // 粗体和斜体
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 删除线
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // 链接和图片
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // 引用
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');

  // 分割线
  html = html.replace(/^---$/gm, '<hr />');

  // 列表项
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');

  // 段落（非空行且不是 HTML 标签的行）
  html = html.replace(/^(?!<[a-z]|$)(.+)$/gm, '<p>$1</p>');

  // 清理多余换行
  html = html.replace(/\n{2,}/g, '\n');

  return html.trim();
}
