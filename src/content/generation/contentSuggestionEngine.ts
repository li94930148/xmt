import {
  buildUnifiedTimeline,
  type BuildUnifiedTimelineSources,
} from '../../editor/timeline/unifiedContentTimeline';
import { analyzeUserImpact } from '../intelligence/collaborationImpactAnalyzer';
import { calculateQualityTrend } from '../intelligence/contentQualityTrend';

export interface ContentImprovementSuggestion {
  type: 'paragraph' | 'redundancy' | 'logic' | 'collaboration';
  message: string;
  priority: 'low' | 'medium' | 'high';
}

export interface WeakSection {
  section: string;
  reason: string;
  rewriteRecommended: boolean;
}

export function suggestImprovements(docId: string, sources: BuildUnifiedTimelineSources = {}): ContentImprovementSuggestion[] {
  const timeline = buildUnifiedTimeline(docId, sources);
  const quality = calculateQualityTrend(docId, sources);
  const impact = analyzeUserImpact(docId, sources);
  const conflicts = timeline.filter((event) => event.type === 'conflict');
  const edits = timeline.filter((event) => event.type === 'edit');
  const suggestions: ContentImprovementSuggestion[] = [];

  suggestions.push({
    type: 'paragraph',
    message: edits.length > 0 ? '建议检查高频编辑段落，统一语气和段落长度。' : '建议先补充可编辑正文，再进行段落级优化。',
    priority: edits.length > 8 ? 'high' : 'medium',
  });

  suggestions.push({
    type: 'redundancy',
    message: '建议合并承担相同表达目标的段落，减少重复铺垫。',
    priority: quality.score < 60 ? 'high' : 'medium',
  });

  suggestions.push({
    type: 'logic',
    message: quality.trend === 'improving'
      ? '当前质量趋势向好，可加强章节之间的转场句。'
      : '建议重新检查开头观点、主体论据和结尾行动指引是否闭环。',
    priority: quality.trend === 'declining' ? 'high' : 'medium',
  });

  if (conflicts.length > 0) {
    suggestions.push({
      type: 'collaboration',
      message: '存在协作冲突节点，建议复核冲突附近内容是否出现重复或断裂。',
      priority: 'high',
    });
  }

  if (impact.some((user) => user.role === 'structural')) {
    suggestions.push({
      type: 'logic',
      message: '检测到结构型编辑者参与，建议在版本保存前做一次全文结构复核。',
      priority: 'medium',
    });
  }

  return suggestions;
}

export function detectWeakSections(docId: string, sources: BuildUnifiedTimelineSources = {}): WeakSection[] {
  const timeline = buildUnifiedTimeline(docId, sources);
  const quality = calculateQualityTrend(docId, sources);
  const conflicts = timeline.filter((event) => event.type === 'conflict');
  const highEditLoad = timeline.filter((event) => event.type === 'edit').length > 10;
  const weakSections: WeakSection[] = [];

  if (quality.score < 60) {
    weakSections.push({
      section: '整体逻辑链路',
      reason: '质量评分偏低，可能存在结构松散或表达重复。',
      rewriteRecommended: true,
    });
  }

  if (highEditLoad) {
    weakSections.push({
      section: '高频修改段落',
      reason: '编辑节点较多，段落可能仍未稳定。',
      rewriteRecommended: true,
    });
  }

  if (conflicts.length > 0) {
    weakSections.push({
      section: '协作冲突区域',
      reason: '存在冲突节点，建议检查前后文衔接。',
      rewriteRecommended: true,
    });
  }

  if (weakSections.length === 0) {
    weakSections.push({
      section: '细节表达',
      reason: '未发现明显弱区，可集中优化措辞、节奏和标题。',
      rewriteRecommended: false,
    });
  }

  return weakSections;
}
