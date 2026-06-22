import { getActiveUsers } from '../../editor/collaboration/editorPresence';
import { getEditorState } from '../../editor/state/editorStateManager';
import {
  getTimelineView,
  type BuildUnifiedTimelineSources,
} from '../../editor/timeline/unifiedContentTimeline';
import {
  analyzeContentEvolution,
  detectContentStability,
} from '../intelligence/contentEvolutionAnalyzer';
import {
  analyzeUserImpact,
  detectStructuralEditors,
} from '../intelligence/collaborationImpactAnalyzer';
import { calculateQualityTrend } from '../intelligence/contentQualityTrend';
import {
  generateStructureSuggestion,
  generateSummary,
  generateTitle,
} from '../generation/contentGenerationEngine';
import {
  detectWeakSections,
  suggestImprovements,
} from '../generation/contentSuggestionEngine';
import type { ContentOSContext, ContentOSInsight, ContentOSResolvedState } from './types';

function createSources(sources: BuildUnifiedTimelineSources = {}) {
  return sources;
}

export function resolveSystemState(docId: string, sources: BuildUnifiedTimelineSources = {}): ContentOSResolvedState {
  const timelineView = getTimelineView(docId, createSources(sources));
  const stability = detectContentStability(docId, sources);
  const quality = calculateQualityTrend(docId, sources);
  const latestEvent = timelineView.timeline[timelineView.timeline.length - 1];
  const hasRecentEdit = latestEvent?.type === 'edit' || latestEvent?.type === 'save';

  if (quality.score >= 75 && stability.stable) return 'finalized';
  if (stability.converging) return 'stabilizing';
  if (hasRecentEdit || stability.highFrequencyEditing) return 'editing';
  return 'draft';
}

export function orchestrateDocContext(docId: string, sources: BuildUnifiedTimelineSources = {}): ContentOSContext {
  const normalizedSources = createSources(sources);
  const timelineView = getTimelineView(docId, normalizedSources);
  const evolution = analyzeContentEvolution(docId, normalizedSources);
  const stability = detectContentStability(docId, normalizedSources);
  const impact = analyzeUserImpact(docId, normalizedSources);
  const structuralEditors = detectStructuralEditors(docId, normalizedSources);
  const quality = calculateQualityTrend(docId, normalizedSources);
  const summary = generateSummary(docId, normalizedSources);
  const title = generateTitle(docId, normalizedSources);
  const structure = generateStructureSuggestion(docId, normalizedSources);
  const suggestions = suggestImprovements(docId, normalizedSources);
  const weakSections = detectWeakSections(docId, normalizedSources);
  const activeUsers = getActiveUsers(docId);
  const state = resolveSystemState(docId, normalizedSources);
  const uxState = getEditorState({
    hasConflict: timelineView.timeline.some((event) => event.type === 'conflict'),
    isSaving: timelineView.timeline[timelineView.timeline.length - 1]?.type === 'save',
    isEditing: state === 'editing',
    isSyncing: activeUsers.some((user) => user.typing),
  });

  return {
    docId,
    timeline: {
      events: timelineView.timeline,
      sessions: timelineView.sessions,
    },
    intelligence: {
      evolution,
      stability,
      impact,
      structuralEditors,
      quality,
    },
    generation: {
      summary,
      title,
      structure,
      suggestions,
      weakSections,
    },
    state,
    uxState,
    presence: {
      activeUsers,
      activeUserCount: activeUsers.length,
    },
  };
}

export function computeSystemInsight(docId: string, sources: BuildUnifiedTimelineSources = {}): ContentOSInsight {
  const context = orchestrateDocContext(docId, sources);
  const quality = context.intelligence.quality;
  const topSuggestion = context.generation.suggestions[0]?.message || '继续沉淀内容时间轴后再生成更细建议。';

  return {
    docId,
    state: context.state,
    headline: `${context.generation.title.title}，质量评分 ${quality.score}`,
    keyInsights: [
      context.intelligence.evolution.evolutionSummary,
      context.intelligence.stability.reason,
      context.intelligence.impact.length > 0
        ? `当前最高影响用户为 ${context.intelligence.impact[0].userId}。`
        : '暂无明确用户影响数据。',
    ],
    recommendedActions: [
      topSuggestion,
      ...context.generation.structure.logicOptimizationSuggestions.slice(0, 2),
    ],
  };
}
