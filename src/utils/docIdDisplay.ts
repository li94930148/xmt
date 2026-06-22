export function normalizeDocId(input: string) {
  return input
    .trim()
    .replace(/^创作[:：]/, 'production:')
    .replace(/^成片[:：]/, 'shooting:');
}

export function displayDocId(docId: string) {
  return docId
    .replace(/^production:/, '创作:')
    .replace(/^shooting:/, '成片:');
}

export function docIdPlaceholder() {
  return '创作:1 或 成片:1';
}
