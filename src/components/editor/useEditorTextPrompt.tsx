import { useCallback, useEffect, useId, useRef, useState } from 'react';
import BaseModal from '../common/BaseModal';
import ActionButton from '../studio/ActionButton';

interface EditorTextPromptOptions {
  title: string;
  label: string;
  description: string;
  initialValue?: string;
  placeholder?: string;
}

interface ActivePrompt extends EditorTextPromptOptions {
  value: string;
}

/** Replaces blocking browser prompts with the app's accessible Studio modal. */
export function useEditorTextPrompt() {
  const [activePrompt, setActivePrompt] = useState<ActivePrompt | null>(null);
  const resolverRef = useRef<((value: string | null) => void) | null>(null);
  const formId = useId();

  const prompt = useCallback((options: EditorTextPromptOptions) => new Promise<string | null>((resolve) => {
    resolverRef.current?.(null);
    resolverRef.current = resolve;
    setActivePrompt({ ...options, value: options.initialValue ?? '' });
  }), []);

  const settle = useCallback((value: string | null) => {
    setActivePrompt(null);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    if (resolve) window.setTimeout(() => resolve(value), 0);
  }, []);

  useEffect(() => () => {
    resolverRef.current?.(null);
    resolverRef.current = null;
  }, []);

  const dialog = activePrompt ? (
    <BaseModal
      open
      onClose={() => settle(null)}
      title={activePrompt.title}
      description={activePrompt.description}
      size="sm"
      closeOnEscape
      closeOnOverlayClick
      footer={(
        <div className="flex gap-3">
          <ActionButton type="button" variant="ghost" className="flex-1 justify-center" onClick={() => settle(null)}>
            取消
          </ActionButton>
          <ActionButton type="submit" form={formId} variant="primary" className="flex-1 justify-center">
            确定
          </ActionButton>
        </div>
      )}
    >
      <form
        id={formId}
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          settle(activePrompt.value);
        }}
      >
        <label htmlFor={`${formId}-value`} className="block text-sm font-medium text-studio-text-secondary">
          {activePrompt.label}
        </label>
        <input
          id={`${formId}-value`}
          data-modal-autofocus
          autoFocus
          type="text"
          value={activePrompt.value}
          placeholder={activePrompt.placeholder}
          className="xmt-field"
          onChange={(event) => setActivePrompt((current) => current ? { ...current, value: event.target.value } : current)}
        />
      </form>
    </BaseModal>
  ) : null;

  return { prompt, dialog };
}
