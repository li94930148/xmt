export interface EditorPerformanceMetrics {
  docId: string;
  crdtBytes: number;
  eventQueueSize: number;
  droppedFrames: number;
  syncLatencyMs: number;
  updatedAt: number;
}

const metricsByDoc = new Map<string, EditorPerformanceMetrics>();
let lastFrameAt = 0;

function ensureMetrics(docId: string): EditorPerformanceMetrics {
  const existing = metricsByDoc.get(docId);
  if (existing) return existing;

  const next: EditorPerformanceMetrics = {
    docId,
    crdtBytes: 0,
    eventQueueSize: 0,
    droppedFrames: 0,
    syncLatencyMs: 0,
    updatedAt: Date.now(),
  };
  metricsByDoc.set(docId, next);
  return next;
}

function updateMetric(docId: string, patch: Partial<EditorPerformanceMetrics>) {
  const current = ensureMetrics(docId);
  metricsByDoc.set(docId, {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  });
}

export function recordCrdtMemoryUsage(docId: string, bytes: number) {
  updateMetric(docId, { crdtBytes: Math.max(0, bytes) });
}

export function recordEventQueueSize(docId: string, size: number) {
  updateMetric(docId, { eventQueueSize: Math.max(0, size) });
}

export function recordSyncLatency(docId: string, latencyMs: number) {
  updateMetric(docId, { syncLatencyMs: Math.max(0, latencyMs) });
}

export function recordRenderFrame(docId: string) {
  const now = performance.now();
  if (lastFrameAt > 0 && now - lastFrameAt > 50) {
    const current = ensureMetrics(docId);
    updateMetric(docId, { droppedFrames: current.droppedFrames + 1 });
  }
  lastFrameAt = now;
}

export function getEditorPerformanceMetrics(docId: string) {
  return ensureMetrics(docId);
}

export function getAllEditorPerformanceMetrics() {
  return Array.from(metricsByDoc.values());
}
