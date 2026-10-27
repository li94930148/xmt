import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearTopicDraftCollection,
  createTopicDraftId,
  emptyTopicDraft,
  hasTopicDraftContent,
  persistTopicDraftCollection,
  readTopicDraftCollection,
  removeTopicDraftEntry,
  legacyDesktopTopicDraftKey,
  topicDraftKey,
  upsertTopicDraftEntry,
  type TopicDraft,
  type TopicDraftCollection,
} from '@/utils/topicDraft';

type SaveResult = { saved: boolean; collection: TopicDraftCollection };

export function useTopicDraftCollection(userId: number | null | undefined, enabled: boolean) {
  const storageKey = topicDraftKey(userId);
  const legacyKey = legacyDesktopTopicDraftKey(userId);
  const [collection, setCollection] = useState<TopicDraftCollection>({ schemaVersion: 1, activeDraftId: null, drafts: [] });
  const [form, setForm] = useState<TopicDraft>(emptyTopicDraft);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const ready = enabled && Boolean(storageKey) && loadedKey === storageKey;
  const lastSavedSignature = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !storageKey) {
      setCollection({ schemaVersion: 1, activeDraftId: null, drafts: [] });
      setForm(emptyTopicDraft);
      setLoadedKey(null);
      setStorageUnavailable(false);
      return;
    }

    const saved = readTopicDraftCollection(storageKey, legacyKey);
    const active = saved.drafts.find((entry) => entry.id === saved.activeDraftId) ?? saved.drafts[0];
    const activeDraftId = saved.activeDraftId || active?.id || createTopicDraftId();
    const restored = { ...saved, activeDraftId };
    setCollection(restored);
    setForm(active?.draft ?? emptyTopicDraft);
    setLoadedKey(storageKey);
    setStorageUnavailable(false);
  }, [enabled, legacyKey, storageKey]);

  const saveFormToCollection = useCallback((currentForm: TopicDraft, currentCollection: TopicDraftCollection): TopicDraftCollection => {
    const activeDraftId = currentCollection.activeDraftId;
    if (!activeDraftId) return currentCollection;
    const drafts = hasTopicDraftContent(currentForm)
      ? upsertTopicDraftEntry(currentCollection.drafts, activeDraftId, currentForm)
      : removeTopicDraftEntry(currentCollection.drafts, activeDraftId);
    return { ...currentCollection, drafts };
  }, []);

  const persist = useCallback((next: TopicDraftCollection) => {
    const saved = persistTopicDraftCollection(storageKey, legacyKey, next);
    if (saved) {
      lastSavedSignature.current = JSON.stringify([next.activeDraftId, form]);
      setCollection(next);
      setStorageUnavailable(false);
    } else {
      setStorageUnavailable(true);
    }
    return saved;
  }, [form, legacyKey, storageKey]);

  const saveCurrentDraft = useCallback((): SaveResult => {
    if (!ready) return { saved: false, collection };
    const next = saveFormToCollection(form, collection);
    const saved = persist(next);
    return { saved, collection: saved ? next : collection };
  }, [collection, form, persist, ready, saveFormToCollection]);

  useEffect(() => {
    if (!enabled || !storageKey || loadedKey !== storageKey || !collection.activeDraftId) return;
    if (!hasTopicDraftContent(form) && !collection.drafts.some((entry) => entry.id === collection.activeDraftId)) return;
    const signature = JSON.stringify([collection.activeDraftId, form]);
    if (lastSavedSignature.current === signature) return;
    const timer = window.setTimeout(() => {
      const next = saveFormToCollection(form, collection);
      if (persist(next)) lastSavedSignature.current = signature;
    }, 300);
    return () => window.clearTimeout(timer);
  }, [collection, enabled, form, loadedKey, persist, saveFormToCollection, storageKey]);

  const selectDraft = useCallback((id: string) => {
    const savedCurrent = saveCurrentDraft();
    if (!savedCurrent.saved) return false;
    const entry = savedCurrent.collection.drafts.find((candidate) => candidate.id === id);
    if (!entry) return false;
    const next = { ...savedCurrent.collection, activeDraftId: id };
    if (!persist(next)) return false;
    setForm(entry.draft);
    return true;
  }, [persist, saveCurrentDraft]);

  const startNewDraft = useCallback(() => {
    const savedCurrent = saveCurrentDraft();
    if (!savedCurrent.saved) return false;
    const id = createTopicDraftId();
    const next = { ...savedCurrent.collection, activeDraftId: id };
    if (!persist(next)) return false;
    setForm(emptyTopicDraft);
    return true;
  }, [persist, saveCurrentDraft]);

  const deleteDraft = useCallback((id: string) => {
    const savedCurrent = saveCurrentDraft();
    if (!savedCurrent.saved) return false;
    const drafts = removeTopicDraftEntry(savedCurrent.collection.drafts, id);
    const deletingActive = savedCurrent.collection.activeDraftId === id;
    const nextActive = deletingActive ? drafts[0]?.id ?? createTopicDraftId() : savedCurrent.collection.activeDraftId;
    const next = { ...savedCurrent.collection, activeDraftId: nextActive, drafts };
    if (!persist(next)) return false;
    if (deletingActive) {
      setForm(drafts.find((entry) => entry.id === nextActive)?.draft ?? emptyTopicDraft);
    }
    return true;
  }, [persist, saveCurrentDraft]);

  const removeSubmittedDraft = useCallback(() => {
    const savedCurrent = saveCurrentDraft();
    if (!savedCurrent.saved || !savedCurrent.collection.activeDraftId) return false;
    const drafts = removeTopicDraftEntry(savedCurrent.collection.drafts, savedCurrent.collection.activeDraftId);
    const nextActive = drafts[0]?.id ?? null;
    const next = { schemaVersion: 1 as const, activeDraftId: nextActive, drafts };
    if (!drafts.length) {
      if (!clearTopicDraftCollection(storageKey, legacyKey)) {
        setStorageUnavailable(true);
        return false;
      }
      setCollection(next);
      setForm(emptyTopicDraft);
      setStorageUnavailable(false);
      return true;
    }
    if (!persist(next)) return false;
    setForm(drafts.find((entry) => entry.id === nextActive)?.draft ?? emptyTopicDraft);
    return true;
  }, [legacyKey, persist, saveCurrentDraft, storageKey]);

  return {
    ready,
    activeDraftId: ready ? collection.activeDraftId : null,
    drafts: ready ? collection.drafts : [],
    form: ready ? form : emptyTopicDraft,
    setForm,
    storageUnavailable: ready && storageUnavailable,
    saveCurrentDraft,
    selectDraft,
    startNewDraft,
    deleteDraft,
    removeSubmittedDraft,
  };
}
