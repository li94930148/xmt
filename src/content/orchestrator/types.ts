import type { CollaborationUserPresence } from '../../collaboration/core/events';
import type { EditorState } from '../../editor/state/editorStateManager';
import type { UnifiedTimelineEvent, UnifiedTimelineSession } from '../../editor/timeline/unifiedContentTimeline';
import type { ContentEvolutionAnalysis, ContentStabilityResult } from '../intelligence/contentEvolutionAnalyzer';
import type { UserImpact } from '../intelligence/collaborationImpactAnalyzer';
import type { ContentQualityTrend } from '../intelligence/contentQualityTrend';
import type { GeneratedSummary, GeneratedTitle, StructureSuggestion } from '../generation/contentGenerationEngine';
import type { ContentImprovementSuggestion, WeakSection } from '../generation/contentSuggestionEngine';

export type ContentOSResolvedState = 'draft' | 'editing' | 'stabilizing' | 'finalized';

export interface ContentOSContext {
  docId: string;
  timeline: {
    events: UnifiedTimelineEvent[];
    sessions: UnifiedTimelineSession[];
  };
  intelligence: {
    evolution: ContentEvolutionAnalysis;
    stability: ContentStabilityResult;
    impact: UserImpact[];
    structuralEditors: UserImpact[];
    quality: ContentQualityTrend;
  };
  generation: {
    summary: GeneratedSummary;
    title: GeneratedTitle;
    structure: StructureSuggestion;
    suggestions: ContentImprovementSuggestion[];
    weakSections: WeakSection[];
  };
  state: ContentOSResolvedState;
  uxState: EditorState;
  presence: {
    activeUsers: CollaborationUserPresence[];
    activeUserCount: number;
  };
}

export interface ContentOSInsight {
  docId: string;
  state: ContentOSResolvedState;
  headline: string;
  keyInsights: string[];
  recommendedActions: string[];
}
