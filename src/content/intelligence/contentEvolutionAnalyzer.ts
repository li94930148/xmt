import {
  buildUnifiedTimeline,
  type BuildUnifiedTimelineSources,
  type UnifiedTimelineEvent,
} from '../../editor/timeline/unifiedContentTimeline';

export type ContentEvolutionPhase = 'draft' | 'editing' | 'refining' | 'finalizing';

export interface ContentEvolutionAnalysis {
  phases: Array<{
    phase: ContentEvolutionPhase;
    start: number;
    end: number;
  }>;
  evolutionSummary: string;
}

export interface ContentStabilityResult {
  stable: boolean;
  highFrequencyEditing: boolean;
  converging: boolean;
  reason: string;
}

function classifyPhase(event: UnifiedTimelineEvent, index: number, total: number): ContentEvolutionPhase {
  if (event.type === 'version' && event.payload?.changeType === 'current') return 'draft';
  if (event.type === 'version' && event.payload?.changeType === 'major') return 'editing';
  if (index >= Math.max(0, total - 2)) return 'finalizing';
  if (event.type === 'save' || event.type === 'snapshot') return 'refining';
  return index < Math.max(1, Math.floor(total * 0.35)) ? 'editing' : 'refining';
}

export function analyzeContentEvolution(docId: string, sources: BuildUnifiedTimelineSources = {}): ContentEvolutionAnalysis {
  const timeline = buildUnifiedTimeline(docId, sources);

  if (timeline.length === 0) {
    const now = Date.now();
    return {
      phases: [{ phase: 'draft', start: now, end: now }],
      evolutionSummary: '暂无可分析的内容时间轴，当前仍处于初稿阶段。',
    };
  }

  const phases: ContentEvolutionAnalysis['phases'] = [];

  timeline.forEach((event, index) => {
    const phase = classifyPhase(event, index, timeline.length);
    const current = phases[phases.length - 1];

    if (!current || current.phase !== phase) {
      phases.push({ phase, start: event.timestamp, end: event.timestamp });
    } else {
      current.end = event.timestamp;
    }
  });

  const latestPhase = phases[phases.length - 1]?.phase || 'draft';
  const editCount = timeline.filter((event) => event.type === 'edit').length;
  const versionCount = timeline.filter((event) => event.type === 'version').length;

  return {
    phases,
    evolutionSummary: `该内容经历了 ${phases.length} 个演化阶段，累计 ${editCount} 次编辑节点、${versionCount} 个版本节点，当前处于${latestPhase === 'finalizing' ? '收尾定稿' : latestPhase === 'refining' ? '精修' : latestPhase === 'editing' ? '集中编辑' : '初稿'}阶段。`,
  };
}

export function detectContentStability(docId: string, sources: BuildUnifiedTimelineSources = {}): ContentStabilityResult {
  const timeline = buildUnifiedTimeline(docId, sources);
  const latest = timeline[timeline.length - 1];
  const now = Date.now();
  const recentWindowStart = now - 10 * 60 * 1000;
  const recentEdits = timeline.filter((event) => event.type === 'edit' && event.timestamp >= recentWindowStart);
  const recentVersions = timeline.filter((event) => event.type === 'version' && event.timestamp >= recentWindowStart);
  const idleMs = latest ? now - latest.timestamp : Number.POSITIVE_INFINITY;
  const highFrequencyEditing = recentEdits.length >= 5;
  const converging = !highFrequencyEditing && recentVersions.length === 0 && idleMs > 2 * 60 * 1000;
  const stable = converging && idleMs > 5 * 60 * 1000;

  return {
    stable,
    highFrequencyEditing,
    converging,
    reason: stable
      ? '最近没有高频编辑，内容已进入稳定状态。'
      : highFrequencyEditing
        ? '最近编辑频率较高，内容仍在快速变化。'
        : converging
          ? '编辑频率下降，内容正在收敛。'
          : '内容仍有近期活动，暂未完全稳定。',
  };
}
