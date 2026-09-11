export function resolveEditorInsertionSelection(
  saved: { from: number; to: number } | null,
  documentEnd: number,
) {
  if (!saved || saved.from < 0 || saved.to < saved.from || saved.to > documentEnd) {
    return { from: documentEnd, to: documentEnd };
  }
  return saved;
}
