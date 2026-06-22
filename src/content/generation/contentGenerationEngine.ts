import {
  buildUnifiedTimeline,
  type BuildUnifiedTimelineSources,
} from '../../editor/timeline/unifiedContentTimeline';
import { analyzeContentEvolution } from '../intelligence/contentEvolutionAnalyzer';
import { calculateQualityTrend } from '../intelligence/contentQualityTrend';

export interface GeneratedSummary {
  summary: string;
  keyPoints: string[];
  evolutionBasedSummary: string;
}

export interface GeneratedTitle {
  title: string;
  alternatives: string[];
}

export interface StructureSuggestion {
  recommendedSections: string[];
  reorganizationSuggestions: string[];
  logicOptimizationSuggestions: string[];
}

function readableDocType(docId: string) {
  if (docId.startsWith('shooting:')) return '成片剧本';
  if (docId.startsWith('production:')) return '创作稿';
  return '内容稿';
}

export function generateSummary(docId: string, sources: BuildUnifiedTimelineSources = {}): GeneratedSummary {
  const timeline = buildUnifiedTimeline(docId, sources);
  const evolution = analyzeContentEvolution(docId, sources);
  const editCount = timeline.filter((event) => event.type === 'edit').length;
  const saveCount = timeline.filter((event) => event.type === 'save').length;
  const versionCount = timeline.filter((event) => event.type === 'version').length;
  const conflictCount = timeline.filter((event) => event.type === 'conflict').length;
  const docType = readableDocType(docId);

  return {
    summary: `${docType}当前基于 ${timeline.length} 个时间轴节点生成摘要，包含 ${editCount} 次编辑、${saveCount} 次保存和 ${versionCount} 个版本节点。`,
    keyPoints: [
      versionCount > 0 ? '内容已经形成明确版本节点。' : '内容版本节点较少，仍适合继续沉淀结构。',
      conflictCount > 0 ? '协作过程中存在冲突，需要关注冲突区域。' : '未发现明显冲突节点。',
      saveCount > 0 ? '内容已有持久化保存节奏。' : '保存节点较少，建议继续观察写入稳定性。',
    ],
    evolutionBasedSummary: evolution.evolutionSummary,
  };
}

export function generateTitle(docId: string, sources: BuildUnifiedTimelineSources = {}): GeneratedTitle {
  const evolution = analyzeContentEvolution(docId, sources);
  const quality = calculateQualityTrend(docId, sources);
  const docType = readableDocType(docId);
  const latestPhase = evolution.phases[evolution.phases.length - 1]?.phase || 'draft';
  const phaseText = latestPhase === 'finalizing' ? '定稿版' : latestPhase === 'refining' ? '精修版' : latestPhase === 'editing' ? '编辑版' : '初稿';
  const qualityText = quality.trend === 'improving' ? '优化' : quality.trend === 'declining' ? '风险复盘' : '稳定';

  return {
    title: `${docType}${phaseText}：${qualityText}内容方案`,
    alternatives: [
      `${docType}协作演化分析`,
      `${docType}${phaseText}结构建议`,
      `${qualityText}趋势下的内容优化稿`,
    ],
  };
}

export function generateStructureSuggestion(docId: string, sources: BuildUnifiedTimelineSources = {}): StructureSuggestion {
  const quality = calculateQualityTrend(docId, sources);
  const evolution = analyzeContentEvolution(docId, sources);
  const latestPhase = evolution.phases[evolution.phases.length - 1]?.phase || 'draft';

  return {
    recommendedSections: [
      '核心观点 / 主题说明',
      '关键事实与素材依据',
      '叙事推进 / 内容主体',
      '结论与行动指引',
    ],
    reorganizationSuggestions: [
      latestPhase === 'draft' ? '先补齐主题、事实、结论三段式骨架。' : '将高频修改区域拆成独立小节，降低协作冲突。',
      quality.score < 60 ? '优先重排逻辑链路，再进行表达润色。' : '保持当前结构，集中优化段落过渡。',
    ],
    logicOptimizationSuggestions: [
      '确保每个章节只承担一个表达目标。',
      '把版本节点后的新增内容放在相邻上下文中复核。',
      '将结论前置或在开头加入一句内容承诺，提升可读性。',
    ],
  };
}
