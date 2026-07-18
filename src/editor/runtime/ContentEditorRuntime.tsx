import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  ContentEditorAdapter,
  ContentEditorCapabilities,
  ContentEditorRuntimeHandle,
  ContentEditorSaveStatus,
} from '../contracts/contentEditorAdapter';
import { resolveContentEditorSaveStrategy } from '../contracts/contentEditorAdapter';
import { RuntimeAutosaveCoordinator } from './AutosaveCoordinator';
import { GracefulDisposeController } from './GracefulDisposeController';
import { ManualSaveController } from './ManualSaveController';
import { createNotApplicableDisposeResult, dispatchManualSave } from './SaveStrategyDispatch';

/** Read-only runtime data made available to a future editor UI. */
export interface ContentEditorRuntimeContext {
  documentId: string;
  collaborationRoom: string;
  readonly: boolean;
  capabilities: ContentEditorCapabilities;
  status: ContentEditorSaveStatus;
  isDestroyed: boolean;
}

export interface ContentEditorRuntimeProps {
  /** Opaque resource context. This shell must not interpret its business type. */
  adapter: ContentEditorAdapter;
  /** Optional future editor UI; no existing editor is connected in Phase B1-A. */
  children?: (context: ContentEditorRuntimeContext) => ReactNode;
  /** Receives the lifecycle handle after the shell mounts. */
  onReady?: (handle: ContentEditorRuntimeHandle) => void;
  /** Signals that a previously-ready handle is no longer current. */
  onDisposed?: (handle: ContentEditorRuntimeHandle) => void;
  /** Receives generic coordinator state without exposing business semantics. */
  onStatusChange?: (status: ContentEditorSaveStatus) => void;
}

/**
 * Phase B1 Runtime shell.
 *
 * It owns the adapter, lifecycle boundary, and internal autosave handle.
 * Tiptap, Yjs, Socket.IO, validation execution, and business persistence are
 * supplied by later integration layers.
 */
const ContentEditorRuntime = forwardRef<ContentEditorRuntimeHandle, ContentEditorRuntimeProps>(
  function ContentEditorRuntime({ adapter, children, onReady, onDisposed, onStatusChange }, ref) {
    const mountedRef = useRef(false);
    const destroyedRef = useRef(false);
    const adapterRef = useRef(adapter);
    const statusChangeRef = useRef(onStatusChange);
    adapterRef.current = adapter;
    statusChangeRef.current = onStatusChange;
    const saveStrategy = resolveContentEditorSaveStrategy(adapter);
    const [status, setStatus] = useState<ContentEditorSaveStatus>('idle');
    const [isDestroyed, setIsDestroyed] = useState(false);

    const coordinator = useMemo(() => new RuntimeAutosaveCoordinator({
      documentId: adapter.documentId,
      persist: (content, context) => adapterRef.current.persist(content, context),
      onStatusChange: (nextStatus) => {
        setStatus(nextStatus);
        statusChangeRef.current?.(nextStatus);
      },
    }), [adapter.documentId]);
    const gracefulDisposeController = useMemo(
      () => new GracefulDisposeController(coordinator),
      [coordinator],
    );
    const manualSaveController = useMemo(() => new ManualSaveController({
      documentId: adapter.documentId,
      persist: (content, context) => adapterRef.current.persist(content, context),
      onStatusChange: (nextStatus) => {
        setStatus(nextStatus);
        statusChangeRef.current?.(nextStatus);
      },
    }), [adapter.documentId]);

    const destroy = useCallback(async () => {
      if (destroyedRef.current) return;

      destroyedRef.current = true;
      gracefulDisposeController.markDestroyed();
      coordinator.destroy();
      manualSaveController.destroy();
      if (mountedRef.current) setIsDestroyed(true);
    }, [coordinator, gracefulDisposeController, manualSaveController]);

    const handle = useMemo<ContentEditorRuntimeHandle>(() => ({
      scheduleSave: (content, revision) => {
        if (saveStrategy === 'autosave') coordinator.scheduleSave(content, revision);
      },
      manualSave: (content, revision) => dispatchManualSave(saveStrategy, manualSaveController, content, revision),
      flush: (options) => coordinator.flush(options),
      gracefulDispose: (options) => saveStrategy === 'autosave'
        ? gracefulDisposeController.gracefulDispose(options)
        : Promise.resolve(createNotApplicableDisposeResult(
          options.reason,
          manualSaveController.getRevisions().latestRevision,
          manualSaveController.getRevisions().persistedRevision,
        )),
      cancel: () => {
        if (saveStrategy === 'autosave') coordinator.cancel();
      },
      getStatus: () => saveStrategy === 'manual'
        ? manualSaveController.getStatus()
        : coordinator.getStatus(),
      destroy,
    }), [coordinator, destroy, gracefulDisposeController, manualSaveController, saveStrategy]);

    useImperativeHandle(ref, () => handle, [handle]);

    useEffect(() => {
      mountedRef.current = true;
      destroyedRef.current = false;
      setIsDestroyed(false);
      setStatus(coordinator.getStatus());
      onReady?.(handle);

      return () => {
        mountedRef.current = false;
        onDisposed?.(handle);
        void handle.destroy();
      };
    }, [handle, onDisposed, onReady]);

    const context: ContentEditorRuntimeContext = {
      documentId: adapter.documentId,
      collaborationRoom: adapter.collaborationRoom,
      readonly: adapter.readonly,
      capabilities: adapter.capabilities,
      status,
      isDestroyed,
    };

    return <>{children?.(context) ?? null}</>;
  },
);

ContentEditorRuntime.displayName = 'ContentEditorRuntime';

export default ContentEditorRuntime;
