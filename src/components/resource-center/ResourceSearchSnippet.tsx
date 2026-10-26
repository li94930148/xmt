import type { ReactNode } from 'react';

type ResourceSearchSnippetProps = {
  snippet: string;
};

const MATCHED_TEXT = /<mark>([\s\S]*?)<\/mark>/gi;

export function ResourceSearchSnippet({ snippet }: ResourceSearchSnippetProps) {
  const content: ReactNode[] = [];
  let cursor = 0;

  for (const [index, match] of [...snippet.matchAll(MATCHED_TEXT)].entries()) {
    const start = match.index ?? cursor;
    if (start > cursor) content.push(snippet.slice(cursor, start));
    content.push(
      <mark key={`match-${index}`} className="rounded-sm bg-studio-amber-soft px-0.5 text-studio-amber-contrast">
        {match[1]}
      </mark>,
    );
    cursor = start + match[0].length;
  }

  if (cursor < snippet.length) content.push(snippet.slice(cursor));

  return <>{content}</>;
}
