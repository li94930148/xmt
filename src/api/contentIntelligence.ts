import { useAuthStore } from '../store';

const BASE_URL = '/api/content/intelligence';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: getAuthHeader(),
  });

  if (!response.ok) {
    throw new Error('获取内容智能分析失败');
  }

  return response.json();
}

export interface ContentEvolutionResponse {
  docId: string;
  evolution: {
    phases: Array<{ phase: 'draft' | 'editing' | 'refining' | 'finalizing'; start: number; end: number }>;
    evolutionSummary: string;
  };
  stability: {
    stable: boolean;
    highFrequencyEditing: boolean;
    converging: boolean;
    reason: string;
  };
}

export interface CollaborationImpactResponse {
  docId: string;
  users: Array<{
    userId: string;
    impactScore: number;
    structuralEdits: number;
    expressionEdits: number;
    polishEdits: number;
    role: 'structural' | 'expression' | 'polish';
    summary: string;
  }>;
  structuralEditors: CollaborationImpactResponse['users'];
}

export interface ContentQualityResponse {
  docId: string;
  quality: {
    trend: 'improving' | 'stable' | 'declining';
    score: number;
    reasons: string[];
  };
}

export function getContentEvolution(docId: string) {
  return request<ContentEvolutionResponse>(`/evolution/${encodeURIComponent(docId)}`);
}

export function getContentImpact(docId: string) {
  return request<CollaborationImpactResponse>(`/impact/${encodeURIComponent(docId)}`);
}

export function getContentQuality(docId: string) {
  return request<ContentQualityResponse>(`/quality/${encodeURIComponent(docId)}`);
}
