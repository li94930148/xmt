import { displayDocId, normalizeDocId } from '../../utils/docIdDisplay';

const CURRENT_CONTENT_DOC_KEY = 'xmt_current_content_doc';
const RECENT_CONTENT_DOCS_KEY = 'xmt_recent_content_docs';
const DEFAULT_DOC_ID = 'production:1';

export interface CurrentContentDocument {
  docId: string;
  label: string;
  title: string;
  kind: 'production' | 'shooting' | 'unknown';
  updatedAt: number;
}

function kindOf(docId: string): CurrentContentDocument['kind'] {
  if (docId.startsWith('production:')) return 'production';
  if (docId.startsWith('shooting:')) return 'shooting';
  return 'unknown';
}

function createCurrentDocument(docId: string, title?: string): CurrentContentDocument {
  const fallbackLabel = displayDocId(docId);
  const resolvedTitle = title?.trim() || fallbackLabel;

  return {
    docId,
    label: resolvedTitle,
    title: resolvedTitle,
    kind: kindOf(docId),
    updatedAt: Date.now(),
  };
}

function parseStoredDocument(value: Partial<CurrentContentDocument> | string | null): CurrentContentDocument | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const docId = normalizeDocId(value);
    return docId ? createCurrentDocument(docId) : null;
  }

  const docId = normalizeDocId(value.docId || value.label || DEFAULT_DOC_ID) || DEFAULT_DOC_ID;
  const title = value.title || value.label || displayDocId(docId);

  return {
    docId,
    title,
    label: title,
    kind: value.kind || kindOf(docId),
    updatedAt: Number(value.updatedAt || Date.now()),
  };
}

export function getCurrentContentDocument(): CurrentContentDocument {
  try {
    const raw = localStorage.getItem(CURRENT_CONTENT_DOC_KEY);
    if (!raw) return createCurrentDocument(DEFAULT_DOC_ID);

    return parseStoredDocument(JSON.parse(raw) as Partial<CurrentContentDocument>) || createCurrentDocument(DEFAULT_DOC_ID);
  } catch {
    return createCurrentDocument(DEFAULT_DOC_ID);
  }
}

export function getRecentContentDocuments(): CurrentContentDocument[] {
  try {
    const raw = localStorage.getItem(RECENT_CONTENT_DOCS_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as Array<Partial<CurrentContentDocument> | string>;
    const docs = parsed
      .map((item) => parseStoredDocument(item))
      .filter((item): item is CurrentContentDocument => Boolean(item));
    const seen = new Set<string>();

    return docs.filter((item) => {
      if (seen.has(item.docId)) return false;
      seen.add(item.docId);
      return true;
    });
  } catch {
    return [];
  }
}

export function resolveContentDocument(input: string): CurrentContentDocument | null {
  const normalizedDocId = normalizeDocId(input);
  if (normalizedDocId) return createCurrentDocument(normalizedDocId);

  const keyword = input.trim();
  if (!keyword) return null;

  return getRecentContentDocuments().find((item) => item.title === keyword || item.label === keyword) || null;
}

export function setCurrentContentDocument(docId: string, title?: string) {
  const normalizedDocId = normalizeDocId(docId);
  if (!normalizedDocId) return createCurrentDocument(DEFAULT_DOC_ID);

  const current = createCurrentDocument(normalizedDocId, title);
  try {
    const recent = [
      current,
      ...getRecentContentDocuments().filter((item) => item.docId !== current.docId),
    ].slice(0, 12);

    localStorage.setItem(CURRENT_CONTENT_DOC_KEY, JSON.stringify(current));
    localStorage.setItem(RECENT_CONTENT_DOCS_KEY, JSON.stringify(recent));
  } catch {
    // localStorage 不可用时保持内存外的调用安全。
  }

  return current;
}
