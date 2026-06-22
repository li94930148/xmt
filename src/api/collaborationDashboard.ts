import { useAuthStore } from '../store';

const BASE_URL = '/api/collaboration';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: getAuthHeader(),
  });

  if (!response.ok) {
    throw new Error('获取协作控制台数据失败');
  }

  return response.json();
}

export interface CollaborationTimelineEvent {
  id: string;
  timestamp: number;
  type: 'join' | 'leave' | 'update' | 'snapshot' | 'lock' | 'conflict';
  userId: string;
  diff?: Record<string, unknown>;
  snapshotId?: string;
}

export interface CollaborationSnapshotSummary {
  id: string;
  docId: string;
  version: number;
  createdAt: number;
  bytes: number;
}

export interface CollaborationStats {
  docId: string;
  totalEdits: number;
  activeUsers: number;
  conflictCount: number;
  typingFrequency: number;
  documentChangeFrequency: number;
  snapshotCount: number;
  lastSnapshotAt: number | null;
  lastEventAt: number | null;
}

export interface UserContribution {
  userId: string;
  edits: number;
  ratio: number;
}

export interface CollaborationReplayResponse {
  docId: string;
  replay: unknown;
  diffSequence: Array<{
    id: string;
    timestamp: number;
    version: number;
    diff: Record<string, unknown>;
  }>;
}

export interface CollaborationNarrativeItem {
  id: string;
  timestamp: number;
  text: string;
  type: string;
  userId: string;
}

export interface CollaborationExplanation {
  summary: string;
  narrative: string[];
  highlights: {
    mostActiveUser: string;
    mostEditedSection: string;
    conflictHotspots: string[];
  };
}

export function getCollaborationTimeline(docId: string) {
  return request<{
    docId: string;
    events: CollaborationTimelineEvent[];
    snapshots: CollaborationSnapshotSummary[];
  }>(`/timeline/${encodeURIComponent(docId)}`);
}

export function getCollaborationStats(docId: string) {
  return request<{
    stats: CollaborationStats;
    contributions: UserContribution[];
  }>(`/stats/${encodeURIComponent(docId)}`);
}

export function getCollaborationReplay(docId: string) {
  return request<CollaborationReplayResponse>(`/replay/${encodeURIComponent(docId)}`);
}

export function getCollaborationExplanation(docId: string) {
  return request<{
    docId: string;
    explanation: CollaborationExplanation;
  }>(`/ux/explain/${encodeURIComponent(docId)}`);
}

export function getCollaborationNarrative(docId: string) {
  return request<{
    docId: string;
    narrative: CollaborationNarrativeItem[];
  }>(`/ux/narrative/${encodeURIComponent(docId)}`);
}
