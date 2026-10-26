export type ManualEditorSave = () => void | boolean | Promise<void | boolean>;

/** Resolves only after the page-owned save callback completes; false means no server confirmation. */
export async function confirmManualEditorSave(save: ManualEditorSave): Promise<boolean> {
  try {
    return (await save()) !== false;
  } catch {
    return false;
  }
}
