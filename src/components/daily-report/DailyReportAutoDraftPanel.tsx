import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Wand2 } from 'lucide-react';
import type { DailyReportItem, GenerateDraftResponse } from '../../api/dailyReports';
import { ActionButton, EmptyState, GlassPanel } from '../studio';

type DailyReportAutoDraftPanelProps = {
  loading: boolean;
  result: GenerateDraftResponse | null;
  importedKeys: string[];
  getSuggestionKey: (item: DailyReportItem) => string;
  onGenerate: () => void;
  onApply: (items: DailyReportItem[]) => void;
};

const sourceLabels: Record<string, string> = {
  topic: 'Topic',
  production: 'Production',
  publishing: 'Publishing',
  unknown: 'Unknown',
};

export default function DailyReportAutoDraftPanel({
  loading,
  result,
  importedKeys,
  getSuggestionKey,
  onGenerate,
  onApply,
}: DailyReportAutoDraftPanelProps) {
  const importedSet = useMemo(() => new Set(importedKeys), [importedKeys]);
  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    return (result?.suggestions || []).filter((item) => {
      const key = getSuggestionKey(item);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [getSuggestionKey, result]);
  const available = useMemo(
    () => suggestions.filter((item) => !importedSet.has(getSuggestionKey(item))),
    [getSuggestionKey, importedSet, suggestions],
  );
  const availableKeys = useMemo(() => available.map(getSuggestionKey), [available, getSuggestionKey]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  useEffect(() => {
    setSelectedKeys(availableKeys);
  }, [availableKeys]);

  const groups = suggestions.reduce<Record<string, DailyReportItem[]>>((acc, item) => {
    const type = item.sourceType || 'unknown';
    acc[type] = acc[type] || [];
    acc[type].push(item);
    return acc;
  }, {});

  const toggle = (key: string) => {
    setSelectedKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  };

  const applySelected = () => {
    onApply(suggestions.filter((item) => selectedKeys.includes(getSuggestionKey(item)) && !importedSet.has(getSuggestionKey(item))));
  };

  return (
    <GlassPanel className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-studio-text-primary">Auto draft</h2>
          <p className="mt-1 text-sm text-studio-text-muted">Only imports existing business records. Nothing is invented.</p>
        </div>
        <ActionButton onClick={onGenerate} disabled={loading}>
          <Wand2 className="h-4 w-4" />
          {loading ? 'Generating...' : 'Generate'}
        </ActionButton>
      </div>

      {!result ? (
        <EmptyState icon={Wand2} title="No auto draft yet" description="Generate to inspect today's topic, production and publishing records." />
      ) : suggestions.length === 0 ? (
        <EmptyState icon={Wand2} title="No source records today" description="You can continue writing the report manually." />
      ) : (
        <div className="space-y-4">
          {Object.entries(groups).map(([sourceType, items]) => (
            <div key={sourceType} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-studio-text-muted">
                {sourceLabels[sourceType] || sourceType}
              </p>
              {items.map((item, index) => {
                const key = getSuggestionKey(item);
                const imported = importedSet.has(key);
                const updatedAt = item.meta?.updatedAt || item.meta?.createdAt;
                return (
                  <label
                    key={`${key}-${index}`}
                    className={`block rounded-card border p-4 transition ${
                      imported
                        ? 'border-studio-border-soft bg-white/[0.025] opacity-70'
                        : 'border-studio-border-soft bg-white/[0.04] hover:bg-white/[0.07]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedKeys.includes(key)}
                        disabled={imported}
                        onChange={() => toggle(key)}
                        className="mt-1 h-4 w-4 rounded border-studio-border-soft accent-studio-primary"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-studio-text-primary">{item.title || 'Auto record'}</p>
                          <span className="text-xs text-studio-text-muted">{item.sourceType || 'source'} #{item.sourceId || '-'}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-studio-text-muted">
                          <span>Section: {item.sectionKey}</span>
                          {updatedAt ? <span>Updated: {String(updatedAt)}</span> : null}
                          {imported ? <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Imported</span> : null}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-studio-text-secondary">{item.contentMd}</p>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          ))}

          <div className="grid gap-2 sm:grid-cols-2">
            <ActionButton onClick={applySelected} variant="primary" disabled={selectedKeys.length === 0} className="w-full">
              Import selected
            </ActionButton>
            <ActionButton onClick={() => onApply(available)} disabled={available.length === 0} className="w-full">
              Import all
            </ActionButton>
          </div>
        </div>
      )}
    </GlassPanel>
  );
}
