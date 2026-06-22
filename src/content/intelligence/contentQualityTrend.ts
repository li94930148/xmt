import {
  buildUnifiedTimeline,
  type BuildUnifiedTimelineSources,
} from '../../editor/timeline/unifiedContentTimeline';
import { detectContentStability } from './contentEvolutionAnalyzer';

export interface ContentQualityTrend {
  trend: 'improving' | 'stable' | 'declining';
  score: number;
  reasons: string[];
}

export function calculateQualityTrend(docId: string, sources: BuildUnifiedTimelineSources = {}): ContentQualityTrend {
  const timeline = buildUnifiedTimeline(docId, sources);
  const reasons: string[] = [];
  const editCount = timeline.filter((event) => event.type === 'edit').length;
  const saveCount = timeline.filter((event) => event.type === 'save').length;
  const versionCount = timeline.filter((event) => event.type === 'version').length;
  const conflictCount = timeline.filter((event) => event.type === 'conflict').length;
  const snapshotCount = timeline.filter((event) => event.type === 'snapshot').length;
  const stability = detectContentStability(docId, sources);

  let score = 50;
  score += Math.min(20, versionCount * 4);
  score += Math.min(15, saveCount * 2);
  score += stability.converging ? 12 : 0;
  score += snapshotCount > 0 ? 3 : 0;
  score -= Math.min(20, conflictCount * 6);
  score -= stability.highFrequencyEditing ? 8 : 0;
  score = Math.max(0, Math.min(100, score));

  if (versionCount > 0) reasons.push('已有版本节点，内容演化有明确阶段。');
  if (saveCount > 0) reasons.push('存在保存节点，持久化节奏稳定。');
  if (editCount > 0 && !stability.highFrequencyEditing) reasons.push('编辑活动存在但没有持续高频震荡。');
  if (stability.converging) reasons.push('内容正在进入收敛阶段。');
  if (conflictCount > 0) reasons.push('存在协作冲突节点，对质量稳定性有负面影响。');
  if (reasons.length === 0) reasons.push('时间轴数据较少，质量趋势暂按稳定处理。');

  return {
    trend: score >= 70 ? 'improving' : score >= 45 ? 'stable' : 'declining',
    score,
    reasons,
  };
}
