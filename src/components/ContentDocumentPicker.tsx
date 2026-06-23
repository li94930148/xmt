import { useId, useMemo } from 'react';
import { getRecentContentDocuments, resolveContentDocument } from '../content/orchestrator/currentContentDocument';
import { displayDocId } from '../utils/docIdDisplay';

interface ContentDocumentPickerProps {
  value: string;
  onChange: (value: string) => void;
  onPick: (docId: string, title: string) => void;
  className?: string;
}

function kindLabel(kind: string) {
  if (kind === 'production') return '创作';
  if (kind === 'shooting') return '成片';
  return '内容';
}

export default function ContentDocumentPicker({
  value,
  onChange,
  onPick,
  className,
}: ContentDocumentPickerProps) {
  const listId = useId();
  const recentDocs = useMemo(() => getRecentContentDocuments(), []);

  const handleSelect = (input: string) => {
    onChange(input);
    const matched = resolveContentDocument(input);
    if (matched) {
      onPick(matched.docId, matched.title);
    }
  };

  return (
    <>
      <input
        list={listId}
        value={value}
        onChange={(event) => handleSelect(event.target.value)}
        className={className}
        placeholder="选择最近协作文档或输入选题名称"
      />
      <datalist id={listId}>
        {recentDocs.map((item) => (
          <option
            key={item.docId}
            value={item.title}
            label={`${kindLabel(item.kind)} · ${displayDocId(item.docId)}`}
          />
        ))}
      </datalist>
    </>
  );
}
