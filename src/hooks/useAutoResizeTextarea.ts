import { useRef, useEffect } from 'react';

export function useAutoResizeTextarea(value: string, minHeight = 100, maxHeight = 300) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${newHeight}px`;
  }, [value, minHeight, maxHeight]);

  return textareaRef;
}