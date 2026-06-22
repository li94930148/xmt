import { useAuthStore } from '../store';

const BASE_URL = '/api/content/generation';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: getAuthHeader(),
  });

  if (!response.ok) {
    throw new Error('获取内容生成结果失败');
  }

  return response.json();
}

export interface GeneratedSummaryResponse {
  docId: string;
  summary: {
    summary: string;
    keyPoints: string[];
    evolutionBasedSummary: string;
  };
}

export interface GeneratedTitleResponse {
  docId: string;
  title: {
    title: string;
    alternatives: string[];
  };
}

export interface GeneratedStructureResponse {
  docId: string;
  structure: {
    recommendedSections: string[];
    reorganizationSuggestions: string[];
    logicOptimizationSuggestions: string[];
  };
}

export interface GeneratedSuggestionsResponse {
  docId: string;
  suggestions: Array<{
    type: 'paragraph' | 'redundancy' | 'logic' | 'collaboration';
    message: string;
    priority: 'low' | 'medium' | 'high';
  }>;
  weakSections: Array<{
    section: string;
    reason: string;
    rewriteRecommended: boolean;
  }>;
}

export function getGeneratedSummary(docId: string) {
  return request<GeneratedSummaryResponse>(`/summary/${encodeURIComponent(docId)}`);
}

export function getGeneratedTitle(docId: string) {
  return request<GeneratedTitleResponse>(`/title/${encodeURIComponent(docId)}`);
}

export function getGeneratedStructure(docId: string) {
  return request<GeneratedStructureResponse>(`/structure/${encodeURIComponent(docId)}`);
}

export function getGeneratedSuggestions(docId: string) {
  return request<GeneratedSuggestionsResponse>(`/suggestions/${encodeURIComponent(docId)}`);
}
