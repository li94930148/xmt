import type { ContentEditorRuntimeHandle } from '../contracts/contentEditorAdapter';

export type RuntimeHandleChangeListener = (handle: ContentEditorRuntimeHandle | null) => void;

/**
 * Keeps an external handle reference synchronized without exposing editor or
 * collaboration internals. Releasing a stale handle cannot clear a newer one.
 */
export class RuntimeHandleBridge {
  private current: ContentEditorRuntimeHandle | null = null;
  private listener: RuntimeHandleChangeListener | undefined;

  setListener(listener: RuntimeHandleChangeListener | undefined): void {
    if (this.listener === listener) return;
    if (this.listener && this.current) this.listener(null);
    this.listener = listener;
    if (listener && this.current) listener(this.current);
  }

  publish(handle: ContentEditorRuntimeHandle): void {
    if (this.current === handle) return;
    this.current = handle;
    this.listener?.(handle);
  }

  release(handle: ContentEditorRuntimeHandle): void {
    if (this.current !== handle) return;
    this.current = null;
    this.listener?.(null);
  }

  dispose(): void {
    if (!this.current) return;
    this.current = null;
    this.listener?.(null);
  }
}
