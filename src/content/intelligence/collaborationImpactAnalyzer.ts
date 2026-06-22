import {
  buildUnifiedTimeline,
  type BuildUnifiedTimelineSources,
  type UnifiedTimelineEvent,
} from '../../editor/timeline/unifiedContentTimeline';

export type StructuralEditorRole = 'structural' | 'expression' | 'polish';

export interface UserImpact {
  userId: string;
  impactScore: number;
  structuralEdits: number;
  expressionEdits: number;
  polishEdits: number;
  role: StructuralEditorRole;
  summary: string;
}

function userIdOf(event: UnifiedTimelineEvent) {
  return event.userId || String(event.payload?.userId || event.payload?.operatorName || event.payload?.operator_name || 'system');
}

function classifyImpact(event: UnifiedTimelineEvent) {
  const bytes = Number(event.payload?.bytes || 0);
  const versionType = String(event.payload?.changeType || '');

  if (event.type === 'version' && versionType === 'major') return 'structuralEdits';
  if (event.type === 'edit' && bytes > 800) return 'structuralEdits';
  if (event.type === 'edit' && bytes > 160) return 'expressionEdits';
  return 'polishEdits';
}

export function analyzeUserImpact(docId: string, sources: BuildUnifiedTimelineSources = {}) {
  const timeline = buildUnifiedTimeline(docId, sources);
  const impact = new Map<string, UserImpact>();

  for (const event of timeline) {
    if (!['edit', 'save', 'version'].includes(event.type)) continue;
    const userId = userIdOf(event);
    const current = impact.get(userId) || {
      userId,
      impactScore: 0,
      structuralEdits: 0,
      expressionEdits: 0,
      polishEdits: 0,
      role: 'polish' as StructuralEditorRole,
      summary: '',
    };
    const bucket = classifyImpact(event);
    current[bucket] += 1;
    current.impactScore += bucket === 'structuralEdits' ? 5 : bucket === 'expressionEdits' ? 3 : 1;
    impact.set(userId, current);
  }

  return Array.from(impact.values())
    .map((item) => {
      const role: StructuralEditorRole =
        item.structuralEdits > 0 ? 'structural' : item.expressionEdits >= item.polishEdits ? 'expression' : 'polish';
      return {
        ...item,
        role,
        summary: role === 'structural'
          ? '主要影响内容结构，可能承担重构内容的角色。'
          : role === 'expression'
            ? '主要影响表达方式，偏向改写与调整语气。'
            : '主要进行轻量润色和细节修正。',
      };
    })
    .sort((a, b) => b.impactScore - a.impactScore);
}

export function detectStructuralEditors(docId: string, sources: BuildUnifiedTimelineSources = {}) {
  return analyzeUserImpact(docId, sources).filter((item) => item.role === 'structural');
}
